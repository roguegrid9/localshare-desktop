import React, { Suspense, useState, useEffect } from 'react';
import { Cog, Home } from 'lucide-react';
import { Spinner } from '../ui/spinner';
import { invoke } from '@tauri-apps/api/core';
import type { Tab } from '../../types/windows';
import GridManagement from '../../layout/pages/GridManagement';
import ChannelView from '../channels/ChannelView';
import VoiceChannelWindow from '../channels/VoiceChannelWindow';
import { ProcessDashboard } from '../process/ProcessDashboard';
import { BandwidthTracker, CreateTunnelModal, TrialSignupModal } from '../relay';
import { WelcomePage } from './WelcomePage';
import { SubscriptionPage } from '../../layout/pages/SubscriptionPage';

const TerminalWindow = React.lazy(() => import('../terminal/TerminalWindow'));

interface TabContentProps {
  tab: Tab;
  windowId: string;
  isMainWindow: boolean;
}

// Wrapper to load auth token for BandwidthTracker
function NetworkDashboardWrapper() {
  const [authToken, setAuthToken] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showCreateTunnel, setShowCreateTunnel] = useState(false);
  const [showTrialSignup, setShowTrialSignup] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const loadAuthToken = async () => {
      try {
        const token = await invoke<string>('get_auth_token');
        setAuthToken(token);
      } catch (error) {
        console.error('Failed to load auth token:', error);
      } finally {
        setLoading(false);
      }
    };
    loadAuthToken();
  }, []);

  const handleCreateTunnel = () => {
    setShowCreateTunnel(true);
  };

  const handleStartTrial = () => {
    setShowTrialSignup(true);
  };

  const handleTunnelCreated = () => {
    setShowCreateTunnel(false);
  };

  const handleTrialStarted = () => {
    setShowTrialSignup(false);
    // Force BandwidthTracker to refresh subscription status
    setRefreshKey(prev => prev + 1);
  };

  if (loading) {
    return <ContentLoader />;
  }

  return (
    <>
      <BandwidthTracker
        key={refreshKey}
        token={authToken}
        onClose={() => {}}
        onCreateTunnel={handleCreateTunnel}
        onStartTrial={handleStartTrial}
      />

      {showCreateTunnel && (
        <CreateTunnelModal
          token={authToken}
          onClose={() => setShowCreateTunnel(false)}
          onCreated={handleTunnelCreated}
        />
      )}

      {showTrialSignup && (
        <TrialSignupModal
          token={authToken}
          onClose={() => setShowTrialSignup(false)}
          onStarted={handleTrialStarted}
        />
      )}
    </>
  );
}

function ContentLoader() {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#0B0D10]">
      <div className="flex items-center gap-2 text-white/60">
        <Spinner className="w-4 h-4" />
        <span>Loading...</span>
      </div>
    </div>
  );
}

function UnsupportedContent({ tab }: { tab: Tab }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#0B0D10]">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 mx-auto">
          <Home className="w-8 h-8 text-white/40" />
        </div>
        <h3 className="text-white/80 font-medium mb-2">Unsupported Content</h3>
        <p className="text-white/40 text-sm">
          Content type "{tab.content.type}" is not yet supported
        </p>
      </div>
    </div>
  );
}

