use std::net::TcpListener;

// Helper function to check if a port is in use
pub async fn is_port_in_use(port: u16) -> bool {
    // Try to bind to the port - if it fails, the port is in use
    TcpListener::bind(format!("127.0.0.1:{}", port)).is_err()
}

// Quick command to get common development ports that might be in use
pub async fn get_common_ports_in_use() -> Result<Vec<u16>, String> {
    let common_ports = vec![3000, 3001, 8000, 8080, 8888, 5000, 4200, 9000, 25565, 7777];
    let mut ports_in_use = Vec::new();
    
    for port in common_ports {
        // Try to bind to the port to see if it's in use
        if TcpListener::bind(format!("127.0.0.1:{}", port)).is_err() {
            ports_in_use.push(port);
        }
    }
    
    Ok(ports_in_use)
}
