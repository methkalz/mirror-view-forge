import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

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

// ─── Audio Config ───

export type PlayMode = 'single' | 'random' | 'sequential' | 'loop';

export interface AudioFileEntry {
  id: string;
  soundConfigId: string;
  fileUrl: string;
  fileName: string;
  sortOrder: number;
}

export interface AudioConfigEntry {
  id: string;
  soundKey: string;
  category: string;
  label: string;
  labelAr: string;
  volume: number;
  enabled: boolean;
  audioUrl: string | null;
  playMode: PlayMode;
  intervalSeconds: number | null;
  maxConcurrent: number;
  files: AudioFileEntry[];
}

export async function fetchAudioConfig(): Promise<AudioConfigEntry[]> {
  try {
    const [configRes, filesRes] = await Promise.all([
      supabase.from('audio_config').select('*').order('category', { ascending: true }),
      supabase.from('audio_files').select('*').order('sort_order', { ascending: true }),
    ]);
    if (configRes.error || !configRes.data) return [];
    const filesData = filesRes.data || [];

    // Group files by config id
    const filesMap = new Map<string, AudioFileEntry[]>();
    for (const f of filesData) {
      const entry: AudioFileEntry = {
        id: f.id,
        soundConfigId: f.sound_config_id,
        fileUrl: f.file_url,
        fileName: f.file_name,
        sortOrder: f.sort_order,
      };
      const arr = filesMap.get(f.sound_config_id) || [];
      arr.push(entry);
      filesMap.set(f.sound_config_id, arr);
    }

    return configRes.data.map(r => ({
      id: r.id,
      soundKey: r.sound_key,
      category: r.category,
      label: r.label,
      labelAr: r.label_ar,
      volume: r.volume,
      enabled: r.enabled,
      audioUrl: (r as any).audio_url ?? null,
      playMode: ((r as any).play_mode || 'single') as PlayMode,
      intervalSeconds: (r as any).interval_seconds ?? null,
      maxConcurrent: (r as any).max_concurrent ?? 1,
      files: filesMap.get(r.id) || [],
    }));
  } catch {
    return [];
  }
}

export async function updateAudioEntry(id: string, updates: {
  volume?: number; enabled?: boolean; audioUrl?: string | null;
  playMode?: PlayMode; intervalSeconds?: number | null; maxConcurrent?: number;
}): Promise<boolean> {
  const mapped: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.volume !== undefined) mapped.volume = updates.volume;
  if (updates.enabled !== undefined) mapped.enabled = updates.enabled;
  if (updates.audioUrl !== undefined) mapped.audio_url = updates.audioUrl;
  if (updates.playMode !== undefined) mapped.play_mode = updates.playMode;
  if (updates.intervalSeconds !== undefined) mapped.interval_seconds = updates.intervalSeconds;
  if (updates.maxConcurrent !== undefined) mapped.max_concurrent = updates.maxConcurrent;
  const { error } = await supabase.from('audio_config').update(mapped).eq('id', id);
  return !error;
}

export async function addAudioFile(soundConfigId: string, fileUrl: string, fileName: string, sortOrder: number): Promise<AudioFileEntry | null> {
  const { data, error } = await supabase.from('audio_files').insert({
    sound_config_id: soundConfigId,
    file_url: fileUrl,
    file_name: fileName,
    sort_order: sortOrder,
  }).select().single();
  if (error || !data) return null;
  return { id: data.id, soundConfigId: data.sound_config_id, fileUrl: data.file_url, fileName: data.file_name, sortOrder: data.sort_order };
}

export async function removeAudioFile(id: string): Promise<boolean> {
  const { error } = await supabase.from('audio_files').delete().eq('id', id);
  return !error;
}

export async function uploadAudioFile(file: File, soundKey: string): Promise<{ url: string; name: string } | null> {
  const ext = file.name.split('.').pop() || 'mp3';
  const path = `${soundKey}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('game-audio').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) return null;
  const { data } = supabase.storage.from('game-audio').getPublicUrl(path);
  return { url: data.publicUrl, name: file.name };
}

export async function deleteAudioFile(url: string): Promise<boolean> {
  const match = url.match(/game-audio\/(.+)$/);
  if (!match) return false;
  const { error } = await supabase.storage.from('game-audio').remove([match[1]]);
  return !error;
}

export async function listAudioLibrary(): Promise<{ name: string; url: string }[]> {
  const { data, error } = await supabase.storage.from('game-audio').list('', { limit: 200 });
  if (error || !data) return [];
  return data
    .filter(f => f.name && !f.name.startsWith('.'))
    .map(f => ({
      name: f.name,
      url: supabase.storage.from('game-audio').getPublicUrl(f.name).data.publicUrl,
    }));
}

export async function updateAudioCategory(category: string, updates: { volume?: number; enabled?: boolean }): Promise<boolean> {
  const mapped: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.volume !== undefined) mapped.volume = updates.volume;
  if (updates.enabled !== undefined) mapped.enabled = updates.enabled;
  const { error } = await supabase.from('audio_config').update(mapped).eq('category', category);
  return !error;
}
