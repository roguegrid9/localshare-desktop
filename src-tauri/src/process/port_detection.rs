use anyhow::{Context, Result};
use std::collections::HashMap;
use std::process::Command;

#[derive(Debug, Clone)]
pub struct PortInfo {
    pub port: u16,
    pub protocol: String, // "tcp" or "udp"
    pub confidence: f32,  // 0.0 to 1.0
}

/// Detect which ports a specific process ID is using
/// Uses platform-specific methods for accurate detection
pub fn detect_ports_for_pid(pid: u32) -> Result<Vec<PortInfo>> {
    #[cfg(target_os = "linux")]
    {
        detect_ports_linux(pid)
    }

    #[cfg(target_os = "macos")]
    {
        detect_ports_macos(pid)
    }

    #[cfg(target_os = "windows")]
    {
        detect_ports_windows(pid)
    }
}

#[cfg(target_os = "linux")]
fn detect_ports_linux(pid: u32) -> Result<Vec<PortInfo>> {
    let mut ports = Vec::new();

    // Parse /proc/net/tcp for TCP ports
    if let Ok(tcp_content) = std::fs::read_to_string("/proc/net/tcp") {
        ports.extend(parse_linux_proc_net(tcp_content, pid, "tcp")?);
    }

    // Parse /proc/net/tcp6 for TCP6 ports
    if let Ok(tcp6_content) = std::fs::read_to_string("/proc/net/tcp6") {
        ports.extend(parse_linux_proc_net(tcp6_content, pid, "tcp")?);
    }

    // Parse /proc/net/udp for UDP ports
    if let Ok(udp_content) = std::fs::read_to_string("/proc/net/udp") {
        ports.extend(parse_linux_proc_net(udp_content, pid, "udp")?);
    }

    if ports.is_empty() {
        // Fallback to lsof if available
        if let Ok(lsof_ports) = detect_ports_with_lsof(pid) {
            ports.extend(lsof_ports);
        }
    }

    Ok(ports)
}

