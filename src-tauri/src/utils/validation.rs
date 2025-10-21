use crate::utils::command::{CommandValidation, CommandTemplate};
use std::path::Path;
use std::process::Command;
use regex::Regex;

// Validate a terminal command before execution
pub async fn validate_terminal_command_impl(
    command: String,
    working_directory: Option<String>,
) -> Result<CommandValidation, String> {
    let trimmed_command = command.trim();
    if trimmed_command.is_empty() {
        return Ok(CommandValidation {
            is_valid: false,
            executable: String::new(),
            args: Vec::new(),
            detected_port: None,
            suggestion: None,
            error: Some("Command cannot be empty".to_string()),
        });
    }

    // Parse command into executable and arguments
    let parts = shell_words::split(trimmed_command)
        .map_err(|e| format!("Failed to parse command: {}", e))?;
    
    if parts.is_empty() {
        return Ok(CommandValidation {
            is_valid: false,
            executable: String::new(),
            args: Vec::new(),
            detected_port: None,
            suggestion: None,
            error: Some("Invalid command format".to_string()),
        });
    }

    let executable = &parts[0];
    let args = parts[1..].to_vec();

    // Check if executable exists
    let executable_exists = check_executable_exists(executable, working_directory.as_deref()).await;
    
    if !executable_exists {
        return Ok(CommandValidation {
            is_valid: false,
            executable: executable.clone(),
            args,
            detected_port: None,
            suggestion: None,
            error: Some(format!("Executable '{}' not found", executable)),
        });
    }

    // Try to detect port from command
    let detected_port = detect_port_from_command(trimmed_command);
    
    // Generate suggestions based on command
    let suggestion = generate_command_suggestion(trimmed_command, detected_port);

    Ok(CommandValidation {
        is_valid: true,
        executable: executable.clone(),
        args,
        detected_port,
        suggestion,
        error: None,
    })
}

// Check if an executable exists and is accessible
async fn check_executable_exists(executable: &str, working_directory: Option<&str>) -> bool {
    // If it's an absolute path, check directly
    if Path::new(executable).is_absolute() {
        return Path::new(executable).exists() && is_executable(executable);
    }

    // If it's a relative path and we have a working directory, check there first
    if let Some(wd) = working_directory {
        let full_path = Path::new(wd).join(executable);
        if full_path.exists() && is_executable(full_path.to_str().unwrap_or("")) {
            return true;
        }
    }

    // Check if it's in PATH
    check_command_in_path(executable).await
}

// Check if command exists in PATH
pub async fn check_command_in_path(command: &str) -> bool {
    let which_cmd = if cfg!(target_os = "windows") {
        Command::new("where").arg(command).output()
    } else {
        Command::new("which").arg(command).output()
    };

    match which_cmd {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

// Basic executable check (this is platform-specific and simplified)
fn is_executable(path: &str) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(path) {
            let permissions = metadata.permissions();
            permissions.mode() & 0o111 != 0
        } else {
            false
        }
    }
    
    #[cfg(windows)]
    {
        // On Windows, check if it's an .exe, .bat, .cmd, etc.
        let path_lower = path.to_lowercase();
        path_lower.ends_with(".exe") || 
        path_lower.ends_with(".bat") || 
        path_lower.ends_with(".cmd") ||
        path_lower.ends_with(".com")
    }
}

// Detect port numbers from command string
fn detect_port_from_command(command: &str) -> Option<u16> {
    // Common port patterns in commands
    let patterns = vec![
        r"--port\s+(\d+)",           // --port 3000
        r"-p\s+(\d+)",               // -p 8080
        r":\s*(\d+)",                // server 8000, :3000
        r"port\s*=\s*(\d+)",         // port=5000
        r"http\.server\s+(\d+)",     // python -m http.server 8080
        r"runserver\s+(\d+)",        // manage.py runserver 8000
        r"listen\s+(\d+)",           // --listen 9000
    ];

    for pattern in patterns {
        if let Ok(re) = Regex::new(pattern) {
            if let Some(captures) = re.captures(command) {
                if let Some(port_str) = captures.get(1) {
                    if let Ok(port) = port_str.as_str().parse::<u16>() {
                        if port > 0 && port <= 65535 {
                            return Some(port);
                        }
                    }
                }
            }
        }
    }

    None
}

// Generate helpful suggestions based on the command
fn generate_command_suggestion(command: &str, detected_port: Option<u16>) -> Option<String> {
    let cmd_lower = command.to_lowercase();
    
    if cmd_lower.contains("http.server") {
        return Some("HTTP file server - will serve files from current directory".to_string());
    }
    
    if cmd_lower.contains("npm run dev") {
        return Some("Development server - usually includes hot reload".to_string());
    }
    
    if cmd_lower.contains("server.jar") {
        return Some("Minecraft server - don't forget 'nogui' for headless mode".to_string());
    }
    
    if cmd_lower.contains("manage.py runserver") {
        return Some("Django development server".to_string());
    }
    
    if cmd_lower.contains("flask") || cmd_lower.contains("app.py") {
        return Some("Flask web application".to_string());
    }
    
    if detected_port.is_some() {
        return Some("Network service detected".to_string());
    }
    
    None
}

