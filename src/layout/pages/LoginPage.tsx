import { useCallback, useMemo, useState, useEffect } from "react";
import UsernamePicker from './UsernamePicker';
import { supabase } from "../../utils/supabase";
import { useTauriCommands } from "../../hooks/useTauriCommands";

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
    "w-full rounded-xl px-4 py-2 font-semibold bg-[#111319] border border-white/10 text-gray-200 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed",
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
  const canSubmit = useMemo(() => email && password.length >= 6, [email, password]);

  const {
    promoteAccount,
    promoteAccountWithUsername,
    getUserState,
    initializeApp,
  } = useTauriCommands();

  // Check for OAuth callback on mount
  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        setIsCheckingAuth(true);
        console.log('Checking for OAuth callback...');
        
        // Initialize app first
        await initializeApp();
        
        // Check URL for OAuth callback
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

  // Setup auth state change listener
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);
      
      if (event === 'SIGNED_IN' && session?.access_token) {
        try {
          console.log('Signed in event detected, promoting account...');
          await promoteAccount(session.access_token);
          const userState = await getUserState();
          onSessionCreated(userState);
        } catch (error) {
          console.error('Failed to handle sign-in event:', error);
          setError(`Failed to complete sign-in: ${error}`);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [promoteAccount, getUserState, onSessionCreated]);

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

      if (selectedUsername) {
        await promoteAccountWithUsername(pendingSupabaseToken, selectedUsername);
      } else {
        await promoteAccount(pendingSupabaseToken);
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

  // Email/password submit
  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: 'http://localhost:1420' },
        });
        if (error) throw error;
        if (data.user && !data.session) {
          setMsg("Verification email sent. Confirm to finish setup.");
          return;
        }
        const done = await promoteIfPossible();
        if (!done) setMsg("Account created. If not redirected, try again.");
        return;
      }

      // signin
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const done = await promoteIfPossible();
      if (!done) setMsg("Signed in. If not redirected, try again.");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [canSubmit, email, password, mode, promoteIfPossible]);

  // OAuth
  const doOAuth = useCallback(async (provider: "google" | "github") => {
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      // Use localhost for OAuth redirect (works better with Tauri)
      const redirectUrl = 'http://localhost:1420';

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          queryParams: { prompt: "select_account" }
        },
      });
      if (error) throw error;
      setMsg("Opening provider… After signing in, you may need to refresh the app.");
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setBusy(false);
    }
    // Don't set busy to false here - let the auth callback handle it
  }, []);

  const tryFinish = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const done = await promoteIfPossible();
      if (!done) setMsg("No active session found yet. Complete the provider flow or sign in.");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [promoteIfPossible]);

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

        {!showUsernameStep && (
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
                  Continue with Google
                </button>
                <button
                  type="button"
                  disabled={connectionStatus === "offline" || busy}
                  onClick={() => doOAuth("github")}
                  className={classes.secondaryBtn}
                >
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

        {connectionStatus === "offline" && (
          <p className="text-red-400 text-sm">Offline mode • limited functionality available</p>
        )}
      </div>
    </div>
  );
}