// src/components/layout/pages/GridManagement.tsx
import { useState, useEffect } from 'react';
import {
  Users,
  Settings,
  Activity,
  Copy,
  Check,
  Plus,
  Terminal,
  Hash,
  Trash2,
  AlertTriangle,
  Crown,
  Shield,
  User,
  X,
  Monitor,
  Radio,
  Wifi
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../../components/ui/Toaster';
import PermissionManager from '../../components/permissions/PermissionManager';

interface GridManagementProps {
  gridId: string;
  onClose?: () => void;
}

interface GridDetails {
  id: string;
  name: string;
  description: string | null;
  creator_id: string;
  grid_type: string | null;
  max_members: number;
  member_count: number;
  user_role: string;
  is_public: boolean;
  invite_code: string;
  created_at: string;
  updated_at: string;
}

interface GridMember {
  user_id: string;
  username?: string;
  display_name?: string;
  role: string;
  joined_at: string;
  is_online: boolean;
}

interface ProcessInfo {
  process_id: string;
  grid_id: string;
  status: {
    state: string;
    pid?: number;
    exit_code?: number;
  };
  config: {
    executable_path: string;
    args: string[];
    env_vars: Record<string, string>;
  };
  created_at: string;
}

// Shared Process types (from Rust backend)
interface SharedProcess {
  id: string;
  grid_id: string;
  user_id: string;
  config: {
    name: string;
    description?: string;
    pid: number;
    port: number;
    command: string;
    working_dir: string;
    executable_path: string;
    process_name: string;
  };
  status: 'Running' | 'Stopped' | 'Error';
  last_seen_at?: number;
  created_at: number;
  updated_at: number;
}

interface ChannelInfo {
  id: string;
  grid_id: string;
  channel_type: string;
  name: string;
  description?: string;
  created_by: string;
  is_private: boolean;
  max_members?: number;
  member_count: number;
  user_role?: string;
  can_join: boolean;
  requires_code: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface ContainerInfo {
  container_id: string;
  container_name: string;
  image_full_name: string;
  container_type: string;
  status: string;
  access_address: string;
  created_at: string;
}

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  onForceConfirm?: () => Promise<void>;
  title: string;
  message: string;
  itemName: string;
  type: 'process' | 'channel' | 'container';
  forceDelete?: boolean;
  containerStatus?: string;
}

interface RoleChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: GridMember;
  currentUserRole: string;
  onRoleChange: (userId: string, newRole: string) => void;
}

