import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://musjoqntygjpxxlmibqr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11c2pvcW50eWdqcHh4bG1pYnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjUyMDMsImV4cCI6MjA5MDMwMTIwM30.lLH7EUCoNivsDeDXBYfzWkLWOBlw3ivj8Plrad__GTM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParentalSettings {
  user_id: string;
  interests: string[];
  toxic_keywords: string[];
  pin_hash: string | null;
  locked: boolean;
  updated_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(pin),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Supabase operations ──────────────────────────────────────────────────────

export async function fetchSettings(
  userId: string,
): Promise<ParentalSettings | null> {
  const { data, error } = await supabase
    .from('parental_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as ParentalSettings | null;
}

export async function upsertSettings(
  settings: Omit<ParentalSettings, 'updated_at'>,
): Promise<void> {
  const { error } = await supabase.from('parental_settings').upsert(
    { ...settings, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}
