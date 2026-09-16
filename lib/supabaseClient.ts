import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

let anonymousSessionPromise: Promise<string | null> | null = null;

export async function ensureAnonymousSession(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  if (!anonymousSessionPromise) {
    anonymousSessionPromise = (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) return session.user.id;
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.warn('[supabase] anonymous sign-in failed:', error.message);
        return null;
      }
      return data.user?.id ?? null;
    })();
  }
  return anonymousSessionPromise;
}
