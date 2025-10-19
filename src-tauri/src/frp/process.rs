use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::path::PathBuf;

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
            child.kill().ok();
        }

        // Start new process
        let child = Command::new(&self.frpc_path)
            .arg("-c")
            .arg(&self.config_path)
            .spawn()
            .map_err(|e| format!("Failed to start FRP: {}", e))?;

        *child_guard = Some(child);
        Ok(())
    }

    pub fn stop(&self) -> Result<(), String> {
        let mut child_guard = self.child.lock().unwrap();

        if let Some(mut child) = child_guard.take() {
            child.kill()
                .map_err(|e| format!("Failed to stop FRP: {}", e))?;
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