#[cfg(target_os = "linux")]
fn parse_linux_proc_net(content: String, target_pid: u32, protocol: &str) -> Result<Vec<PortInfo>> {
    let mut ports = Vec::new();

    // Skip header line
    for line in content.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 10 {
            continue;
        }

        // parts[1] contains "local_address:port" in hex
        if let Some(port_hex) = parts[1].split(':').nth(1) {
            // parts[9] contains inode
            if let Ok(inode) = parts[9].parse::<u64>() {
                // Find which process owns this inode
                if let Ok(owner_pid) = find_pid_for_inode(inode) {
                    if owner_pid == target_pid {
                        if let Ok(port) = u16::from_str_radix(port_hex, 16) {
                            ports.push(PortInfo {
                                port,
                                protocol: protocol.to_string(),
                                confidence: 1.0, // High confidence from /proc
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(ports)
}

#[cfg(target_os = "linux")]
fn find_pid_for_inode(inode: u64) -> Result<u32> {
    // Search /proc/*/fd/* for matching socket inode
    let proc_dir = std::fs::read_dir("/proc")?;

    for entry in proc_dir.flatten() {
        if let Some(pid_str) = entry.file_name().to_str() {
            if let Ok(pid) = pid_str.parse::<u32>() {
                let fd_path = format!("/proc/{}/fd", pid);
                if let Ok(fd_dir) = std::fs::read_dir(&fd_path) {
                    for fd_entry in fd_dir.flatten() {
                        if let Ok(link) = std::fs::read_link(fd_entry.path()) {
                            let link_str = link.to_string_lossy();
                            // Socket links look like: socket:[12345]
                            if link_str.starts_with("socket:[") {
                                if let Some(socket_inode_str) = link_str.strip_prefix("socket:[") {
                                    if let Some(socket_inode_str) = socket_inode_str.strip_suffix(']') {
                                        if let Ok(socket_inode) = socket_inode_str.parse::<u64>() {
                                            if socket_inode == inode {
                                                return Ok(pid);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Err(anyhow::anyhow!("PID not found for inode {}", inode))
}

#[cfg(target_os = "macos")]
fn detect_ports_macos(pid: u32) -> Result<Vec<PortInfo>> {
    detect_ports_with_lsof(pid)
}

#[cfg(target_os = "windows")]
fn detect_ports_windows(pid: u32) -> Result<Vec<PortInfo>> {
    let output = Command::new("netstat")
        .args(&["-ano"])
        .output()
        .context("Failed to execute netstat")?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut ports = Vec::new();

    for line in stdout.lines().skip(4) {  // Skip header lines
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 5 {
            continue;
        }

        // Format: Proto  Local Address      Foreign Address    State      PID
        let protocol = parts[0].to_lowercase();
        let local_addr = parts[1];
        let found_pid = parts[parts.len() - 1];

        if found_pid == pid.to_string() {
            // Extract port from "0.0.0.0:8080" or "[::]:8080"
            if let Some(port_str) = local_addr.split(':').last() {
                if let Ok(port) = port_str.parse::<u16>() {
                    ports.push(PortInfo {
                        port,
                        protocol,
                        confidence: 1.0,
                    });
                }
            }
        }
    }

    Ok(ports)
}

/// Fallback method using lsof (works on macOS and Linux if installed)
fn detect_ports_with_lsof(pid: u32) -> Result<Vec<PortInfo>> {
    let output = Command::new("lsof")
        .args(&["-Pan", "-p", &pid.to_string(), "-i"])
        .output()
        .context("Failed to execute lsof")?;

    if !output.status.success() {
        return Err(anyhow::anyhow!("lsof command failed"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut ports = Vec::new();

    for line in stdout.lines().skip(1) {  // Skip header
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 9 {
            continue;
        }

        // parts[7] contains protocol (like "TCP" or "UDP")
        // parts[8] contains address like "*:8080" or "localhost:8080"
        let protocol = parts[7].to_lowercase();
        let addr = parts[8];

        // Extract port from "*:8080" or "localhost:8080"
        if let Some(port_str) = addr.split(':').last() {
            // Handle cases like "8080 (LISTEN)" or just "8080"
            let port_str = port_str.split_whitespace().next().unwrap_or(port_str);
            if let Ok(port) = port_str.parse::<u16>() {
                ports.push(PortInfo {
                    port,
                    protocol,
                    confidence: 0.9, // Slightly lower confidence for lsof
                });
            }
        }
    }

    Ok(ports)
}

/// Fallback: Try to detect port by attempting to bind (original method)
/// Returns lower confidence since we can't verify it's the right process
pub fn detect_port_by_binding(common_ports: &[u16]) -> Option<PortInfo> {
    use std::net::TcpListener;

    for port in common_ports {
        // Try to bind to the port
        if TcpListener::bind(format!("127.0.0.1:{}", port)).is_err() {
            // Port is in use - but we don't know if it's our process
            return Some(PortInfo {
                port: *port,
                protocol: "tcp".to_string(),
                confidence: 0.3, // Low confidence - we just know port is busy
            });
        }
    }

    None
}

/// Enhanced port detection with multiple strategies
pub fn detect_process_ports(pid: u32, common_ports: &[u16]) -> Vec<PortInfo> {
    // Strategy 1: Platform-specific detection (highest confidence)
    if let Ok(mut ports) = detect_ports_for_pid(pid) {
        if !ports.is_empty() {
            log::info!("Detected {} ports for PID {} using platform-specific method", ports.len(), pid);
            return ports;
        }
    }

    // Strategy 2: Fallback to bind checking (low confidence)
    if let Some(port_info) = detect_port_by_binding(common_ports) {
        log::warn!("Using low-confidence bind detection for PID {}: port {}", pid, port_info.port);
        return vec![port_info];
    }

    // No ports detected
    log::warn!("Could not detect any ports for PID {}", pid);
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_current_process_port_detection() {
        let pid = std::process::id();
        let ports = detect_ports_for_pid(pid);
        // Current process might not have ports, so just check it doesn't crash
        assert!(ports.is_ok());
    }
}
