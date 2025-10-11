// src-tauri/src/transport/terminal_tunnel.rs
use super::TransportInfo;
use anyhow::{Result, Context};
use std::sync::Arc;
use tokio::sync::Mutex;
use webrtc::data_channel::RTCDataChannel;
use tokio::process::{Child, Command};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use bytes::Bytes;
use tokio::sync::mpsc;

pub struct TerminalTunnel {
    shell_type: String, // "bash", "zsh", "powershell", "cmd"
    grid_id: String,
    process_id: String,
    local_port: Option<u16>, // Not used for terminal, but required by trait
    shell_process: Arc<Mutex<Option<Child>>>,
    data_channel: Arc<Mutex<Option<Arc<RTCDataChannel>>>>,
    stdin_sender: Arc<Mutex<Option<mpsc::UnboundedSender<Vec<u8>>>>>,
    is_running: Arc<Mutex<bool>>,
}

impl TerminalTunnel {
    pub fn new(shell_type: String, grid_id: String, process_id: String) -> Self {
        Self {
            shell_type,
            grid_id,
            process_id,
            local_port: Some(0), // Terminal doesn't use ports
            shell_process: Arc::new(Mutex::new(None)),
            data_channel: Arc::new(Mutex::new(None)),
            stdin_sender: Arc::new(Mutex::new(None)),
            is_running: Arc::new(Mutex::new(false)),
        }
    }

    fn get_shell_command(&self) -> (&str, Vec<&str>) {
        match self.shell_type.as_str() {
            "bash" => ("bash", vec!["-i"]),
            "zsh" => ("zsh", vec!["-i"]),
            "powershell" => ("powershell", vec!["-NoLogo", "-Interactive"]),
            "cmd" => ("cmd", vec![]),
            _ => ("bash", vec!["-i"]), // Default to bash
        }
    }

    async fn start_shell_process(&mut self, data_channel: Arc<RTCDataChannel>) -> Result<()> {
        let (cmd, args) = self.get_shell_command();
        
        log::info!("Starting shell process: {} with args: {:?}", cmd, args);

        // Configure shell command
        let mut command = Command::new(cmd);
        command.args(args);
        command.stdin(std::process::Stdio::piped());
        command.stdout(std::process::Stdio::piped());
        command.stderr(std::process::Stdio::piped());

        // Set environment for better terminal experience
        command.env("TERM", "xterm-256color");
        command.env("PS1", "\\u@roguegrid:\\w$ "); // Custom prompt

        // Spawn the shell
        let mut child = command.spawn()
            .with_context(|| format!("Failed to spawn shell: {}", cmd))?;

        // Get I/O handles
        let stdin = child.stdin.take()
            .ok_or_else(|| anyhow::anyhow!("Failed to get shell stdin"))?;
        let stdout = child.stdout.take()
            .ok_or_else(|| anyhow::anyhow!("Failed to get shell stdout"))?;
        let stderr = child.stderr.take()
            .ok_or_else(|| anyhow::anyhow!("Failed to get shell stderr"))?;

        // Store the child process
        {
            let mut process_guard = self.shell_process.lock().await;
            *process_guard = Some(child);
        }

        // Set up I/O forwarding
        self.setup_io_forwarding(stdin, stdout, stderr, data_channel).await?;

        Ok(())
    }

