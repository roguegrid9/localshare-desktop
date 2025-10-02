// src-tauri/src/terminal/shell.rs

use anyhow::{Context, Result};
use std::env;
use std::path::PathBuf;
use std::fmt;

#[derive(Debug, Clone, PartialEq)]
pub enum ShellType {
    Bash,
    Zsh,
    Fish,
    PowerShell,
    Cmd,
    PowerShellCore,
    Container { container_id: String, inner_shell: String },
}

impl fmt::Display for ShellType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ShellType::Bash => write!(f, "bash"),
            ShellType::Zsh => write!(f, "zsh"),
            ShellType::Fish => write!(f, "fish"),
            ShellType::PowerShell => write!(f, "powershell"),
            ShellType::Cmd => write!(f, "cmd"),
            ShellType::PowerShellCore => write!(f, "pwsh"),
            ShellType::Container { inner_shell, .. } => write!(f, "container-{}", inner_shell),
        }
    }
}

impl ShellType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ShellType::Bash => "bash",
            ShellType::Zsh => "zsh", 
            ShellType::Fish => "fish",
            ShellType::PowerShell => "powershell",
            ShellType::Cmd => "cmd",
            ShellType::PowerShellCore => "pwsh",
            ShellType::Container { .. } => "container",
        }
    }

    pub fn get_command_and_args(&self) -> (&str, Vec<&str>) {
        match self {
            ShellType::Bash => ("bash", vec!["--login", "-i"]),
            ShellType::Zsh => ("zsh", vec!["--login", "-i"]),
            ShellType::Fish => ("fish", vec!["--login", "--interactive"]),
            ShellType::PowerShell => ("powershell", vec!["-NoLogo", "-Interactive"]),
            ShellType::Cmd => ("cmd", vec!["/K"]),
            ShellType::PowerShellCore => ("pwsh", vec!["-NoLogo", "-Interactive"]),
            ShellType::Container { container_id, inner_shell } => {
                ("docker", vec!["exec", "-it", container_id.as_str(), inner_shell.as_str()])
            }
        }
    }

    pub fn get_environment_vars(&self, config: &crate::terminal::types::TerminalConfig) -> Vec<(String, String)> {
        let mut vars = vec![
            ("TERM".to_string(), "xterm-256color".to_string()),
            ("COLORTERM".to_string(), "truecolor".to_string()),
        ];

        if config.enable_colors {
            match self {
                ShellType::Bash | ShellType::Zsh => {
                    let ps1 = if let Some(custom_ps1) = &config.custom_ps1 {
                        custom_ps1.clone()
                    } else {
                        self.get_colored_ps1(&config.color_theme)
                    };
                    vars.push(("PS1".to_string(), ps1));
                }
                ShellType::Fish => {
                    // Fish will use function-based prompt setup
                    vars.push(("FISH_ROGUEGRID_COLORS".to_string(), "1".to_string()));
                }
                ShellType::PowerShell | ShellType::PowerShellCore => {
                    vars.push(("PROMPT".to_string(), "RogueGrid> ".to_string()));
                }
                ShellType::Cmd => {
                    vars.push(("PROMPT".to_string(), "RogueGrid$G ".to_string()));
                }
                ShellType::Container { inner_shell, .. } => {
                    vars.push(("PS1".to_string(), "container:\\w$ ".to_string()));
                    vars.push(("CONTAINER_SHELL".to_string(), inner_shell.clone()));
                }
            }
        } else {
            // No colors - simple prompts
            match self {
                ShellType::Bash | ShellType::Zsh => {
                    vars.push(("PS1".to_string(), "\\u@roguegrid:\\w$ ".to_string()));
                }
                ShellType::Fish => {
                    vars.push(("FISH_ROGUEGRID_COLORS".to_string(), "0".to_string()));
                }
                ShellType::PowerShell | ShellType::PowerShellCore => {
                    vars.push(("PROMPT".to_string(), "RogueGrid> ".to_string()));
                }
                ShellType::Cmd => {
                    vars.push(("PROMPT".to_string(), "RogueGrid$G ".to_string()));
                }
                ShellType::Container { inner_shell, .. } => {
                    vars.push(("PS1".to_string(), "container:\\w$ ".to_string()));
                    vars.push(("CONTAINER_SHELL".to_string(), inner_shell.clone()));
                }
            }
        }

        vars
    }

    fn get_colored_ps1(&self, theme: &crate::terminal::types::ColorTheme) -> String {
        use crate::terminal::types::ColorTheme;
        
        let (user_color, _host_color, path_color, prompt_symbol) = match theme {
            ColorTheme::Dark => ("1;32", "1;32", "1;34", "$"),      // bright green user@host, bright blue path
            ColorTheme::Light => ("0;32", "0;32", "0;34", "$"),     // normal green user@host, normal blue path
            ColorTheme::Minimal => ("0;37", "0;37", "0;37", "$"),   // all white
            ColorTheme::Custom(colors) => (
                colors.user_color.as_str(),
                colors.host_color.as_str(), 
                colors.path_color.as_str(),
                colors.prompt_symbol.as_str()
            ),
        };

        match self {
            ShellType::Bash | ShellType::Zsh => {
                format!(
                    "\\[\\e[{}m\\]\\u@roguegrid\\[\\e[0m\\]:\\[\\e[{}m\\]\\w\\[\\e[0m\\]\\{} ",
                    user_color, path_color, prompt_symbol
                )
            }
            _ => "\\u@roguegrid:\\w$ ".to_string(), // fallback
        }
    }
}

