// Enhanced CreateGridModal.tsx with simplified flow
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "../../components/ui/Toaster";
import ShareButton from "../../components/codes/ShareButton";
import { ResourceType } from "../../types/codes";

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

type WizardStep = 1 | 2;

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function CreateGridModal({ open, onClose, onSuccess }: CreateGridModalProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    grid_type: "",
    max_members: 10,
    is_public: false,
  });
  const [isCreating, setIsCreating] = useState(false);
  const [createdGrid, setCreatedGrid] = useState<CreateGridResponse | null>(null);
  const toast = useToast();

  const stepTitles = {
    1: "Grid Settings",
    2: "Complete"
  };

  const handleCreateGrid = () => {
    if (!formData.name.trim()) {
      toast("Grid name is required", "error");
      return;
    }
    createGrid();
  };

  const createGrid = async () => {
    try {
      setIsCreating(true);
      
      const request: CreateGridRequest = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        grid_type: formData.grid_type || undefined,
        max_members: formData.max_members,
        is_public: formData.is_public,
      };

      console.log("Creating grid with request:", request);

      const response = await invoke<CreateGridResponse>("create_grid", { request });

      console.log("Grid created successfully:", response);
      setCreatedGrid(response);
      setCurrentStep(2);
      
    } catch (error) {
      console.error("Failed to create grid:", error);
      toast(`Failed to create grid: ${error}`, "error");
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      // Reset everything when closing
      setCurrentStep(1);
      setCreatedGrid(null);
      setFormData({
        name: "",
        description: "",
        grid_type: "",
        max_members: 10,
        is_public: false,
      });
      onClose();
    }
  };

  const handleFinish = () => {
    // This will trigger the grid to be added to the sidebar and selected
    onSuccess(createdGrid?.grid.id);
    handleClose();
  };

  const copyInviteCode = async (inviteCode: string) => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      toast("Invite code copied to clipboard!", "success");
    } catch (error) {
      console.error("Failed to copy invite code:", error);
      toast("Failed to copy invite code", "error");
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
          {/* Header with Progress */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">Create New Grid</h2>
              <p className="text-sm text-white/60">{stepTitles[currentStep]}</p>
            </div>
            <button
              onClick={handleClose}
              disabled={isCreating}
              className="rounded-lg p-1 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              {[1, 2].map((step) => (
                <div
                  key={step}
                  className={cx(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                    step <= currentStep
                      ? "bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] text-white"
                      : "bg-white/10 text-white/40"
                  )}
                >
                  {step}
                </div>
              ))}
            </div>
            <div className="w-full bg-white/10 rounded-full h-1">
              <div
                className="bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] h-1 rounded-full transition-all duration-300"
                style={{ width: `${(currentStep / 2) * 100}%` }}
              />
            </div>
          </div>

          {/* Step Content */}
          <div className="space-y-4 mb-6">
            {currentStep === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium mb-4">Basic Information</h3>
                
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Grid Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Dev Team, Gaming Squad, Study Group"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 focus:border-white/20 focus:outline-none"
                    maxLength={50}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="What's this grid for? (optional)"
                    rows={3}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 focus:border-white/20 focus:outline-none resize-none"
                    maxLength={200}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Grid Type</label>
                  <select
                    value={formData.grid_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, grid_type: e.target.value }))}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/20 focus:outline-none"
                  >
                    <option value="">General</option>
                    <option value="development">Development</option>
                    <option value="gaming">Gaming</option>
                    <option value="study">Study Group</option>
                    <option value="work">Work Team</option>
                    <option value="creative">Creative Project</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Maximum Members</label>
                  <select
                    value={formData.max_members}
                    onChange={(e) => setFormData(prev => ({ ...prev, max_members: parseInt(e.target.value) }))}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/20 focus:outline-none"
                  >
                    <option value={5}>5 members</option>
                    <option value={10}>10 members</option>
                    <option value={20}>20 members</option>
                    <option value={50}>50 members</option>
                    <option value={100}>100 members</option>
                  </select>
                </div>
              </div>
            )}

            {/* Step 2: Success */}
            {currentStep === 2 && createdGrid && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium mb-2">Grid Created Successfully!</h3>
                  <p className="text-white/60">{createdGrid.grid.name}</p>
                </div>

                {/* Basic Invite Code */}
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="text-center mb-3">
                    <h4 className="font-medium mb-1">Invite Code</h4>
                    <p className="text-sm text-white/60">Share this code with others to join your grid</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-center text-lg tracking-wider">
                      {createdGrid.invite_code || createdGrid.grid.invite_code}
                    </div>
                    <button
                      onClick={() => copyInviteCode(createdGrid.invite_code || createdGrid.grid.invite_code || "")}
                      className="rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                {/* Next Steps */}
                <div className="space-y-3">
                  <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3">
                    <p className="text-sm text-green-200">
                      <strong>Ready to go!</strong> Your grid will appear in the sidebar and you can start adding processes and channels.
                    </p>
                  </div>

                  <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-3">
                    <p className="text-sm text-orange-200 mb-2">
                      <strong>💡 Want to share your grid?</strong>
                    </p>
                    <p className="text-xs text-orange-200/80">
                      After adding processes and channels, you can create a public share from the Grid Management page. Grid sharing creates a landing page where others can access your shared resources via a custom subdomain!
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Navigation Buttons */}
          <div className="flex gap-3">
            {currentStep === 1 ? (
              <button
                onClick={handleCreateGrid}
                disabled={isCreating || !formData.name.trim()}
                className="w-full rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {isCreating ? "Creating..." : "Create Grid"}
              </button>
            ) : (
              <button
                onClick={handleFinish}
                className="w-full rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Open Grid
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}