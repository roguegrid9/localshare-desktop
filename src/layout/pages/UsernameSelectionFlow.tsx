import { useState, useCallback } from 'react';
import { useTauriCommands } from '../../hooks/useTauriCommands';
import UsernamePicker from './UsernamePicker';

interface UserState {
  is_authenticated: boolean;
  is_provisional: boolean;
  user_id: string | null;
  display_name: string | null;
  username: string | null;
  developer_handle: string | null;
  connection_status: 'connected' | 'disconnected' | 'unhealthy';
  token_expires_at: number | null;
  account_type: string | null;
}

interface UsernameSelectionFlowProps {
  userState: UserState;
  onComplete: (updatedUserState: UserState) => void;
  onSkip?: () => void; // Optional skip for guest accounts
}

export default function UsernameSelectionFlow({
  userState,
  onComplete,
  onSkip
}: UsernameSelectionFlowProps) {
  const [selectedUsername, setSelectedUsername] = useState<string | undefined>();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { updateUsername, getUserState } = useTauriCommands();

  const handleSaveUsername = useCallback(async () => {
    if (!selectedUsername) return;

    setIsUpdating(true);
    setError(null);

    try {
      // Update username on server and in local storage
      await updateUsername(selectedUsername);
      
      // Get updated user state
      const updatedState = await getUserState();
      
      // Complete the flow with updated state
      onComplete(updatedState);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set username');
    } finally {
      setIsUpdating(false);
    }
  }, [selectedUsername, updateUsername, getUserState, onComplete]);

  const handleSkip = useCallback(() => {
    if (onSkip) {
      onSkip();
    } else {
      // If no skip handler provided, complete with current state
      onComplete(userState);
    }
  }, [onSkip, onComplete, userState]);

  const canSkip = userState.account_type !== 'authenticated'; // Only allow skipping for non-authenticated users

  return (
    <div className="min-h-screen bg-[#0a0b14] flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">
            Choose Your Username
          </h1>
          <p className="text-gray-400">
            {userState.account_type === 'authenticated' 
              ? "Set a username to make it easier for others to find you in grids"
              : "Optionally set a username to personalize your experience"
            }
          </p>
        </div>

        {/* Username Selection */}
        <div className="bg-[#111319] rounded-2xl border border-white/10 p-6">
          <div className="space-y-6">
            {/* User Info */}
            <div className="flex items-center space-x-3 p-3 bg-[#1a1d29] rounded-xl">
              <div className="w-10 h-10 bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] rounded-full flex items-center justify-center text-white font-semibold">
                {userState.display_name?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <div className="text-white font-medium">
                  {userState.display_name || 'Unknown User'}
                </div>
                <div className="text-xs text-gray-400 capitalize">
                  {userState.account_type} Account
                </div>
              </div>
            </div>

            {/* Username Input */}
            <UsernamePicker
              onUsernameSelected={setSelectedUsername}
              disabled={isUpdating}
              required={userState.account_type === 'authenticated'}
              placeholder="Enter your username"
            />

            {/* Error Display */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              {canSkip && (
                <button
                  onClick={handleSkip}
                  disabled={isUpdating}
                  className="flex-1 px-4 py-3 bg-[#1a1d29] hover:bg-[#1f2336] text-gray-300 rounded-xl disabled:opacity-50 transition-colors"
                >
                  Skip for Now
                </button>
              )}
              
              <button
                onClick={handleSaveUsername}
                disabled={isUpdating || !selectedUsername}
                className={`${canSkip ? 'flex-1' : 'w-full'} px-4 py-3 bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] text-white rounded-xl disabled:opacity-50 transition-all`}
              >
                {isUpdating ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Setting Username...</span>
                  </div>
                ) : (
                  'Continue'
                )}
              </button>
            </div>

            {/* Help Text */}
            <div className="text-xs text-gray-500 text-center">
              {userState.account_type === 'authenticated' 
                ? "You can change your username later in settings"
                : "You can set or change your username anytime in settings"
              }
            </div>
          </div>
        </div>

        {/* Connection Status */}
        <div className="text-center">
          <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs ${
            userState.connection_status === 'connected' 
              ? 'bg-green-500/20 text-green-400' 
              : 'bg-yellow-500/20 text-yellow-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              userState.connection_status === 'connected' 
                ? 'bg-green-400' 
                : 'bg-yellow-400'
            }`}></div>
            <span className="capitalize">{userState.connection_status}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
