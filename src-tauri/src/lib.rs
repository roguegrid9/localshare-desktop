// client/src-tauri/src/lib.rs
// Module declarations
mod api;
mod auth;
mod terminal;
mod commands;
mod grids;
mod p2p;
mod process;
mod discovery;
mod state;
mod transport;
mod utils;
mod websocket;
mod codes;
mod share;
mod frp;
mod logging;
pub mod tunnel_names;
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;
pub mod messaging;
mod windows;
mod media; 
use crate::terminal::TerminalManager;
use crate::transport::start_transport_tunnel_with_permissions;
use crate::process::TerminalProcessBridge;
use crate::windows::WindowManager;
use std::sync::Arc;
use tauri::Emitter;
use commands::*;
use crate::commands::p2p::get_network_status;
// Import discovery commands
use crate::commands::discovery::{
    scan_processes,
    quick_scan_processes,
    analyze_specific_port,
};


// Keep all existing window commands (unchanged)
use crate::windows::{
    get_all_windows,
    get_window_state,
    create_tab,
    close_tab,
    activate_tab,
    detach_tab,
    reattach_tab,
    move_tab,
    close_window,
    focus_window,
    update_tab_title,
    set_tab_notification,
    get_window_stats,
    create_terminal_tab,
    create_text_channel_tab,
    create_media_channel_tab,
    create_process_tab,
    create_grid_dashboard_tab,
    create_network_dashboard_tab,
    create_welcome_tab,
    get_active_tab,
    window_exists,
    get_tab_count,
    serialize_window_state,
    restore_window_state,
};

use crate::commands::media::{
    get_media_devices,
    test_audio_device,
    test_video_device,
    start_audio_capture,
    stop_audio_capture,
    mute_audio,
    set_audio_volume,
    get_audio_level,
    start_video_capture,
    stop_video_capture,
    toggle_video,
    start_screen_share,
    stop_screen_share,
    get_screen_sources,
    create_media_session,
    get_active_media_sessions,
    save_audio_settings,
    load_audio_settings,
    save_video_settings,
    load_video_settings,
    get_detailed_audio_level,
    set_voice_activation_threshold,
    get_media_manager_status,
};



// Re-exports for easy access
pub use commands::*;
pub use state::app::AppState;
use commands::relay::FRPState;
use api::CoordinatorClient;
use std::sync::Mutex;
use lazy_static::lazy_static;

