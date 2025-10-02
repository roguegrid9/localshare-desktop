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