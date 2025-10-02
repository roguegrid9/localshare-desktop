pub mod scanner;
pub mod types;

use scanner::ProcessScanner;
use types::{DetectedProcess, ScanConfig};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Clone)]
struct CacheEntry {
    processes: Vec<DetectedProcess>,
    timestamp: Instant,
}

pub struct Discovery {
    scanner: ProcessScanner,
    cache: Arc<Mutex<HashMap<String, CacheEntry>>>,
}

impl Discovery {
    pub fn new() -> Self {
        Self {
            scanner: ProcessScanner::new(),
            cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }
    
    // Main discovery method - replaces all the complex analyze_* methods
    pub async fn discover_processes(&self, config: ScanConfig) -> Result<Vec<DetectedProcess>, String> {
        let cache_key = format!("{:?}", config.scope);
        
        // Check cache first
        {
            let mut cache = self.cache.lock().await;
            if let Some(entry) = cache.get(&cache_key) {
                if entry.timestamp.elapsed() < Duration::from_secs(5) {
                    return Ok(entry.processes.clone());
                } else {
                    // Remove expired entry
                    cache.remove(&cache_key);
                }
            }
        }
        
        // Cache miss or expired - do fresh scan
        let processes = self.scanner.scan_processes(&config).await?;
        
        // Update cache
        {
            let mut cache = self.cache.lock().await;
            cache.insert(cache_key, CacheEntry {
                processes: processes.clone(),
                timestamp: Instant::now(),
            });
        }
        
        Ok(processes)
    }
    
    // Quick scan for common ports (optional convenience method)
    pub async fn quick_scan(&self) -> Result<Vec<DetectedProcess>, String> {
        let config = ScanConfig::default();
        self.discover_processes(config).await
    }
    
    // Analyze specific port (for manual entry)
    pub async fn analyze_port(&self, port: u16) -> Result<Option<DetectedProcess>, String> {
        if let Ok(pid) = self.scanner.get_pid_for_port(port).await {
            if let Ok(process_info) = self.scanner.extract_process_info(pid).await {
                return Ok(Some(DetectedProcess {
                    pid,
                    name: process_info.name,
                    command: process_info.command,
                    working_dir: process_info.working_dir,
                    port,
                    executable_path: process_info.executable_path,
                }));
            }
        }
        Ok(None)
    }
}

impl Default for Discovery {
    fn default() -> Self {
        Self::new()
    }
}