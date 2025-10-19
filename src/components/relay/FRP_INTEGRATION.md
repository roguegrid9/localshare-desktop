# FRP Relay & Tunnel Integration Guide

This document explains how to integrate the new FRP relay and tunnel components into the RogueGrid9 desktop app.

## Components

### 1. NetworkMenu (Primary Integration Point)
The easiest way to add FRP relay functionality to your app.

```tsx
import { NetworkMenu } from './components/relay';

function Navigation() {
  const { token } = useAuth();

  return (
    <nav className="flex items-center gap-4">
      <NetworkMenu token={token} isConnected={false} />
      {/* other navigation items */}
    </nav>
  );
}
```

### 2. NetworkDashboard
Full-featured dashboard for managing relay connections and tunnels.

```tsx
import { NetworkDashboard } from './components/relay';
import { useState } from 'react';

function MyComponent() {
  const [showDashboard, setShowDashboard] = useState(false);
  const { token } = useAuth();

  return (
    <>
      <button onClick={() => setShowDashboard(true)}>
        Open Network Dashboard
      </button>

      {showDashboard && (
        <NetworkDashboard
          token={token}
          onClose={() => setShowDashboard(false)}
          onCreateTunnel={() => {
            // Optional: Handle create tunnel callback
          }}
          onStartTrial={() => {
            // Optional: Handle start trial callback
          }}
        />
      )}
    </>
  );
}
```

### 3. CreateTunnelModal
Standalone modal for creating public tunnels.

```tsx
import { CreateTunnelModal } from './components/relay';

function MyComponent() {
  const [showModal, setShowModal] = useState(false);
  const { token } = useAuth();

  return (
    <>
      <button onClick={() => setShowModal(true)}>
        Create Tunnel
      </button>

      {showModal && (
        <CreateTunnelModal
          token={token}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            console.log('Tunnel created!');
            setShowModal(false);
          }}
        />
      )}
    </>
  );
}
```

### 4. TrialSignupModal
Modal for starting the 7-day free trial.

```tsx
import { TrialSignupModal } from './components/relay';

function MyComponent() {
  const [showModal, setShowModal] = useState(false);
  const { token } = useAuth();

  return (
    <>
      <button onClick={() => setShowModal(true)}>
        Start Free Trial
      </button>

      {showModal && (
        <TrialSignupModal
          token={token}
          onClose={() => setShowModal(false)}
          onStarted={() => {
            console.log('Trial started!');
            setShowModal(false);
          }}
        />
      )}
    </>
  );
}
```

## Tauri Commands Reference

The components use these Tauri commands (already implemented):

```typescript
// Trial & Subscription
await invoke('start_relay_trial', { token, location: 'us-east' });

// Connection Management
await invoke('connect_frp_relay', { token });
await invoke('disconnect_frp_relay');
await invoke('get_frp_status'); // Returns FRPStatus

// Tunnel Management
await invoke('create_tunnel_command', { token, subdomain, localPort, protocol });
await invoke('list_tunnels_command', { token });
await invoke('delete_tunnel_command', { token, tunnelId });
await invoke('check_subdomain_command', { subdomain }); // Public, no auth
```

## TypeScript Types

```typescript
interface FRPStatus {
  connected: boolean;
  tunnels_active: number;
  server_addr?: string;
  uptime_seconds: number;
}

interface RelaySubscription {
  id: string;
  status: string;
  plan_type: string;
  bandwidth_used: number;
  bandwidth_limit: number;
  max_connections: number;
  is_trial: boolean;
  trial_ends_at?: string;
}

interface Tunnel {
  id: string;
  subdomain: string;
  local_port: number;
  protocol: string;
  status: string;
  bandwidth_used: number;
}

interface SubdomainAvailability {
  subdomain: string;
  available: boolean;
  reason?: string;
  full_domain?: string;
}
```

## Integration Example

Here's a complete example of adding the Network menu to your main layout:

