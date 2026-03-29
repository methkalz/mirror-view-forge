import { supabase } from '@/integrations/supabase/client';

export interface RemoteGameConfig {
  gravity: number;
  baseSpeed: number;
  spawnInterval: number;
  difficultyMultiplier: number;
  ddaEnabled: boolean;
  globalPause: boolean;
}

export interface RemoteWaveConfig {
  waveNumber: number;
  duration: number;
  threats: string[];
  maxConcurrent: number;
  spawnRate: number;
  surgeMultiplier: number;
  droneTypes: string[];
}

export interface LeaderboardEntry {
  id: string;
  playerName: string;
  score: number;
  wavesReached: number;
  levelReached: number;
  createdAt: string;
}

// Defaults used when DB is unreachable
const DEFAULT_CONFIG: RemoteGameConfig = {
  gravity: 1.0,
  baseSpeed: 260,
  spawnInterval: 3.5,
  difficultyMultiplier: 1.0,
  ddaEnabled: true,
  globalPause: false,
};

export async function fetchGameConfig(): Promise<RemoteGameConfig> {
  try {
    const { data, error } = await supabase
      .from('game_config')
      .select('*')
      .limit(1)
      .single();
    if (error || !data) return DEFAULT_CONFIG;
    return {
      gravity: data.gravity,
      baseSpeed: data.base_speed,
      spawnInterval: data.spawn_interval,
      difficultyMultiplier: data.difficulty_multiplier,
      ddaEnabled: data.dda_enabled,
      globalPause: data.global_pause,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function fetchWaveConfigs(): Promise<RemoteWaveConfig[]> {
  try {
    const { data, error } = await supabase
      .from('wave_configs')
      .select('*')
      .order('wave_number', { ascending: true });
    if (error || !data) return [];
    return data.map(w => ({
      waveNumber: w.wave_number,
      duration: w.duration,
      threats: (w.threats as string[]) || ['shrapnel'],
      maxConcurrent: w.max_concurrent,
      spawnRate: w.spawn_rate,
      surgeMultiplier: w.surge_multiplier,
      droneTypes: (w.drone_types as string[]) || [],
    }));
  } catch {
    return [];
  }
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .order('score', { ascending: false })
      .limit(10);
    if (error || !data) return [];
    return data.map(e => ({
      id: e.id,
      playerName: e.player_name,
      score: e.score,
      wavesReached: e.waves_reached,
      levelReached: e.level_reached,
      createdAt: e.created_at,
    }));
  } catch {
    return [];
  }
}

export async function submitScore(
  playerName: string,
  score: number,
  wavesReached: number,
  levelReached: number
): Promise<{ rank: number | null }> {
  try {
    await supabase.from('leaderboard').insert({
      player_name: playerName.slice(0, 20),
      score,
      waves_reached: wavesReached,
      level_reached: levelReached,
    });

    // Get rank
    const { count } = await supabase
      .from('leaderboard')
      .select('*', { count: 'exact', head: true })
      .gt('score', score);
    
    return { rank: (count ?? 0) + 1 };
  } catch {
    return { rank: null };
  }
}

export async function deleteLeaderboardEntry(id: string): Promise<boolean> {
  const { error } = await supabase.from('leaderboard').delete().eq('id', id);
  return !error;
}

export async function clearLeaderboard(): Promise<boolean> {
  const { error } = await supabase.from('leaderboard').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  return !error;
}

export async function updateGameConfig(config: Partial<RemoteGameConfig>): Promise<boolean> {
  const mapped: Record<string, unknown> = {};
  if (config.gravity !== undefined) mapped.gravity = config.gravity;
  if (config.baseSpeed !== undefined) mapped.base_speed = config.baseSpeed;
  if (config.spawnInterval !== undefined) mapped.spawn_interval = config.spawnInterval;
  if (config.difficultyMultiplier !== undefined) mapped.difficulty_multiplier = config.difficultyMultiplier;
  if (config.ddaEnabled !== undefined) mapped.dda_enabled = config.ddaEnabled;
  if (config.globalPause !== undefined) mapped.global_pause = config.globalPause;

  const { data: rows } = await supabase.from('game_config').select('id').limit(1);
  if (!rows || rows.length === 0) return false;
  
  const { error } = await supabase.from('game_config').update(mapped).eq('id', rows[0].id);
  return !error;
}

export async function upsertWaveConfig(wave: RemoteWaveConfig): Promise<boolean> {
  // Check if exists
  const { data: existing } = await supabase
    .from('wave_configs')
    .select('id')
    .eq('wave_number', wave.waveNumber)
    .maybeSingle();

  const payload = {
    wave_number: wave.waveNumber,
    duration: wave.duration,
    threats: wave.threats as unknown as Json,
    max_concurrent: wave.maxConcurrent,
    spawn_rate: wave.spawnRate,
    surge_multiplier: wave.surgeMultiplier,
    drone_types: wave.droneTypes as unknown as Json,
  };

  if (existing) {
    const { error } = await supabase.from('wave_configs').update(payload).eq('id', existing.id);
    return !error;
  } else {
    const { error } = await supabase.from('wave_configs').insert(payload);
    return !error;
  }
}

export async function deleteWaveConfig(waveNumber: number): Promise<boolean> {
  const { error } = await supabase.from('wave_configs').delete().eq('wave_number', waveNumber);
  return !error;
}
