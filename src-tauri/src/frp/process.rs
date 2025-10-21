use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::path::PathBuf;

#[cfg(unix)]
use std::os::unix::process::CommandExt;

pub struct FRPProcess {
    child: Arc<Mutex<Option<Child>>>,
    frpc_path: PathBuf,
    config_path: PathBuf,
}

impl FRPProcess {
    pub fn new(frpc_path: PathBuf, config_path: PathBuf) -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            frpc_path,
            config_path,
        }
    }

    pub fn start(&self) -> Result<(), String> {
        let mut child_guard = self.child.lock().unwrap();

        // Stop existing process if running
        if let Some(mut child) = child_guard.take() {
            log::info!("Stopping existing FRP client process");
            child.kill().ok();
        }

        log::info!("Starting FRP client: {:?} -c {:?}", self.frpc_path, self.config_path);

        // Start new process with stdout/stderr inherited so we can see logs
        // On Unix: Use process groups so child dies when parent dies
        let mut command = Command::new(&self.frpc_path);
        command
            .arg("-c")
            .arg(&self.config_path)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());

        // On Unix, create a new process group and set up death signal
        #[cfg(unix)]
        {
            // Create new process group - when parent dies, all children in group are killed
            command.process_group(0);
        }

        let child = command
            .spawn()
            .map_err(|e| {
                log::error!("Failed to spawn FRP client: {}", e);
                format!("Failed to start FRP: {}", e)
            })?;

        log::info!("FRP client process started with PID: {}", child.id());

        *child_guard = Some(child);
        Ok(())
    }

    pub fn stop(&self) -> Result<(), String> {
        let mut child_guard = self.child.lock().unwrap();

        if let Some(mut child) = child_guard.take() {
            let pid = child.id();
            log::info!("Stopping FRP client process (PID: {})", pid);

            // On Unix: Kill the entire process group to ensure all children die
            #[cfg(unix)]
            {
                use nix::sys::signal::{self, Signal};
                use nix::unistd::Pid;

                // Try to kill the process group first
                let pgid = Pid::from_raw(pid as i32);
                if let Err(e) = signal::killpg(pgid, Signal::SIGTERM) {
                    log::warn!("Failed to kill process group {}: {}", pid, e);
                    // Fallback to killing just the process
                    if let Err(e) = child.kill() {
                        log::error!("Failed to kill FRP client {}: {}", pid, e);
                        return Err(format!("Failed to stop FRP: {}", e));
                    }
                } else {
                    log::info!("Sent SIGTERM to process group {}", pid);
                    // Wait a bit for graceful shutdown
                    std::thread::sleep(std::time::Duration::from_millis(500));

                    // Force kill if still alive
                    if let Err(e) = signal::killpg(pgid, Signal::SIGKILL) {
                        log::debug!("Process group {} already dead: {}", pid, e);
                    }
                }

                // Wait for the process to exit
                let _ = child.wait();
            }

            // On Windows: Just kill the process
            #[cfg(windows)]
            {
                child.kill()
                    .map_err(|e| {
                        log::error!("Failed to kill FRP client: {}", e);
                        format!("Failed to stop FRP: {}", e)
                    })?;
                let _ = child.wait();
            }

            log::info!("FRP client stopped successfully");
        }

        Ok(())
    }

    pub fn is_running(&self) -> bool {
        let mut child_guard = self.child.lock().unwrap();

        if let Some(child) = child_guard.as_mut() {
            match child.try_wait() {
                Ok(Some(_)) => {
                    // Process exited
                    *child_guard = None;
                    false
                }
                Ok(None) => true, // Still running
                Err(_) => {
                    *child_guard = None;
                    false
                }
            }
        } else {
            false
        }
    }

    pub fn reload(&self) -> Result<(), String> {
        self.stop()?;
        std::thread::sleep(std::time::Duration::from_millis(500));
        self.start()
    }
}

impl Drop for FRPProcess {
    fn drop(&mut self) {
        self.stop().ok();
    }
}