// Global logger instance for analytics
lazy_static! {
    pub static ref LOGGER: Option<logging::Logger> = {
        match logging::Logger::new() {
            Ok(logger) => {
                log::info!("Analytics logger initialized successfully");
                Some(logger)
            }
            Err(e) => {
                log::warn!("Failed to initialize analytics logger: {} (analytics will be disabled)", e);
                None
            }
        }
    };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::new())
        .manage(FRPState {
            client: Mutex::new(None),
        })
        .manage(CoordinatorClient::new())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            
            log::info!("RogueGrid9 client starting up");
            log::info!("Coordinator URL: https://api.roguegrid9.com");

            // DevTools can be opened with F12 or Ctrl+Shift+I
            // Commented out auto-open for production-like experience
            // if let Some(window) = app.get_webview_window("main") {
            //     window.open_devtools();
            //     log::info!("DevTools opened");
            // }

            // Initialize storage on app start
            auth::initialize_storage();
            
            let app_handle = app.handle().clone();
            
            // ========================================
            // AUTO-UPDATER - Check for updates on startup
            // ========================================
            #[cfg(not(debug_assertions))] // Only check for updates in release builds
            {
                let update_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    log::info!("Checking for updates...");
                    
                    match update_handle.updater() {
                        Ok(updater) => match updater.check().await {
                            Ok(Some(update)) => {
                                let new_version = update.version.clone();
                                let current_version = update.current_version.clone();

                                log::info!("Update available! Current: {}, New: {}", current_version, new_version);

                                // Notify user that update is available (don't auto-download)
                                if let Err(e) = update_handle.emit("update-available", &serde_json::json!({
                                    "version": new_version,
                                    "current_version": current_version,
                                })) {
                                    log::error!("Failed to emit update-available event: {}", e);
                                }

                                // Note: We no longer auto-download here
                                // User must click "Download Now" button which will trigger manual update
                            }
                            Ok(None) => {
                                log::info!("No updates available - running latest version");
                            }
                            Err(e) => {
                                log::warn!("Failed to check for updates: {}", e);
                                // Don't show error to user - updates are optional
                            }
                        }
                        Err(e) => {
                            log::warn!("Failed to get updater: {}", e);
                            // Don't show error to user - updates are optional
                        }
                    }
                });
            }
            
            #[cfg(debug_assertions)]
            {
                log::info!("Auto-updater disabled in debug mode");
            }
            // ========================================
            // END AUTO-UPDATER
            // ========================================
            
            // Initialize services in the right order
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<AppState>();
                
                async fn initialize_all_services(
                    app_handle: tauri::AppHandle,
                    state: tauri::State<'_, AppState>
                ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
                    // Note: Tunnel cleanup moved to post-authentication in auth commands
                    // Can't clean up tunnels here because user isn't authenticated yet

                    // 2. Initialize grids service
                    if let Err(e) = initialize_grids_service(app_handle.clone(), state.clone()).await {
                        log::error!("Failed to initialize grids service: {}", e);
                    }

                    if let Err(e) = initialize_terminal_manager(app_handle.clone(), state.clone()).await {
                        log::error!("Failed to initialize terminal manager: {}", e);
                    }
                    
                    // 3. Initialize process manager
                    if let Err(e) = initialize_process_manager(app_handle.clone(), state.clone()).await {
                        log::error!("Failed to initialize process manager: {}", e);
                    }

                    // 4. Discovery system no longer needs initialization (simplified)

                    // 5. Setup terminal recovery listener
                    {
                        let process_manager_guard = state.process_manager.lock().await;
                        if let Some(ref manager) = *process_manager_guard {
                            if let Err(e) = manager.setup_terminal_recovery_listener().await {
                                log::error!("Failed to setup terminal recovery listener: {}", e);
                            }
                        }
                    }
                    
                    if let Err(e) = connect_terminal_to_process_bridge(state.clone()).await {
                        log::error!("Failed to set up terminal-process bridge: {}", e);
                    }
                    
                    
                    if let Err(e) = initialize_window_manager(app_handle.clone(), state.clone()).await {
                        log::error!("Failed to initialize window manager: {}", e);
                    }
                    // 5. Initialize P2P manager
                    if let Err(e) = initialize_p2p_service(app_handle.clone(), state.clone()).await {
                        log::error!("Failed to initialize P2P service: {}", e);
                    }
                    // 6. Set up cross-service integration
                    if let Err(e) = setup_service_integration(state.clone()).await {
                        log::error!("Failed to set up service integration: {}", e);
                    }
                    if let Err(e) = initialize_codes_service(app_handle.clone(), state.clone()).await {
                        log::error!("Failed to initialize codes service: {}", e);
                    }
                    if let Err(e) = initialize_messaging_service(app_handle.clone(), state.clone()).await {
                        log::error!("Failed to initialize messaging service: {}", e);
                    }
                    if let Err(e) = initialize_media_manager(app_handle.clone(), state.clone()).await {
                        log::error!("Failed to initialize media manager: {}", e);
                    }

                    // Auto-connect FRP relay if authenticated
                    let token_opt = {
                        let auth_token_guard = state.auth_token.lock().await;
                        auth_token_guard.clone()
                    };

                    if let Some(token) = token_opt {
                        log::info!("🔌 Auto-connecting to FRP relay...");
                        let frp_state = app_handle.state::<FRPState>();
                        let api_client = app_handle.state::<CoordinatorClient>();

                        if let Err(e) = crate::commands::relay::connect_frp_relay(
                            app_handle.clone(),
                            frp_state,
                            api_client,
                            token.clone()
                        ).await {
                            log::warn!("Failed to auto-connect FRP relay: {}", e);
                        } else {
                            log::info!("✅ FRP relay auto-connected successfully");
                        }
                    } else {
                        log::info!("No auth token available, skipping FRP auto-connect");
                    }

                    // Resume heartbeats - MOVED to frontend call after authentication
                    // Frontend will call resume_heartbeats_after_auth() after OAuth completes
                    // if let Err(e) = crate::commands::process::resume_all_shared_process_heartbeats(state.clone()).await {
                    //     log::error!("Failed to resume shared process heartbeats: {}", e);
                    // }

                    log::info!("All services initialized successfully");
                    Ok(())
                }
                
                if let Err(e) = initialize_all_services(app_handle.clone(), state).await {
                    log::error!("Service initialization failed: {}", e);
                }
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // ============================================================================
            // AUTHENTICATION COMMANDS
            // ============================================================================
            initialize_app_storage,
            create_guest_session,
            promote_account_simple,
            check_supabase_session,
            initialize_user_session,
            get_user_state,
            promote_account,
            clear_user_session,
            check_connection_status,
            validate_token,
            update_username,
            update_display_name,
            accept_tos,
            get_current_user,
            check_username_availability,
            promote_account_with_username,
            get_auth_token,
            start_oauth_server,
            cleanup_stale_tunnels,

            // ============================================================================
            // UPDATER COMMANDS
            // ============================================================================
            get_app_version,
            check_for_updates,
            download_and_install_update,

            // ============================================================================
            // PROCESS MANAGEMENT COMMANDS
            // ============================================================================
            initialize_process_manager,
            start_process,
            stop_process,
            get_process_status,
            send_process_input,
            get_active_processes,
            start_grid_process,
            stop_grid_process,
            send_grid_process_data,
            get_process_session_id,
            get_process_display_name,
            get_process_info,
            check_process_health,
            create_shared_process,
            get_grid_shared_processes,
            start_p2p_sharing,
            stop_p2p_sharing,
            get_process_availability,
            connect_to_process,
            disconnect_from_process,
            cleanup_stale_connection,
            resume_heartbeats_after_auth,

            // ============================================================================
            // PROCESS DISCOVERY COMMANDS
            // ============================================================================
            scan_processes,
            quick_scan_processes,
            analyze_specific_port,


            // ============================================================================
            // TERMINAL SESSION COMMANDS
            // ============================================================================
            create_terminal_session,
            send_terminal_input,
            send_terminal_string,
            send_terminal_command,
            send_terminal_interrupt,
            send_terminal_eof,
            get_terminal_sessions,
            get_grid_terminal_sessions,
            get_terminal_session,
            terminate_terminal_session,
            resize_terminal_session,
            get_terminal_session_history,
            add_user_to_terminal_session,
            remove_user_from_terminal_session,
            get_available_shells,
            get_default_shell,
            get_terminal_statistics,
            create_terminal_session_preset,
            create_terminal_session_with_command,
            disconnect_terminal_ui,
            reconnect_terminal_ui,
            get_background_terminal_sessions,
            get_active_ui_terminal_sessions,
            cleanup_dead_terminal_sessions,
            get_terminal_session_context,

            // ============================================================================
            // TERMINAL-PROCESS BRIDGE COMMANDS
            // ============================================================================
            create_terminal_process_command,
            create_terminal_as_grid_process,
            connect_terminal_to_grid,
            get_grid_terminal_processes,
            send_terminal_process_input,
            stop_terminal_process,
            grid_has_terminal_process,
            get_grid_terminal_session_id,
            register_terminal_as_process,



            // ============================================================================
            // GRID SERVICE COMMANDS
            // ============================================================================
            initialize_grids_service,
            create_grid,
            get_my_grids,
            get_grids_from_cache,
            get_grid_details,
            get_grid_members,
            invite_user_to_grid,
            join_grid_by_code,
            get_grid_invitations,
            accept_grid_invitation,
            decline_grid_invitation,
            search_users,
            get_grids_state,
            get_grid_processes,
            get_grid_channels,
            delete_grid_process,
            delete_grid_channel,
            update_member_role,
            update_grid_basic_info,

            // ============================================================================
            // WEBSOCKET COMMANDS
            // ============================================================================
            connect_websocket,
            disconnect_websocket,
            send_voice_webrtc_signal,
            is_websocket_connected,

            // ============================================================================
            // P2P COMMANDS
            // ============================================================================
            initialize_p2p_service,
            join_grid_session,
            release_grid_host,
            get_grid_session_status,
            get_active_p2p_sessions,
            close_p2p_session,
            send_p2p_data,
            get_network_status,
            auto_host_grid,
            report_nat_status,

            // Grid Relay Commands
            get_grid_relay_config,
            update_grid_relay_mode,
            purchase_grid_bandwidth,
            report_grid_bandwidth_usage,

            // ============================================================================
            // TRANSPORT COMMANDS
            // ============================================================================
            start_transport_tunnel,
            stop_transport_tunnel,
            get_active_transports,
            send_transport_terminal_input,
            detect_service_type,

            // ============================================================================
            // PERMISSION COMMANDS
            // ============================================================================
            get_grid_permissions,
            update_grid_settings,
            update_member_permissions,
            get_process_permissions,
            get_grid_audit_log,
            check_grid_permission,
            start_transport_tunnel_with_permissions,

            // ============================================================================
            // RESOURCE CODE COMMANDS
            // ============================================================================
            initialize_codes_service,
            generate_resource_code,
            use_access_code,
            list_grid_codes,
            get_code_details,
            revoke_code,
            get_code_usage_history,
            share_process,
            create_grid_invite_code,
            share_channel,
            copy_code_to_clipboard,
            create_shareable_link,
            validate_access_code_format,
            format_access_code_input,
            get_grid_codes_from_cache,
            get_active_codes_from_cache,
            get_my_codes_from_cache,
            get_codes_by_resource,
            clear_grid_codes_cache,
            revoke_multiple_codes,
            refresh_grid_codes,

            



            // ============================================================================
            // MESSAGING COMMANDS
            // ============================================================================
            create_channel,
            create_text_channel,
            create_voice_channel,
            get_channel_details,
            join_channel,
            leave_channel,
            send_message,
            get_channel_messages,
            edit_message,
            delete_message,
            add_message_reaction,
            remove_message_reaction,
            set_typing_indicator,
            send_websocket_text_message,
            send_websocket_edit_message,
            send_websocket_delete_message,
            send_websocket_typing_indicator,
            get_messaging_state,
            get_cached_messages,
            get_cached_channels,
            clear_grid_messaging_state,
            reinitialize_messaging_service,
            create_text_channel_tab,
            create_voice_channel_tab, 
            initialize_voice_session,  
            join_voice_channel,       
            leave_voice_channel,      
            get_voice_channel_status, 

            // ============================================================================
            // WINDOW MANAGEMENT COMMANDS
            // ============================================================================
            initialize_window_manager,
            get_all_windows,
            get_window_state,
            create_tab,
            close_tab,
            activate_tab,
            detach_tab,
            reattach_tab,
            move_tab,
            close_window,
            focus_window,
            update_tab_title,
            set_tab_notification,
            get_window_stats,
            create_terminal_tab,
            create_text_channel_tab,
            create_media_channel_tab,
            create_process_tab,
            create_grid_dashboard_tab,
            create_network_dashboard_tab,
            create_welcome_tab,
            get_active_tab,
            window_exists,
            get_tab_count,
            serialize_window_state,
            restore_window_state,

            // ============================================================================
            // MEDIA COMMANDS
            // ============================================================================
            get_media_devices,
            test_audio_device,
            test_video_device,
            start_audio_capture,
            stop_audio_capture,
            mute_audio,
            set_audio_volume,
            get_audio_level,
            start_video_capture,
            stop_video_capture,
            toggle_video,
            start_screen_share,
            stop_screen_share,
            get_screen_sources,
            create_media_session,
            get_active_media_sessions,
            save_audio_settings,
            load_audio_settings,
            save_video_settings,
            load_video_settings,
            get_detailed_audio_level,
            set_voice_activation_threshold,
            get_media_manager_status,
            initialize_media_session,
            add_media_track,
            remove_media_track,
            set_track_enabled,
            replace_video_track,
            get_media_stats,
            configure_media_quality,
            get_media_sessions,
            close_media_session,
            send_media_signal,
            handle_media_signal,

            // ============================================================================
            // SHARE MANAGEMENT COMMANDS
            // ============================================================================
            register_process_share,
            unregister_process_share,
            list_active_shares,
            get_share_status,
            handle_share_visitor,
            handle_visitor_disconnect,

            // ============================================================================
            // FRP RELAY & TUNNEL COMMANDS
            // ============================================================================
            start_relay_trial,
            connect_frp_relay,
            disconnect_frp_relay,
            get_frp_status,
            get_relay_subscription,
            create_tunnel_command,
            list_tunnels_command,
            delete_tunnel_command,
            check_subdomain_command,
            detect_nat_type,

            // ============================================================================
            // PROCESS TUNNEL COMMANDS
            // ============================================================================
            create_process_tunnel,
            get_process_tunnel,
            update_process_tunnel_subdomain,
            delete_process_tunnel,
            check_tunnel_subdomain_availability,

        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Clean up tunnels and FRP connection when app is closing
                let app_handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    // Get user session and API client
                    if let Ok(Some(session)) = crate::auth::storage::get_user_session().await {
                        let api_client = app_handle.state::<CoordinatorClient>();

                        // Delete all tunnels
                        match api_client.delete_all_tunnels(&session.token).await {
                            Ok(count) if count > 0 => log::info!("Cleaned up {} tunnel(s) on shutdown", count),
                            Ok(_) => log::info!("No tunnels to clean up on shutdown"),
                            Err(e) => log::warn!("Failed to clean up tunnels on shutdown: {}", e),
                        }
                    }

                    // Disconnect FRP relay
                    let frp_state = app_handle.state::<commands::relay::FRPState>();
                    let mut frp_guard = frp_state.client.lock().unwrap();
                    if let Some(frp) = frp_guard.as_mut() {
                        if let Err(e) = frp.disconnect() {
                            log::warn!("Failed to disconnect FRP on shutdown: {}", e);
                        } else {
                            log::info!("FRP client disconnected on shutdown");
                        }
                    }
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Service integration setup (unchanged)
async fn setup_service_integration(state: tauri::State<'_, AppState>) -> Result<(), String> {
    log::info!("Setting up service integration...");

    // Set up P2P-Process integration
    {
        let p2p_state = state.p2p_manager.lock().await;
        if let Some(p2p_manager) = p2p_state.as_ref() {
            if let Err(e) = p2p_manager.setup_process_event_listeners().await {
                log::error!("Failed to set up P2P process listeners: {}", e);
                return Err(e.to_string());
            }
        }
    }

    // Set up Process-P2P integration
    {
        let process_state = state.process_manager.lock().await;
        if let Some(process_manager) = process_state.as_ref() {
            if let Err(e) = process_manager.setup_p2p_event_listeners().await {
                log::error!("Failed to set up Process P2P listeners: {}", e);
                return Err(e.to_string());
            }
        }
    }

    {
        let process_state = state.process_manager.lock().await;
        let terminal_state = state.terminal_manager.lock().await;

        if let (Some(process_manager), Some(terminal_manager)) = (process_state.as_ref(), terminal_state.as_ref()) {
            if let Err(e) = process_manager.set_terminal_manager((*terminal_manager).clone()).await {
                log::error!("Failed to set up terminal-process bridge: {}", e);
                return Err(e.to_string());
            }
        }
    }

    log::info!("Service integration setup complete");
    Ok(())
}

