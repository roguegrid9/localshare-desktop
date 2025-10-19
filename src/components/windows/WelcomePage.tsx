import React, { useState } from 'react';
import { Plus, Compass, Terminal } from 'lucide-react';
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
  const { refreshGrids } = useGrids();

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

  return (
    <div className="w-full h-full bg-bg-primary flex items-center justify-center">
      <div className="text-center max-w-[480px] mx-auto px-6 py-24 animate-fade-in">
        <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center rounded-full bg-[rgba(58,175,255,0.08)] text-accent-solid shadow-[0_0_20px_rgba(123,92,255,0.3)]">
          <Terminal className="w-6 h-6" />
        </div>

        <h2 className="text-3xl font-bold text-text-primary mb-4">Welcome Back</h2>

        <p className="text-text-secondary mb-8">
          Select a grid from the sidebar or create a new one to get started.
        </p>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setOpenCreate(true)}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#3AAFFF] to-[#7B5CFF] text-white font-medium hover:shadow-[0_0_16px_rgba(123,92,255,0.6)] transition-all duration-150 ease-out flex items-center gap-2 animate-scale-in"
            style={{ animationDelay: '100ms' }}
          >
            <Plus className="w-5 h-5" />
            Create Grid
          </button>

          <button
            onClick={() => setOpenJoin(true)}
            className="px-6 py-3 rounded-xl border border-[rgba(255,255,255,0.12)] hover:border-[rgba(255,255,255,0.25)] text-text-primary font-medium hover:bg-[rgba(255,255,255,0.05)] hover:shadow-[0_0_8px_rgba(123,92,255,0.4)] transition-all duration-150 ease-out flex items-center gap-2 animate-scale-in"
            style={{ animationDelay: '200ms' }}
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
