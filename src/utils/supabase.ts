import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pepsufkvgfwymtmrjkna.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlcHN1Zmt2Z2Z3eW10bXJqa25hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzkwNTgsImV4cCI6MjA3MDg1NTA1OH0.3qxsJ0KNZQei9gBitcyIGsKggkKyGYxNttqMfsqHkHM';

let supabaseClient;

try {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: window.localStorage,
      storageKey: 'roguegrid9-auth',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // Disabled for Tauri - we handle OAuth manually
      flowType: 'pkce'
    }
  });
  console.log('Supabase client initialized successfully');
} catch (error) {
  console.error('Failed to initialize Supabase client:', error);
  // Create a minimal fallback client
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: window.localStorage,
      storageKey: 'roguegrid9-auth',
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      flowType: 'pkce'
    }
  });
}

export const supabase = supabaseClient;