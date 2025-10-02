use crate::api::types::{ResourceAccessCode, CodeUsageAuditEntry, ResourceType};
use std::collections::{HashMap, HashSet};
use std::time::SystemTime;

#[derive(Debug, Default, Clone)]
pub struct CodeState {
    // Active codes by grid
    pub grid_codes: HashMap<String, Vec<ResourceAccessCode>>,
    
    // Generated codes by this user
    pub my_codes: HashMap<String, ResourceAccessCode>,
    
    // Usage history cache
    pub usage_history: HashMap<String, Vec<CodeUsageAuditEntry>>,
    
    // Pending code operations
    pub pending_generations: HashSet<String>,
    pub pending_usages: HashSet<String>,
    
    // Real-time updates
    pub last_updated: HashMap<String, SystemTime>,
}

impl CodeState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_code(&mut self, grid_id: &str, code: ResourceAccessCode) {
        self.grid_codes
            .entry(grid_id.to_string())
            .or_insert_with(Vec::new)
            .push(code.clone());
        
        self.my_codes.insert(code.id.clone(), code);
        self.update_timestamp(grid_id);
    }

    pub fn remove_code(&mut self, grid_id: &str, code_id: &str) {
        if let Some(codes) = self.grid_codes.get_mut(grid_id) {
            codes.retain(|c| c.id != code_id);
        }
        self.my_codes.remove(code_id);
        self.update_timestamp(grid_id);
    }

    pub fn update_code(&mut self, grid_id: &str, updated_code: ResourceAccessCode) {
        if let Some(codes) = self.grid_codes.get_mut(grid_id) {
            if let Some(index) = codes.iter().position(|c| c.id == updated_code.id) {
                codes[index] = updated_code.clone();
            }
        }
        
        if self.my_codes.contains_key(&updated_code.id) {
            self.my_codes.insert(updated_code.id.clone(), updated_code);
        }
        
        self.update_timestamp(grid_id);
    }

    pub fn get_grid_codes(&self, grid_id: &str) -> Vec<ResourceAccessCode> {
        self.grid_codes
            .get(grid_id)
            .cloned()
            .unwrap_or_default()
    }

    pub fn get_active_codes(&self, grid_id: &str) -> Vec<ResourceAccessCode> {
        self.get_grid_codes(grid_id)
            .into_iter()
            .filter(|c| c.is_active)
            .collect()
    }

    pub fn get_codes_by_resource(&self, grid_id: &str, resource_type: &ResourceType, resource_id: &str) -> Vec<ResourceAccessCode> {
        self.get_grid_codes(grid_id)
            .into_iter()
            .filter(|c| c.resource_type == *resource_type && c.resource_id == resource_id)
            .collect()
    }

    pub fn get_my_codes(&self) -> Vec<ResourceAccessCode> {
        self.my_codes.values().cloned().collect()
    }

    pub fn set_grid_codes(&mut self, grid_id: &str, codes: Vec<ResourceAccessCode>) {
        self.grid_codes.insert(grid_id.to_string(), codes);
        self.update_timestamp(grid_id);
    }

    pub fn add_usage_history(&mut self, code_id: &str, entries: Vec<CodeUsageAuditEntry>) {
        self.usage_history.insert(code_id.to_string(), entries);
    }

    pub fn get_usage_history(&self, code_id: &str) -> Vec<CodeUsageAuditEntry> {
        self.usage_history
            .get(code_id)
            .cloned()
            .unwrap_or_default()
    }

    pub fn add_pending_generation(&mut self, operation_id: String) {
        self.pending_generations.insert(operation_id);
    }

    pub fn remove_pending_generation(&mut self, operation_id: &str) {
        self.pending_generations.remove(operation_id);
    }

    pub fn add_pending_usage(&mut self, operation_id: String) {
        self.pending_usages.insert(operation_id);
    }

    pub fn remove_pending_usage(&mut self, operation_id: &str) {
        self.pending_usages.remove(operation_id);
    }

    pub fn is_generating(&self, operation_id: &str) -> bool {
        self.pending_generations.contains(operation_id)
    }

    pub fn is_using(&self, operation_id: &str) -> bool {
        self.pending_usages.contains(operation_id)
    }

    pub fn clear_grid_data(&mut self, grid_id: &str) {
        self.grid_codes.remove(grid_id);
        self.last_updated.remove(grid_id);
        
        // Remove codes that belong to this grid from my_codes
        self.my_codes.retain(|_, code| code.grid_id != grid_id);
    }

    pub fn get_last_updated(&self, grid_id: &str) -> Option<SystemTime> {
        self.last_updated.get(grid_id).copied()
    }

    fn update_timestamp(&mut self, grid_id: &str) {
        self.last_updated.insert(grid_id.to_string(), SystemTime::now());
    }

    // Helper methods for filtering
    pub fn filter_codes_by_type(&self, grid_id: &str, resource_type: ResourceType) -> Vec<ResourceAccessCode> {
        self.get_grid_codes(grid_id)
            .into_iter()
            .filter(|c| c.resource_type == resource_type)
            .collect()
    }

    pub fn get_expired_codes(&self, grid_id: &str) -> Vec<ResourceAccessCode> {
        let now = chrono::Utc::now();
        self.get_grid_codes(grid_id)
            .into_iter()
            .filter(|c| {
                if let Some(expires_at) = &c.expires_at {
                    if let Ok(expiry_time) = chrono::DateTime::parse_from_rfc3339(expires_at) {
                        return expiry_time < now;
                    }
                }
                false
            })
            .collect()
    }

    pub fn get_usage_limited_codes(&self, grid_id: &str) -> Vec<ResourceAccessCode> {
        self.get_grid_codes(grid_id)
            .into_iter()
            .filter(|c| c.usage_limit > 0 && c.used_count >= c.usage_limit)
            .collect()
    }

    pub fn count_codes_by_creator(&self, grid_id: &str, creator_id: &str) -> usize {
        self.get_grid_codes(grid_id)
            .iter()
            .filter(|c| c.created_by == creator_id)
            .count()
    }

    pub fn get_codes_stats(&self, grid_id: &str) -> CodeStats {
        let codes = self.get_grid_codes(grid_id);
        let total = codes.len();
        let active = codes.iter().filter(|c| c.is_active).count();
        let expired = self.get_expired_codes(grid_id).len();
        let usage_exhausted = self.get_usage_limited_codes(grid_id).len();

        CodeStats {
            total,
            active,
            expired,
            usage_exhausted,
            by_type: self.count_codes_by_type(&codes),
        }
    }

    fn count_codes_by_type(&self, codes: &[ResourceAccessCode]) -> std::collections::HashMap<ResourceType, usize> {
        let mut counts = std::collections::HashMap::new();
        for code in codes {
            *counts.entry(code.resource_type.clone()).or_insert(0) += 1;
        }
        counts
    }
}

#[derive(Debug, Clone)]
pub struct CodeStats {
    pub total: usize,
    pub active: usize,
    pub expired: usize,
    pub usage_exhausted: usize,
    pub by_type: std::collections::HashMap<ResourceType, usize>,
}
