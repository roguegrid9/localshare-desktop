use std::path::PathBuf;
use std::fs;
use super::types::{FRPCredentials, TunnelConfig};

pub struct FRPConfigGenerator {
    config_dir: PathBuf,
}

impl FRPConfigGenerator {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let config_dir = app_data_dir.join("frp");
        fs::create_dir_all(&config_dir).ok();

        Self { config_dir }
    }

    pub fn generate_config(
        &self,
        credentials: &FRPCredentials,
        tunnels: &[TunnelConfig],
    ) -> Result<PathBuf, String> {
        let config_path = self.config_dir.join("frpc.ini");

        let mut config = format!(
            "[common]\n\
             server_addr = {}\n\
             server_port = {}\n\
             authentication_method = token\n\
             token = {}\n\
             user = {}\n\
             \n",
            credentials.server_addr,
            credentials.server_port,
            credentials.auth_token,
            credentials.user_id
        );

        // Add tunnel configurations
        for tunnel in tunnels {
            match tunnel.protocol.as_str() {
                "http" => {
                    config.push_str(&format!(
                        "[{}]\n\
                         type = http\n\
                         local_port = {}\n\
                         subdomain = {}\n\
                         \n",
                        tunnel.id,
                        tunnel.local_port,
                        tunnel.subdomain
                    ));
                }
                "https" => {
                    config.push_str(&format!(
                        "[{}]\n\
                         type = https\n\
                         local_port = {}\n\
                         subdomain = {}\n\
                         \n",
                        tunnel.id,
                        tunnel.local_port,
                        tunnel.subdomain
                    ));
                }
                "tcp" => {
                    config.push_str(&format!(
                        "[{}]\n\
                         type = tcp\n\
                         local_port = {}\n\
                         remote_port = {}\n\
                         \n",
                        tunnel.id,
                        tunnel.local_port,
                        tunnel.local_port // Use same port remotely
                    ));
                }
                _ => {}
            }
        }

        fs::write(&config_path, config)
            .map_err(|e| format!("Failed to write config: {}", e))?;

        Ok(config_path)
    }

    pub fn get_config_path(&self) -> PathBuf {
        self.config_dir.join("frpc.ini")
    }
}
