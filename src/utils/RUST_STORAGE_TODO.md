# Rust Storage Commands TODO

Add these Tauri commands to support layout preferences storage:

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize)]
struct LayoutEnvelope {
    version: u32,
    data: serde_json::Value,
}

#[tauri::command]
fn get_layout_preferences(app_handle: tauri::AppHandle) -> Result<LayoutEnvelope, String> {
    let data_dir = app_handle.path_resolver()
        .app_data_dir()
        .ok_or("Failed to get app data directory")?;

    let prefs_path = data_dir.join("layout_preferences.json");

    if !prefs_path.exists() {
        return Err("No preferences file found".to_string());
    }

    let contents = fs::read_to_string(&prefs_path)
        .map_err(|e| format!("Failed to read preferences: {}", e))?;

    let envelope: LayoutEnvelope = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse preferences: {}", e))?;

    Ok(envelope)
}

#[tauri::command]
fn save_layout_preferences(
    app_handle: tauri::AppHandle,
    preferences: LayoutEnvelope
) -> Result<(), String> {
    let data_dir = app_handle.path_resolver()
        .app_data_dir()
        .ok_or("Failed to get app data directory")?;

    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data directory: {}", e))?;

    let prefs_path = data_dir.join("layout_preferences.json");

    // Write atomically: temp file + rename to avoid corruption
    let temp_path = data_dir.join("layout_preferences.json.tmp");

    let json = serde_json::to_string_pretty(&preferences)
        .map_err(|e| format!("Failed to serialize preferences: {}", e))?;

    fs::write(&temp_path, json)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    fs::rename(&temp_path, &prefs_path)
        .map_err(|e| format!("Failed to rename temp file: {}", e))?;

    Ok(())
}
```

## Register Commands

In your Tauri builder:

```rust
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        get_layout_preferences,
        save_layout_preferences,
        // ... other commands
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
```