function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  onForceConfirm,
  title,
  message,
  itemName,
  type,
  forceDelete = false,
  containerStatus
}: DeleteConfirmationModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const toast = useToast();

  if (!isOpen) return null;

  const isContainer = type === 'container';
  // const isRunningContainer = isContainer && containerStatus?.toLowerCase() === 'running';

  const handleConfirm = async () => {
    if (isDeleting) {
      console.log('⚠️ Already deleting, ignoring click');
      return; // Prevent double-clicks
    }
    console.log('🚀 Modal handleConfirm started');
    setIsDeleting(true);
    try {
      console.log('⏳ Awaiting onConfirm...');
      await onConfirm();
      console.log('✅ onConfirm completed successfully');
      console.log('🚪 Closing modal...');
      onClose(); // Close modal after successful deletion
      console.log('✅ Modal closed');
    } catch (error) {
      console.error('❌ Deletion error in modal:', error);
      toast(`Failed to delete: ${error}`, 'error');
      console.log('🚪 Closing modal after error...');
      onClose(); // Close modal even on error
    } finally {
      console.log('🔄 Setting isDeleting to false');
      setIsDeleting(false);
    }
  };

  const handleForceConfirm = async () => {
    if (isDeleting || !onForceConfirm) return; // Prevent double-clicks
    setIsDeleting(true);
    try {
      await onForceConfirm();
      onClose(); // Close modal after successful deletion
    } catch (error) {
      console.error('Force deletion error in modal:', error);
      toast(`Failed to force delete: ${error}`, 'error');
      onClose(); // Close modal even on error
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className={`border rounded-xl p-6 max-w-md w-full mx-4 ${
        forceDelete 
          ? 'bg-[#111319] border-yellow-500/20' 
          : 'bg-[#111319] border-red-500/20'
      }`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            forceDelete 
              ? 'bg-yellow-500/20' 
              : 'bg-red-500/20'
          }`}>
            {forceDelete ? (
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400" />
            )}
          </div>
          <h3 className={`text-lg font-semibold ${
            forceDelete ? 'text-yellow-300' : 'text-red-300'
          }`}>
            {forceDelete ? 'Force Delete Container' : title}
          </h3>
        </div>
        
        <div className="mb-6">
          <p className="text-white/80 mb-2">
            {forceDelete 
              ? "This container is currently running. Force deletion will stop and remove it immediately."
              : message
            }
          </p>
          <p className="text-white font-medium mb-2">"{itemName}"</p>
          
          {isContainer && containerStatus && (
            <div className="text-sm text-white/60 bg-white/5 rounded-lg p-3 mt-3">
              <div className="flex items-center gap-2 mb-2">
                <Monitor className="w-4 h-4" />
                <span className="font-medium">Container Details</span>
              </div>
              <div className="space-y-1">
                <div>Status: <span className="text-white">{containerStatus}</span></div>
              </div>
            </div>
          )}
          
          {forceDelete && (
            <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-yellow-200 text-sm font-medium">⚠️ Warning</p>
              <p className="text-yellow-200/80 text-sm">
                This will forcefully stop and remove the running container. Any unsaved data will be lost.
              </p>
            </div>
          )}
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm hover:border-white/20 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>

          {forceDelete && onForceConfirm ? (
            <button
              onClick={handleForceConfirm}
              disabled={isDeleting}
              className="flex-1 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? 'Deleting...' : 'Force Delete'}
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={isDeleting}
              className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? 'Deleting...' : `Delete ${type === 'container' ? 'Container' : type === 'process' ? 'Process' : 'Channel'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleChangeModal({ isOpen, onClose, member, currentUserRole, onRoleChange }: RoleChangeModalProps) {
  // Add null check here - use empty string as fallback
  const [selectedRole, setSelectedRole] = useState(member?.role || '');

  // Update selectedRole when member changes
  useEffect(() => {
    if (member?.role) {
      setSelectedRole(member.role);
    }
  }, [member]);

  // Return early if modal is closed OR if member is null
  if (!isOpen || !member) return null;

  const availableRoles = currentUserRole === 'owner' 
    ? ['member', 'admin', 'owner']
    : ['member', 'admin'];

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="w-4 h-4 text-yellow-400" />;
      case 'admin': return <Shield className="w-4 h-4 text-blue-400" />;
      default: return <User className="w-4 h-4 text-gray-400" />;
    }
  };

  const getRoleDescription = (role: string) => {
    switch (role) {
      case 'owner': return 'Full control including grid deletion';
      case 'admin': return 'Manage members, channels, and processes';
      default: return 'Basic grid access and participation';
    }
  };

  const handleConfirm = () => {
    if (selectedRole !== member.role) {
      onRoleChange(member.user_id, selectedRole);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#111319] border border-white/10 rounded-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Change Role</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="mb-4">
          <p className="text-white/80 mb-2">
            Changing role for <span className="font-medium text-white">
              {member.display_name || member.username || 'Unknown User'}
            </span>
          </p>
          <p className="text-sm text-white/60">
            Current role: <span className="capitalize">{member.role}</span>
          </p>
        </div>
        
        <div className="space-y-3 mb-6">
          {availableRoles.map(role => (
            <label
              key={role}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedRole === role
                  ? 'border-[#FF8A00] bg-[#FF8A00]/10'
                  : 'border-white/10 hover:border-white/20 hover:bg-white/5'
              }`}
            >
              <input
                type="radio"
                name="role"
                value={role}
                checked={selectedRole === role}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="sr-only"
              />
              <div className="flex items-center gap-2 flex-1">
                {getRoleIcon(role)}
                <div>
                  <div className="font-medium text-white capitalize">{role}</div>
                  <div className="text-sm text-white/60">{getRoleDescription(role)}</div>
                </div>
              </div>
              {selectedRole === role && (
                <Check className="w-4 h-4 text-[#FF8A00]" />
              )}
            </label>
          ))}
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm hover:border-white/20 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedRole === member.role}
            className="flex-1 rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Change Role
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GridManagement({ gridId, onClose }: GridManagementProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'resources' | 'relay' | 'settings'>('overview');
  const [gridDetails, setGridDetails] = useState<GridDetails | null>(null);
  const [members, setMembers] = useState<GridMember[]>([]);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [sharedProcesses, setSharedProcesses] = useState<SharedProcess[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [inviteCodeCopied, setInviteCodeCopied] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: 'process' | 'channel' | 'container';
    id: string;
    name: string;
    forceDelete?: boolean;
    containerStatus?: string;
  }>({ isOpen: false, type: 'process', id: '', name: '' });
  const [roleChangeModal, setRoleChangeModal] = useState<{
    isOpen: boolean;
    member: GridMember | null;
  }>({ isOpen: false, member: null });

  // Editable grid info state
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [isSavingGridInfo, setIsSavingGridInfo] = useState(false);

  const toast = useToast();

  const loadGridData = async () => {
    setLoading(true);
    try {
      // Load grid details
      const response = await invoke<any>('get_grid_details', { gridId });
      
      // Extract the actual grid details from the nested structure
      const details = response.grid as GridDetails;
      setGridDetails(details);

      // Load grid members - they might already be in the response
      let membersData: GridMember[];
      if (response.members && Array.isArray(response.members)) {
        membersData = response.members;
      } else {
        membersData = await invoke<GridMember[]>('get_grid_members', { gridId });
      }
      setMembers(Array.isArray(membersData) ? membersData : []);

      // Load processes and extract containers from them
      try {
        const processesData = await invoke<ProcessInfo[]>('get_active_processes');
        const gridProcesses = processesData.filter(p => p.grid_id === gridId);
        setProcesses(Array.isArray(gridProcesses) ? gridProcesses : []);
        
        // Extract containers from processes
        const containerProcesses = gridProcesses.filter(p => 
          p.config?.executable_path === 'internal_container'
        );
        
        // Convert process info to container info
        const containersFromProcesses = containerProcesses.map(p => {
          // Use the display name as the primary container name (user-friendly name)
          const displayName = p.config.env_vars?.DISPLAY_NAME || p.config.env_vars?.display_name;
          const containerName = p.config.env_vars?.RG9_CONTAINER_NAME;
          const containerId = p.config.env_vars?.RG9_CONTAINER_ID || p.config.args?.[0];
          
          return {
            container_id: containerId || '',
            container_name: displayName || containerName || containerId?.slice(0, 8) || 'Unknown Container',
            image_full_name: p.config.args?.[1] || 'unknown',
            container_type: p.config.args?.[2] || 'application',
            status: p.status?.state || 'unknown',
            access_address: p.config.env_vars?.RG9_ACCESS_ADDRESS || '',
            created_at: typeof p.created_at === 'number' ? new Date(p.created_at * 1000).toISOString() : p.created_at,
            process_id: p.process_id // Add this for deletion
          };
        });
        
        console.log('🔍 Containers from processes:', containersFromProcesses);
        setContainers(containersFromProcesses);
        
      } catch (error) {
        console.error('Failed to load containers from processes:', error);
        setContainers([]);
        setProcesses([]);
      }

      // Load shared processes
      try {
        const sharedProcessesData = await invoke<SharedProcess[]>('get_grid_shared_processes', { gridId });
        setSharedProcesses(Array.isArray(sharedProcessesData) ? sharedProcessesData : []);
        console.log('✅ Loaded shared processes in GridManagement:', sharedProcessesData);
      } catch (error) {
        console.error('Failed to load shared processes:', error);
        setSharedProcesses([]);
      }

      // Load channels
      const channelsData = await invoke<ChannelInfo[]>('get_grid_channels', { gridId });
      setChannels(Array.isArray(channelsData) ? channelsData : []);

    } catch (error) {
      console.error('Failed to load grid data:', error);
      toast(`Failed to load grid data: ${error}`, 'error');
      setMembers([]);
      setProcesses([]);
      setSharedProcesses([]);
      setChannels([]);
      setContainers([]);
    } finally {
      setLoading(false);
    }
  };

  // Load grid data on mount and ensure grid is hosted
  useEffect(() => {
    const initializeGrid = async () => {
      // Load grid data first
      loadGridData();
    };

    initializeGrid();
  }, [gridId]);

  // Auto-host only if user is owner or admin
  useEffect(() => {
    const autoHostIfOwner = async () => {
      if (!gridDetails) return;

      // Only auto-host if user is owner or admin
      const isOwnerOrAdmin = gridDetails.user_role === 'owner' || gridDetails.user_role === 'admin';
      if (!isOwnerOrAdmin) {
        console.log('Skipping auto-host: user is not owner/admin (role:', gridDetails.user_role, ')');
        return;
      }

      try {
        await invoke('auto_host_grid', { gridId });
        console.log('Grid auto-hosted successfully (owner/admin)');
      } catch (error) {
        console.warn('Failed to auto-host grid:', error);
      }
    };

    autoHostIfOwner();
  }, [gridId, gridDetails?.user_role]);

  // WebSocket listener for process deletion from other clients
  useEffect(() => {
    const setupWSListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');

      const unlisten = await listen('process_deleted_ws', (event: any) => {
        console.log('🗑️ Process deleted via WebSocket in GridManagement', event.payload);

        // Update state optimistically - remove the process from local state
        const payload = event.payload;
        if (payload && payload.process_id) {
          console.log('Removing process from local state:', payload.process_id);
          setSharedProcesses(prev => prev.filter(p => p.id !== payload.process_id));
          setProcesses(prev => prev.filter(p => p.process_id !== payload.process_id));

          // No need for background refresh - heartbeat is stopped so process won't reappear
        }
      });

      return unlisten;
    };

    const unlistenPromise = setupWSListener();

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, [gridId]);

  // Local listener for process deletion from this client
  useEffect(() => {
    const setupLocalListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');

      const unlisten = await listen('process_deleted', (event: any) => {
        console.log('🗑️ Process deleted locally in GridManagement', event.payload);
        const payload = event.payload as { grid_id: string; process_id: string };

        // Only update if this event is for the current grid
        if (payload.grid_id === gridId) {
          console.log('Removing process from local state after deletion:', payload.process_id);
          // Update state optimistically - remove the process from local state
          setSharedProcesses(prev => prev.filter(p => p.id !== payload.process_id));
          setProcesses(prev => prev.filter(p => p.process_id !== payload.process_id));

          // No need for background refresh - heartbeat is stopped so process won't reappear
        }
      });

      return unlisten;
    };

    const unlistenPromise = setupLocalListener();

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, [gridId]);

  const copyInviteCode = async () => {
    const code = gridDetails?.invite_code;
    if (!code) return;
    
    try {
      await navigator.clipboard.writeText(code);
      setInviteCodeCopied(true);
      toast('Grid invite code copied to clipboard!', 'success');
      setTimeout(() => setInviteCodeCopied(false), 2000);
    } catch (error) {
      toast('Failed to copy invite code', 'error');
    }
  };

  // Convert SharedProcess to ProcessInfo format for unified display
  const convertSharedProcessToProcessInfo = (sharedProcess: SharedProcess): ProcessInfo => {
    return {
      process_id: sharedProcess.id,
      grid_id: sharedProcess.grid_id,
      config: {
        executable_path: "shared_process", // Special identifier for shared processes
        args: [sharedProcess.config.name, sharedProcess.config.description || ''],
        env_vars: {
          SHARED_PROCESS_NAME: sharedProcess.config.name,
          SHARED_PROCESS_DESCRIPTION: sharedProcess.config.description || '',
          SHARED_PROCESS_PORT: sharedProcess.config.port.toString(),
          SHARED_PROCESS_PID: sharedProcess.config.pid.toString(),
          SHARED_PROCESS_COMMAND: sharedProcess.config.command,
          SHARED_PROCESS_WORKING_DIR: sharedProcess.config.working_dir,
          SHARED_PROCESS_EXECUTABLE: sharedProcess.config.executable_path,
          SHARED_PROCESS_PROCESS_NAME: sharedProcess.config.process_name,
        },
      },
      status: {
        state: sharedProcess.status as any,
        pid: sharedProcess.config.pid,
        exit_code: null,
      },
      created_at: new Date(sharedProcess.created_at * 1000).toISOString(),
    };
  };

  const handleDeleteProcess = async (processId: string) => {
    console.log('🗑️ handleDeleteProcess called for:', processId);

    // Owners and admins can delete ANY process
    const canManageAllProcesses = gridDetails?.user_role === 'owner' || gridDetails?.user_role === 'admin';

    // Check if this is a shared process first
    const isSharedProcessItem = sharedProcesses.some(sp => sp.id === processId);

    if (isSharedProcessItem && !canManageAllProcesses) {
      // Regular members can't delete shared processes from other users
      console.log('❌ Permission denied for shared process');
      toast('Shared processes cannot be deleted from here. Contact the process owner.', 'warning');
      throw new Error('Permission denied');
    }

    // Delete the process (works for both shared and regular processes)
    console.log('📡 Calling delete_grid_process...');
    try {
      await invoke('delete_grid_process', { gridId, processId });
      console.log('✅ delete_grid_process completed');
    } catch (error) {
      console.error('❌ delete_grid_process failed:', error);
      throw error;
    }

    console.log('📢 Showing success toast');
    toast('Process deleted successfully', 'success');

    // Dispatch event to notify other components (like ContentPanel)
    console.log('📤 Dispatching process-deleted event');
    const deleteEvent = new CustomEvent('process-deleted', {
      detail: { gridId, processId }
    });
    window.dispatchEvent(deleteEvent);

    console.log('✅ handleDeleteProcess completed successfully');
    // Note: UI refresh is handled by the 'process_deleted' event listener
  };

  const handleDeleteChannel = async (channelId: string) => {
    await invoke('delete_grid_channel', { gridId, channelId });
    toast('Channel deleted successfully', 'success');
    loadGridData(); // Reload data
  };

  const handleDeleteContainerProcess = async (processId: string) => {
    try {
      setLoadingContainers(true);

      // For container processes, use the comprehensive cleanup but with process-based deletion
      await invoke('cleanup_container_process', {
        processId,
        gridId
      });

      // Force refresh of active processes to update UI
      window.dispatchEvent(new CustomEvent('refresh-processes'));

      toast('Container deleted successfully', 'success');
      loadGridData(); // Reload data
    } finally {
      setLoadingContainers(false);
    }
  };

  const handleDeleteContainer = async (containerId: string) => {
    try {
      setLoadingContainers(true);
      
      // Use the comprehensive cleanup function
      await invoke('cleanup_container_data', {
        containerId,
        gridId
      });
      
      // Remove from server database
      try {
        const response = await fetch(`/api/grids/${gridId}/containers/${containerId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
            'Content-Type': 'application/json'
          }
        });
        if (!response.ok) {
          console.warn('Failed to delete container from server, continuing with local cleanup');
        }
      } catch (e) {
        console.warn('Failed to contact server for container deletion:', e);
      }
      
      // Clean up local storage items related to this container
      const containerKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes(containerId) || key.includes(`container_${containerId}`))) {
          containerKeys.push(key);
        }
      }
      containerKeys.forEach(key => localStorage.removeItem(key));
      
      toast('Container deleted successfully', 'success');

      // Reload data to reflect changes
      loadGridData();

      // Force refresh of active processes to update UI
      window.dispatchEvent(new CustomEvent('refresh-processes'));

    } finally {
      setLoadingContainers(false);
    }
  };

  const handleForceDeleteContainer = async (containerId: string) => {
    try {
      setLoadingContainers(true);
      
      // Use the comprehensive cleanup function with force mode
      await invoke('cleanup_container_data', {
        containerId,
        gridId
      });
      
      // Also try the force removal as backup
      await invoke('remove_roguegrid9_container', { 
        containerId, 
        force: true 
      });
      
      // Force remove from server database
      try {
        const response = await fetch(`/api/grids/${gridId}/containers/${containerId}?force=true`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
            'Content-Type': 'application/json'
          }
        });
        if (!response.ok) {
          console.warn('Failed to force delete container from server, continuing with local cleanup');
        }
      } catch (e) {
        console.warn('Failed to contact server for force container deletion:', e);
      }
      
      // Clean up all local storage items related to this container
      const containerKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes(containerId) || key.includes(`container_${containerId}`) || key.includes(`conn_${containerId}`))) {
          containerKeys.push(key);
        }
      }
      containerKeys.forEach(key => localStorage.removeItem(key));
      
      // Clean up session storage as well
      const sessionKeys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes(containerId) || key.includes(`container_${containerId}`))) {
          sessionKeys.push(key);
        }
      }
      sessionKeys.forEach(key => sessionStorage.removeItem(key));
      
      toast('Container forcefully deleted', 'success');
      loadGridData();

      // Force refresh of active processes to update UI
      window.dispatchEvent(new CustomEvent('refresh-processes'));

    } finally {
      setLoadingContainers(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await invoke('update_member_role', { gridId, userId, newRole });
      toast(`Role updated successfully`, 'success');
      loadGridData(); // Reload data
    } catch (error) {
      console.error('Failed to update role:', error);
      toast(`Failed to update role: ${error}`, 'error');
    }
  };

  const handleSaveGridInfo = async () => {
    if (!gridDetails) return;

    setIsSavingGridInfo(true);
    try {
      await invoke('update_grid_basic_info', {
        gridId,
        name: editedName || gridDetails.name,
        description: editedDescription || null
      });

      toast('Grid updated successfully', 'success');
      loadGridData(); // Reload data to get updated values

      // Dispatch event to refresh grid list in sidebar
      window.dispatchEvent(new CustomEvent('grid-updated', {
        detail: { gridId, name: editedName }
      }));
    } catch (error) {
      console.error('Failed to update grid:', error);
      toast(`Failed to update grid: ${error}`, 'error');
    } finally {
      setIsSavingGridInfo(false);
    }
  };

  // Initialize edited state when grid details load
  if (gridDetails && !editedName && !editedDescription) {
    setEditedName(gridDetails.name);
    setEditedDescription(gridDetails.description || '');
  }

  const canDeleteProcess = (process: ProcessInfo): boolean => {
    if (!gridDetails) return false;
    
    // Check if this is a shared process - shared processes have different deletion rules
    if (isSharedProcess(process)) {
      // Shared processes can only be "removed" by the grid owner/admin (removing access)
      // but they can't be truly deleted as they belong to another user
      return gridDetails.user_role === 'owner' || gridDetails.user_role === 'admin';
    }
    
    // Owner and admin can delete any regular process
    if (gridDetails.user_role === 'owner' || gridDetails.user_role === 'admin') return true;
    // Users can delete their own processes (would need to check owner_id from backend)
    return false;
  };

  const canDeleteChannel = (channel: ChannelInfo): boolean => {
    console.log('=== DEBUG CHANNEL DELETE PERMISSIONS ===');
    console.log('gridDetails:', gridDetails);
    console.log('channel:', channel);
    console.log('gridDetails.user_role:', gridDetails?.user_role);
    console.log('Is owner?', gridDetails?.user_role === 'owner');
    console.log('Is admin?', gridDetails?.user_role === 'admin');
    
    if (!gridDetails) {
      console.log('No gridDetails - returning false');
      return false;
    }
    
    // Owner and admin can delete any channel
    const canDelete = gridDetails.user_role === 'owner' || gridDetails.user_role === 'admin';
    console.log('Final canDelete result:', canDelete);
    console.log('=== END DEBUG ===');
    
    return canDelete;
  };

  const canDeleteContainer = (_container: ContainerInfo): boolean => {
    if (!gridDetails) return false;
    // Owner and admin can delete any container
    return gridDetails.user_role === 'owner' || gridDetails.user_role === 'admin';
  };

  const canChangeRole = (member: GridMember): boolean => {
    if (!gridDetails) return false;
    // Owner can change anyone's role
    if (gridDetails.user_role === 'owner') return true;
    // Admin can change member roles but not other admins or owners
    if (gridDetails.user_role === 'admin') {
      return member.role === 'member';
    }
    return false;
  };

  const isSharedProcess = (process: ProcessInfo): boolean => {
    return process.config.executable_path === "shared_process";
  };

  const getProcessDisplayName = (process: ProcessInfo): string => {
    // Handle shared processes
    if (isSharedProcess(process)) {
      return process.config.env_vars?.SHARED_PROCESS_NAME || 
             process.config.args?.[0] || 
             `Shared Process ${process.process_id.slice(0, 8)}`;
    }
    
    // Handle terminal processes
    if (process.config.executable_path === 'internal_terminal' || 
        process.config.executable_path.startsWith('Recovered Terminal')) {
      return process.config.args[2] || 
            process.config.env_vars?.TERMINAL_NAME || 
            `Terminal ${process.process_id.slice(0, 8)}`;
    }
    
    // Handle container processes
    if (process.config.executable_path === 'internal_container' || 
        process.config.env_vars?.RG9_CONTAINER_ID) {
      // First try environment variables for the display name and container name
      const displayName = process.config.env_vars?.DISPLAY_NAME || 
                         process.config.env_vars?.display_name;
      if (displayName) {
        return displayName;
      }
      
      const containerName = process.config.env_vars?.RG9_CONTAINER_NAME;
      if (containerName) {
        return containerName;
      }
      
      // Fallback to container ID if available
      const containerId = process.config.env_vars?.RG9_CONTAINER_ID;
      if (containerId) {
        return `Container ${containerId.slice(0, 8)}`;
      }
    }
    
    // Default fallback for other processes
    return process.process_id.slice(0, 8);
  };

  // const getStatusColor = (state: string): string => {
  //   switch (state) {
  //     case 'Running': return 'text-green-400';
  //     case 'Starting': return 'text-yellow-400';
  //     case 'Stopped': return 'text-gray-400';
  //     case 'Failed': return 'text-red-400';
  //     default: return 'text-white/60';
  //   }
  // };

  const getStatusDot = (state: string): string => {
    switch (state) {
      case 'Running': return 'bg-green-500';
      case 'Starting': return 'bg-yellow-500';
      case 'Stopped': return 'bg-gray-500';
      case 'Failed': return 'bg-red-500';
      default: return 'bg-white/20';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="w-4 h-4 text-yellow-400" />;
      case 'admin': return <Shield className="w-4 h-4 text-blue-400" />;
      default: return <User className="w-4 h-4 text-gray-400" />;
    }
  };

  // Combine regular processes with shared processes for consistent display
  const allProcesses = [
    ...(Array.isArray(processes) ? processes : []),
    ...(Array.isArray(sharedProcesses) ? sharedProcesses.map(convertSharedProcessToProcessInfo) : [])
  ];

  // Safe array operations with proper checks
  const runningProcessCount = allProcesses.filter(p => p?.status?.state === 'Running').length;
  const totalProcessCount = allProcesses.length;
  const sharedProcessCount = Array.isArray(sharedProcesses) ? sharedProcesses.length : 0;
  const channelsCount = Array.isArray(channels) ? channels.length : 0;
  const onlineMembersCount = Array.isArray(members) ? members.filter(m => m?.is_online === true).length : 0;
  const totalMembersCount = Array.isArray(members) ? members.length : 0;
  const containersCount = Array.isArray(containers) ? containers.length : 0;
  const runningContainersCount = Array.isArray(containers) ? containers.filter(c => c.status.toLowerCase() === 'running').length : 0;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0B0D10]">
        <div className="flex items-center gap-2 text-white/60">
          <div className="w-4 h-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          <span>Loading grid management...</span>
        </div>
      </div>
    );
  }

  if (!gridDetails) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0B0D10]">
        <div className="text-center text-white/60">
          <Settings className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>Failed to load grid details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0B0D10] h-full">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/10 bg-[#111319]">
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF8A00] to-[#FF3D00] flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{gridDetails.name}</h1>
              <p className="text-white/60">
                {gridDetails.member_count} {gridDetails.member_count === 1 ? 'member' : 'members'} • 
                {gridDetails.is_public ? ' Public' : ' Private'} Grid
              </p>
            </div>
          </div>
          
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-white/60 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-t border-white/10">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'members', label: 'Members', icon: Users },
            { id: 'resources', label: 'Resources', icon: Terminal },
            { id: 'relay', label: 'Relay & Bandwidth', icon: Wifi },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#FF8A00] text-white bg-white/5'
                  : 'border-transparent text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && (
          <div className="p-6 space-y-6">
            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Invite Code */}
              <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Grid Invite</h3>
                    <p className="text-sm text-white/60">Share access to this grid</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                    <code className="flex-1 font-mono text-sm text-white">{gridDetails.invite_code || 'Loading...'}</code>
                    <button
                      onClick={copyInviteCode}
                      className={`rounded-lg p-2 transition-colors ${
                        inviteCodeCopied 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'hover:bg-white/10 text-white/60'
                      }`}
                    >
                      {inviteCodeCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Grid Stats */}
              <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Activity</h3>
                    <p className="text-sm text-white/60">Current grid activity</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-white/60">Active Processes</span>
                    <span className="text-white font-medium">{runningProcessCount}/{totalProcessCount}</span>
                  </div>
                  {sharedProcessCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-white/60">Shared Processes</span>
                      <span className="text-white font-medium">{sharedProcessCount}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-white/60">Channels</span>
                    <span className="text-white font-medium">{channelsCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Containers</span>
                    <span className="text-white font-medium">{runningContainersCount}/{containersCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Online Members</span>
                    <span className="text-white font-medium">{onlineMembersCount}/{totalMembersCount}</span>
                  </div>
                </div>
              </div>

              {/* Quick Settings */}
              <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <Settings className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Quick Settings</h3>
                    <p className="text-sm text-white/60">Manage grid preferences</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/80">Public Grid</span>
                    <div className={`w-10 h-6 rounded-full flex items-center transition-colors ${
                      gridDetails.is_public ? 'bg-green-500' : 'bg-white/20'
                    }`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        gridDetails.is_public ? 'translate-x-5' : 'translate-x-1'
                      }`} />
                    </div>
                  </div>

                  <button
                    onClick={() => setShowPermissions(true)}
                    className="w-full rounded-lg border border-white/10 px-3 py-2 text-sm hover:border-white/20 hover:bg-white/5"
                  >
                    Manage Permissions
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
              <h3 className="font-semibold text-white mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {allProcesses.slice(0, 3).map(process => (
                  <div key={process.process_id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
                    {isSharedProcess(process) ? (
                      <div className="w-4 h-4 text-orange-400 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                      </div>
                    ) : (
                      <Terminal className="w-4 h-4 text-white/60" />
                    )}
                    <div className="flex-1">
                      <span className="text-sm text-white">
                        {getProcessDisplayName(process)} {isSharedProcess(process) ? 'shared' : 'started'}
                      </span>
                      <div className="text-xs text-white/40">
                        {new Date(process.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${getStatusDot(process.status.state)}`} />
                  </div>
                ))}
                
                {allProcesses.length === 0 && (
                  <div className="text-center py-8 text-white/40">
                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No recent activity</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'members' && (
          <div className="p-6">
            {showPermissions ? (
              <PermissionManager
                gridId={gridId}
                members={members}
                currentUserPermissions={{
                  can_invite: true,
                  can_kick: gridDetails.user_role === 'owner' || gridDetails.user_role === 'admin',
                  can_ban: gridDetails.user_role === 'owner',
                  can_manage_roles: gridDetails.user_role === 'owner' || gridDetails.user_role === 'admin',
                  can_create_process: true,
                  can_view_all_processes: true,
                  can_connect_to_processes: true,
                  can_manage_own_processes: true,
                  can_manage_all_processes: gridDetails.user_role === 'owner' || gridDetails.user_role === 'admin',
                  can_view_logs: true,
                  can_send_commands: true,
                  can_modify_settings: gridDetails.user_role === 'owner' || gridDetails.user_role === 'admin',
                  can_delete_grid: gridDetails.user_role === 'owner',
                  can_view_invite_code: true,
                  can_view_audit_log: gridDetails.user_role === 'owner' || gridDetails.user_role === 'admin',
                  max_processes: 10,
                }}
                onUpdate={loadGridData}
              />
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white">Grid Members</h2>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowPermissions(true)}
                      className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:border-white/20"
                    >
                      Manage Permissions
                    </button>
                  </div>
                </div>

                <div className="grid gap-4">
                  {Array.isArray(members) && members.map(member => (
                    <div key={member.user_id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF8A00] to-[#FF3D00] flex items-center justify-center">
                            <span className="text-sm font-medium text-white">
                              {(member.display_name || member.username || 'U')[0].toUpperCase()}
                            </span>
                          </div>
                          <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#111319] ${
                            member.is_online ? 'bg-green-500' : 'bg-gray-500'
                          }`} />
                        </div>
                        
                        <div className="flex-1">
                          <div className="font-medium text-white">
                            {member.display_name || member.username || 'Unknown User'}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-white/60">
                            <div className="flex items-center gap-1">
                              {getRoleIcon(member.role)}
                              <span className="capitalize">{member.role}</span>
                            </div>
                            <span>•</span>
                            <span>Joined {new Date(member.joined_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <div className={`px-2 py-1 rounded text-xs font-medium ${
                            member.is_online 
                              ? 'bg-green-500/20 text-green-400' 
                              : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {member.is_online ? 'Online' : 'Offline'}
                          </div>
                          
                          {canChangeRole(member) && (
                            <button
                              onClick={() => {
                                if (member && member.role) {
                                  setRoleChangeModal({ isOpen: true, member });
                                }
                              }}
                              className="rounded-lg border border-white/10 px-3 py-1 text-xs hover:border-white/20 hover:bg-white/5"
                            >
                              Change Role
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'resources' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Grid Resources</h2>
              <button className="rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                <Plus className="w-4 h-4 mr-2" />
                Add Resource
              </button>
            </div>

            {/* Processes */}
            <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Terminal className="w-5 h-5" />
                All Processes ({totalProcessCount})
                {sharedProcessCount > 0 && (
                  <span className="text-sm text-orange-400 font-normal">
                    • {sharedProcessCount} shared
                  </span>
                )}
              </h3>
              
              <div className="space-y-3">
                {allProcesses.map(process => (
                  <div key={process.process_id} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${getStatusDot(process.status.state)}`} />
                      {isSharedProcess(process) ? (
                        <Radio className="w-4 h-4 text-orange-400" />
                      ) : (
                        <Terminal className="w-4 h-4 text-blue-400" />
                      )}
                      <div>
                        <div className="font-medium text-white flex items-center gap-2">
                          {getProcessDisplayName(process)}
                          {isSharedProcess(process) && (
                            <span className="text-xs px-2 py-1 rounded-full bg-orange-500/20 text-orange-300">
                              Shared
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-white/60">
                          {process.status.state} • PID: {process.status.pid || 'N/A'}
                          {isSharedProcess(process) && process.config.env_vars?.SHARED_PROCESS_DESCRIPTION && (
                            <>
                              <br />
                              <span className="text-xs text-white/40">
                                {process.config.env_vars.SHARED_PROCESS_DESCRIPTION}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {canDeleteProcess(process) && (
                        <button
                          onClick={() => {
                            // Check if this process is actually a container by looking for container environment variables
                            const isContainer = process.config?.env_vars?.RG9_CONTAINER_ID !== undefined ||
                                              process.config?.executable_path === 'internal_container';
                            
                            setDeleteModal({
                              isOpen: true,
                              type: isContainer ? 'container' : 'process',
                              id: process.process_id,
                              name: getProcessDisplayName(process)
                            });
                          }}
                          className="rounded-lg p-2 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          title={isSharedProcess(process) ? "Remove Access to Shared Process" : "Delete Process"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                
                {allProcesses.length === 0 && (
                  <div className="text-center py-8 text-white/40">
                    <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No active processes</p>
                  </div>
                )}
              </div>
            </div>

            {/* Channels */}
            <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Hash className="w-5 h-5" />
                Channels ({channelsCount})
              </h3>
              
              <div className="space-y-3">
                {Array.isArray(channels) && channels.map(channel => (
                  <div key={channel.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <div>
                        <div className="font-medium text-white">{channel.name}</div>
                        <div className="text-sm text-white/60">
                          {channel.channel_type} • {channel.member_count} members
                          {channel.is_private && <span className="ml-1 text-yellow-400">• Private</span>}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {canDeleteChannel(channel) && (
                        <button
                          onClick={() => setDeleteModal({
                            isOpen: true,
                            type: 'channel',
                            id: channel.id,
                            name: channel.name
                          })}
                          className="rounded-lg p-2 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          title="Delete Channel"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                
                {(!Array.isArray(channels) || channels.length === 0) && (
                  <div className="text-center py-8 text-white/40">
                    <Hash className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No channels created</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'relay' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Relay & Bandwidth Management</h2>
            </div>

            {/* Coming Soon Message */}
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                  <Wifi className="w-6 h-6 text-yellow-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-yellow-300 mb-2 text-lg">Coming Soon</h3>
                  <p className="text-sm text-yellow-200/80 mb-4">
                    Relay servers and bandwidth management features are currently under development.
                    All connections currently use direct peer-to-peer networking.
                  </p>
                  <div className="space-y-2 text-sm text-yellow-200/70">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                      <span>Relay server fallback for restricted networks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                      <span>Bandwidth usage tracking and quotas</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                      <span>Connection strategy customization</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                      <span>Bandwidth purchase and management</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Preview sections (disabled) */}
            <div className="rounded-xl border border-white/10 bg-[#111319] p-6 opacity-50">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Wifi className="w-5 h-5" />
                Bandwidth Usage (Preview)
              </h3>
              <div className="bg-white/5 rounded-lg p-6 text-center text-white/40">
                <p className="text-sm">Feature coming soon</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#111319] p-6 opacity-50">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Radio className="w-5 h-5" />
                Connection Strategy (Preview)
              </h3>
              <div className="bg-white/5 rounded-lg p-6 text-center text-white/40">
                <p className="text-sm">Feature coming soon</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-6 space-y-6">
            <h2 className="text-xl font-semibold text-white">Grid Settings</h2>
            
            <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
              <h3 className="font-semibold text-white mb-4">Basic Information</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Grid Name</label>
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 focus:border-[#FF8A00]/50 focus:outline-none transition-colors"
                    placeholder="Enter grid name"
                    maxLength={50}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Description</label>
                  <textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 focus:border-[#FF8A00]/50 focus:outline-none transition-colors"
                    rows={3}
                    placeholder="Enter grid description (optional)"
                    maxLength={200}
                  />
                </div>

                {/* Save button */}
                {(editedName !== gridDetails.name || editedDescription !== (gridDetails.description || '')) && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveGridInfo}
                      disabled={isSavingGridInfo || !editedName.trim()}
                      className="rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                    >
                      {isSavingGridInfo ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      onClick={() => {
                        setEditedName(gridDetails.name);
                        setEditedDescription(gridDetails.description || '');
                      }}
                      disabled={isSavingGridInfo}
                      className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Grid Type</label>
                    <input
                      type="text"
                      value={gridDetails.grid_type || 'Standard'}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
                      readOnly
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Max Members</label>
                    <input
                      type="number"
                      value={gridDetails.max_members}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
                      readOnly
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Role Management Section */}
            <div className="rounded-xl border border-white/10 bg-[#111319] p-6">
              <h3 className="font-semibold text-white mb-4">Role Management</h3>
              <p className="text-sm text-white/60 mb-4">
                Control member roles and permissions within your grid.
              </p>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <div className="flex items-center gap-3">
                    <Crown className="w-5 h-5 text-yellow-400" />
                    <div>
                      <div className="font-medium text-white">Owner</div>
                      <div className="text-sm text-white/60">Full control including grid deletion</div>
                    </div>
                  </div>
                  <div className="text-sm text-white/60">
                    {members.filter(m => m && m.role === 'owner').length} member{members.filter(m => m && m.role === 'owner').length !== 1 ? 's' : ''}
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-blue-400" />
                    <div>
                      <div className="font-medium text-white">Admin</div>
                      <div className="text-sm text-white/60">Manage members, channels, and processes</div>
                    </div>
                  </div>
                  <div className="text-sm text-white/60">
                    {members.filter(m => m && m.role === 'admin').length} member{members.filter(m => m && m.role === 'admin').length !== 1 ? 's' : ''}
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-white">Member</div>
                      <div className="text-sm text-white/60">Basic grid access and participation</div>
                    </div>
                  </div>
                  <div className="text-sm text-white/60">
                    {members.filter(m => m && m.role === 'member').length} member{members.filter(m => m && m.role === 'member').length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {(gridDetails.user_role === 'owner' || gridDetails.user_role === 'admin') && (
                <div className="mt-4">
                  <button
                    onClick={() => setActiveTab('members')}
                    className="rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Manage Member Roles
                  </button>
                </div>
              )}
            </div>
            
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6">
              <h3 className="font-semibold text-red-300 mb-4">Danger Zone</h3>
              <p className="text-sm text-red-200 mb-4">
                These actions cannot be undone. Please be certain before proceeding.
              </p>
              
              <div className="space-y-3">
                <button className="rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/30">
                  Leave Grid
                </button>
                
                {gridDetails.user_role === 'owner' && (
                  <button className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600">
                    Delete Grid
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, type: 'process', id: '', name: '' })}
        onConfirm={async () => {
          if (deleteModal.type === 'process') {
            await handleDeleteProcess(deleteModal.id);
          } else if (deleteModal.type === 'channel') {
            await handleDeleteChannel(deleteModal.id);
          } else if (deleteModal.type === 'container') {
            // Check if this is a container process (ID is a UUID) vs direct container (ID is container hash)
            if (deleteModal.id.length > 20 && deleteModal.id.includes('-')) {
              // This is a process ID (UUID format), use container process deletion
              await handleDeleteContainerProcess(deleteModal.id);
            } else {
              // This is a direct container ID, use regular container deletion
              await handleDeleteContainer(deleteModal.id);
            }
          }
          // Modal will close automatically after this completes
        }}
        onForceConfirm={async () => {
          if (deleteModal.type === 'container') {
            await handleForceDeleteContainer(deleteModal.id);
          }
          // Modal will close automatically after this completes
        }}
        title={`Delete ${deleteModal.type === 'container' ? 'Container' : deleteModal.type === 'process' ? 'Process' : 'Channel'}`}
        message={`Are you sure you want to delete this ${deleteModal.type}? This action cannot be undone.`}
        itemName={deleteModal.name}
        type={deleteModal.type}
        forceDelete={deleteModal.forceDelete}
        containerStatus={deleteModal.containerStatus}
      />

      {/* Role Change Modal */}
      <RoleChangeModal
        isOpen={roleChangeModal.isOpen}
        onClose={() => setRoleChangeModal({ isOpen: false, member: null })}
        member={roleChangeModal.member!}
        currentUserRole={gridDetails.user_role}
        onRoleChange={handleRoleChange}
      />
    </div>
  );
}