    async fn setup_io_forwarding(
        &mut self,
        mut stdin: tokio::process::ChildStdin,
        stdout: tokio::process::ChildStdout,
        stderr: tokio::process::ChildStderr,
        data_channel: Arc<RTCDataChannel>,
    ) -> Result<()> {
        // Create channel for stdin data
        let (stdin_tx, mut stdin_rx) = mpsc::unbounded_channel::<Vec<u8>>();
        
        // Store stdin sender
        {
            let mut sender_guard = self.stdin_sender.lock().await;
            *sender_guard = Some(stdin_tx);
        }

        // Task 1: Forward P2P data to shell stdin
        let shell_type = self.shell_type.clone();
        let is_running = self.is_running.clone();
        tokio::spawn(async move {
            while let Some(data) = stdin_rx.recv().await {
                // Check if still running
                {
                    let running = is_running.lock().await;
                    if !*running {
                        break;
                    }
                }

                // Write to shell stdin
                if let Err(e) = stdin.write_all(&data).await {
                    log::error!("Failed to write to {} stdin: {}", shell_type, e);
                    break;
                }

                if let Err(e) = stdin.flush().await {
                    log::error!("Failed to flush {} stdin: {}", shell_type, e);
                    break;
                }
            }
            log::info!("Terminal stdin forwarder stopped");
        });

        // Task 2: Forward shell stdout to P2P
        let data_channel_stdout = data_channel.clone();
        let grid_id_stdout = self.grid_id.clone();
        let is_running_stdout = self.is_running.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            let mut buffer = Vec::new();

            loop {
                buffer.clear();
                
                // Check if still running
                {
                    let running = is_running_stdout.lock().await;
                    if !*running {
                        break;
                    }
                }

                match reader.read_until(b'\n', &mut buffer).await {
                    Ok(0) => break, // EOF
                    Ok(_) => {
                        // Send stdout data over P2P
                        let terminal_message = serde_json::json!({
                            "type": "terminal_output",
                            "stream": "stdout",
                            "grid_id": grid_id_stdout,
                            "data": base64::encode(&buffer)
                        });

                        let message_bytes = terminal_message.to_string().into_bytes();
                        if let Err(e) = data_channel_stdout.send(&Bytes::from(message_bytes)).await {
                            log::error!("Failed to send terminal stdout over P2P: {}", e);
                            break;
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to read shell stdout: {}", e);
                        break;
                    }
                }
            }
            log::info!("Terminal stdout forwarder stopped");
        });

        // Task 3: Forward shell stderr to P2P
        let data_channel_stderr = data_channel.clone();
        let grid_id_stderr = self.grid_id.clone();
        let is_running_stderr = self.is_running.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr);
            let mut buffer = Vec::new();

            loop {
                buffer.clear();
                
                // Check if still running
                {
                    let running = is_running_stderr.lock().await;
                    if !*running {
                        break;
                    }
                }

                match reader.read_until(b'\n', &mut buffer).await {
                    Ok(0) => break, // EOF
                    Ok(_) => {
                        // Send stderr data over P2P
                        let terminal_message = serde_json::json!({
                            "type": "terminal_output",
                            "stream": "stderr",
                            "grid_id": grid_id_stderr,
                            "data": base64::encode(&buffer)
                        });

                        let message_bytes = terminal_message.to_string().into_bytes();
                        if let Err(e) = data_channel_stderr.send(&Bytes::from(message_bytes)).await {
                            log::error!("Failed to send terminal stderr over P2P: {}", e);
                            break;
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to read shell stderr: {}", e);
                        break;
                    }
                }
            }
            log::info!("Terminal stderr forwarder stopped");
        });

        Ok(())
    }

    pub async fn send_input(&self, input: Vec<u8>) -> Result<()> {
        let sender_guard = self.stdin_sender.lock().await;
        if let Some(sender) = sender_guard.as_ref() {
            sender.send(input)
                .map_err(|_| anyhow::anyhow!("Failed to send input to terminal"))?;
        } else {
            return Err(anyhow::anyhow!("Terminal stdin sender not available"));
        }
        Ok(())
    }

    pub async fn start(&mut self, data_channel: Arc<RTCDataChannel>) -> Result<u16> {
        Ok(3001)
    }

    pub async fn stop(&mut self) -> Result<()> {
        // Implementation from your Transport trait impl
        Ok(())
    }

    pub fn get_connection_info(&self) -> TransportInfo {
        TransportInfo {
            transport_type: "terminal".to_string(),
            local_port: 0, // Terminal doesn't use ports
            target_port: None, // Change from Some(self.target_port) to None
            connection_url: None,
            instructions: format!(
                "Terminal session ready. Type commands to interact with the remote {} shell.",
                self.shell_type
            ),
        }
    }
}

