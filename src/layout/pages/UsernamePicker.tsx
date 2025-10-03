import { useState, useEffect, useCallback } from 'react';
import { useTauriCommands } from '../../hooks/useTauriCommands';

interface UsernamePickerProps {
  onUsernameSelected: (username: string | undefined) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

export default function UsernamePicker({ 
  onUsernameSelected, 
  disabled = false, 
  required = false,
  placeholder = "Choose a username (optional)"
}: UsernamePickerProps) {
  const [username, setUsername] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { checkUsernameAvailability } = useTauriCommands();

  // Debounced username availability check
  useEffect(() => {
    if (!username || username.length < 3) {
      setIsAvailable(null);
      setError(null);
      onUsernameSelected(undefined);
      return;
    }

    // Basic client-side validation
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      setError('Username can only contain letters, numbers, underscores, and dashes');
      setIsAvailable(false);
      onUsernameSelected(undefined);
      return;
    }

    if (username.startsWith('_') || username.startsWith('-') || username.endsWith('_') || username.endsWith('-')) {
      setError('Username cannot start or end with underscore or dash');
      setIsAvailable(false);
      onUsernameSelected(undefined);
      return;
    }

    const checkAvailability = async () => {
      setIsChecking(true);
      setError(null);

      try {
        const result = await checkUsernameAvailability(username);
        console.log('Username availability check result:', result);
        setIsAvailable(result.available);

        if (result.available) {
          onUsernameSelected(username);
        } else {
          setError(result.message || 'Username is not available');
          onUsernameSelected(undefined);
        }
      } catch (err) {
        console.error('Username availability check failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to check username availability');
        setIsAvailable(false);
        onUsernameSelected(undefined);
      } finally {
        setIsChecking(false);
      }
    };

    const timeoutId = setTimeout(checkAvailability, 500); // Debounce
    return () => clearTimeout(timeoutId);
  }, [username, checkUsernameAvailability, onUsernameSelected]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Enforce max length
    if (value.length <= 30) {
      setUsername(value);
    }
  }, []);

  const getStatusColor = () => {
    if (isChecking) return 'text-gray-400';
    if (error) return 'text-red-400';
    if (isAvailable === true) return 'text-green-400';
    if (isAvailable === false) return 'text-red-400';
    return 'text-gray-400';
  };

  const getStatusIcon = () => {
    if (isChecking) return '...';
    if (error) return '✗';
    if (isAvailable === true) return '✓';
    if (isAvailable === false) return '✗';
    return '';
  };

  const getHelperText = () => {
    if (isChecking) return 'Checking availability...';
    if (error) return error;
    if (isAvailable === true) return 'Username is available!';
    if (isAvailable === false) return 'Username is taken';
    if (username.length > 0 && username.length < 3) return 'Username must be at least 3 characters';
    return '3-30 characters, letters, numbers, underscores, dashes only';
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-300">
        Username {required && <span className="text-red-400">*</span>}
      </label>
      
      <div className="relative">
        <input
          type="text"
          value={username}
          onChange={handleChange}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full px-3 py-2 bg-[#111319] border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-orange-500/50 pr-8"
          minLength={3}
          maxLength={30}
        />
        
        {username.length > 0 && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <span className={getStatusColor()}>{getStatusIcon()}</span>
          </div>
        )}
      </div>
      
      <div className={`text-xs ${getStatusColor()}`}>
        {getHelperText()}
      </div>
    </div>
  );
}
