import { useState, useCallback } from 'react';
import { useTauriCommands } from '../hooks/useTauriCommands';
import UsernamePicker from '../layout/pages/UsernamePicker';

interface UsernameSettingsProps {
  currentUsername?: string | null;
  onUsernameUpdated?: (newUsername: string) => void;
}

export default function UsernameSettings({ 
  currentUsername, 
  onUsernameUpdated 
}: UsernameSettingsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState<string | undefined>();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { updateUsername } = useTauriCommands();

  const handleSave = useCallback(async () => {
    if (!selectedUsername) return;

    setIsUpdating(true);
    setError(null);
    setSuccess(false);

    try {
      await updateUsername(selectedUsername);
      onUsernameUpdated?.(selectedUsername);
      setIsEditing(false);
      setSuccess(true);
      
      // Hide success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update username');
    } finally {
      setIsUpdating(false);
    }
  }, [selectedUsername, updateUsername, onUsernameUpdated]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setSelectedUsername(undefined);
    setError(null);
  }, []);

  if (!isEditing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Username
            </label>
            <div className="text-white">
              {currentUsername ? `@${currentUsername}` : 'No username set'}
            </div>
            {!currentUsername && (
              <div className="text-xs text-gray-400 mt-1">
                Set a username to make it easier for others to find you
              </div>
            )}
          </div>
          
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1 bg-[#111319] border border-white/10 text-gray-300 rounded-lg hover:bg-white/5 text-sm"
          >
            {currentUsername ? 'Change' : 'Set Username'}
          </button>
        </div>

        {success && (
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-300 text-sm">
            Username updated successfully!
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          {currentUsername ? 'Change Username' : 'Set Username'}
        </label>
        
        <UsernamePicker
          onUsernameSelected={setSelectedUsername}
          disabled={isUpdating}
          placeholder={currentUsername || 'Enter your username'}
        />
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleCancel}
          disabled={isUpdating}
          className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-xl disabled:opacity-50"
        >
          Cancel
        </button>
        
        <button
          onClick={handleSave}
          disabled={isUpdating || !selectedUsername}
          className="flex-1 px-4 py-2 bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] text-white rounded-xl disabled:opacity-50"
        >
          {isUpdating ? 'Saving...' : 'Save Username'}
        </button>
      </div>
    </div>
  );
}
