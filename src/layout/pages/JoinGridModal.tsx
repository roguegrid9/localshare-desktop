import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Check, Clipboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "../../components/ui/input-otp";

type JoinGridModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type Grid = {
  id: string;
  name: string;
  description?: string;
  creator_id: string;
  grid_type?: string;
  max_members: number;
  member_count: number;
  user_role: string;
  is_public: boolean;
  invite_code?: string;
  created_at: string;
  updated_at: string;
};

export default function JoinGridModal({ open, onClose, onSuccess }: JoinGridModalProps) {
  const [inviteCode, setInviteCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [joinedGrid, setJoinedGrid] = useState<Grid | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (inviteCode.length !== 6) {
      toast.error("Please enter a 6-character invite code");
      return;
    }

    try {
      setIsJoining(true);

      const grid = await invoke<Grid>("join_grid_by_code", {
        inviteCode: inviteCode.toUpperCase()
      });

      setJoinedGrid(grid);
      toast.success(`Successfully joined "${grid.name}"!`);
      onSuccess();

    } catch (error) {
      console.error("Failed to join grid:", error);
      let errorMessage = "Failed to join grid";

      if (typeof error === 'string') {
        if (error.includes("Invalid invite code")) {
          errorMessage = "Invalid invite code";
        } else if (error.includes("Grid is full")) {
          errorMessage = "Grid is full";
        } else if (error.includes("Already a member")) {
          errorMessage = "You're already a member of this grid";
        } else if (error.includes("Expired")) {
          errorMessage = "Invite code has expired";
        }
      }

      toast.error(errorMessage);
    } finally {
      setIsJoining(false);
    }
  };

  const handleClose = () => {
    if (!isJoining) {
      setJoinedGrid(null);
      setInviteCode("");
      onClose();
    }
  };

  const handleFinish = () => {
    handleClose();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const cleanText = text.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (cleanText.length === 6) {
        setInviteCode(cleanText);
        toast.success("Pasted from clipboard");
      } else {
        toast.error("Invalid code format. Expected 6 characters.");
      }
    } catch (error) {
      console.error("Failed to paste from clipboard:", error);
      toast.error("Failed to paste from clipboard");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {!joinedGrid ? (
          <>
            <DialogHeader>
              <DialogTitle>Join a Grid</DialogTitle>
              <DialogDescription>
                Enter a 6-character invite code to join a collaborative grid
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-4">
                  <InputOTP
                    maxLength={6}
                    value={inviteCode}
                    onChange={(value) => setInviteCode(value.toUpperCase())}
                    disabled={isJoining}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePaste}
                    disabled={isJoining}
                    className="gap-2"
                  >
                    <Clipboard className="h-4 w-4" />
                    Paste Code
                  </Button>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Get invite codes from grid owners or members
                </p>

                {/* P2P Info Message */}
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                  <p className="text-xs text-blue-200">
                    <strong>ℹ️ P2P Connection:</strong> Both you and other members must have RogueGrid9 installed for direct peer-to-peer connections to work.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isJoining}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isJoining || inviteCode.length !== 6}
                >
                  {isJoining ? "Joining..." : "Join Grid"}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
                  <Check className="h-5 w-5 text-green-500" />
                </div>
                Welcome to the Grid!
              </DialogTitle>
              <DialogDescription>
                You've successfully joined "{joinedGrid.name}"
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Grid Info */}
              <div className="rounded-lg border bg-muted p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Members:</span>
                  <span className="font-medium">
                    {joinedGrid.member_count}/{joinedGrid.max_members}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Your Role:</span>
                  <span className="font-medium capitalize">{joinedGrid.user_role}</span>
                </div>
                {joinedGrid.grid_type && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="font-medium capitalize">{joinedGrid.grid_type}</span>
                  </div>
                )}
              </div>

              {/* Info Box */}
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                <p className="text-sm text-blue-200">
                  <strong>Next Steps:</strong> The grid will appear in your sidebar.
                  Connect with members and start collaborating!
                </p>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleFinish}>
                  Go to My Grids
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
