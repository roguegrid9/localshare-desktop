import { useState, useEffect, useCallback } from 'react';
import { Check, X, Loader2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    if (isChecking) return 'text-text-secondary';
    if (error && error.includes('Could not verify')) return 'text-warning';
    if (error) return 'text-red-400';
    if (isAvailable === true) return 'text-green-500';
    if (isAvailable === false) return 'text-red-400';
    return 'text-text-tertiary';
  };

  const getStatusIcon = () => {
    if (isChecking) return <Loader2 className="h-4 w-4 animate-spin" />;
    if (error && error.includes('Could not verify')) return <AlertCircle className="h-4 w-4" />;
    if (error) return <X className="h-4 w-4" />;
    if (isAvailable === true) return <Check className="h-4 w-4" />;
    if (isAvailable === false) return <X className="h-4 w-4" />;
    return null;
  };

  const getHelperText = () => {
    if (isChecking) return 'Checking availability...';
    if (error && error.includes('Could not verify')) return error;
    if (error) return error;
    if (isAvailable === true) return 'Username is available!';
    if (isAvailable === false) return 'Username is taken';
    if (username.length > 0 && username.length < 3) return 'Username must be at least 3 characters';
    return '3-30 characters, letters, numbers, underscores, dashes only';
  };

  return (
    <div className="space-y-2">
      <Label className="text-text-secondary">
        Username {required && <span className="text-red-400">*</span>}
      </Label>

      <div className="relative">
        <Input
          type="text"
          value={username}
          onChange={handleChange}
          disabled={disabled}
          placeholder={placeholder}
          className="pr-10"
          minLength={3}
          maxLength={30}
        />

        {username.length > 0 && (
          <div className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${getStatusColor()}`}>
            {getStatusIcon()}
          </div>
        )}
      </div>

      <p className={`text-xs ${getStatusColor()} flex items-center gap-1.5`}>
        {getHelperText()}
      </p>
    </div>
  );
}
