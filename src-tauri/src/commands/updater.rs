use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

/// Check for updates manually (triggered by user)
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    log::info!("Manual update check triggered");

    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                let version_info = serde_json::json!({
                    "version": update.version,
                    "current_version": update.current_version,
                });

                log::info!("Update available: {}", update.version);
                Ok(Some(version_info))
            }
            Ok(None) => {
                log::info!("No updates available");
                Ok(None)
            }
            Err(e) => {
                log::error!("Failed to check for updates: {}", e);
                Err(format!("Failed to check for updates: {}", e))
            }
        }
        Err(e) => {
            log::error!("Failed to get updater: {}", e);
            Err(format!("Failed to get updater: {}", e))
        }
    }
}

/// Download and install an available update
#[tauri::command]
pub async fn download_and_install_update(app: AppHandle) -> Result<(), String> {
    log::info!("Downloading and installing update...");

    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                let app_handle = app.clone();

                // Download and install with progress tracking
                match update
                    .download_and_install(
                        |chunk_length, content_length| {
                            // Emit download progress
                            if let Some(total) = content_length {
                                let progress = (chunk_length as f64 / total as f64 * 100.0) as u32;
                                if let Err(e) = app_handle.emit("update-download-progress", &serde_json::json!({
                                    "downloaded": chunk_length,
                                    "total": total,
                                    "progress": progress,
                                })) {
                                    log::error!("Failed to emit download progress: {}", e);
                                }
                            }
                        },
                        || {
                            // Download finished, installing...
                            if let Err(e) = app_handle.emit("update-installing", ()) {
                                log::error!("Failed to emit installing event: {}", e);
                            }
                        },
                    )
                    .await
                {
                    Ok(_) => {
                        log::info!("Update downloaded and installed successfully");
                        // Notify user to restart
                        if let Err(e) = app.emit("update-installed", ()) {
                            log::error!("Failed to emit update-installed event: {}", e);
                        }
                        Ok(())
                    }
                    Err(e) => {
                        log::error!("Failed to download/install update: {}", e);
                        let error_msg = e.to_string();
                        if let Err(e) = app.emit(
                            "update-error",
                            &serde_json::json!({
                                "error": error_msg.clone()
                            }),
                        ) {
                            log::error!("Failed to emit update-error event: {}", e);
                        }
                        Err(error_msg)
                    }
                }
            }
            Ok(None) => {
                log::info!("No update available to download");
                Err("No update available".to_string())
            }
            Err(e) => {
                log::error!("Failed to check for update: {}", e);
                Err(format!("Failed to check for update: {}", e))
            }
        },
        Err(e) => {
            log::error!("Failed to get updater: {}", e);
            Err(format!("Failed to get updater: {}", e))
        }
    }
}
