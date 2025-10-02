import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pepsufkvgfwymtmrjkna.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlcHN1Zmt2Z2Z3eW10bXJqa25hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzkwNTgsImV4cCI6MjA3MDg1NTA1OH0.3qxsJ0KNZQei9gBitcyIGsKggkKyGYxNttqMfsqHkHM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: window.localStorage,
    storageKey: 'roguegrid9-auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
});