pub struct ShellDetector;

impl ShellDetector {
    /// Detect the best available shell for the current platform
    pub fn detect_best_shell() -> Result<ShellType> {
        if cfg!(windows) {
            Self::detect_windows_shell()
        } else {
            Self::detect_unix_shell()
        }
    }

    /// Try to detect shell from user preference or environment
    pub fn detect_user_preferred_shell() -> Result<ShellType> {
        // Check SHELL environment variable first (Unix)
        if let Ok(shell_path) = env::var("SHELL") {
            if let Some(shell_name) = PathBuf::from(shell_path).file_name() {
                if let Some(shell_str) = shell_name.to_str() {
                    match shell_str {
                        "bash" => return Ok(ShellType::Bash),
                        "zsh" => return Ok(ShellType::Zsh),
                        "fish" => return Ok(ShellType::Fish),
                        _ => {}
                    }
                }
            }
        }

        // Check COMSPEC for Windows
        if cfg!(windows) {
            if let Ok(comspec) = env::var("COMSPEC") {
                if comspec.to_lowercase().contains("cmd") {
                    return Ok(ShellType::Cmd);
                }
            }
        }

        // Fall back to best available
        Self::detect_best_shell()
    }

    /// Detect available shells on Windows
    fn detect_windows_shell() -> Result<ShellType> {
        // Try PowerShell Core first (cross-platform)
        if Self::is_command_available("pwsh") {
            return Ok(ShellType::PowerShellCore);
        }

        // Try Windows PowerShell
        if Self::is_command_available("powershell") {
            return Ok(ShellType::PowerShell);
        }

        // Fall back to cmd
        Ok(ShellType::Cmd)
    }

    /// Detect available shells on Unix-like systems
    fn detect_unix_shell() -> Result<ShellType> {
        // Priority order: zsh, bash, fish
        let shells_to_try = [
            ShellType::Zsh,
            ShellType::Bash,
            ShellType::Fish,
        ];

        for shell in shells_to_try.iter() {
            if Self::is_command_available(shell.as_str()) {
                return Ok(shell.clone());
            }
        }

        // If nothing else works, try sh
        if Self::is_command_available("sh") {
            return Ok(ShellType::Bash); // Treat sh as bash
        }

        Err(anyhow::anyhow!("No suitable shell found"))
    }

    /// Check if a command is available in PATH
    fn is_command_available(command: &str) -> bool {
        std::process::Command::new(command)
            .arg("--version")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    /// Get all available shells on the system
    pub fn get_available_shells() -> Vec<ShellType> {
        let mut available = Vec::new();

        let shells_to_check = if cfg!(windows) {
            vec![ShellType::PowerShellCore, ShellType::PowerShell, ShellType::Cmd]
        } else {
            vec![ShellType::Zsh, ShellType::Bash, ShellType::Fish]
        };

        for shell in shells_to_check {
            if Self::is_command_available(shell.as_str()) {
                available.push(shell);
            }
        }

        available
    }

    /// Get the default working directory for a shell
    pub fn get_default_working_directory() -> Result<PathBuf> {
        // Try home directory first
        if let Some(home) = dirs::home_dir() {
            return Ok(home);
        }

        // Fall back to current directory
        env::current_dir().context("Failed to get current directory")
    }

    /// Validate a shell type string
    pub fn parse_shell_type(shell_str: &str) -> Result<ShellType> {
        match shell_str.to_lowercase().as_str() {
            "bash" => Ok(ShellType::Bash),
            "zsh" => Ok(ShellType::Zsh),
            "fish" => Ok(ShellType::Fish),
            "powershell" | "ps" => Ok(ShellType::PowerShell),
            "cmd" => Ok(ShellType::Cmd),
            "pwsh" | "powershell-core" => Ok(ShellType::PowerShellCore),
            s if s.starts_with("container:") => {
                let parts: Vec<&str> = s.splitn(3, ':').collect();
                if parts.len() == 3 {
                    Ok(ShellType::Container {
                        container_id: parts[1].to_string(),
                        inner_shell: parts[2].to_string(),
                    })
                } else {
                    Err(anyhow::anyhow!("Invalid container shell format: {}", shell_str))
                }
            }
            _ => Err(anyhow::anyhow!("Unsupported shell type: {}", shell_str)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shell_detection() {
        let shell = ShellDetector::detect_best_shell();
        assert!(shell.is_ok());
        println!("Detected shell: {:?}", shell.unwrap());
    }

    #[test]
    fn test_available_shells() {
        let shells = ShellDetector::get_available_shells();
        assert!(!shells.is_empty());
        println!("Available shells: {:?}", shells);
    }

    #[test]
    fn test_shell_parsing() {
        assert_eq!(ShellDetector::parse_shell_type("bash").unwrap(), ShellType::Bash);
        assert_eq!(ShellDetector::parse_shell_type("ZSH").unwrap(), ShellType::Zsh);
        assert!(ShellDetector::parse_shell_type("invalid").is_err());
    }
}
