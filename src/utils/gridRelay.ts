// Grid Relay Utilities
import { invoke } from '@tauri-apps/api/core';

export type RelayMode = 'p2p_first' | 'relay_only' | 'p2p_only';

export interface GridRelayStatus {
  grid_id: string;
  relay_mode: RelayMode;
  allocation?: RelayAllocation;
  turn_credentials?: TurnCredentials;
  relay_servers: RelayServer[];
}

export interface RelayAllocation {
  id: string;
  purchased_gb: number;
  used_gb: number;
  expires_at: string;
  status: string;
}

export interface TurnCredentials {
  username: string;
  credential: string;
  ttl: number;
}

export interface RelayServer {
  id: string;
  region: string;
  urls: string[];
  is_healthy: boolean;
}

export interface PaymentIntent {
  payment_intent_id: string;
  client_secret: string;
  amount: number;
  currency: string;
  status: string;
}

/**
 * Get relay configuration and status for a grid
 */
export async function getGridRelayConfig(gridId: string): Promise<GridRelayStatus> {
  return await invoke<GridRelayStatus>('get_grid_relay_config', { gridId });
}

/**
 * Update relay mode for a grid
 * @param gridId - Grid ID
 * @param relayMode - One of: 'p2p_first', 'relay_only', 'p2p_only'
 */
export async function updateGridRelayMode(gridId: string, relayMode: RelayMode): Promise<void> {
  return await invoke('update_grid_relay_mode', { gridId, relayMode });
}

/**
 * Purchase bandwidth allocation for a grid
 * @param gridId - Grid ID
 * @param bandwidthGb - Bandwidth in GB
 * @param durationMonths - Duration in months
 */
export async function purchaseGridBandwidth(
  gridId: string,
  bandwidthGb: number,
  durationMonths: number = 1
): Promise<PaymentIntent> {
  return await invoke<PaymentIntent>('purchase_grid_bandwidth', {
    gridId,
    bandwidthGb,
    durationMonths,
  });
}

/**
 * Report bandwidth usage for a grid
 * @param gridId - Grid ID
 * @param bytesSent - Bytes sent
 * @param bytesReceived - Bytes received
 */
export async function reportGridBandwidthUsage(
  gridId: string,
  bytesSent: number,
  bytesReceived: number
): Promise<void> {
  return await invoke('report_grid_bandwidth_usage', {
    gridId,
    bytesSent,
    bytesReceived,
  });
}

/**
 * Get bandwidth usage percentage
 */
export function getBandwidthUsagePercentage(allocation?: RelayAllocation): number {
  if (!allocation) return 0;
  return (allocation.used_gb / allocation.purchased_gb) * 100;
}

/**
 * Get remaining bandwidth in GB
 */
export function getRemainingBandwidth(allocation?: RelayAllocation): number {
  if (!allocation) return 0;
  return Math.max(0, allocation.purchased_gb - allocation.used_gb);
}

/**
 * Check if bandwidth is low (< 10%)
 */
export function isBandwidthLow(allocation?: RelayAllocation): boolean {
  return getBandwidthUsagePercentage(allocation) > 90;
}

/**
 * Check if allocation is expired
 */
export function isAllocationExpired(allocation?: RelayAllocation): boolean {
  if (!allocation) return true;
  return new Date(allocation.expires_at) < new Date();
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Convert relay mode to display string
 */
export function relayModeToString(mode: RelayMode): string {
  switch (mode) {
    case 'p2p_first':
      return 'P2P First (Fallback to Relay)';
    case 'relay_only':
      return 'Always Use Relay';
    case 'p2p_only':
      return 'P2P Only (No Relay)';
    default:
      return mode;
  }
}

/**
 * Get relay mode description
 */
export function getRelayModeDescription(mode: RelayMode): string {
  switch (mode) {
    case 'p2p_first':
      return 'Try direct P2P connection first, fallback to relay servers if needed. Balances cost and reliability.';
    case 'relay_only':
      return 'Always use relay servers for guaranteed connectivity. Higher cost but maximum reliability.';
    case 'p2p_only':
      return 'Only use direct P2P connections. No relay costs but may fail in restrictive networks.';
    default:
      return '';
  }
}
