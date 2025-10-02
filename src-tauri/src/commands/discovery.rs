use crate::discovery::{Discovery, types::{ScanConfig, ScanScope, DetectedProcess}};
use tauri::command;

#[command]
pub async fn scan_processes(scope: Option<ScanScope>) -> Result<Vec<DetectedProcess>, String> {
    let config = ScanConfig {
        scope: scope.unwrap_or_default(),
        timeout_ms: 1000,
    };
    
    let discovery = Discovery::new();
    discovery.discover_processes(config).await
}

#[command]
pub async fn quick_scan_processes() -> Result<Vec<DetectedProcess>, String> {
    let discovery = Discovery::new();
    discovery.quick_scan().await
}

#[command]
pub async fn analyze_specific_port(port: u16) -> Result<Option<DetectedProcess>, String> {
    let discovery = Discovery::new();
    discovery.analyze_port(port).await
}