import { useState, useEffect } from 'react'
import './index.css'
import UnifiedStartupScreen from './layout/pages/UnifiedStartupScreen'
import LoginPage from './layout/pages/LoginPage'
import UsernameSelectionFlow from './layout/pages/UsernameSelectionFlow'
import { AppShell } from './layout/AppShell'
import { useConnectionManager } from './hooks/useConnectionManager'
import { P2PProvider, useP2P } from './context/P2PProvider'
import { ThemeProvider } from './theme'
import { ToastProvider } from './components/toast/ToastContext'
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

  // Initialize app on mount
  useEffect(() => {
    const initApp = async () => {
      try {
        // Try to initialize the app and check for existing session
        await invoke('initialize_app')

        // Check if user is already authenticated
        const userState = await invoke<UserState>('get_user_state')

        if (userState && (userState.is_authenticated || userState.is_provisional)) {
          // User is already authenticated, restore session
          await handleSessionCreated(userState)
        } else {
          // No existing session, show welcome screen
          setAppState('welcome')
        }
      } catch (error) {
        // On error, show welcome screen anyway
        setAppState('welcome')
      }
    }

    initApp()
  }, [])

  const handleSessionCreated = async (newUserState: UserState) => {
    setUserState(newUserState)

    // Connect WebSocket after successful authentication
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('connect_websocket')
    } catch (error) {
      // Silently handle websocket connection errors
    }

    try {
      const reconciliationResult = await invoke('reconcile_containers_on_startup')
    } catch (error) {
      // Silently handle container reconciliation errors
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('reinitialize_messaging_service')
    } catch (error) {
      // Silently handle messaging service errors
    }

    // Resume heartbeats for all owned shared processes
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('resume_heartbeats_after_auth')
    } catch (error) {
      // Silently handle heartbeat errors
    }
    // Check if username is required for authenticated users
    // Remove the connectionStatus check since we know the user just authenticated successfully
    if (newUserState.is_authenticated && !newUserState.username) {
      // console.log('Username required for authenticated user')
      setAppState('username_required')
      return
    }
    
    // Load grids after successful authentication
    if (newUserState && (newUserState.is_authenticated || newUserState.is_provisional)) {
      // console.log('Loading user grids...')
      try {
        await loadGrids()
        // console.log('Grids loaded successfully')
      } catch (error) {
        // console.error('Failed to load grids after authentication:', error)
      }
    }
    
    setAppState('authenticated')
  }

  const handleUsernameComplete = async (updatedUserState: UserState) => {
    // console.log('Username selection completed:', updatedUserState)
    setUserState(updatedUserState)
    
    // Connect WebSocket if not already connected
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const isConnected = await invoke('is_websocket_connected')
      if (!isConnected) {
        await invoke('connect_websocket')
        // console.log('WebSocket connected after username completion')
      }
    } catch (error) {
      // console.warn('Failed to connect WebSocket after username completion:', error)
    }
    
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('reinitialize_messaging_service')
      // console.log('Messaging service reinitialized after username completion')
    } catch (error) {
      // console.warn('Failed to reinitialize messaging service after username completion:', error)
    }

    // Load grids after username is set
    if (updatedUserState && (updatedUserState.is_authenticated || updatedUserState.is_provisional)) {
      // console.log('Loading user grids after username selection...')
      try {
        await loadGrids()
        // console.log('Grids loaded successfully')
      } catch (error) {
        // console.error('Failed to load grids after username selection:', error)
      }
    }
    
    setAppState('authenticated')
  }

  const handleUsernameSkip = async () => {
    // console.log('Username selection skipped')
    
    // Load grids even if username is skipped
    if (userState && (userState.is_authenticated || userState.is_provisional)) {
      // console.log('Loading user grids after skipping username...')
      try {
        await loadGrids()
        // console.log('Grids loaded successfully')
      } catch (error) {
        // console.error('Failed to load grids after skipping username:', error)
      }
    }
    
    setAppState('authenticated')
  }

  if (appState === 'loading') {
    return (
      <UnifiedStartupScreen
        statusText="Initializing..."
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
  return <AppShell userState={userState} />
}

// Main App component that wraps everything in providers
function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <ToastProvider>
        <P2PProvider>
          <AppContent />
        </P2PProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App