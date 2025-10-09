import { useState, useEffect } from 'react';
import { X, User, Save, Download } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../../components/ui/Toaster';
import { getVersion } from '@tauri-apps/api/app';

interface UserSettingsProps {
  onClose: () => void;
}

interface UserInfo {
  user_id: string;
  username: string | null;
  display_name: string | null;
  email: string;
  account_type: string;
  created_at: string;
  updated_at: string;
}

export default function UserSettings({ onClose }: UserSettingsProps) {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [editedUsername, setEditedUsername] = useState('');
  const [editedDisplayName, setEditedDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const toast = useToast();

  useEffect(() => {
    loadUserInfo();
    loadVersion();
  }, []);

  const loadVersion = async () => {
    try {
      const version = await getVersion();
      setCurrentVersion(version);
    } catch (error) {
      console.error('Failed to get app version:', error);
    }
  };

  const loadUserInfo = async () => {
    try {
      const info = await invoke<UserInfo>('get_current_user');
      setUserInfo(info);
      setEditedUsername(info.username || '');
      setEditedDisplayName(info.display_name || '');
    } catch (error) {
      console.error('Failed to load user info:', error);
      toast(`Failed to load user info: ${error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveUsername = async () => {
    if (!userInfo) return;

    setIsSaving(true);
    try {
      await invoke('update_username', { username: editedUsername });
      toast('Username updated successfully', 'success');
      loadUserInfo(); // Reload user info
    } catch (error) {
      console.error('Failed to update username:', error);
      toast(`Failed to update username: ${error}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDisplayName = async () => {
    if (!userInfo) return;

    setIsSaving(true);
    try {
      await invoke('update_display_name', { displayName: editedDisplayName });
      toast('Display name updated successfully', 'success');
      loadUserInfo(); // Reload user info
    } catch (error) {
      console.error('Failed to update display name:', error);
      toast(`Failed to update display name: ${error}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true);
    try {
      const updateInfo = await invoke<{ version: string; current_version: string } | null>('check_for_updates');

      if (updateInfo) {
        toast(`Update available: v${updateInfo.version}`, 'success');
      } else {
        toast('You\'re up to date!', 'success');
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      toast(`Failed to check for updates: ${error}`, 'error');
    } finally {
      setCheckingUpdate(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-[#111319] rounded-xl border border-white/10 p-8">
          <div className="flex items-center gap-3 text-white">
            <div className="w-5 h-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
            <span>Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!userInfo) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-[#111319] rounded-xl border border-white/10 p-8">
          <p className="text-white">Failed to load user information</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[#111319] rounded-xl border border-white/10 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Settings</h2>
              <p className="text-sm text-white/60">Manage your account information</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Account Type Badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/60">Account Type:</span>
            <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium uppercase">
              {userInfo.account_type}
            </span>
          </div>

          {/* Username */}
          <div className="rounded-xl border border-white/10 bg-[#0B0D10] p-6">
            <h3 className="font-semibold text-white mb-4">Username</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={editedUsername}
                onChange={(e) => setEditedUsername(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 focus:border-[#FF8A00]/50 focus:outline-none transition-colors"
                placeholder="Enter username"
                maxLength={30}
              />
              {editedUsername !== (userInfo.username || '') && (
                <button
                  onClick={handleSaveUsername}
                  disabled={isSaving || !editedUsername.trim() || editedUsername.length < 3}
                  className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save Username'}
                </button>
              )}
              <p className="text-xs text-white/40">
                3-30 characters, letters, numbers, underscores, and dashes only
              </p>
            </div>
          </div>

          {/* Display Name */}
          <div className="rounded-xl border border-white/10 bg-[#0B0D10] p-6">
            <h3 className="font-semibold text-white mb-4">Display Name</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={editedDisplayName}
                onChange={(e) => setEditedDisplayName(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 focus:border-[#FF8A00]/50 focus:outline-none transition-colors"
                placeholder="Enter display name"
                maxLength={50}
              />
              {editedDisplayName !== (userInfo.display_name || '') && (
                <button
                  onClick={handleSaveDisplayName}
                  disabled={isSaving || !editedDisplayName.trim()}
                  className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save Display Name'}
                </button>
              )}
              <p className="text-xs text-white/40">
                This is how your name appears to other users
              </p>
            </div>
          </div>

          {/* Account Info */}
          <div className="rounded-xl border border-white/10 bg-[#0B0D10] p-6">
            <h3 className="font-semibold text-white mb-4">Account Information</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-white/60">User ID</span>
                <span className="text-white/80 font-mono text-xs">{userInfo.user_id.slice(0, 8)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Created</span>
                <span className="text-white/80">{new Date(userInfo.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Last Updated</span>
                <span className="text-white/80">{new Date(userInfo.updated_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* App Info */}
          <div className="rounded-xl border border-white/10 bg-[#0B0D10] p-6">
            <h3 className="font-semibold text-white mb-4">Application</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Version</span>
                <span className="text-white/80 font-mono">{currentVersion || 'Loading...'}</span>
              </div>
              <button
                onClick={handleCheckForUpdates}
                disabled={checkingUpdate}
                className="flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center"
              >
                <Download className="w-4 h-4" />
                {checkingUpdate ? 'Checking...' : 'Check for Updates'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-white/60 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