// Utility to get popular command templates
pub fn generate_command_templates() -> Vec<CommandTemplate> {
    vec![
        CommandTemplate {
            name: "HTTP File Server".to_string(),
            command: "python -m http.server 8000".to_string(),
            description: "Serve files from current directory".to_string(),
            category: "web".to_string(),
            default_port: Some(8000),
        },
        CommandTemplate {
            name: "Node.js Dev Server".to_string(),
            command: "npm run dev".to_string(),
            description: "Start development server with hot reload".to_string(),
            category: "development".to_string(),
            default_port: Some(3000),
        },
        CommandTemplate {
            name: "Minecraft Server".to_string(),
            command: "java -Xmx1024M -Xms1024M -jar server.jar nogui".to_string(),
            description: "Headless Minecraft server".to_string(),
            category: "gaming".to_string(),
            default_port: Some(25565),
        },
        CommandTemplate {
            name: "Django Dev Server".to_string(),
            command: "python manage.py runserver 8000".to_string(),
            description: "Django development server".to_string(),
            category: "development".to_string(),
            default_port: Some(8000),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_port_from_command_with_port_flag() {
        assert_eq!(detect_port_from_command("npm run dev --port 3000"), Some(3000));
        assert_eq!(detect_port_from_command("server -p 8080"), Some(8080));
        assert_eq!(detect_port_from_command("python -m http.server 8000"), Some(8000));
    }

    #[test]
    fn test_detect_port_from_command_with_port_option() {
        assert_eq!(detect_port_from_command("run server port=5000"), Some(5000));
        assert_eq!(detect_port_from_command("server --listen 9000"), Some(9000));
    }

    #[test]
    fn test_detect_port_from_command_with_colon() {
        assert_eq!(detect_port_from_command("server :3000"), Some(3000));
        assert_eq!(detect_port_from_command("localhost:8080"), Some(8080));
    }

    #[test]
    fn test_detect_port_from_command_no_port() {
        assert_eq!(detect_port_from_command("npm install"), None);
        assert_eq!(detect_port_from_command("ls -la"), None);
        assert_eq!(detect_port_from_command("echo hello"), None);
    }

    #[test]
    fn test_detect_port_from_command_invalid_port() {
        // Port out of range
        assert_eq!(detect_port_from_command("server --port 99999"), None);
        assert_eq!(detect_port_from_command("server --port 0"), None);
    }

    #[test]
    fn test_generate_command_suggestion_http_server() {
        let suggestion = generate_command_suggestion("python -m http.server 8000", Some(8000));
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("HTTP file server"));
    }

    #[test]
    fn test_generate_command_suggestion_npm_dev() {
        let suggestion = generate_command_suggestion("npm run dev", None);
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("Development server"));
    }

    #[test]
    fn test_generate_command_suggestion_minecraft() {
        let suggestion = generate_command_suggestion("java -jar server.jar nogui", None);
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("Minecraft"));
    }

    #[test]
    fn test_generate_command_suggestion_django() {
        let suggestion = generate_command_suggestion("python manage.py runserver 8000", Some(8000));
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("Django"));
    }

    #[test]
    fn test_generate_command_suggestion_flask() {
        let suggestion = generate_command_suggestion("flask run", None);
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("Flask"));
    }

    #[test]
    fn test_generate_command_suggestion_generic_port() {
        let suggestion = generate_command_suggestion("some-server --port 5000", Some(5000));
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("Network service"));
    }

    #[test]
    fn test_generate_command_suggestion_no_match() {
        let suggestion = generate_command_suggestion("ls -la", None);
        assert!(suggestion.is_none());
    }

    #[test]
    fn test_generate_command_templates_has_entries() {
        let templates = generate_command_templates();
        assert!(!templates.is_empty());
        assert!(templates.len() >= 4);
    }

    #[test]
    fn test_generate_command_templates_has_http_server() {
        let templates = generate_command_templates();
        let http_server = templates.iter().find(|t| t.name == "HTTP File Server");
        assert!(http_server.is_some());

        let http = http_server.unwrap();
        assert_eq!(http.default_port, Some(8000));
        assert_eq!(http.category, "web");
    }

    #[test]
    fn test_generate_command_templates_has_nodejs() {
        let templates = generate_command_templates();
        let nodejs = templates.iter().find(|t| t.name == "Node.js Dev Server");
        assert!(nodejs.is_some());

        let node = nodejs.unwrap();
        assert_eq!(node.default_port, Some(3000));
        assert_eq!(node.category, "development");
    }
}