import { useState, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTauriCommands } from '../../hooks/useTauriCommands';
import UsernamePicker from './UsernamePicker';
import { Spinner } from '../../components/ui/spinner';

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

const layout = {
  root:
    "relative min-h-screen bg-bg-primary text-text-primary flex items-center justify-center overflow-hidden px-6 py-12",
  backdrop: "absolute inset-0 pointer-events-none",
  orbPrimary:
    "absolute -top-40 -left-24 h-[32rem] w-[32rem] rounded-full opacity-35 blur-3xl",
  orbSecondary:
    "absolute -bottom-56 right-[-14rem] h-[32rem] w-[32rem] rounded-full opacity-35 blur-[140px]",
  gradient:
    "absolute inset-0 bg-[linear-gradient(135deg,rgba(10,11,20,0.9)_0%,rgba(7,8,14,0.96)_50%,rgba(5,5,7,0.98)_100%)]",
  card:
    "relative z-10 glass-panel border-border/70 shadow-glow w-full max-w-xl rounded-[28px] overflow-hidden",
  badge:
    "inline-flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-text-secondary",
  avatar:
    "w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-gradient-start to-accent-gradient-end text-white text-lg font-heading grid place-items-center shadow-glow border border-border/70",
  infoCard:
    "flex items-center gap-3 rounded-2xl border border-border/70 bg-bg-muted px-4 py-3",
  statusChip:
    "inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs tracking-[0.28em]",
  errorBanner:
    "rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error",
};

const Backdrop = () => (
  <div className={layout.backdrop} aria-hidden>
    <div
      className={layout.orbPrimary}
      style={{
        background:
          "radial-gradient(circle at 25% 25%, rgba(58,175,255,0.45), transparent 70%)",
      }}
    />
    <div
      className={layout.orbSecondary}
      style={{
        background:
          "radial-gradient(circle at 75% 75%, rgba(123,92,255,0.45), transparent 75%)",
      }}
    />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(90,184,255,0.18),transparent_55%)] opacity-80" />
    <div className={layout.gradient} />
  </div>
);

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
    <div className={layout.root}>
      <Backdrop />

      <Card className={layout.card}>
        <CardHeader className="space-y-3 text-center">
          <CardTitle className="text-2xl">Choose your username</CardTitle>
          <CardDescription className="text-sm text-text-secondary">
            {userState.account_type === "authenticated"
              ? "Claim your handle so teammates can find you across grids."
              : "Set an optional handle to personalize your LocalShare presence."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className={layout.infoCard}>
            <div className={layout.avatar}>
              {userState.display_name?.[0]?.toUpperCase() || "?"}
            </div>
            <div>
              <p className="font-heading text-sm text-text-primary">
                {userState.display_name || "Unknown user"}
              </p>
              <p className="text-xs text-text-secondary capitalize">
                {userState.account_type} account
              </p>
            </div>
          </div>

          {error && <div className={layout.errorBanner}>{error}</div>}

          <UsernamePicker
            onUsernameSelected={setSelectedUsername}
            disabled={isUpdating}
            required={userState.account_type === "authenticated"}
            placeholder="Enter your username"
          />

          <div className="flex flex-col gap-3 sm:flex-row">
            {canSkip && (
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={isUpdating}
                onClick={handleSkip}
              >
                Skip for now
              </Button>
            )}

            <Button
              type="button"
              variant="gradient"
              className={canSkip ? "flex-1" : "w-full"}
              disabled={isUpdating || !selectedUsername}
              onClick={handleSaveUsername}
            >
              {isUpdating ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="h-4 w-4" />
                  Setting username…
                </span>
              ) : (
                "Continue"
              )}
            </Button>
          </div>

          <p className="text-xs text-text-tertiary text-center">
            {userState.account_type === "authenticated"
              ? "You can update this anytime from settings."
              : "You can set or edit your username later from settings."}
          </p>
        </CardContent>
      </Card>

      <div className="relative z-10 mt-6 text-center">
        <div
          className={`${layout.statusChip} ${
            userState.connection_status === "connected"
              ? "border-success/50 text-success"
              : "border-warning/50 text-warning"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              userState.connection_status === "connected"
                ? "bg-success"
                : "bg-warning"
            }`}
          />
          <span className="capitalize">{userState.connection_status}</span>
        </div>
      </div>
    </div>
  );
}