// Handle Process tabs that might be terminals
function ProcessTabContent({ tab, windowId }: { tab: Tab; windowId: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isContainer, setIsContainer] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Type guard to check if tab content has process_id
  const hasProcessId = (content: Tab['content']): content is Tab['content'] & { data: { process_id: string; grid_id: string } } => {
    return content.type === 'Process' && 'data' in content && 'process_id' in content.data;
  };

  useEffect(() => {
    const analyzeProcess = async () => {
      try {
        console.log('ProcessTabContent: Analyzing process:', hasProcessId(tab.content) ? tab.content.data.process_id : 'unknown');
        setLoading(true);
        setError(null);
        
        if (!hasProcessId(tab.content)) {
          throw new Error('Invalid process tab content');
        }
        
        // Try to get terminal session ID
        const result = await invoke<string | null>('get_process_session_id', {
          processId: tab.content.data.process_id
        });
        
        console.log('ProcessTabContent: Got session ID result:', result);
        setSessionId(result);
        setIsContainer(false);
        
      } catch (err) {
        console.error('ProcessTabContent: Failed to analyze process:', err);
        setError(err as string);
        setSessionId(null);
        setIsContainer(false);
      } finally {
        setLoading(false);
      }
    };
    
    analyzeProcess();
  }, [tab.content]);

  if (loading) {
    return <ContentLoader />;
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0B0D10]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4 mx-auto">
            <Cog className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-red-300 font-medium mb-2">Process Error</h3>
          <p className="text-red-400/60 text-sm mb-4">
            Failed to load process: {error}
          </p>
          {hasProcessId(tab.content) && (
            <p className="text-white/40 text-xs">
              Process ID: {tab.content.data.process_id}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!hasProcessId(tab.content)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0B0D10]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 mx-auto">
            <Cog className="w-8 h-8 text-white/40" />
          </div>
          <h3 className="text-white/80 font-medium mb-2">Invalid Process</h3>
          <p className="text-white/40 text-sm">
            Process content is not properly formatted
          </p>
        </div>
      </div>
    );
  }

  // Container functionality removed - ready for AI capsules

  // If we found a session ID, this is a terminal process
  if (sessionId) {
    return (
      <Suspense fallback={<ContentLoader />}>
        <TerminalWindow 
          sessionId={sessionId}
          gridId={tab.content.data.grid_id}
          windowId={windowId}
        />
      </Suspense>
    );
  }

  // Otherwise show process dashboard for non-terminal, non-container processes
  return (
    <ProcessDashboard 
      processId={tab.content.data.process_id}
      gridId={tab.content.data.grid_id}
    />
  );
}

export function TabContent({ tab, windowId}: TabContentProps) {
  const renderContent = () => {
    switch (tab.content.type) {
      case 'Terminal':
        return (
          <Suspense fallback={<ContentLoader />}>
            <TerminalWindow 
              sessionId={tab.content.data.session_id}
              gridId={tab.content.data.grid_id}
              windowId={windowId}
            />
          </Suspense>
        );

      case 'Container':
        return (
          <div className="flex-1 flex items-center justify-center bg-[#0B0D10]">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 mx-auto">
                <Cog className="w-8 h-8 text-white/40" />
              </div>
              <h3 className="text-white/80 font-medium mb-2">Container Removed</h3>
              <p className="text-white/40 text-sm">
                Container functionality has been removed.
              </p>
              <p className="text-white/30 text-xs mt-2">
                Ready for AI capsule system.
              </p>
            </div>
          </div>
        );

      case 'TextChannel':
        return (
          <Suspense fallback={<ContentLoader />}>
            <ChannelView 
              channelId={tab.content.data.channel_id}
              gridId={tab.content.data.grid_id}
            />
          </Suspense>
        );

      case 'DirectMessage':
        return (
          <Suspense fallback={<ContentLoader />}>
            <ChannelView 
              channelId={tab.content.data.conversation_id}
              gridId=""
            />
          </Suspense>
        );

      case 'MediaChannel':
        return (
          <Suspense fallback={<ContentLoader />}>
            <ChannelView 
              channelId={tab.content.data.channel_id}
              gridId={tab.content.data.grid_id}
            />
          </Suspense>
        );
      
      case 'VoiceChannel':
        console.log('🎙️ TabContent VoiceChannel Debug:', {
          tabContent: tab.content,
          tabData: tab.content.data,
          channelId: tab.content.data.data.channel_id, // Fixed path
          gridId: tab.content.data.data.grid_id // Fixed path
        });
        
        return (
          <Suspense fallback={<ContentLoader />}>
            <VoiceChannelWindow 
              channelId={tab.content.data.data.channel_id}  // Fixed: added extra .data
              gridId={tab.content.data.data.grid_id}        // Fixed: added extra .data
            />
          </Suspense>
        );
      case 'Process':
        return <ProcessTabContent tab={tab} windowId={windowId} />;

      case 'GridDashboard':
        return <GridManagement gridId={tab.content.data.grid_id} />;

      case 'NetworkDashboard':
        return <NetworkDashboardWrapper />;

      case 'Subscription':
        return <SubscriptionPage />;

      case 'Welcome':
        return (
          <WelcomePage
            windowId={windowId}
            onQuickAction={(actionId) => {
              console.log('Quick action triggered:', actionId);
            }}
          />
        );

      default:
        return <UnsupportedContent tab={tab} />;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {renderContent()}
    </div>
  );
}