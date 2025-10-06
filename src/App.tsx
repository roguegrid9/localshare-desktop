import { useState, useEffect } from 'react'
import './index.css'
import SplashScreen from './layout/pages/SplashScreen'
import LoginPage from './layout/pages/LoginPage'
import UsernameSelectionFlow from './layout/pages/UsernameSelectionFlow'
import { AppShell } from './layout/AppShell'
import { useConnectionManager } from './hooks/useConnectionManager'
import { P2PProvider, useP2P } from './context/P2PProvider'
import { invoke } from '@tauri-apps/api/core'

type AppState = 'loading' | 'welcome' | 'username_required' | 'authenticated'

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

// Inner component that has access to P2P context
function AppContent() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [userState, setUserState] = useState<UserState | null>(null)
  const { status: connectionStatus } = useConnectionManager()
  const { loadGrids } = useP2P()

  // Simulate initial app loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppState('welcome')
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  const handleSessionCreated = async (newUserState: UserState) => {
    console.log('User authenticated successfully:', newUserState)
    setUserState(newUserState)

    // Connect WebSocket after successful authentication
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('connect_websocket')
      console.log('WebSocket connected after authentication')
    } catch (error) {
      console.warn('Failed to connect WebSocket after authentication:', error)
    }

    try {
      console.log('🚀 Starting container reconciliation after authentication...')
      const reconciliationResult = await invoke('reconcile_containers_on_startup')
      console.log('✅ Container reconciliation completed:', reconciliationResult)
    } catch (error) {
      console.warn('Container reconciliation failed:', error)
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('reinitialize_messaging_service')
      console.log('Messaging service reinitialized after authentication')
    } catch (error) {
      console.warn('Failed to reinitialize messaging service after authentication:', error)
    }

    // Resume heartbeats for all owned shared processes
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('resume_heartbeats_after_auth')
      console.log('✅ Process heartbeats resumed after authentication')
    } catch (error) {
      console.warn('Failed to resume process heartbeats after authentication:', error)
    }
    // Check if username is required for authenticated users
    // Remove the connectionStatus check since we know the user just authenticated successfully
    if (newUserState.is_authenticated && !newUserState.username) {
      console.log('Username required for authenticated user')
      setAppState('username_required')
      return
    }
    
    // Load grids after successful authentication
    if (newUserState && (newUserState.is_authenticated || newUserState.is_provisional)) {
      console.log('Loading user grids...')
      try {
        await loadGrids()
        console.log('Grids loaded successfully')
      } catch (error) {
        console.error('Failed to load grids after authentication:', error)
      }
    }
    
    setAppState('authenticated')
  }

  const handleUsernameComplete = async (updatedUserState: UserState) => {
    console.log('Username selection completed:', updatedUserState)
    setUserState(updatedUserState)
    
    // Connect WebSocket if not already connected
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const isConnected = await invoke('is_websocket_connected')
      if (!isConnected) {
        await invoke('connect_websocket')
        console.log('WebSocket connected after username completion')
      }
    } catch (error) {
      console.warn('Failed to connect WebSocket after username completion:', error)
    }
    
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('reinitialize_messaging_service')
      console.log('Messaging service reinitialized after username completion')
    } catch (error) {
      console.warn('Failed to reinitialize messaging service after username completion:', error)
    }

    // Load grids after username is set
    if (updatedUserState && (updatedUserState.is_authenticated || updatedUserState.is_provisional)) {
      console.log('Loading user grids after username selection...')
      try {
        await loadGrids()
        console.log('Grids loaded successfully')
      } catch (error) {
        console.error('Failed to load grids after username selection:', error)
      }
    }
    
    setAppState('authenticated')
  }

  const handleUsernameSkip = async () => {
    console.log('Username selection skipped')
    
    // Load grids even if username is skipped
    if (userState && (userState.is_authenticated || userState.is_provisional)) {
      console.log('Loading user grids after skipping username...')
      try {
        await loadGrids()
        console.log('Grids loaded successfully')
      } catch (error) {
        console.error('Failed to load grids after skipping username:', error)
      }
    }
    
    setAppState('authenticated')
  }

  if (appState === 'loading') {
    return (
      <SplashScreen 
        statusText="Initializing RogueGrid..."
        netStatus={connectionStatus}
      />
    )
  }

  if (appState === 'welcome') {
    return (
      <LoginPage 
        onSessionCreated={handleSessionCreated}
        connectionStatus={connectionStatus}
      />
    )
  }

  if (appState === 'username_required' && userState) {
    return (
      <UsernameSelectionFlow
        userState={userState}
        onComplete={handleUsernameComplete}
        onSkip={handleUsernameSkip}
      />
    )
  }

  // Authenticated state - main app
  return (
    <AppShell userState={userState}>
      <div className="p-8">
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl mb-4">
            Welcome back, {userState?.username ? `@${userState.username}` : userState?.display_name || 'User'}!
          </h2>
          <p className="text-gray-300 mb-4">
            You're now authenticated and ready to use RogueGrid.
          </p>
          <div className="text-sm text-gray-400">
            <p>Connection: <span className="capitalize text-green-400">{connectionStatus}</span></p>
            <p>Session Type: Permanent Account</p>
            <p>User ID: {userState?.user_id}</p>
            {userState?.username && <p>Username: @{userState.username}</p>}
          </div>
        </div>
      </div>
    </AppShell>
  )
}

// Main App component that wraps everything in P2PProvider
function App() {
  return (
    <P2PProvider>
      <AppContent />
    </P2PProvider>
  )
}

export default App