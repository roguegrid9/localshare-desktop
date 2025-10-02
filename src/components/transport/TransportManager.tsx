// src/components/transport/TransportManager.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useToast } from "../ui/Toaster";

// Enhanced TransportInfo type with optional fields for presets
type TransportInfo = {
  transport_id: string;
  transport_type: string;
  local_port: number;
  target_port?: number;
  connection_url?: string;
  instructions: string;
  preset_id?: string;
  auto_created?: boolean;
  service_name?: string;
};

type ServiceDetection = {
  service_type: string;
  transport_type: string;
  suggested_name: string;
  protocol?: string;
  is_shareable: boolean;
};

type ProcessInfo = {
  process_id: string;
  grid_id: string;
  port?: number;
  service_name?: string;
  status: string;
};

type TransportManagerProps = {
  gridId: string;
  isHost: boolean;
  processes: ProcessInfo[];
  onTransportStarted?: (transport: TransportInfo) => void;
};

// --- Helper functions for enhanced transport display ---

// Determines the icon based on preset or transport type
const getTransportIcon = (transport: TransportInfo) => {
  if (transport.auto_created && transport.preset_id) {
    // Show preset-specific icons
    switch (transport.preset_id) {
      case 'minecraft_server':
        return '🎮';
      case 'http_server':
      case 'web_server':
        return '🌐';
      case 'dev_server':
        return '⚡';
      default:
        return '🔧'; // Default for other presets
    }
  }

  // Default transport type icons
  switch (transport.transport_type.toLowerCase()) {
    case 'http':
      return '🌐';
    case 'tcp':
      return '🔌';
    case 'websocket':
      return '💬';
    default:
      return '🔗';
  }
};

// Generates a title, giving priority to preset-based names
const getTransportTitle = (transport: TransportInfo) => {
  if (transport.auto_created && transport.preset_id) {
    // A more descriptive title for auto-created transports
    return `${transport.service_name || 'Service'} (via ${transport.preset_id})`;
  }
  // Default title for manually created tunnels
  return `${transport.service_name || transport.transport_type.toUpperCase()} Tunnel`;
};

// Provides a description, indicating if it was auto-shared
const getTransportDescription = (transport: TransportInfo) => {
  if (transport.auto_created) {
    return `Auto-shared by preset • ${transport.instructions}`;
  }
  return transport.instructions;
};


// --- Enhanced UI Components ---

/**
 * A card component to display detailed information about a single transport.
 */
const TransportCard = ({ transport, isHost, onConnect, onStop }: {
  transport: TransportInfo;
  isHost: boolean;
  onConnect: (transport: TransportInfo) => void;
  onStop: (transportId: string) => void;
}) => (
  <div className="rounded-lg border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors">
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3 flex-1">
        {/* Transport Icon */}
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-lg">
          {getTransportIcon(transport)}
        </div>
        
        {/* Transport Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h4 className="font-medium text-white truncate">
              {getTransportTitle(transport)}
            </h4>
            <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400 border border-green-500/30">
              Active
            </span>
            {transport.auto_created && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30">
                Auto-shared
              </span>
            )}
          </div>
          
          <p className="text-sm text-white/60 mb-2">
            {getTransportDescription(transport)}
          </p>
          
          {/* Connection Details */}
          <div className="flex items-center gap-4 text-xs">
            {transport.connection_url ? (
              <span className="text-blue-400 font-mono">{transport.connection_url}</span>
            ) : (
              <span className="text-blue-400 font-mono">localhost:{transport.local_port}</span>
            )}
            
            {transport.target_port && (
              <span className="text-white/40">→ port {transport.target_port}</span>
            )}
          </div>
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex items-center gap-2 ml-4">
        <button
          onClick={() => onConnect(transport)}
          className="rounded-lg bg-blue-500/20 border border-blue-500/30 px-3 py-1.5 text-sm text-blue-300 hover:bg-blue-500/30 transition-colors"
        >
          {transport.connection_url ? "Open" : "Copy"}
        </button>
        
        {isHost && (
          <button
            onClick={() => onStop(transport.transport_id)}
            className="rounded-lg bg-red-500/20 border border-red-500/30 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/30 transition-colors"
          >
            Stop
          </button>
        )}
      </div>
    </div>
  </div>
);

/**
 * An enhanced empty state component for better user guidance when no transports are active.
 */
