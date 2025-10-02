// Grid Connection Manager with P2P → STUN → TURN Fallback
import { getGridRelayConfig, reportGridBandwidthUsage, type GridRelayStatus } from './gridRelay';

export type ConnectionState =
  | 'idle'
  | 'attempting-p2p'
  | 'attempting-stun'
  | 'attempting-turn'
  | 'connected-p2p'
  | 'connected-stun'
  | 'connected-turn'
  | 'failed'
  | 'quota-exceeded';

export interface ConnectionStats {
  bytesSent: number;
  bytesReceived: number;
  packetsLost: number;
  roundTripTime: number;
  connectionType: 'p2p' | 'stun' | 'turn' | 'unknown';
}

export interface ConnectionManagerOptions {
  gridId: string;
  onStateChange?: (state: ConnectionState) => void;
  onStatsUpdate?: (stats: ConnectionStats) => void;
  onQuotaWarning?: (percentUsed: number) => void;
  p2pTimeout?: number; // Default: 10000ms
  stunTimeout?: number; // Default: 10000ms
}

export class GridConnectionManager {
  private gridId: string;
  private state: ConnectionState = 'idle';
  private peerConnection: RTCPeerConnection | null = null;
  private relayConfig: GridRelayStatus | null = null;
  private statsInterval: number | null = null;
  private usageReportInterval: number | null = null;
  private stats: ConnectionStats = {
    bytesSent: 0,
    bytesReceived: 0,
    packetsLost: 0,
    roundTripTime: 0,
    connectionType: 'unknown',
  };

  private options: Required<ConnectionManagerOptions>;

  constructor(options: ConnectionManagerOptions) {
    this.gridId = options.gridId;
    this.options = {
      ...options,
      onStateChange: options.onStateChange || (() => {}),
      onStatsUpdate: options.onStatsUpdate || (() => {}),
      onQuotaWarning: options.onQuotaWarning || (() => {}),
      p2pTimeout: options.p2pTimeout || 10000,
      stunTimeout: options.stunTimeout || 10000,
    };
  }

  /**
   * Main connection method - handles fallback logic based on relay mode
   */
  async connect(): Promise<void> {
    try {
      // Fetch relay configuration from backend
      this.relayConfig = await getGridRelayConfig(this.gridId);

      // Check if quota is exceeded
      if (this.isQuotaExceeded()) {
        this.setState('quota-exceeded');
        throw new Error('Bandwidth quota exceeded. Please purchase more bandwidth.');
      }

      // Determine connection strategy based on relay mode
      switch (this.relayConfig.relay_mode) {
        case 'relay_only':
          await this.connectViaTURN();
          break;
        case 'p2p_only':
          await this.connectP2P();
          break;
        case 'p2p_first':
        default:
          await this.connectWithFallback();
          break;
      }

      // Start monitoring stats and reporting usage
      this.startStatsMonitoring();
      this.startUsageReporting();
    } catch (error) {
      this.setState('failed');
      throw error;
    }
  }

  /**
   * P2P-first strategy with fallback to STUN then TURN
   */
  private async connectWithFallback(): Promise<void> {
    // Try P2P (no ICE servers)
    try {
      await this.tryP2P();
      return;
    } catch (error) {
      console.log('P2P failed, trying STUN...', error);
    }

    // Try STUN
    try {
      await this.trySTUN();
      return;
    } catch (error) {
      console.log('STUN failed, falling back to TURN...', error);
    }

    // Fallback to TURN
    await this.connectViaTURN();
  }

  /**
   * Attempt P2P connection with timeout
   */
  private async tryP2P(): Promise<void> {
    this.setState('attempting-p2p');

    const config: RTCConfiguration = {
      iceServers: [], // No ICE servers = host candidates only
    };

    await this.attemptConnection(config, this.options.p2pTimeout);
    this.setState('connected-p2p');
    this.stats.connectionType = 'p2p';
  }

  /**
   * Attempt STUN connection with timeout
   */
  private async trySTUN(): Promise<void> {
    this.setState('attempting-stun');

    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    await this.attemptConnection(config, this.options.stunTimeout);
    this.setState('connected-stun');
    this.stats.connectionType = 'stun';
  }

  /**
   * Direct P2P only (no fallback)
   */
  private async connectP2P(): Promise<void> {
    await this.tryP2P();
  }

  /**
   * TURN relay connection (guaranteed to work)
   */
  private async connectViaTURN(): Promise<void> {
    this.setState('attempting-turn');

    if (!this.relayConfig?.turn_credentials) {
      throw new Error('No TURN credentials available. Please purchase bandwidth.');
    }

    const iceServers = this.buildTURNConfig();
    const config: RTCConfiguration = {
      iceServers,
      iceTransportPolicy: 'relay', // Force TURN only
    };

    await this.attemptConnection(config, 20000); // TURN gets more time
    this.setState('connected-turn');
    this.stats.connectionType = 'turn';
  }

