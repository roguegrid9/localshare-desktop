import { useCallback, useMemo, useState, useEffect } from "react";
import UsernamePicker from './UsernamePicker';
import TOSAcceptance from './TOSAcceptance';
import { supabase } from "../../utils/supabase";
import { useTauriCommands } from "../../hooks/useTauriCommands";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";

interface WelcomeProps {
  onSessionCreated: (userState: any) => void;
  connectionStatus: "connected" | "connecting" | "offline";
}

type Mode = "signin" | "signup";

// Shared UI primitives (compact spacing, no neon glow)
const classes = {
  root:
    "min-h-screen w-screen bg-[#0B0D10] text-white flex items-center justify-center p-6",
  container:
    "w-full max-w-sm space-y-5 text-center mx-auto",
  logoWrap: "relative mx-auto flex items-center justify-center",
  logoImg: "w-14 h-14",
  title: "text-2xl font-semibold tracking-tight",
  subtitle: "text-sm text-gray-400",
  primaryBtn:
    "w-full rounded-xl px-4 py-2 font-semibold bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed",
  secondaryBtn:
    "w-full rounded-xl px-4 py-2 font-semibold bg-[#111319] border border-white/10 text-gray-200 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",
  input:
    "rounded-xl bg-[#111319] border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/20 w-full",
  tinyBtn: "text-gray-400 hover:text-white",
  alertErr:
    "p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm text-left",
  alertInfo:
    "p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-sm text-left",
};

