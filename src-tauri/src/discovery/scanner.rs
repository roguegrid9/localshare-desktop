use crate::discovery::types::{DetectedProcess, ScanConfig, ScanScope};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::process::Command as AsyncCommand;

pub struct ProcessScanner;

impl ProcessScanner {
    pub fn new() -> Self {
        Self
    }
    
    pub async fn scan_processes(&self, config: &ScanConfig) -> Result<Vec<DetectedProcess>, String> {
        match &config.scope {
            ScanScope::Localhost => self.scan_localhost_efficient().await,
            ScanScope::Network(range) => self.scan_network_ports(range).await.map(|_| Vec::new()),
            ScanScope::Docker => self.scan_docker_ports().await.map(|_| Vec::new()),
            ScanScope::CustomIP(ip) => self.scan_custom_ip_ports(ip).await.map(|_| Vec::new()),
        }
    }
    
    #[cfg(target_os = "linux")]
    async fn scan_localhost_efficient(&self) -> Result<Vec<DetectedProcess>, String> {
        // Single command to get all listening ports with PIDs
        let output = AsyncCommand::new("ss")
            .args(&["-tulnp", "--numeric"])
            .output()
            .await
            .map_err(|e| format!("Failed to run 'ss' command: {}", e))?;

        if !output.status.success() {
            return Err("ss command failed".to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut processes: Vec<DetectedProcess> = Vec::new();
        let mut seen_pids: HashMap<u32, std::collections::HashSet<u16>> = HashMap::new();
        let mut seen_ports_without_pid: std::collections::HashSet<u16> = std::collections::HashSet::new();
        
        for line in stdout.lines().skip(1) {
            if let Some((port, pid_opt)) = self.parse_ss_line_with_pid(line) {
                if let Some(pid) = pid_opt {
                    // Track unique ports per PID using HashSet to avoid duplicates
                    seen_pids.entry(pid).or_insert_with(std::collections::HashSet::new).insert(port);
                } else if self.is_system_service_port(port) && !seen_ports_without_pid.contains(&port) {
                    // Add system services without PID access (deduplicated)
                    seen_ports_without_pid.insert(port);
                    let description = self.guess_service_by_port(port);
                    processes.push(DetectedProcess {
                        pid: 0,
                        name: format!("{} (Port {})", description, port),
                        command: "System service (no access)".to_string(),
                        working_dir: "/unknown".to_string(),
                        port,
                        executable_path: "/unknown".to_string(),
                    });
                }
            }
        }
        
        // Now get process info for each unique PID
        for (pid, ports) in seen_pids {
            if let Ok(process_info) = self.extract_process_info(pid).await {
                let ports_vec: Vec<u16> = ports.into_iter().collect();
                let primary_port = self.select_primary_port(&ports_vec, &process_info);
                
                processes.push(DetectedProcess {
                    pid,
                    name: if ports_vec.len() > 1 {
                        let mut sorted_ports = ports_vec.clone();
                        sorted_ports.sort();
                        format!("{} (Ports: {})", process_info.name, sorted_ports.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(", "))
                    } else {
                        process_info.name
                    },
                    command: process_info.command,
                    working_dir: process_info.working_dir,
                    port: primary_port,
                    executable_path: process_info.executable_path,
                });
            }
        }
        
        Ok(processes)
    }
    
    #[cfg(not(target_os = "linux"))]
    async fn scan_localhost_efficient(&self) -> Result<Vec<DetectedProcess>, String> {
        // Fallback to old method for non-Linux
        let ports = self.scan_localhost_ports().await?;
        let mut processes: Vec<DetectedProcess> = Vec::new();
        let mut seen_entries = std::collections::HashSet::new();
        
        for (ip, port) in ports {
            let entry_key = format!("{}:{}", ip, port);
            if seen_entries.contains(&entry_key) {
                continue;
            }
            seen_entries.insert(entry_key);
            
            match self.get_pid_for_port(port).await {
                Ok(pid) => {
                    if let Ok(process_info) = self.extract_process_info(pid).await {
                        processes.push(DetectedProcess {
                            pid,
                            name: process_info.name,
                            command: process_info.command,
                            working_dir: process_info.working_dir,
                            port,
                            executable_path: process_info.executable_path,
                        });
                    }
                }
                Err(_) => {
                    if self.is_system_service_port(port) {
                        let description = self.guess_service_by_port(port);
                        processes.push(DetectedProcess {
                            pid: 0,
                            name: format!("{} (Port {})", description, port),
                            command: "System service (no access)".to_string(),
                            working_dir: "/unknown".to_string(),
                            port,
                            executable_path: "/unknown".to_string(),
                        });
                    }
                }
            }
        }
        
        Ok(processes)
    }
    
    pub async fn get_pid_for_port(&self, port: u16) -> Result<u32, String> {
        #[cfg(target_os = "linux")]
        return self.get_linux_pid_for_port(port).await;
        
        #[cfg(target_os = "windows")]  
        return self.get_windows_pid_for_port(port).await;
        
        #[cfg(target_os = "macos")]
        return self.get_macos_pid_for_port(port).await;
        
        #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
        Err("Platform not supported".to_string())
    }
    
    pub async fn extract_process_info(&self, pid: u32) -> Result<ProcessInfo, String> {
        #[cfg(target_os = "linux")]
        return self.extract_linux_process_info(pid).await;
        
        #[cfg(target_os = "windows")]
        return self.extract_windows_process_info(pid).await;
        
        #[cfg(target_os = "macos")]
        return self.extract_macos_process_info(pid).await;
        
        #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
        Err("Platform not supported".to_string())
    }
    
    async fn scan_ports(&self, scope: &ScanScope) -> Result<Vec<(String, u16)>, String> {
        match scope {
            ScanScope::Localhost => self.scan_localhost_ports().await,
            ScanScope::Network(range) => self.scan_network_ports(range).await,
            ScanScope::Docker => self.scan_docker_ports().await,
            ScanScope::CustomIP(ip) => self.scan_custom_ip_ports(ip).await,
        }
    }
    
    async fn scan_localhost_ports(&self) -> Result<Vec<(String, u16)>, String> {
        #[cfg(target_os = "linux")]
        return self.scan_linux_ports().await;
        
        #[cfg(target_os = "windows")]
        return self.scan_windows_ports().await;
        
        #[cfg(target_os = "macos")]
        return self.scan_macos_ports().await;
        
        #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
        Err("Platform not supported".to_string())
    }
    
    async fn scan_network_ports(&self, _range: &str) -> Result<Vec<(String, u16)>, String> {
        // TODO: Implement network scanning
        Ok(Vec::new())
    }
    
    async fn scan_docker_ports(&self) -> Result<Vec<(String, u16)>, String> {
        // TODO: Implement Docker container scanning
        Ok(Vec::new())
    }
    
    async fn scan_custom_ip_ports(&self, _ip: &str) -> Result<Vec<(String, u16)>, String> {
        // TODO: Implement custom IP scanning
        Ok(Vec::new())
    }

    // Linux implementations
    #[cfg(target_os = "linux")]
    async fn scan_linux_ports(&self) -> Result<Vec<(String, u16)>, String> {
        // Use ss -tulnp to get ports AND PIDs in one command
        let output = AsyncCommand::new("ss")
            .args(&["-tulnp", "--numeric"])
            .output()
            .await
            .map_err(|e| format!("Failed to run 'ss' command: {}", e))?;

        if !output.status.success() {
            return Err("ss command failed".to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut ports = Vec::new();

        for line in stdout.lines().skip(1) { // Skip header
            if let Some((ip, port)) = self.parse_ss_line_linux(line) {
                ports.push((ip, port));
            }
        }

        Ok(ports)
    }

    #[cfg(target_os = "linux")]
    fn parse_ss_line_linux(&self, line: &str) -> Option<(String, u16)> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 5 {
            return None;
        }

        let local_address = parts[4];

        // Parse address:port
        if let Some(colon_pos) = local_address.rfind(':') {
            let addr_with_interface = &local_address[..colon_pos];
            let port_str = &local_address[colon_pos + 1..];

            if let Ok(port) = port_str.parse::<u16>() {
                // Remove interface specifier (e.g., "127.0.0.53%lo" -> "127.0.0.53")
                let addr = if let Some(percent_pos) = addr_with_interface.find('%') {
                    &addr_with_interface[..percent_pos]
                } else {
                    addr_with_interface
                };

                // Include localhost, wildcard, and local network addresses
                if addr == "127.0.0.1" || addr.starts_with("127.0.0.") || 
                   addr == "0.0.0.0" || addr == "::1" || addr == "*" ||
                   addr.starts_with("192.168.") || addr.starts_with("10.") || 
                   addr.starts_with("172.") || addr == "localhost" {
                    return Some((addr.to_string(), port));
                }
            }
        }

        None
    }
    
    #[cfg(target_os = "linux")]
    fn parse_ss_line_with_pid(&self, line: &str) -> Option<(u16, Option<u32>)> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 5 {
            return None;
        }

        let local_address = parts[4];

        // Parse address:port
        if let Some(colon_pos) = local_address.rfind(':') {
            let addr_with_interface = &local_address[..colon_pos];
            let port_str = &local_address[colon_pos + 1..];

            if let Ok(port) = port_str.parse::<u16>() {
                // Remove interface specifier
                let addr = if let Some(percent_pos) = addr_with_interface.find('%') {
                    &addr_with_interface[..percent_pos]
                } else {
                    addr_with_interface
                };

                // Only include local addresses
                if addr == "127.0.0.1" || addr.starts_with("127.0.0.") || 
                   addr == "0.0.0.0" || addr == "::1" || addr == "*" ||
                   addr.starts_with("192.168.") || addr.starts_with("10.") || 
                   addr.starts_with("172.") || addr == "localhost" {
                    
                    // Extract PID if available
                    let pid = if parts.len() > 6 && parts[6].contains("users:") {
                        self.extract_pid_from_users_field(parts[6])
                    } else {
                        None
                    };
                    
                    return Some((port, pid));
                }
            }
        }

        None
    }
    
    #[cfg(target_os = "linux")]
    fn extract_pid_from_users_field(&self, users_field: &str) -> Option<u32> {
        // ss format: users:(("process",pid=1234,fd=5))
        if let Some(start) = users_field.find("pid=") {
            let pid_part = &users_field[start + 4..];
            if let Some(end) = pid_part.find(',') {
                let pid_str = &pid_part[..end];
                return pid_str.parse().ok();
            }
        }
        None
    }
    
    fn select_primary_port(&self, ports: &[u16], process_info: &ProcessInfo) -> u16 {
        // Priority logic for selecting the main port when a process has multiple
        
        // 1. Check for well-known service ports
        for &port in ports {
            match port {
                25565 => return port, // Minecraft
                7777 => return port,  // Terraria  
                3306 => return port,  // MySQL
                5432 => return port,  // PostgreSQL
                6379 => return port,  // Redis
                80 | 443 => return port, // HTTP(S)
                _ => {}
            }
        }
        
        // 2. Check process command for hints
        let command = process_info.command.to_lowercase();
        for &port in ports {
            if command.contains(&port.to_string()) {
                return port;
            }
        }
        
        // 3. Prefer development ports (3000-9000 range)
        for &port in ports {
            if (3000..=9000).contains(&port) {
                return port;
            }
        }
        
        // 4. Prefer lower numbered ports (typically primary)
        *ports.iter().min().unwrap_or(&ports[0])
    }

    #[cfg(target_os = "linux")]
    async fn get_linux_pid_for_port(&self, port: u16) -> Result<u32, String> {
        // Try multiple approaches to find the PID
        
        // Method 1: Try netstat first
        if let Ok(pid) = self.try_netstat_for_pid(port).await {
            return Ok(pid);
        }
        
        // Method 2: Try lsof (often works when netstat doesn't show PIDs)
        if let Ok(pid) = self.try_lsof_for_pid(port).await {
            return Ok(pid);
        }
        
        // Method 3: Try ss with process info
        if let Ok(pid) = self.try_ss_for_pid(port).await {
            return Ok(pid);
        }
        
        // Method 4: Try scanning /proc/*/net/tcp (direct approach)
        if let Ok(pid) = self.try_proc_scan_for_pid(port).await {
            return Ok(pid);
        }

        Err(format!("No process found for port {}", port))
    }
    
    #[cfg(target_os = "linux")]
    async fn try_netstat_for_pid(&self, port: u16) -> Result<u32, String> {
        let output = AsyncCommand::new("netstat")
            .args(&["-tulnp"])
            .output()
            .await
            .map_err(|e| format!("Failed to run netstat: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        
        for line in stdout.lines() {
            if line.contains(&format!(":{}", port)) {
                if let Some(pid) = self.extract_pid_from_netstat_line_linux(line) {
                    return Ok(pid);
                }
            }
        }

        Err("No PID found with netstat".to_string())
    }
    
    #[cfg(target_os = "linux")]
    async fn try_lsof_for_pid(&self, port: u16) -> Result<u32, String> {
        let output = AsyncCommand::new("lsof")
            .args(&["-i", &format!(":{}", port), "-t"])
            .output()
            .await
            .map_err(|e| format!("Failed to run lsof: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(pid_line) = stdout.lines().next() {
                if let Ok(pid) = pid_line.trim().parse::<u32>() {
                    return Ok(pid);
                }
            }
        }

        Err("No PID found with lsof".to_string())
    }
    
    #[cfg(target_os = "linux")]
    async fn try_ss_for_pid(&self, port: u16) -> Result<u32, String> {
        let output = AsyncCommand::new("ss")
            .args(&["-tulnp", "sport", &format!("= :{}", port)])
            .output()
            .await
            .map_err(|e| format!("Failed to run ss: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        
        for line in stdout.lines() {
            if line.contains("users:") {
                // ss format: users:(("process",pid=1234,fd=5))
                if let Some(start) = line.find("pid=") {
                    let pid_part = &line[start + 4..];
                    if let Some(end) = pid_part.find(',') {
                        let pid_str = &pid_part[..end];
                        if let Ok(pid) = pid_str.parse::<u32>() {
                            return Ok(pid);
                        }
                    }
                }
            }
        }

        Err("No PID found with ss".to_string())
    }
    
    #[cfg(target_os = "linux")]
    async fn try_proc_scan_for_pid(&self, port: u16) -> Result<u32, String> {
        // This is a more direct approach - scan /proc/*/net/tcp
        // This might work even when the other tools don't show PIDs
        let port_hex = format!("{:04X}", port);
        
        if let Ok(mut entries) = tokio::fs::read_dir("/proc").await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                if let Ok(file_name) = entry.file_name().into_string() {
                    if let Ok(pid) = file_name.parse::<u32>() {
                        let tcp_path = format!("/proc/{}/net/tcp", pid);
                        if let Ok(content) = tokio::fs::read_to_string(&tcp_path).await {
                            for line in content.lines().skip(1) {
                                let parts: Vec<&str> = line.split_whitespace().collect();
                                if parts.len() > 1 {
                                    let local_addr = parts[1];
                                    if local_addr.ends_with(&format!(":{}", port_hex)) {
                                        return Ok(pid);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        Err("No PID found with /proc scan".to_string())
    }
    
    fn guess_service_by_port(&self, port: u16) -> &'static str {
        match port {
            22 => "SSH Server",
            25 => "SMTP Server", 
            53 => "DNS Server",
            80 => "HTTP Server",
            110 => "POP3 Server",
            143 => "IMAP Server",
            443 => "HTTPS Server",
            993 => "IMAPS Server",
            995 => "POP3S Server",
            3306 => "MySQL Database",
            5432 => "PostgreSQL Database",
            6379 => "Redis Cache",
            8080 => "HTTP Alt Server",
            8443 => "HTTPS Alt Server",
            9000 => "Development Server",
            25565 => "Minecraft Server",
            7777 => "Terraria Server",
            3000..=9999 => "Development Server",
            _ => "System Service"
        }
    }

    /// Check if a port is likely a system service that should be shown even without PID access
    fn is_system_service_port(&self, port: u16) -> bool {
        match port {
            // Standard system services
            22 | 25 | 53 | 80 | 110 | 143 | 443 | 993 | 995 => true,
            // Common databases
            3306 | 5432 | 6379 => true,
            // Common game servers (users might want to see these)
            25565 | 7777 => true,
            // Common web development ports
            3000..=9999 => true,
            // Everything else - skip to reduce noise
            _ => false
        }
    }

    #[cfg(target_os = "linux")]
    fn extract_pid_from_netstat_line_linux(&self, line: &str) -> Option<u32> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if let Some(last_part) = parts.last() {
            // Handle cases where PID is not available (shows as "-")
            if *last_part == "-" {
                return None;
            }
            
            if let Some(slash_pos) = last_part.find('/') {
                let pid_str = &last_part[..slash_pos];
                return pid_str.parse().ok();
            }
        }
        None
    }

    #[cfg(target_os = "linux")]
    async fn extract_linux_process_info(&self, pid: u32) -> Result<ProcessInfo, String> {
        let proc_path = format!("/proc/{}", pid);
        
        // Read command line
        let cmdline_path = format!("{}/cmdline", proc_path);
        let cmdline_data = tokio::fs::read(&cmdline_path).await
            .map_err(|e| format!("Failed to read process cmdline: {}", e))?;
        
        let command_parts: Vec<String> = cmdline_data
            .split(|&b| b == 0)
            .filter(|part| !part.is_empty())
            .map(|part| String::from_utf8_lossy(part).to_string())
            .collect();

        if command_parts.is_empty() {
            return Err(format!("Empty command line for PID {}", pid));
        }

        let command = command_parts.join(" ");

        // Read working directory
        let cwd_path = format!("{}/cwd", proc_path);
        let working_directory = tokio::fs::read_link(&cwd_path).await
            .unwrap_or_else(|_| PathBuf::from("/"));

        // Read executable path
        let exe_path = format!("{}/exe", proc_path);
        let executable_path = tokio::fs::read_link(&exe_path).await
            .unwrap_or_else(|_| PathBuf::from(&command_parts[0]));

        // Get process name
        let comm_path = format!("{}/comm", proc_path);
        let name = tokio::fs::read_to_string(&comm_path).await
            .unwrap_or_else(|_| command_parts[0].clone())
            .trim()
            .to_string();

        Ok(ProcessInfo {
            name,
            command,
            working_dir: working_directory.to_string_lossy().to_string(),
            executable_path: executable_path.to_string_lossy().to_string(),
        })
    }

    // Windows implementations
    #[cfg(target_os = "windows")]
    async fn scan_windows_ports(&self) -> Result<Vec<(String, u16)>, String> {
        let output = AsyncCommand::new("netstat")
            .args(&["-an"])
            .output()
            .await
            .map_err(|e| format!("Failed to run netstat: {}", e))?;

        if !output.status.success() {
            return Err("netstat command failed".to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut ports = Vec::new();

        for line in stdout.lines() {
            if let Some((ip, port)) = self.parse_netstat_line_windows(line) {
                ports.push((ip, port));
            }
        }

        Ok(ports)
    }

    #[cfg(target_os = "windows")]
    fn parse_netstat_line_windows(&self, line: &str) -> Option<(String, u16)> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 {
            return None;
        }

        let protocol = parts[0].to_lowercase();
        if protocol != "tcp" && protocol != "udp" {
            return None;
        }

        // For TCP, check if it's LISTENING (parts[3] should be "LISTENING")
        // For UDP, there's typically an asterisk (*:*) in foreign address (parts[2])
        if protocol == "tcp" {
            if parts.len() < 4 || parts[3] != "LISTENING" {
                return None;
            }
        }

        let local_address = parts[1];
        if let Some(colon_pos) = local_address.rfind(':') {
            let addr = &local_address[..colon_pos];
            let port_str = &local_address[colon_pos + 1..];

            if let Ok(port) = port_str.parse::<u16>() {
                // Accept more address types including wildcard and IPv6
                if addr == "127.0.0.1" || addr == "0.0.0.0" || addr == "[::]" || addr == "[::1]" {
                    return Some((addr.to_string(), port));
                }
            }
        }

        None
    }

    #[cfg(target_os = "windows")]
    async fn get_windows_pid_for_port(&self, port: u16) -> Result<u32, String> {
        let output = AsyncCommand::new("netstat")
            .args(&["-ano"])
            .output()
            .await
            .map_err(|e| format!("Failed to run netstat -ano: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        
        for line in stdout.lines() {
            if line.contains(&format!(":{}", port)) {
                if let Some(pid) = self.extract_pid_from_netstat_windows(line) {
                    return Ok(pid);
                }
            }
        }

        Err(format!("No process found for port {}", port))
    }

    #[cfg(target_os = "windows")]
    fn extract_pid_from_netstat_windows(&self, line: &str) -> Option<u32> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if let Some(last_part) = parts.last() {
            return last_part.parse().ok();
        }
        None
    }

    #[cfg(target_os = "windows")]
    async fn extract_windows_process_info(&self, pid: u32) -> Result<ProcessInfo, String> {
        let output = AsyncCommand::new("tasklist")
            .args(&["/FI", &format!("PID eq {}", pid), "/FO", "CSV", "/V"])
            .output()
            .await
            .map_err(|e| format!("Failed to run tasklist: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        
        let lines: Vec<&str> = stdout.lines().collect();
        if lines.len() < 2 {
            return Err("Process not found".to_string());
        }

        let process_line = lines[1];
        let parts: Vec<&str> = process_line.split(',').collect();
        
        if parts.is_empty() {
            return Err("Invalid process data".to_string());
        }

        let name = parts[0].trim_matches('"').to_string();
        
        Ok(ProcessInfo {
            name: name.clone(),
            command: name.clone(), // Simplified - would need more Windows API calls
            working_dir: "C:\\".to_string(), // Would need Windows API
            executable_path: parts[0].trim_matches('"').to_string(),
        })
    }

    // macOS implementations
    #[cfg(target_os = "macos")]
    async fn scan_macos_ports(&self) -> Result<Vec<(String, u16)>, String> {
        log::info!("macOS: Running netstat to scan for ports");
        let mut ports = Vec::new();

        // Scan TCP ports
        let tcp_output = AsyncCommand::new("netstat")
            .args(&["-an", "-p", "tcp"])
            .output()
            .await
            .map_err(|e| format!("Failed to run netstat for TCP: {}", e))?;

        if tcp_output.status.success() {
            let stdout = String::from_utf8_lossy(&tcp_output.stdout);
            log::debug!("macOS: TCP netstat output:\n{}", stdout);

            for line in stdout.lines() {
                if let Some((ip, port)) = self.parse_netstat_line_macos(line) {
                    log::debug!("macOS: Found TCP port {} on {}", port, ip);
                    ports.push((ip, port));
                }
            }
        } else {
            let stderr = String::from_utf8_lossy(&tcp_output.stderr);
            log::warn!("macOS: TCP netstat command failed: {}", stderr);
        }

        // Scan UDP ports
        let udp_output = AsyncCommand::new("netstat")
            .args(&["-an", "-p", "udp"])
            .output()
            .await
            .map_err(|e| format!("Failed to run netstat for UDP: {}", e))?;

        if udp_output.status.success() {
            let stdout = String::from_utf8_lossy(&udp_output.stdout);
            log::debug!("macOS: UDP netstat output:\n{}", stdout);

            for line in stdout.lines() {
                if let Some((ip, port)) = self.parse_netstat_line_macos_udp(line) {
                    log::debug!("macOS: Found UDP port {} on {}", port, ip);
                    ports.push((ip, port));
                }
            }
        } else {
            let stderr = String::from_utf8_lossy(&udp_output.stderr);
            log::warn!("macOS: UDP netstat command failed: {}", stderr);
        }

        log::info!("macOS: Found {} total listening ports", ports.len());
        Ok(ports)
    }

    #[cfg(target_os = "macos")]
    fn parse_netstat_line_macos(&self, line: &str) -> Option<(String, u16)> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 6 {
            return None;
        }

        let protocol = parts[0].to_lowercase();
        if protocol != "tcp" && protocol != "tcp4" && protocol != "tcp6" {
            return None;
        }

        // Check for LISTEN state (column 5)
        let state = parts[5];
        if state != "LISTEN" {
            return None;
        }

        // macOS netstat uses periods as separators, not colons
        // Format: 127.0.0.1.8080 or *.8080 or ::1.8080
        let local_address = parts[3];

        // Handle IPv6 addresses (e.g., "::1.8080" or "fe80::1.8080")
        // For IPv6, we need to find the LAST period (the port separator)
        if let Some(period_pos) = local_address.rfind('.') {
            let addr = &local_address[..period_pos];
            let port_str = &local_address[period_pos + 1..];

            if let Ok(port) = port_str.parse::<u16>() {
                // Normalize the address format
                let normalized_addr = if addr == "*" {
                    "0.0.0.0".to_string()
                } else if addr == "::1" || addr.starts_with("::") {
                    // IPv6 localhost
                    "::1".to_string()
                } else {
                    addr.to_string()
                };

                // Accept all addresses (localhost, wildcard, specific interfaces, IPv6)
                // This includes: 127.0.0.1, 0.0.0.0, *, ::1, ::, localhost, and specific IPs
                return Some((normalized_addr, port));
            }
        }

        None
    }

    #[cfg(target_os = "macos")]
    fn parse_netstat_line_macos_udp(&self, line: &str) -> Option<(String, u16)> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        // UDP has fewer columns (no state), typically 5 columns
        if parts.len() < 5 {
            return None;
        }

        let protocol = parts[0].to_lowercase();
        if protocol != "udp" && protocol != "udp4" && protocol != "udp6" {
            return None;
        }

        // For UDP, local address is in column 3
        let local_address = parts[3];

        // Handle IPv6 addresses (e.g., "::1.8080" or "fe80::1.8080")
        if let Some(period_pos) = local_address.rfind('.') {
            let addr = &local_address[..period_pos];
            let port_str = &local_address[period_pos + 1..];

            if let Ok(port) = port_str.parse::<u16>() {
                // Normalize the address format
                let normalized_addr = if addr == "*" {
                    "0.0.0.0".to_string()
                } else if addr == "::1" || addr.starts_with("::") {
                    "::1".to_string()
                } else {
                    addr.to_string()
                };

                // Accept all addresses for UDP
                return Some((normalized_addr, port));
            }
        }

        None
    }

    #[cfg(target_os = "macos")]
    async fn get_macos_pid_for_port(&self, port: u16) -> Result<u32, String> {
        log::debug!("macOS: Looking up PID for port {}", port);
        let output = AsyncCommand::new("lsof")
            .args(&["-i", &format!(":{}", port), "-n", "-P"])
            .output()
            .await
            .map_err(|e| format!("Failed to run lsof: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::warn!("macOS: lsof failed for port {}: {}", port, stderr);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        log::trace!("macOS: lsof output for port {}:\n{}", port, stdout);

        for line in stdout.lines().skip(1) { // Skip header
            if let Some(pid) = self.extract_pid_from_lsof_line(line) {
                log::debug!("macOS: Found PID {} for port {}", pid, port);
                return Ok(pid);
            }
        }

        log::warn!("macOS: No process found for port {}", port);
        Err(format!("No process found for port {}", port))
    }

    #[cfg(target_os = "macos")]
    fn extract_pid_from_lsof_line(&self, line: &str) -> Option<u32> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() > 1 {
            return parts[1].parse().ok();
        }
        None
    }

    #[cfg(target_os = "macos")]
    async fn extract_macos_process_info(&self, pid: u32) -> Result<ProcessInfo, String> {
        log::debug!("macOS: Extracting process info for PID {}", pid);
        let output = AsyncCommand::new("ps")
            .args(&["-p", &pid.to_string(), "-o", "pid,comm,args"])
            .output()
            .await
            .map_err(|e| format!("Failed to run ps: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let lines: Vec<&str> = stdout.lines().collect();

        if lines.len() < 2 {
            log::warn!("macOS: Process {} not found", pid);
            return Err("Process not found".to_string());
        }

        let process_line = lines[1];
        let parts: Vec<&str> = process_line.splitn(3, ' ').collect();

        if parts.len() < 3 {
            log::warn!("macOS: Invalid process data for PID {}: {}", pid, process_line);
            return Err("Invalid process data".to_string());
        }

        let name = parts[1].to_string();
        let command = parts[2].to_string();

        log::debug!("macOS: Found process info for PID {}: {}", pid, name);

        Ok(ProcessInfo {
            name,
            command,
            working_dir: "/".to_string(), // Would need additional system calls
            executable_path: parts[1].to_string(),
        })
    }
}

#[derive(Debug)]
pub struct ProcessInfo {
    pub name: String,
    pub command: String,
    pub working_dir: String,
    pub executable_path: String,
}

impl Default for ProcessScanner {
    fn default() -> Self {
        Self::new()
    }
}