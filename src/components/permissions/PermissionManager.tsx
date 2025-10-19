// src/components/permissions/PermissionManager.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "../ui/sonner";

type GridMember = {
  user_id: string;
  username?: string;
  display_name?: string;
  role: string;
  joined_at: string;
  is_online: boolean;
};

type GridPermissions = {
  can_invite: boolean;
  can_kick: boolean;
  can_ban: boolean;
  can_manage_roles: boolean;
  can_create_process: boolean;
  can_view_all_processes: boolean;
  can_connect_to_processes: boolean;
  can_manage_own_processes: boolean;
  can_manage_all_processes: boolean;
  can_view_logs: boolean;
  can_send_commands: boolean;
  can_modify_settings: boolean;
  can_delete_grid: boolean;
  can_view_invite_code: boolean;
  can_view_audit_log: boolean;
  max_processes: number;
};

type UpdateMemberPermissionsRequest = {
  can_invite?: boolean;
  can_kick?: boolean;
  can_create_process?: boolean;
  can_view_all_processes?: boolean;
  can_connect_to_processes?: boolean;
  can_view_logs?: boolean;
  can_send_commands?: boolean;
  can_manage_grid_settings?: boolean;
  max_processes?: number;
};

type UpdateGridSettingsRequest = {
  allow_member_invite?: boolean;
  allow_member_kick?: boolean;
  require_approval_for_invite?: boolean;
  allow_member_create_process?: boolean;
  allow_member_view_all_processes?: boolean;
  allow_member_connect_to_processes?: boolean;
  max_processes_per_member?: number;
  require_process_approval?: boolean;
  allow_external_connections?: boolean;
  audit_process_access?: boolean;
  allow_member_view_logs?: boolean;
  allow_member_send_commands?: boolean;
  auto_backup_processes?: boolean;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// Member Permission Editor Component
function MemberPermissionEditor({ 
  member, 
  gridId, 
  onClose, 
  onUpdate 
}: {
  member: GridMember;
  gridId: string;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [permissions, setPermissions] = useState<UpdateMemberPermissionsRequest>({});

  const handleSave = async () => {
    try {
      setLoading(true);
      await invoke("update_member_permissions", {
        gridId,
        memberId: member.user_id,
        permissions
      });
      toast.success("Member permissions updated successfully");
      onUpdate();
      onClose();
    } catch (error) {
      console.error("Failed to update member permissions:", error);
      toast.error("Failed to update permissions");
    } finally {
      setLoading(false);
    }
  };

  const permissionCategories = [
    {
      title: "Member Management",
      permissions: [
        { key: "can_invite", label: "Invite new members", description: "Allow inviting new people to the grid" },
        { key: "can_kick", label: "Remove members", description: "Allow removing other members from the grid" },
      ]
    },
    {
      title: "Process Access",
      permissions: [
        { key: "can_create_process", label: "Create processes", description: "Allow sharing new processes with the grid" },
        { key: "can_view_all_processes", label: "View all processes", description: "See processes shared by other members" },
        { key: "can_connect_to_processes", label: "Connect to processes", description: "Join and interact with shared processes" },
        { key: "can_view_logs", label: "View process logs", description: "Access stdout/stderr logs from processes" },
        { key: "can_send_commands", label: "Send commands", description: "Send input to terminal processes" },
      ]
    },
    {
      title: "Administrative",
      permissions: [
        { key: "can_manage_grid_settings", label: "Manage grid settings", description: "Modify grid-wide configuration" },
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-4">
        <div className="rounded-xl border border-white/10 bg-[#111319] p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">Manage Permissions</h2>
              <p className="text-white/60 text-sm">
                {member.display_name || member.username || member.user_id.slice(0, 8)} ({member.role})
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-white/60 hover:text-white hover:bg-white/10"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-6">
            {permissionCategories.map(category => (
              <div key={category.title} className="space-y-3">
                <h3 className="font-medium text-white/80">{category.title}</h3>
                <div className="space-y-3">
                  {category.permissions.map(perm => (
                    <div key={perm.key} className="flex items-start justify-between p-3 rounded-lg bg-white/5">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{perm.label}</div>
                        <div className="text-xs text-white/60 mt-1">{perm.description}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <select
                          value={permissions[perm.key as keyof UpdateMemberPermissionsRequest] === undefined ? "default" : permissions[perm.key as keyof UpdateMemberPermissionsRequest] ? "allow" : "deny"}
                          onChange={(e) => {
                            const value = e.target.value;
                            setPermissions(prev => ({
                              ...prev,
                              [perm.key]: value === "default" ? undefined : value === "allow"
                            }));
                          }}
                          className="rounded border border-white/10 bg-white/5 px-2 py-1 text-sm"
                        >
                          <option value="default">Use Default</option>
                          <option value="allow">Allow</option>
                          <option value="deny">Deny</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Process Limit */}
            <div className="space-y-3">
              <h3 className="font-medium text-white/80">Process Limits</h3>
              <div className="p-3 rounded-lg bg-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">Maximum Processes</div>
                    <div className="text-xs text-white/60 mt-1">Override the default process limit for this member</div>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Default"
                    value={permissions.max_processes || ""}
                    onChange={(e) => setPermissions(prev => ({
                      ...prev,
                      max_processes: e.target.value ? parseInt(e.target.value) : undefined
                    }))}
                    className="w-20 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-center"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-6 border-t border-white/10 mt-6">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium hover:border-white/20 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Grid Settings Editor Component
function GridSettingsEditor({ 
  gridId, 
  onClose, 
  onUpdate 
}: {
  gridId: string;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<UpdateGridSettingsRequest>({});

  const handleSave = async () => {
    try {
      setLoading(true);
      await invoke("update_grid_settings", { gridId, settings });
      toast.success("Grid settings updated successfully");
      onUpdate();
      onClose();
    } catch (error) {
      console.error("Failed to update grid settings:", error);
      toast.error("Failed to update settings");
    } finally {
      setLoading(false);
    }
  };

  const settingCategories = [
    {
      title: "Member Permissions",
      description: "Default permissions for new members",
      settings: [
        { key: "allow_member_invite", label: "Allow members to invite others", description: "Members can invite new people to the grid" },
        { key: "allow_member_kick", label: "Allow members to remove others", description: "Members can remove other members" },
        { key: "require_approval_for_invite", label: "Require admin approval for invites", description: "Invites must be approved by admins" },
      ]
    },
    {
      title: "Process Management",
      description: "How members can interact with processes",
      settings: [
        { key: "allow_member_create_process", label: "Allow process creation", description: "Members can share new processes" },
        { key: "allow_member_view_all_processes", label: "Allow viewing all processes", description: "Members can see processes from other members" },
        { key: "allow_member_connect_to_processes", label: "Allow process connections", description: "Members can connect to shared processes" },
        { key: "allow_member_view_logs", label: "Allow log access", description: "Members can view process logs" },
        { key: "allow_member_send_commands", label: "Allow command sending", description: "Members can send commands to processes" },
      ]
    },
    {
      title: "Security & Limits",
      description: "Grid-wide security and resource policies",
      settings: [
        { key: "require_process_approval", label: "Require process approval", description: "New processes must be approved by admins" },
        { key: "allow_external_connections", label: "Allow external connections", description: "Processes can accept connections from outside the grid" },
        { key: "audit_process_access", label: "Audit process access", description: "Log all process access for security" },
        { key: "auto_backup_processes", label: "Auto-backup processes", description: "Automatically backup process data to cloud storage" },
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl mx-4">
        <div className="rounded-xl border border-white/10 bg-[#111319] p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">Grid Settings</h2>
              <p className="text-white/60 text-sm">Configure default permissions and policies for this grid</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-white/60 hover:text-white hover:bg-white/10"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-8">
            {settingCategories.map(category => (
              <div key={category.title} className="space-y-4">
                <div>
                  <h3 className="font-medium text-white/80">{category.title}</h3>
                  <p className="text-sm text-white/60">{category.description}</p>
                </div>
                <div className="space-y-3">
                  {category.settings.map(setting => (
                    <div key={setting.key} className="flex items-start justify-between p-4 rounded-lg bg-white/5">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{setting.label}</div>
                        <div className="text-xs text-white/60 mt-1">{setting.description}</div>
                      </div>
                      <button
                        onClick={() => setSettings(prev => ({
                          ...prev,
                          [setting.key]: !prev[setting.key as keyof UpdateGridSettingsRequest]
                        }))}
                        className={cx(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                          settings[setting.key as keyof UpdateGridSettingsRequest] 
                            ? "bg-gradient-to-r from-[#FF8A00] to-[#FF3D00]" 
                            : "bg-white/20"
                        )}
                      >
                        <span
                          className={cx(
                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                            settings[setting.key as keyof UpdateGridSettingsRequest] ? "translate-x-6" : "translate-x-1"
                          )}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Process Limits */}
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-white/80">Resource Limits</h3>
                <p className="text-sm text-white/60">Set default limits for grid members</p>
              </div>
              <div className="p-4 rounded-lg bg-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">Default processes per member</div>
                    <div className="text-xs text-white/60 mt-1">Maximum number of processes each member can create</div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={settings.max_processes_per_member || 5}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      max_processes_per_member: parseInt(e.target.value)
                    }))}
                    className="w-20 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-center"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-6 border-t border-white/10 mt-8">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium hover:border-white/20 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main Permission Manager Component
export default function PermissionManager({ 
  gridId, 
  members, 
  currentUserPermissions, 
  onUpdate 
}: {
  gridId: string;
  members: GridMember[];
  currentUserPermissions: GridPermissions;
  onUpdate: () => void;
}) {
  const [selectedMember, setSelectedMember] = useState<GridMember | null>(null);
  const [showGridSettings, setShowGridSettings] = useState(false);

  const getRoleColor = (role: string) => {
    switch (role) {
      case "owner": return "text-yellow-400";
      case "admin": return "text-blue-400";
      default: return "text-white/60";
    }
  };

  const canManageMember = (member: GridMember) => {
    // Can't manage owners, and can only manage if you have manage_roles permission
    return member.role !== "owner" && currentUserPermissions.can_manage_roles;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Permission Management</h2>
          <p className="text-white/60 text-sm">Manage member roles and grid-wide permission settings</p>
        </div>
        {currentUserPermissions.can_modify_settings && (
          <button
            onClick={() => setShowGridSettings(true)}
            className="rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Grid Settings
          </button>
        )}
      </div>

      {/* Members List with Permission Management */}
      <div className="space-y-3">
        <h3 className="font-medium">Member Permissions</h3>
        {members.map(member => (
          <div key={member.user_id} className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-white/5">
            <div className="flex items-center gap-3">
              <div className={cx(
                "w-3 h-3 rounded-full",
                member.is_online ? "bg-green-400" : "bg-gray-400"
              )} />
              <div>
                <div className="font-medium">
                  {member.display_name || member.username || member.user_id.slice(0, 8)}
                </div>
                <div className={cx("text-sm capitalize", getRoleColor(member.role))}>
                  {member.role}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/50">
                Joined {new Date(member.joined_at).toLocaleDateString()}
              </span>
              {canManageMember(member) && (
                <button
                  onClick={() => setSelectedMember(member)}
                  className="rounded-lg border border-white/10 px-3 py-1 text-sm hover:border-white/20"
                >
                  Manage Permissions
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Permission Summary */}
      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <h3 className="font-medium text-blue-300 mb-2">Permission System</h3>
        <div className="text-sm text-blue-200 space-y-1">
          <p>• Grid settings define default permissions for all members</p>
          <p>• Individual member permissions can override grid defaults</p>
          <p>• Role hierarchy: Owner &gt; Admin &gt; Member</p>
          <p>• Changes take effect immediately for active sessions</p>
        </div>
      </div>

      {/* Modals */}
      {selectedMember && (
        <MemberPermissionEditor
          member={selectedMember}
          gridId={gridId}
          onClose={() => setSelectedMember(null)}
          onUpdate={onUpdate}
        />
      )}

      {showGridSettings && (
        <GridSettingsEditor
          gridId={gridId}
          onClose={() => setShowGridSettings(false)}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}
