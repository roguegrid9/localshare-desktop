import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

type CreateGridModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: (gridId?: string) => void;
};

type CreateGridRequest = {
  name: string;
  description?: string;
  grid_type?: string;
  max_members?: number;
  is_public?: boolean;
};

type CreateGridResponse = {
  grid: {
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
  invite_code?: string;
};

export default function CreateGridModal({ open, onClose, onSuccess }: CreateGridModalProps) {
  const [gridName, setGridName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createdGrid, setCreatedGrid] = useState<CreateGridResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreateGrid = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!gridName.trim()) {
      toast.error("Grid name is required");
      return;
    }

    try {
      setIsCreating(true);

      const request: CreateGridRequest = {
        name: gridName.trim(),
      };

      const response = await invoke<CreateGridResponse>("create_grid", { request });
      setCreatedGrid(response);

    } catch (error) {
      console.error("Failed to create grid:", error);
      toast.error(`Failed to create grid: ${error}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setGridName("");
      setCreatedGrid(null);
      setCopied(false);
      onClose();
    }
  };

  const handleFinish = () => {
    onSuccess(createdGrid?.grid.id);
    handleClose();
  };

  const copyInviteCode = async () => {
    const inviteCode = createdGrid?.invite_code || createdGrid?.grid.invite_code;
    if (!inviteCode) return;

    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      toast.success("Invite code copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy invite code:", error);
      toast.error("Failed to copy invite code");
    }
  };

  const inviteCode = createdGrid?.invite_code || createdGrid?.grid.invite_code;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {!createdGrid ? (
          <>
            <DialogHeader>
              <DialogTitle>Create New Grid</DialogTitle>
              <DialogDescription>
                Create a collaborative workspace for your team
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateGrid} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="grid-name">
                  Grid Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="grid-name"
                  value={gridName}
                  onChange={(e) => setGridName(e.target.value)}
                  placeholder="e.g., Dev Team, Gaming Squad, Study Group"
                  maxLength={50}
                  disabled={isCreating}
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isCreating || !gridName.trim()}
                >
                  {isCreating ? "Creating..." : "Create Grid"}
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
                Grid Created Successfully!
              </DialogTitle>
              <DialogDescription>
                {createdGrid.grid.name}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Invite Code Display */}
              <div className="space-y-2">
                <Label>Invite Code</Label>
                <p className="text-sm text-muted-foreground">
                  Share this code with others to join your grid
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-md border bg-muted px-4 py-3 font-mono text-2xl font-semibold tracking-wider text-center">
                    {inviteCode}
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={copyInviteCode}
                    className="h-12 w-12"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Info Box */}
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                <p className="text-sm text-blue-200">
                  <strong>Ready to go!</strong> Your grid will appear in the sidebar.
                  You can start adding processes and channels.
                </p>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleFinish}>
                  Open Grid
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