```tsx
// src/layout/MainLayout.tsx
import { NetworkMenu } from '../components/relay';
import { useAuth } from '../hooks/useAuth';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

function MainLayout({ children }) {
  const { token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);

  // Poll connection status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await invoke('get_frp_status');
        setIsConnected(status.connected);
      } catch (err) {
        setIsConnected(false);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <nav className="bg-gray-900 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white">RogueGrid9</h1>
            {/* Add Network Menu */}
            <NetworkMenu token={token} isConnected={isConnected} />
          </div>
        </div>
      </nav>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

export default MainLayout;
```

## WebRTC Fallback Integration

To use FRP relay as a fallback for WebRTC connections:

```typescript
// In your WebRTC connection manager
import { invoke } from '@tauri-apps/api/core';

async function establishConnection(peer: Peer): Promise<RTCPeerConnection> {
  // Try P2P first
  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  // Wait for ICE gathering
  await waitForICEGathering(peerConnection);

  // Check if we have a relay connection candidate
  const hasRelay = peerConnection.localDescription?.sdp.includes('relay');

  if (!hasRelay) {
    // P2P failed, check if FRP relay is available
    try {
      const status = await invoke('get_frp_status');

      if (!status.connected) {
        // Prompt user to enable relay
        showRelayPrompt();
        throw new Error('P2P connection failed and relay not available');
      }

      // Use FRP relay fallback (implementation depends on your WebRTC setup)
      return await connectViaFRPRelay(peer);
    } catch (err) {
      throw new Error('Connection failed');
    }
  }

  return peerConnection;
}
```

## Styling

All components use Tailwind CSS with the following color scheme:
- Background: `bg-gray-900`, `bg-gray-800`, `bg-gray-700`
- Text: `text-white`, `text-gray-300`, `text-gray-400`
- Primary: `bg-blue-600`, `text-blue-400`
- Success: `bg-green-500`, `text-green-400`
- Error: `bg-red-500`, `text-red-400`

Icons are from `lucide-react` package.

## Testing

1. **Start Trial**
   - Open Network Dashboard
   - Click "Start Free Trial"
   - Select a location
   - Verify trial is created

2. **Connect Relay**
   - Click "Connect Relay" in dashboard
   - Verify connection status changes to "Connected"
   - Check uptime is counting up

3. **Create Tunnel**
   - Click "Create Tunnel"
   - Enter subdomain (e.g., "myapp")
   - Set local port (e.g., 3000)
   - Verify tunnel is created
   - Check tunnel appears in list

4. **Delete Tunnel**
   - Click trash icon on a tunnel
   - Confirm deletion
   - Verify tunnel is removed

5. **Disconnect**
   - Click "Disconnect Relay"
   - Verify status changes to "Disconnected"

## Troubleshooting

### "Failed to connect"
- Check that backend server is running
- Verify user has an active subscription (trial or paid)
- Check network connectivity

### "Subdomain already taken"
- Try a different subdomain
- Check subdomain follows rules (3-32 chars, lowercase alphanumeric with hyphens)

### "Connection limit reached"
- Trial: max 3 connections
- Pro: max 40 connections
- Delete unused tunnels to free up slots

### Tunnels not working
- Verify local application is running on specified port
- Check FRP relay is connected
- Test tunnel URL in browser

## Architecture

```
Frontend (React/TypeScript)
├── NetworkMenu          -> User-facing menu item
├── NetworkDashboard     -> Main management UI
├── CreateTunnelModal    -> Tunnel creation
└── TrialSignupModal     -> Trial signup

                ↓ invoke()

Tauri Commands (Rust)
├── start_relay_trial
├── connect_frp_relay
├── disconnect_frp_relay
├── get_frp_status
├── create_tunnel_command
├── list_tunnels_command
├── delete_tunnel_command
└── check_subdomain_command

                ↓

FRP Client Manager (Rust)
├── Process Management   -> Start/stop FRP client
├── Config Generation    -> Create frpc.ini
└── Binary Management    -> Platform-specific FRP binary

                ↓

Backend API (Go/PostgreSQL)
├── Subscription Management
├── VPS Provisioning (Vultr)
├── Tunnel Management
└── Bandwidth Tracking
```

## Next Steps

1. Add NetworkMenu to your main navigation component
2. Test trial signup flow
3. Test tunnel creation and deletion
4. Integrate WebRTC fallback (if needed)
5. Add monitoring/analytics (optional)

For questions or issues, refer to the main implementation plan document.
