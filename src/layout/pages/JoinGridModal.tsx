import 
 { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "../../components/ui/Toaster";

type JoinGridModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void; // Called when grid is successfully joined
};

// Based on your Rust backend, join_grid_by_code returns Grid directly
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
  const [step, setStep] = useState<'form' | 'success'>('form');
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inviteCode.trim()) {
      toast("Please enter an invite code", "error");
      return;
    }

    // Basic validation for invite code format (adjust based on your backend format)
    const cleanCode = inviteCode.trim().toUpperCase();
    if (cleanCode.length < 6) {
      toast("Invite code seems too short", "error");
      return;
    }

    try {
      setIsJoining(true);
      
      console.log("Joining grid with invite code:", cleanCode);
      
      const grid = await invoke<Grid>("join_grid_by_code", { 
        inviteCode: cleanCode 
      });
      
      console.log("Successfully joined grid:", grid);
      setJoinedGrid(grid);
      setStep('success');
      
      toast(`Successfully joined "${grid.name}"!`, "success");
      onSuccess(); // Refresh the grids list
      
    } catch (error) {
      console.error("Failed to join grid:", error);
      let errorMessage = "Failed to join grid";
      
      // Handle specific error cases
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
      
      toast(errorMessage, "error");
    } finally {
      setIsJoining(false);
    }
  };

  const handleClose = () => {
    if (!isJoining) {
      // Reset state when closing
      setStep('form');
      setJoinedGrid(null);
      setInviteCode("");
      onClose();
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const cleanText = text.trim().toUpperCase();
      setInviteCode(cleanText);
      toast("Pasted from clipboard", "success");
    } catch (error) {
      console.error("Failed to paste from clipboard:", error);
      toast("Failed to paste from clipboard", "error");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md mx-4">
        <div className="rounded-xl border border-white/10 bg-[#111319] p-6 shadow-2xl">
          {step === 'form' ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Join a Grid</h2>
                <button
                  onClick={handleClose}
                  disabled={isJoining}
                  className="rounded-lg p-1 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Instructions */}
              <div className="mb-6 p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-sm text-white/80 mb-2">Enter an invite code to join a collaborative grid:</p>
                <ul className="text-xs text-white/60 space-y-1">
                  <li>• Invite codes are usually 8-12 characters</li>
                  <li>• You can get invite codes from grid owners</li>
                  <li>• Codes may expire after some time</li>
                </ul>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Invite Code Input */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Invite Code <span className="text-red-400">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      placeholder="e.g., X7K9P2M1"
                      className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 focus:border-white/20 focus:outline-none font-mono text-center"
                      disabled={isJoining}
                      maxLength={20}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={handlePaste}
                      disabled={isJoining}
                      className="rounded-lg border border-white/10 px-3 py-2 hover:border-white/20 hover:bg-white/5 disabled:opacity-50"
                      title="Paste from clipboard"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-xs text-white/40 mt-1">
                    Codes are case-insensitive and will be automatically formatted
                  </p>
                </div>

                {/* Form Actions */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isJoining}
                    className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium hover:border-white/20 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isJoining || !inviteCode.trim()}
                    className="flex-1 rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {isJoining ? "Joining..." : "Join Grid"}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              {/* Success State */}
              <div className="text-center">
                {/* Success Icon */}
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                {/* Success Message */}
                <h2 className="text-xl font-semibold mb-2">Welcome to the Grid!</h2>
                <p className="text-white/60 mb-6">
                  You've successfully joined "{joinedGrid?.name}"
                </p>

                {/* Grid Info */}
                {joinedGrid && (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4 mb-6 text-left">
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-white/60">Grid Name:</span>
                        <span className="font-medium">{joinedGrid.name}</span>
                      </div>
                      {joinedGrid.description && (
                        <div className="flex justify-between">
                          <span className="text-white/60">Description:</span>
                          <span className="text-right max-w-[200px] truncate">{joinedGrid.description}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-white/60">Type:</span>
                        <span className="capitalize">{joinedGrid.grid_type || "General"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">Members:</span>
                        <span>{joinedGrid.member_count}/{joinedGrid.max_members}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">Your Role:</span>
                        <span className="text-blue-400 capitalize">{joinedGrid.user_role}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Next Steps */}
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 mb-6 text-left">
                  <h3 className="font-medium text-blue-300 mb-2">What's Next?</h3>
                  <ul className="text-xs text-blue-200/80 space-y-1">
                    <li>• Connect with other grid members</li>
                    <li>• Start P2P sessions when members are online</li>
                    <li>• Collaborate in real-time</li>
                  </ul>
                </div>

                {/* Actions */}
                <button
                  onClick={handleClose}
                  className="w-full rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Go to My Grids
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}