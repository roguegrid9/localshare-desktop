import React, { useState } from 'react';
import { Plus, Compass, Zap, Users, Terminal } from 'lucide-react';
import CreateGridModal from '../../layout/pages/CreateGridModal';
import JoinGridModal from '../../layout/pages/JoinGridModal';
import { useGrids } from '../../hooks/useGrids';

interface WelcomePageProps {
  windowId: string;
  onQuickAction?: (actionId: string) => void;
}

export function WelcomePage({ windowId, onQuickAction }: WelcomePageProps) {
  const [openCreate, setOpenCreate] = useState(false);
  const [openJoin, setOpenJoin] = useState(false);
  const { grids, refreshGrids } = useGrids();

  // Show empty state only if user has no grids
  const showEmptyState = grids.length === 0;

  const handleCreateSuccess = (gridId?: string) => {
    setOpenCreate(false);
    refreshGrids();
    if (gridId && onQuickAction) {
      onQuickAction(`select_grid:${gridId}`);
    }
  };

  const handleJoinSuccess = () => {
    setOpenJoin(false);
    refreshGrids();
  };

  if (!showEmptyState) {
    // User has grids - show minimal welcome
    return (
      <div className="w-full h-full bg-[#0B0D10] flex items-center justify-center">
        <div className="text-center max-w-2xl px-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center mb-6 mx-auto">
            <Terminal className="w-10 h-10 text-white" />
          </div>

          <h2 className="text-3xl font-bold text-white mb-4">Welcome Back</h2>

          <p className="text-white/60 mb-8">
            Select a grid from the sidebar or create a new one to get started.
          </p>

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setOpenCreate(true)}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Grid
            </button>

            <button
              onClick={() => setOpenJoin(true)}
              className="px-6 py-3 rounded-xl border border-white/20 text-white font-medium hover:bg-white/5 transition-colors flex items-center gap-2"
            >
              <Compass className="w-5 h-5" />
              Join with Code
            </button>
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
      </div>
    );
  }

  // Empty state for new users
  return (
    <div className="w-full h-full bg-[#0B0D10] flex items-center justify-center p-8">
      <div className="text-center max-w-3xl">
        {/* Hero Logo */}
        <div className="mb-8">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-orange-500/20">
            <Terminal className="w-12 h-12 text-white" />
          </div>

          <h1 className="text-5xl font-bold text-white mb-4">
            Welcome to RogueGrid
          </h1>

          <p className="text-xl text-white/60 mb-12 max-w-2xl mx-auto">
            Your collaborative computing platform. Share processes, voice chat, and work together in real-time.
          </p>
        </div>

        {/* Primary CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <button
            onClick={() => setOpenCreate(true)}
            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-orange-500/25 flex items-center justify-center gap-3"
          >
            <Plus className="w-6 h-6" />
            Create Your First Grid
          </button>

          <button
            onClick={() => setOpenJoin(true)}
            className="w-full sm:w-auto px-8 py-4 rounded-xl border-2 border-white/20 text-white font-semibold text-lg hover:bg-white/5 transition-colors flex items-center justify-center gap-3"
          >
            <Compass className="w-6 h-6" />
            Join with Code
          </button>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
          <div className="p-6 rounded-xl bg-white/5 border border-white/10">
            <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center mb-4 mx-auto">
              <Terminal className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-white font-semibold mb-2">Run Processes</h3>
            <p className="text-white/50 text-sm">
              Share terminals, web servers, and games with your team
            </p>
          </div>

          <div className="p-6 rounded-xl bg-white/5 border border-white/10">
            <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center mb-4 mx-auto">
              <Users className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-white font-semibold mb-2">Voice & Video</h3>
            <p className="text-white/50 text-sm">
              Communicate with built-in voice and video channels
            </p>
          </div>

          <div className="p-6 rounded-xl bg-white/5 border border-white/10">
            <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center mb-4 mx-auto">
              <Zap className="w-6 h-6 text-green-400" />
            </div>
            <h3 className="text-white font-semibold mb-2">Real-time P2P</h3>
            <p className="text-white/50 text-sm">
              Fast peer-to-peer connections with automatic NAT traversal
            </p>
          </div>
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
    </div>
  );
}