// Keep all existing initialization functions unchanged
async fn initialize_terminal_manager(
    _app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Initializing terminal manager...");
    
    let terminal_manager = TerminalManager::new(_app_handle);
    
    let mut terminal_guard = state.terminal_manager.lock().await;
    *terminal_guard = Some(terminal_manager);
    
    log::info!("Terminal manager initialized successfully");
    Ok(())
}

async fn initialize_messaging_service(
    _app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Initializing messaging service...");
    
    let api_client = match auth::get_authenticated_client().await {
        Ok(client) => std::sync::Arc::new(client),
        Err(_) => {
            log::warn!("No authenticated client available, messaging service will be initialized when user authenticates");
            return Ok(());
        }
    };
    
    let messaging_service = crate::messaging::MessagingService::new(api_client);
    
    let mut messaging_guard = state.messaging_service.lock().await;
    *messaging_guard = Some(messaging_service);
    
    log::info!("Messaging service initialized successfully");
    Ok(())
}

async fn initialize_window_manager(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Initializing window manager...");
    
    let window_manager = WindowManager::new(app_handle);
    
    let mut window_guard = state.window_manager.lock().await;
    *window_guard = Some(window_manager);
    
    log::info!("Window manager initialized successfully");
    Ok(())
}

async fn connect_terminal_to_process_bridge(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Connecting terminal manager to process bridge...");
    
    let terminal_manager = {
        let tm_guard = state.terminal_manager.lock().await;
        tm_guard.as_ref().cloned()
    };
    
    if let Some(terminal_manager) = terminal_manager {
        let pm_guard = state.process_manager.lock().await;
        if let Some(process_manager) = pm_guard.as_ref() {
            process_manager.set_terminal_manager(terminal_manager).await
                .map_err(|e| {
                    log::error!("Failed to connect terminal manager to process bridge: {}", e);
                    e.to_string()
                })?;
            
            log::info!("Terminal manager successfully connected to process bridge");
        } else {
            return Err("Process manager not initialized".to_string());
        }
    } else {
        return Err("Terminal manager not initialized".to_string());
    }
    
    Ok(())
}

async fn initialize_media_manager(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Initializing MediaManager with audio device support");
    
    // Create API client
    let api_client = Arc::new(crate::api::client::CoordinatorClient::new());
    
    // Initialize MediaManager with error handling
    match crate::media::MediaManager::new(app_handle.clone(), api_client) {
        Ok(media_manager) => {
            let mut media_guard = state.media_manager.lock().await;
            *media_guard = Some(media_manager);
            log::info!("MediaManager initialized successfully");
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to initialize MediaManager: {}", e);
            
            // Emit error event to frontend
            if let Err(emit_err) = app_handle.emit("media_manager_error", &serde_json::json!({
                "error": e.to_string(),
                "suggestion": "Check that audio drivers are properly installed and accessible"
            })) {
                log::error!("Failed to emit media manager error: {}", emit_err);
            }
            
            // Continue without media manager - audio features will be disabled
            log::warn!("MediaManager initialization failed, continuing without audio support");
            Ok(())
        }
    }
}