const EmptyTransportState = ({ isHost }: { isHost: boolean }) => (
  <div className="rounded-lg border border-white/10 bg-white/5 p-8 text-center">
    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
      <span className="text-3xl">🚀</span>
    </div>
    
    <h3 className="text-xl font-semibold mb-3">
      {isHost ? "Ready to Share!" : "Waiting for Shared Processes"}
    </h3>
    
    <p className="text-white/60 mb-6 max-w-md mx-auto">
      {isHost 
        ? "Create processes using presets and they'll automatically be shared with your grid members via P2P tunnels."
        : "When grid members create processes, they'll appear here for you to connect to."
      }
    </p>
    
    {isHost && (
      <div className="space-y-2 text-sm text-white/40">
        <div className="flex items-center justify-center gap-2">
          <span>🎮</span>
          <span>Minecraft servers</span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <span>🌐</span>
          <span>Web applications</span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <span>⚡</span>
          <span>Development servers</span>
        </div>
        <div className="text-xs mt-3">All automatically shared when created!</div>
      </div>
    )}
  </div>
);


export default function TransportManager({ 
  gridId, 
  isHost, 
  processes, 
  onTransportStarted 
}: TransportManagerProps) {
  const [activeTransports, setActiveTransports] = useState<TransportInfo[]>([]);
  const [showAddTransport, setShowAddTransport] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);
  const [transportType, setTransportType] = useState<string>("http");
  const [serviceDetection, setServiceDetection] = useState<ServiceDetection | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  
  const toast = useToast();

  // Load active transports on component mount
  useEffect(() => {
    loadActiveTransports();
  }, [gridId]);

  // Listen for transport-related events from the backend
  useEffect(() => {
    const unsubscribe = Promise.all([
      listen("transport_started", (event: any) => {
        const transport = event.payload as TransportInfo;
        if (transport.transport_id.startsWith(gridId)) {
          setActiveTransports(prev => [...prev, transport]);
          onTransportStarted?.(transport);
          toast(`Transport started: ${transport.instructions}`, "success");
        }
      }),
      
      listen("transport_stopped", (event: any) => {
        const { transport_id } = event.payload;
        setActiveTransports(prev => prev.filter(t => t.transport_id !== transport_id));
        toast("Transport tunnel stopped", "info");
      }),

      listen("terminal_output", (event: any) => {
        const { grid_id, data } = event.payload;
        if (grid_id === gridId) {
          try {
            const output = atob(data);
            console.log("Terminal output:", output);
            // Future enhancement: Display this in a terminal UI component
          } catch (e) {
            console.error("Failed to decode terminal output:", e);
          }
        }
      }),
    ]);

    return () => {
      unsubscribe.then(unsubs => unsubs.forEach(unsub => unsub()));
    };
  }, [gridId, onTransportStarted, toast]);

  const loadActiveTransports = async () => {
    try {
      const transports = await invoke<TransportInfo[]>("get_active_transports", { gridId });
      setActiveTransports(transports);
    } catch (error) {
      console.error("Failed to load active transports:", error);
    }
  };

  const detectServiceType = async (process: ProcessInfo) => {
    if (!process.port) return;

    try {
      const detection = await invoke<ServiceDetection>("detect_service_type", {
        port: process.port,
        processName: process.service_name,
      });
      
      setServiceDetection(detection);
      setTransportType(detection.transport_type);
    } catch (error) {
      console.error("Failed to detect service type:", error);
      toast("Failed to detect service type", "error");
    }
  };

  const startTransport = async () => {
    if (!selectedProcess) return;

    try {
      setIsStarting(true);

      const request = {
        grid_id: gridId,
        process_id: selectedProcess.process_id,
        transport_type: transportType,
        target_port: selectedProcess.port,
        service_name: selectedProcess.service_name || serviceDetection?.suggested_name,
        protocol: serviceDetection?.protocol,
        shell_type: transportType === "terminal" ? "bash" : undefined,
      };

      await invoke("start_transport_tunnel", { request });
      
      // Reset form state after starting
      setShowAddTransport(false);
      setSelectedProcess(null);
      setServiceDetection(null);
      
    } catch (error) {
      console.error("Failed to start transport:", error);
      toast(`Failed to start transport: ${error}`, "error");
    } finally {
      setIsStarting(false);
    }
  };

  const stopTransport = async (transportId: string) => {
    try {
      await invoke("stop_transport_tunnel", { transportId });
      // The `transport_stopped` event will update the UI
    } catch (error) {
      console.error("Failed to stop transport:", error);
      toast(`Failed to stop transport: ${error}`, "error");
    }
  };

  const sendTerminalInput = async () => {
    if (!terminalInput.trim()) return;

    try {
      await invoke("send_terminal_input", {
        gridId,
        input: terminalInput,
      });
      
      setTerminalInput("");
    } catch (error) {
      console.error("Failed to send terminal input:", error);
      toast("Failed to send terminal input", "error");
    }
  };

  const openConnection = (transport: TransportInfo) => {
    if (transport.connection_url) {
      // Open HTTP URLs in the default browser
      window.open(transport.connection_url, '_blank');
    } else {
      // Copy connection details for TCP/game servers to clipboard
      const text = `localhost:${transport.local_port}`;
      navigator.clipboard.writeText(text);
      toast("Connection details copied to clipboard", "success");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Transport Tunnels</h3>
          <p className="text-sm text-white/60">
            {isHost ? "Share your processes with grid members" : "Connect to shared processes"}
          </p>
        </div>
        
        {isHost && processes.length > 0 && (
          <button
            onClick={() => setShowAddTransport(true)}
            className="rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Add Transport
          </button>
        )}
      </div>

      {/* Enhanced Active Transports Display */}
      {activeTransports.length > 0 ? (
        <div className="space-y-3">
          {activeTransports
            .sort((a, b) => {
              // Sort auto-created transports to the top
              if (a.auto_created && !b.auto_created) return -1;
              if (!a.auto_created && b.auto_created) return 1;
              // Then sort by service name
              return a.service_name?.localeCompare(b.service_name || '') || 0;
            })
            .map((transport) => (
              <TransportCard
                key={transport.transport_id}
                transport={transport}
                isHost={isHost}
                onConnect={openConnection}
                onStop={stopTransport}
              />
            ))}
        </div>
      ) : (
        <EmptyTransportState isHost={isHost} />
      )}

      {/* Terminal Input (only shown if a terminal transport is active) */}
      {activeTransports.some(t => t.transport_type === "terminal") && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={terminalInput}
              onChange={(e) => setTerminalInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendTerminalInput()}
              placeholder="Type terminal command..."
              className="flex-1 rounded border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 focus:border-white/20 focus:outline-none"
            />
            <button
              onClick={sendTerminalInput}
              disabled={!terminalInput.trim()}
              className="rounded bg-blue-500/20 px-3 py-2 text-sm text-blue-300 hover:bg-blue-500/30 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Add Transport Modal */}
      {showAddTransport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAddTransport(false)}
          />
          
          <div className="relative w-full max-w-md mx-4">
            <div className="rounded-xl border border-white/10 bg-[#111319] p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Add Transport Tunnel</h2>
                <button
                  onClick={() => setShowAddTransport(false)}
                  className="rounded-lg p-1 text-white/60 hover:text-white hover:bg-white/10"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Process Selection */}
                <div>
                  <label className="block text-sm font-medium mb-2">Select Process</label>
                  <select
                    value={selectedProcess?.process_id || ""}
                    onChange={(e) => {
                      const process = processes.find(p => p.process_id === e.target.value);
                      setSelectedProcess(process || null);
                      if (process) {
                        detectServiceType(process);
                      }
                    }}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/20 focus:outline-none"
                  >
                    <option value="">Choose a process...</option>
                    {processes.map((process) => (
                      <option key={process.process_id} value={process.process_id}>
                        {process.service_name || `Process ${process.process_id.substring(0,6)}`}
                        {process.port && ` (Port ${process.port})`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Service Detection Results */}
                {serviceDetection && (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                    <h4 className="font-medium text-blue-200 mb-2">Detected Service</h4>
                    <p className="text-sm text-blue-300">
                      Type: {serviceDetection.service_type}
                    </p>
                    <p className="text-sm text-blue-300">
                      Suggested Transport: {serviceDetection.transport_type}
                    </p>
                    {!serviceDetection.is_shareable && (
                      <p className="text-sm text-yellow-300 mt-1">
                        ⚠️ This service type may not be suitable for sharing.
                      </p>
                    )}
                  </div>
                )}

                {/* Transport Type Selection */}
                <div>
                  <label className="block text-sm font-medium mb-2">Transport Type</label>
                  <select
                    value={transportType}
                    onChange={(e) => setTransportType(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/20 focus:outline-none"
                  >
                    <option value="http">HTTP Tunnel (Web servers, APIs)</option>
                    <option value="tcp">TCP Tunnel (Game servers, databases)</option>
                    <option value="terminal">Terminal Session</option>
                  </select>
                </div>

                {/* Modal Actions */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowAddTransport(false)}
                    disabled={isStarting}
                    className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium hover:border-white/20 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={startTransport}
                    disabled={!selectedProcess || isStarting}
                    className="flex-1 rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {isStarting ? "Starting..." : "Start Tunnel"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
