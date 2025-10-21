use std::net::TcpListener;

// Helper function to check if a port is in use
pub async fn is_port_in_use(port: u16) -> bool {
    // Try to bind to the port - if it fails, the port is in use
    TcpListener::bind(format!("localhost:{}", port)).is_err()
}

// Quick command to get common development ports that might be in use
pub async fn get_common_ports_in_use() -> Result<Vec<u16>, String> {
    let common_ports = vec![3000, 3001, 8000, 8080, 8888, 5000, 4200, 9000, 25565, 7777];
    let mut ports_in_use = Vec::new();
    
    for port in common_ports {
        // Try to bind to the port to see if it's in use
        if TcpListener::bind(format!("localhost:{}", port)).is_err() {
            ports_in_use.push(port);
        }
    }
    
    Ok(ports_in_use)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[tokio::test]
    async fn test_is_port_in_use_free_port() {
        // Find a free port by binding and then dropping
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let free_port = listener.local_addr().unwrap().port();
        drop(listener); // Release the port

        // Now check that the port is free
        let in_use = is_port_in_use(free_port).await;
        assert!(!in_use);
    }

    #[tokio::test]
    async fn test_is_port_in_use_occupied_port() {
        // Bind to a port to occupy it
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let occupied_port = listener.local_addr().unwrap().port();

        // Check that the port is in use
        let in_use = is_port_in_use(occupied_port).await;
        assert!(in_use);

        // Clean up
        drop(listener);
    }

    #[tokio::test]
    async fn test_get_common_ports_in_use_returns_vec() {
        let result = get_common_ports_in_use().await;
        assert!(result.is_ok());

        let ports = result.unwrap();
        // Result should be a vector (may be empty or have entries)
        assert!(ports.len() <= 10); // Should not exceed the number of common ports checked
    }

    #[tokio::test]
    async fn test_get_common_ports_in_use_with_occupied_port() {
        // Occupy a common port (3000)
        let listener = TcpListener::bind("127.0.0.1:3000");

        let result = get_common_ports_in_use().await;
        assert!(result.is_ok());

        let ports = result.unwrap();

        // If we successfully bound to port 3000, it should be in the results
        if listener.is_ok() {
            assert!(ports.contains(&3000));
        }

        // Clean up
        drop(listener);
    }
}
