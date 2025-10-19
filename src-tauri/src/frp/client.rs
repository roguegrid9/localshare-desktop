use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

use super::config::FRPConfigGenerator;
use super::process::FRPProcess;
use super::types::{FRPCredentials, TunnelConfig, FRPStatus};

pub struct FRPClient {
    config_generator: FRPConfigGenerator,
    process: Arc<Mutex<Option<FRPProcess>>>,
    frpc_path: PathBuf,
    started_at: Arc<Mutex<Option<std::time::Instant>>>,
}

impl FRPClient {
    pub fn new(app_handle: &AppHandle) -> Result<Self, String> {
        let app_data_dir = app_handle.path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;

        let frpc_path = Self::get_frpc_binary_path(app_handle)?;

        Ok(Self {
            config_generator: FRPConfigGenerator::new(app_data_dir),
            process: Arc::new(Mutex::new(None)),
            frpc_path,
            started_at: Arc::new(Mutex::new(None)),
        })
    }

    fn get_frpc_binary_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
        let resource_dir = app_handle.path()
            .resource_dir()
            .map_err(|e| format!("Failed to resolve resource directory: {}", e))?;

        #[cfg(target_os = "linux")]
        let platform = "linux-x64";

        #[cfg(target_os = "windows")]
        let platform = "windows-x64";

        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        let platform = "darwin-arm64";

        #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
        let platform = "darwin-x64";

        let binary_name = if cfg!(windows) { "frpc.exe" } else { "frpc" };

        let frpc_path = resource_dir
            .join("resources")
            .join("frp")
            .join(platform)
            .join(binary_name);

        if !frpc_path.exists() {
            return Err(format!("FRP binary not found at {:?}", frpc_path));
        }

        // Make executable on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&frpc_path)
                .map_err(|e| format!("Failed to get permissions: {}", e))?
                .permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&frpc_path, perms)
                .map_err(|e| format!("Failed to set permissions: {}", e))?;
        }

        Ok(frpc_path)
    }

    pub fn connect(
        &mut self,
        credentials: FRPCredentials,
        tunnels: Vec<TunnelConfig>,
    ) -> Result<(), String> {
        // Generate config file
        let config_path = self.config_generator.generate_config(&credentials, &tunnels)?;

        // Create process
        let frp_process = FRPProcess::new(self.frpc_path.clone(), config_path);

        // Start process
        frp_process.start()?;

        // Store process and start time
        *self.process.lock().unwrap() = Some(frp_process);
        *self.started_at.lock().unwrap() = Some(std::time::Instant::now());

        Ok(())
    }

    pub fn disconnect(&mut self) -> Result<(), String> {
        if let Some(process) = self.process.lock().unwrap().as_ref() {
            process.stop()?;
        }

        *self.process.lock().unwrap() = None;
        *self.started_at.lock().unwrap() = None;

        Ok(())
    }

    pub fn reload(&self) -> Result<(), String> {
        if let Some(process) = self.process.lock().unwrap().as_ref() {
            process.reload()
        } else {
            Err("FRP not running".to_string())
        }
    }

    pub fn get_status(&self) -> FRPStatus {
        let is_running = self.process.lock().unwrap()
            .as_ref()
            .map(|p| p.is_running())
            .unwrap_or(false);

        let uptime_seconds = if let Some(started) = *self.started_at.lock().unwrap() {
            started.elapsed().as_secs()
        } else {
            0
        };

        FRPStatus {
            connected: is_running,
            tunnels_active: 0, // We'll enhance this later
            server_addr: None, // We'll enhance this later
            uptime_seconds,
        }
    }
}
