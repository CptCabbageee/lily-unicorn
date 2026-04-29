/*
 * MIGRATION SQL — run once in Supabase Dashboard > SQL Editor:
 *
 *   create table if not exists player_progress (
 *     id            uuid default gen_random_uuid() primary key,
 *     user_id       uuid references auth.users(id) on delete cascade not null unique,
 *     current_level integer default 1 not null,
 *     total_score   integer default 0 not null,
 *     best_score    integer default 0 not null,
 *     updated_at    timestamptz default now() not null
 *   );
 *   alter table player_progress enable row level security;
 *   create policy "users manage own row" on player_progress
 *     using  (auth.uid() = user_id)
 *     with check (auth.uid() = user_id);
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface PlayerProgress {
  user_id: string;
  current_level: number;
  total_score: number;
  best_score: number;
}

export async function loadProgress(userId: string): Promise<PlayerProgress | null> {
  const { data, error } = await supabase
    .from('player_progress')
    .select('user_id, current_level, total_score, best_score')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  return data as PlayerProgress;
}

export async function upsertProgress(progress: PlayerProgress): Promise<void> {
  await supabase
    .from('player_progress')
    .upsert({ ...progress, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}
