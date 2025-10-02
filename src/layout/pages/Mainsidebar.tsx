import { Plus, Settings, User, Compass, LogOut, UserCog, Server } from "lucide-react";
import type { GridSummary } from "../../types/grid";
import { cx } from "../../utils/cx";
import { useState, useRef, useEffect } from "react";
import CreateGridModal from "./CreateGridModal";
import JoinGridModal from "./JoinGridModal";
import { useGrids } from "../../hooks/useGrids";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { BandwidthDisplay, PurchaseBandwidthModal } from "../../components/relay";

interface NetworkStatus {
  nat_type: string;
  needs_relay: boolean;
  stun_available: boolean;
  turn_available: boolean;
  connection_quality: string;
  last_checked: string;
}
import { WifiOff, Shield, ShieldAlert } from "lucide-react";

export default function GridsRail({
  grids,
  selectedId,
  onSelect,
}: {
  grids: ReadonlyArray<GridSummary>;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [openCreate, setOpenCreate] = useState(false);
  const [openJoin, setOpenJoin] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showRelayModal, setShowRelayModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const { refreshGrids } = useGrids();
  // Docker functionality removed
  const { networkStatus, loading: networkLoading, checkNetworkStatus } = useNetworkStatus();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    if (showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileMenu]);

  const handleCreateSuccess = (gridId?: string) => {
    setOpenCreate(false);
    refreshGrids();
    if (gridId) {
      onSelect(gridId);
    }
  };

  const handleJoinSuccess = () => {
    setOpenJoin(false);
    refreshGrids();
  };

  const handleProfileMenuClick = (action: string) => {
    console.log(`Profile action: ${action}`);
    setShowProfileMenu(false);
  };

  function getNetworkStatusTitle(status: NetworkStatus | null): string {
    if (!status) return "Network Status Unknown";
    
    const quality = status.connection_quality;
    const needsRelay = status.needs_relay;
    
    return `NAT: ${status.nat_type} | Quality: ${quality}${needsRelay ? " (Needs Relay)" : ""}`;
  }

  return (
    <aside className="h-screen w-[68px] shrink-0 border-r border-white/10 bg-[#0B0D10] flex flex-col items-center py-3 gap-2">
      {/* App/Home Logo */}
      <button
        className="h-12 w-12 grid place-items-center transition-colors"
      >
        <img src="/assets/logo1.svg" alt="RG9" className="h-15 w-15" />
      </button>

      <div className="h-px w-8 bg-white/10 my-2" />

      {/* Grids Section */}
      <div className="flex flex-col items-center gap-2 overflow-auto scrollbar-none flex-1">
        {grids.map((g) => (
          <button
            key={g.id}
            title={g.name}
            onClick={() => onSelect(g.id)}
            className={cx(
              "relative h-10 w-10 rounded-2xl transition grid place-items-center group",
              selectedId === g.id
                ? "bg-white text-black"
                : "bg-white/10 hover:bg-white/20 text-white hover:rounded-lg"
            )}
          >
            {g.icon ?? <span className="text-xs font-medium">{g.name[0]}</span>}

            {selectedId !== g.id && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-[#111319] text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {g.name}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Create/Join Buttons */}
      <div className="flex flex-col items-center gap-2">
        {/* Discover (Join Grid) */}
        <button
          className="h-9 w-9 grid place-items-center rounded-xl border border-white/10 hover:bg-white/10 hover:border-white/20 transition-colors group"
          title="Discover & Join Grid"
          onClick={() => setOpenJoin(true)}
        >
          <Compass className="h-4 w-4" />

          <div className="absolute left-full ml-2 px-2 py-1 bg-[#111319] text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
            Join Grid
          </div>
        </button>

        {/* Create Grid */}
        <button
          className="h-9 w-9 grid place-items-center rounded-xl bg-gradient-to-b from-[#FF8A00] to-[#FF3D00] text-black hover:opacity-90 transition-opacity group"
          title="Create New Grid"
          onClick={() => setOpenCreate(true)}
        >
          <Plus className="h-4 w-4" />

          <div className="absolute left-full ml-2 px-2 py-1 bg-[#111319] text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
            Create Grid
          </div>
        </button>
      </div>

      {/* Bottom Controls */}
      <div className="mt-auto flex flex-col items-center gap-3">
        {/* Docker status removed - ready for AI capsules */}

        {/* Network Status Button */}
        <button
          className={cx(
            "h-9 w-9 grid place-items-center rounded-xl hover:bg-white/20 transition-colors group relative",
            networkStatus?.connection_quality === "excellent" ? "bg-green-600/20 text-green-400" :
            networkStatus?.connection_quality === "good" ? "bg-blue-600/20 text-blue-400" :
            networkStatus?.connection_quality === "fair" ? "bg-yellow-600/20 text-yellow-400" :
            networkStatus?.needs_relay ? "bg-red-600/20 text-red-400" :
            "bg-gray-600/20 text-gray-400"
          )}
          title={getNetworkStatusTitle(networkStatus)}
          onClick={checkNetworkStatus}
          disabled={networkLoading}
        >
          {networkStatus?.needs_relay ? <ShieldAlert className="h-4 w-4" /> : 
          networkStatus?.stun_available ? <Shield className="h-4 w-4" /> : 
          <WifiOff className="h-4 w-4" />}
          
          {/* Status indicator dot */}
          <span className={cx(
            "absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-[#0B0D10]",
            networkStatus?.connection_quality === "excellent" ? "bg-green-500" :
            networkStatus?.connection_quality === "good" ? "bg-blue-500" :
            networkStatus?.connection_quality === "fair" ? "bg-yellow-500" :
            "bg-red-500"
          )} />

          <div className="absolute left-full ml-2 px-2 py-1 bg-[#111319] text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 max-w-xs">
            <div className="font-medium">{networkStatus?.nat_type || "Checking..."}</div>
            {networkStatus && (
              <div className="text-white/60 text-xs mt-1">
                {networkStatus.needs_relay ? "Requires TURN relay" : "Direct P2P possible"}
              </div>
            )}
            {networkLoading && (
              <div className="text-blue-400 text-xs">Testing connectivity...</div>
            )}
          </div>
        </button>

        {/* Relay & Bandwidth Button */}
        <button
          className="h-9 w-9 grid place-items-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors group"
          title="Relay & Bandwidth"
          onClick={() => setShowRelayModal(true)}
        >
          <Server className="h-4 w-4" />

          <div className="absolute left-full ml-2 px-2 py-1 bg-[#111319] text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
            Relay & Bandwidth
          </div>
        </button>

        {/* Profile with Dropdown Menu */}
        <div className="relative" ref={profileMenuRef}>
          <button
            className="relative h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center group cursor-pointer transition-colors"
            title="Profile"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
          >
            <User className="h-4 w-4" />
            <span className="absolute -right-1 -bottom-1">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            </span>

            {!showProfileMenu && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-[#111319] text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                Profile
              </div>
            )}
          </button>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute bottom-full left-full ml-2 mb-2 w-48 rounded-lg border border-white/10 bg-[#111319] shadow-xl z-50">
              <div className="p-2">
                <div className="px-3 py-2 text-xs text-white/60 border-b border-white/10 mb-1">
                  @imadethis
                </div>
                
                <button
                  onClick={() => handleProfileMenuClick('profile')}
                  className="flex items-center gap-3 w-full px-3 py-2 text-sm text-white/80 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <UserCog className="h-4 w-4" />
                  Profile Settings
                </button>
                
                <button
                  onClick={() => handleProfileMenuClick('settings')}
                  className="flex items-center gap-3 w-full px-3 py-2 text-sm text-white/80 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Settings className="h-4 w-4" />
                  App Settings
                </button>
                
                <div className="h-px bg-white/10 my-1" />
                
                <button
                  onClick={() => handleProfileMenuClick('logout')}
                  className="flex items-center gap-3 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {openCreate && (
        <CreateGridModal
          open={openCreate}
          onClose={() => setOpenCreate(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
      {openJoin && (
        <JoinGridModal
          open={openJoin}
          onClose={() => setOpenJoin(false)}
          onSuccess={handleJoinSuccess}
        />
      )}

      {/* Relay & Bandwidth Modal */}
      {showRelayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRelayModal(false)}>
          <div className="bg-[#111319] border border-white/10 rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Server className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Relay & Bandwidth</h2>
                  <p className="text-sm text-white/60">Manage your relay bandwidth allocation</p>
                </div>
              </div>
              <button
                onClick={() => setShowRelayModal(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {selectedId ? (
              <div className="space-y-6">
                {/* Bandwidth Display */}
                <div>
                  <h3 className="text-sm font-medium text-white/80 mb-3">Current Usage</h3>
                  <BandwidthDisplay gridId={selectedId} />
                </div>

                {/* Purchase Section */}
                <div>
                  <h3 className="text-sm font-medium text-white/80 mb-3">Purchase Additional Bandwidth</h3>
                  <button
                    onClick={() => setShowPurchaseModal(true)}
                    className="w-full rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] px-4 py-3 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                  >
                    Purchase Bandwidth
                  </button>
                </div>

                {/* Info Section */}
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
                  <p className="text-sm text-blue-200/80">
                    💡 Bandwidth is shared across all members of your grid. Purchase more when you need additional relay capacity for connections.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Server className="w-12 h-12 mx-auto mb-3 text-white/20" />
                <p className="text-white/60">Select a grid to view bandwidth stats</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Purchase Bandwidth Modal */}
      {showPurchaseModal && selectedId && (
        <PurchaseBandwidthModal
          gridId={selectedId}
          isOpen={showPurchaseModal}
          onClose={() => setShowPurchaseModal(false)}
          onSuccess={() => {
            setShowPurchaseModal(false);
            // Optionally refresh bandwidth display
          }}
        />
      )}
    </aside>
  );
}