export default function Welcome({
  onSessionCreated,
  connectionStatus,
}: WelcomeProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Embedded auth state
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showUsernameStep, setShowUsernameStep] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState<string | undefined>();
  const [pendingSupabaseToken, setPendingSupabaseToken] = useState<string | null>(null);
  const [waitingForOAuth, setWaitingForOAuth] = useState(false);
  const [showTOSStep, setShowTOSStep] = useState(false);
  const canSubmit = useMemo(() => email && password.length >= 6, [email, password]);

  const {
    promoteAccount,
    promoteAccountWithUsername,
    getUserState,
    initializeApp,
    acceptTOS,
  } = useTauriCommands();

  // Check for OAuth callback on mount
  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        setIsCheckingAuth(true);
        console.log('Checking for OAuth callback...');

        // Initialize app first
        await initializeApp();

        // Only check URL params if we're on an HTTP(S) URL, not tauri://
        const currentUrl = window.location.href;
        console.log('Current URL:', currentUrl);

        // Skip OAuth detection for Tauri protocol URLs
        if (currentUrl.startsWith('tauri://')) {
          console.log('Tauri app - skipping OAuth URL detection');
          setIsCheckingAuth(false);

          // Still check for existing Supabase session in localStorage
          try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError) {
              console.error('Error getting existing session:', sessionError);
              return;
            }

            if (session?.access_token) {
              console.log('Found existing Supabase session');

              try {
                await promoteAccount(session.access_token);
                const userState = await getUserState();
                onSessionCreated(userState);
                return;
              } catch (promotionError) {
                console.error('Failed to promote existing account:', promotionError);
              }
            }
          } catch (error) {
            console.error('Session check failed:', error);
          }

          return;
        }

        // For HTTP(S) URLs, check for OAuth callback params
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));

        console.log('URL params:', Object.fromEntries(urlParams.entries()));

        // Check for authorization code in URL
        const code = urlParams.get('code') || hashParams.get('code');
        
        if (code) {
          console.log('OAuth authorization code found, exchanging for session...');
          
          try {
            // Exchange the authorization code for a session
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            
            console.log('Code exchange result:', { data: !!data.session, error });
            
            if (error) {
              console.error('Failed to exchange code for session:', error);
              setError(`OAuth error: ${error.message}`);
              // Clean up URL
              window.history.replaceState({}, document.title, window.location.pathname);
              setIsCheckingAuth(false);
              return;
            }
            
            if (data.session?.access_token) {
              console.log('Session created successfully:', {
                user: data.session.user?.email,
                expires_at: data.session.expires_at
              });
              
              // Clean up URL before proceeding
              window.history.replaceState({}, document.title, window.location.pathname);
              
              try {
                console.log('Promoting account with Supabase token...');
                const result = await promoteAccount(data.session.access_token);
                console.log('Account promotion result:', result);
                
                const userState = await getUserState();
                console.log('Final user state:', userState);
                
                onSessionCreated(userState);
                return;
              } catch (promotionError) {
                console.error('Failed to promote account:', promotionError);
                setError(`Failed to complete sign-in: ${promotionError}`);
              }
            }
          } catch (exchangeError) {
            console.error('Code exchange failed:', exchangeError);
            setError(`Failed to process OAuth callback: ${exchangeError}`);
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
            setIsCheckingAuth(false);
            return;
          }
        } else {
          // No code parameter, check for existing session
          console.log('No OAuth code found, checking for existing session...');
          
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError) {
            console.error('Error getting existing session:', sessionError);
            setIsCheckingAuth(false);
            return;
          }
          
          if (session?.access_token) {
            console.log('Found existing Supabase session');
            
            try {
              await promoteAccount(session.access_token);
              const userState = await getUserState();
              onSessionCreated(userState);
              return;
            } catch (promotionError) {
              console.error('Failed to promote existing account:', promotionError);
              setError(`Failed to restore session: ${promotionError}`);
            }
          }
        }
        
        console.log('No valid session found');
        setIsCheckingAuth(false);
        
      } catch (error) {
        console.error('Auth callback handling failed:', error);
        setError('Failed to process authentication');
        setIsCheckingAuth(false);
      }
    };

    handleAuthCallback();
  }, []);

  // Setup auth state change listener (for monitoring only, not auto-promotion)
  useEffect(() => {
    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);

        // Just log events, don't auto-promote
        // Promotion is handled explicitly in submit() and tryFinish()
        // This prevents race conditions where both handlers try to promote simultaneously
      });

      return () => {
        try {
          subscription.unsubscribe();
        } catch (error) {
          console.error('Failed to unsubscribe from auth state changes:', error);
        }
      };
    } catch (error) {
      console.error('Failed to setup auth state listener:', error);
      return () => {}; // Return empty cleanup function
    }
  }, []);

  // Promote account after successful auth
  const promoteIfPossible = useCallback(async (skipUsernameStep = false) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return false;

    // If we want to collect username and haven't skipped the step, show username picker
    if (!skipUsernameStep && !showUsernameStep) {
      setPendingSupabaseToken(session.access_token);
      setShowUsernameStep(true);
      return true; // Return true to indicate we're handling it
    }

    // Promote with or without username
    try {
      if (selectedUsername) {
        await promoteAccountWithUsername(session.access_token, selectedUsername);
      } else {
        await promoteAccount(session.access_token);
      }

      const userState = await getUserState();
      onSessionCreated(userState);
      return true;
    } catch (error) {
      console.error('Failed to promote account:', error);
      throw error;
    }
  }, [promoteAccount, promoteAccountWithUsername, getUserState, onSessionCreated, selectedUsername, showUsernameStep]);

  const handleUsernameStepComplete = useCallback(async () => {
    if (!pendingSupabaseToken) return;

    try {
      setBusy(true);
      setError(null);

      let response;
      if (selectedUsername) {
        response = await promoteAccountWithUsername(pendingSupabaseToken, selectedUsername);
      } else {
        response = await promoteAccount(pendingSupabaseToken);
      }

      // Check if TOS has been accepted
      const tosAccepted = response?.user_info?.tos_accepted ?? false;

      if (!tosAccepted) {
        // Show TOS acceptance modal
        setShowUsernameStep(false);
        setShowTOSStep(true);
        setBusy(false);
        return;
      }

      const userState = await getUserState();
      onSessionCreated(userState);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
      setPendingSupabaseToken(null);
      setShowUsernameStep(false);
    }
  }, [pendingSupabaseToken, selectedUsername, promoteAccountWithUsername, promoteAccount, getUserState, onSessionCreated]);

  const handleTOSAccept = useCallback(async () => {
    try {
      setBusy(true);
      setError(null);

      // Call the acceptTOS API
      await acceptTOS('1.0');

      // Continue to the app
      const userState = await getUserState();
      onSessionCreated(userState);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
      setShowTOSStep(false);
    }
  }, [acceptTOS, getUserState, onSessionCreated]);

  const handleTOSDecline = useCallback(async () => {
    try {
      // User declined TOS - sign them out
      await supabase.auth.signOut();
      setShowTOSStep(false);
      setError('You must accept the Terms of Service to use RogueGrid9');
    } catch (e: any) {
      console.error('Error signing out:', e);
    }
  }, []);

  // Email/password submit
  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        console.log('Creating account with email:', email);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: 'https://pepsufkvgfwymtmrjkna.supabase.co/auth/v1/callback' },
        });
        if (error) {
          console.error('Signup error:', error);
          throw error;
        }
        if (data.user && !data.session) {
          console.log('Email verification required');
          setMsg("Verification email sent. Confirm to finish setup.");
          setBusy(false);
          return;
        }
        console.log('Account created, promoting...');
        const done = await promoteIfPossible();
        if (!done) {
          console.warn('Promotion failed or incomplete');
          setMsg("Account created. If not redirected, try again.");
        }
        return;
      }

      // signin
      console.log('Signing in with email:', email);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('Signin error:', error);
        throw error;
      }
      console.log('Signed in successfully, promoting...');
      const done = await promoteIfPossible();
      if (!done) {
        console.warn('Promotion failed or incomplete');
        setMsg("Signed in. If not redirected, try again.");
      }
    } catch (e: any) {
      console.error('Submit error:', e);
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [canSubmit, email, password, mode, promoteIfPossible]);

  // OAuth with localhost callback (Supabase handles PKCE automatically)
  const doOAuth = useCallback(async (provider: "google" | "github") => {
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      console.log('Starting OAuth with localhost callback...');

      // Step 1: Start OAuth callback server
      const port = await invoke<number>('start_oauth_server');
      console.log('OAuth server started on port:', port);

      // Step 2: Build OAuth URL with localhost redirect
      const redirectUrl = `http://localhost:${port}`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          skipBrowserRedirect: true,
          redirectTo: redirectUrl,
          queryParams: {
            prompt: "select_account"
          }
        },
      });

      if (error) throw error;

      console.log('OAuth URL generated:', data?.url);

      // Step 3: Open OAuth URL in user's default browser (using Tauri shell)
      if (data?.url) {
        console.log('Opening OAuth URL in browser...');
        await open(data.url);
        console.log('Browser opened successfully');
      }

      // Step 4: Listen for callback from localhost server
      const unlisten = await listen<string>('oauth-callback', async (event) => {
        console.log('OAuth callback received:', event.payload);

        try {
          // Extract code from callback URL
          const url = new URL(event.payload);
          const code = url.searchParams.get('code');

          if (!code) {
            throw new Error('No authorization code in callback URL');
          }

          console.log('Authorization code received, exchanging for session...');

          // Exchange code for session (Supabase handles PKCE verification)
          const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.error('Failed to exchange code:', exchangeError);
            throw exchangeError;
          }

          console.log('Session obtained successfully!');

          // Clean up listener
          unlisten();

          // Promote account
          if (sessionData.session?.access_token) {
            console.log('Promoting account...');
            await promoteAccount(sessionData.session.access_token);
            const userState = await getUserState();
            setWaitingForOAuth(false);
            onSessionCreated(userState);
          }

        } catch (callbackError: any) {
          console.error('OAuth callback error:', callbackError);
          setError(callbackError.message || 'OAuth login failed');
          setBusy(false);
          setWaitingForOAuth(false);
        }
      });

      // Show waiting state
      setWaitingForOAuth(true);
      setBusy(false);
      setMsg("Complete sign-in in your browser. The app will automatically detect when you're done.");

    } catch (e: any) {
      console.error('OAuth setup error:', e);
      setError(e?.message ?? String(e));
      setBusy(false);
      setWaitingForOAuth(false);
    }
  }, [promoteAccount, getUserState, onSessionCreated]);

  const tryFinish = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      // Check for Supabase session
      console.log('Checking for Supabase session...');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      console.log('Session check result:', { session: !!session, error: sessionError, accessToken: session?.access_token?.substring(0, 20) });

      if (sessionError) {
        console.error('Session error:', sessionError);
        throw sessionError;
      }

      if (!session?.access_token) {
        console.warn('No session found in localStorage');
        // Check localStorage directly
        const storedSession = localStorage.getItem('roguegrid9-auth');
        console.log('Direct localStorage check:', storedSession ? 'Found data' : 'No data');

        setError("OAuth login doesn't work properly in Tauri yet. Please use email/password login instead, or sign in at https://app.roguegrid9.com and then refresh this app.");
        setBusy(false);
        return;
      }

      // We have a session! Promote the account
      console.log('Found Supabase session, promoting account...');
      await promoteAccount(session.access_token);
      const userState = await getUserState();

      // Success! Clear waiting state and move to app
      setWaitingForOAuth(false);
      onSessionCreated(userState);

    } catch (e: any) {
      console.error('tryFinish error:', e);
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [promoteAccount, getUserState, onSessionCreated]);

  // Show loading screen while checking for existing auth
  if (isCheckingAuth) {
    return (
      <div className={classes.root}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-300">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (isCreating) {
    return (
      <div className={classes.root}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-300">Setting up your session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={classes.root}>
      <div className={classes.container}>
        {/* Logo (no glow) */}
        <div className={classes.logoWrap}>
          <img src="/assets/logo1.svg" alt="RogueGrid9" className={classes.logoImg} />
        </div>

        <h1 className={classes.title}>Welcome to RogueGrid9</h1>
        <p className={classes.subtitle}>Kill the VPS. Own your network.</p>

        {/* Alerts */}
        {error && <div className={classes.alertErr}>{error}</div>}
        {msg && !error && <div className={classes.alertInfo}>{msg}</div>}

        {/* Waiting for OAuth completion */}
        {waitingForOAuth && !showUsernameStep && (
          <div className="grid gap-4 text-center">
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
            <p className="text-gray-300 text-sm">
              Waiting for sign-in to complete in your browser...
              <br />
              <span className="text-xs text-gray-400">This should happen automatically</span>
            </p>
            <button
              onClick={() => {
                setWaitingForOAuth(false);
                setMsg(null);
                setError(null);
              }}
              className={classes.tinyBtn}
            >
              Cancel
            </button>
          </div>
        )}

        {!showUsernameStep && !waitingForOAuth && (
          <>
            {/* OAuth and Account Creation */}
            <div className="grid gap-3 text-left">
              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={connectionStatus === "offline" || busy}
                  onClick={() => doOAuth("google")}
                  className={classes.secondaryBtn}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </button>
                <button
                  type="button"
                  disabled={connectionStatus === "offline" || busy}
                  onClick={() => doOAuth("github")}
                  className={classes.secondaryBtn}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  Continue with GitHub
                </button>
              </div>

              <div className="my-2 flex items-center gap-3 text-gray-500">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[12px]">or use email</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <form
                className="grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <label className="grid gap-1">
                  <span className="text-[12px] text-gray-300">Email</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={classes.input}
                    placeholder="you@example.com"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-[12px] text-gray-300 flex items-center justify-between">
                    <span>Password</span>
                    <button type="button" onClick={() => setShowPwd((s) => !s)} className={classes.tinyBtn}>
                      {showPwd ? "Hide" : "Show"}
                    </button>
                  </span>
                  <input
                    type={showPwd ? "text" : "password"}
                    required
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={classes.input}
                    placeholder={mode === "signin" ? "Your password" : "Create a strong password"}
                    minLength={6}
                  />
                </label>

                <button
                  type="submit"
                  disabled={!canSubmit || connectionStatus === "offline" || busy}
                  className={classes.primaryBtn}
                >
                  {mode === "signin" ? (busy ? "Signing in…" : "Sign in") : busy ? "Creating…" : "Create account"}
                </button>
              </form>

              <div className="flex items-center justify-between text-[13px] text-gray-300">
                <div className="flex gap-3">
                  {mode !== "signin" && (
                    <button
                      className={classes.tinyBtn}
                      onClick={() => {
                        setMode("signin");
                        setError(null);
                        setMsg(null);
                      }}
                    >
                      Use password
                    </button>
                  )}
                  {mode !== "signup" && (
                    <button
                      className={classes.tinyBtn}
                      onClick={() => {
                        setMode("signup");
                        setError(null);
                        setMsg(null);
                      }}
                    >
                      Create account
                    </button>
                  )}
                </div>

                <button className={classes.tinyBtn} onClick={tryFinish} disabled={busy}>
                  Finish sign-in
                </button>
              </div>
            </div>

          </>
        )}

        {showUsernameStep && (
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Choose Your Username</h2>
              <p className="text-sm text-gray-400 mb-4">
                Pick a unique username to identify yourself in grids and make it easier for others to find you.
              </p>
            </div>

            <UsernamePicker
              onUsernameSelected={setSelectedUsername}
              disabled={busy}
              placeholder="Enter your username"
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedUsername(undefined);
                  handleUsernameStepComplete();
                }}
                disabled={busy}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-xl disabled:opacity-50"
              >
                Skip for now
              </button>

              <button
                onClick={handleUsernameStepComplete}
                disabled={busy || !selectedUsername}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] text-white rounded-xl disabled:opacity-50"
              >
                {busy ? 'Creating account...' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {showTOSStep && (
          <TOSAcceptance
            onAccept={handleTOSAccept}
            onDecline={handleTOSDecline}
            disabled={busy}
          />
        )}

        {connectionStatus === "offline" && (
          <p className="text-red-400 text-sm">Offline mode • limited functionality available</p>
        )}
      </div>
    </div>
  );
}