  /**
   * Build ICE server configuration with TURN credentials
   */
  private buildTURNConfig(): RTCIceServer[] {
    const servers: RTCIceServer[] = [];

    // Add TURN servers from relay config
    if (this.relayConfig?.relay_servers) {
      for (const relay of this.relayConfig.relay_servers) {
        if (!relay.is_healthy) continue;

        servers.push({
          urls: relay.urls,
          username: this.relayConfig.turn_credentials?.username,
          credential: this.relayConfig.turn_credentials?.credential,
        });
      }
    }

    // Fallback to STUN if no TURN servers available
    if (servers.length === 0) {
      servers.push({ urls: 'stun:stun.l.google.com:19302' });
    }

    return servers;
  }

  /**
   * Attempt connection with timeout
   */
  private async attemptConnection(
    config: RTCConfiguration,
    timeout: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.peerConnection?.close();
        reject(new Error(`Connection attempt timed out after ${timeout}ms`));
      }, timeout);

      this.peerConnection = new RTCPeerConnection(config);

      // ICE connection state monitoring
      this.peerConnection.oniceconnectionstatechange = () => {
        const state = this.peerConnection?.iceConnectionState;

        if (state === 'connected' || state === 'completed') {
          clearTimeout(timeoutId);
          resolve();
        } else if (state === 'failed' || state === 'disconnected') {
          clearTimeout(timeoutId);
          reject(new Error(`ICE connection ${state}`));
        }
      };

      // Start ICE gathering
      this.peerConnection.createDataChannel('test');
      this.peerConnection
        .createOffer()
        .then(offer => this.peerConnection?.setLocalDescription(offer))
        .catch(reject);
    });
  }

  /**
   * Start monitoring WebRTC stats
   */
  private startStatsMonitoring(): void {
    if (this.statsInterval) return;

    this.statsInterval = window.setInterval(async () => {
      if (!this.peerConnection) return;

      const stats = await this.peerConnection.getStats();
      let bytesSent = 0;
      let bytesReceived = 0;
      let packetsLost = 0;
      let roundTripTime = 0;

      stats.forEach((report) => {
        if (report.type === 'outbound-rtp') {
          bytesSent += report.bytesSent || 0;
        } else if (report.type === 'inbound-rtp') {
          bytesReceived += report.bytesReceived || 0;
          packetsLost += report.packetsLost || 0;
        } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          roundTripTime = report.currentRoundTripTime || 0;
        }
      });

      this.stats = {
        bytesSent,
        bytesReceived,
        packetsLost,
        roundTripTime,
        connectionType: this.stats.connectionType,
      };

      this.options.onStatsUpdate(this.stats);
    }, 1000); // Update every second
  }

  /**
   * Report usage to backend every 5 seconds
   */
  private startUsageReporting(): void {
    if (this.usageReportInterval) return;

    let lastBytesSent = 0;
    let lastBytesReceived = 0;

    this.usageReportInterval = window.setInterval(async () => {
      const deltaBytesSent = this.stats.bytesSent - lastBytesSent;
      const deltaBytesReceived = this.stats.bytesReceived - lastBytesReceived;

      if (deltaBytesSent > 0 || deltaBytesReceived > 0) {
        try {
          await reportGridBandwidthUsage(
            this.gridId,
            deltaBytesSent,
            deltaBytesReceived
          );

          lastBytesSent = this.stats.bytesSent;
          lastBytesReceived = this.stats.bytesReceived;

          // Check quota and warn if needed
          this.checkQuotaWarnings();
        } catch (error) {
          console.error('Failed to report bandwidth usage:', error);
        }
      }
    }, 5000); // Report every 5 seconds
  }

  /**
   * Check quota and emit warnings
   */
  private checkQuotaWarnings(): void {
    if (!this.relayConfig?.allocation) return;

    const { used_gb, purchased_gb } = this.relayConfig.allocation;
    const percentUsed = (used_gb / purchased_gb) * 100;

    // Emit warnings at 80%, 90%, 95%
    if (percentUsed >= 95) {
      this.options.onQuotaWarning(95);
    } else if (percentUsed >= 90) {
      this.options.onQuotaWarning(90);
    } else if (percentUsed >= 80) {
      this.options.onQuotaWarning(80);
    }
  }

  /**
   * Check if quota is exceeded
   */
  private isQuotaExceeded(): boolean {
    if (!this.relayConfig?.allocation) return false;

    const { used_gb, purchased_gb, status } = this.relayConfig.allocation;

    if (status === 'exhausted') return true;
    if (used_gb >= purchased_gb) return true;

    return false;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get current stats
   */
  getStats(): ConnectionStats {
    return { ...this.stats };
  }

  /**
   * Get relay configuration
   */
  getRelayConfig(): GridRelayStatus | null {
    return this.relayConfig;
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    if (this.usageReportInterval) {
      clearInterval(this.usageReportInterval);
      this.usageReportInterval = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.setState('idle');
  }

  /**
   * Update state and notify listeners
   */
  private setState(state: ConnectionState): void {
    this.state = state;
    this.options.onStateChange(state);
  }
}
