import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface RemoteGameConfig {
  gravity: number;
  baseSpeed: number;
  spawnInterval: number;
  difficultyMultiplier: number;
  ddaEnabled: boolean;
  globalPause: boolean;
  // Branding
  logoUrl: string | null;
  gameTitle: string;
  gameSubtitle: string;
  developerName: string;
  developerUrl: string | null;
  showTitle: boolean;
  cameraMargin: number;
  bgLoop: boolean;
  bgLoopFadeDuration: number;
}

export interface RemoteWaveConfig {
  waveNumber: number;
  duration: number;
  threats: string[];
  maxConcurrent: number;
  spawnRate: number;
  surgeMultiplier: number;
  droneTypes: string[];
  clusterSplits: number;
  bulletLevel: number;
  phaseInDelay: number;
  droneInterval: number;
  hasBoss: boolean;
  hasChemical: boolean;
  hasIncendiary: boolean;
  warningText: string | null;
  warningColor: string;
  warningType: string;
  warningSoundKey: string | null;
}

export interface DifficultyProfile {
  id: string;
  baseMaxConcurrent: number;
  maxConcurrentCap: number;
  concurrentGrowth: number;
  baseSpawnInterval: number;
  minSpawnInterval: number;
  spawnIntervalDecay: number;
  threatsUnlock: Record<string, number>;
  dronesUnlock: Record<string, number>;
  clusterSplitsBase: number;
  clusterSplitsGrowth: number;
  clusterSplitsCap: number;
  droneIntervalBase: number;
  droneIntervalMin: number;
  droneIntervalDecay: number;
  bossEveryNWaves: number;
  bossStartWave: number;
  bulletLevelWaves: Record<string, number>;
  waveDuration: number;
  phaseInDelay: number;
  scalingFormula: string;
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
  logoUrl: null,
  gameTitle: 'SKYFALL',
  gameSubtitle: 'SURVIVAL',
  developerName: 'CAILOR GG',
  developerUrl: null,
  showTitle: true,
  cameraMargin: 400,
  bgLoop: false,
  bgLoopFadeDuration: 60,
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
      logoUrl: (data as any).logo_url ?? null,
      gameTitle: (data as any).game_title ?? 'SKYFALL',
      gameSubtitle: (data as any).game_subtitle ?? 'SURVIVAL',
      developerName: (data as any).developer_name ?? 'CAILOR GG',
      developerUrl: (data as any).developer_url ?? null,
      showTitle: (data as any).show_title ?? true,
      cameraMargin: (data as any).camera_margin ?? 400,
      bgLoop: (data as any).bg_loop ?? false,
      bgLoopFadeDuration: (data as any).bg_loop_fade_duration ?? 60,
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
    return data.map((w: any) => ({
      waveNumber: w.wave_number,
      duration: w.duration,
      threats: (w.threats as string[]) || ['shrapnel'],
      maxConcurrent: w.max_concurrent,
      spawnRate: w.spawn_rate,
      surgeMultiplier: w.surge_multiplier,
      droneTypes: (w.drone_types as string[]) || [],
      clusterSplits: w.cluster_splits ?? 0,
      bulletLevel: w.bullet_level ?? 1,
      phaseInDelay: w.phase_in_delay ?? 0,
      droneInterval: w.drone_interval ?? 0,
      hasBoss: w.has_boss ?? false,
      hasChemical: w.has_chemical ?? false,
      hasIncendiary: w.has_incendiary ?? false,
      warningText: w.warning_text ?? null,
      warningColor: w.warning_color ?? '#ef4444',
      warningType: w.warning_type ?? 'warning',
      warningSoundKey: w.warning_sound_key ?? null,
    }));
  } catch {
    return [];
  }
}

const DEFAULT_DIFFICULTY: DifficultyProfile = {
  id: '',
  baseMaxConcurrent: 3,
  maxConcurrentCap: 15,
  concurrentGrowth: 0.5,
  baseSpawnInterval: 2.5,
  minSpawnInterval: 0.5,
  spawnIntervalDecay: 0.1,
  threatsUnlock: { shrapnel: 1, missile: 2, cluster: 4 },
  dronesUnlock: { scout: 5, tracker: 7, bomber: 9, chemical: 10, incendiary: 11 },
  clusterSplitsBase: 2,
  clusterSplitsGrowth: 0.3,
  clusterSplitsCap: 8,
  droneIntervalBase: 25,
  droneIntervalMin: 6,
  droneIntervalDecay: 0.8,
  bossEveryNWaves: 6,
  bossStartWave: 12,
  bulletLevelWaves: { '2': 3, '3': 8 },
  waveDuration: 60,
  phaseInDelay: 12,
  scalingFormula: 'linear',
};

export async function fetchDifficultyProfile(): Promise<DifficultyProfile> {
  try {
    const { data, error } = await supabase
      .from('difficulty_profile')
      .select('*')
      .limit(1)
      .single();
    if (error || !data) return DEFAULT_DIFFICULTY;
    return {
      id: (data as any).id,
      baseMaxConcurrent: (data as any).base_max_concurrent ?? 3,
      maxConcurrentCap: (data as any).max_concurrent_cap ?? 15,
      concurrentGrowth: (data as any).concurrent_growth ?? 0.5,
      baseSpawnInterval: (data as any).base_spawn_interval ?? 2.5,
      minSpawnInterval: (data as any).min_spawn_interval ?? 0.5,
      spawnIntervalDecay: (data as any).spawn_interval_decay ?? 0.1,
      threatsUnlock: (data as any).threats_unlock ?? { shrapnel: 1, missile: 2, cluster: 4 },
      dronesUnlock: (data as any).drones_unlock ?? { scout: 5, tracker: 7, bomber: 9, chemical: 10, incendiary: 11 },
      clusterSplitsBase: (data as any).cluster_splits_base ?? 2,
      clusterSplitsGrowth: (data as any).cluster_splits_growth ?? 0.3,
      clusterSplitsCap: (data as any).cluster_splits_cap ?? 8,
      droneIntervalBase: (data as any).drone_interval_base ?? 25,
      droneIntervalMin: (data as any).drone_interval_min ?? 6,
      droneIntervalDecay: (data as any).drone_interval_decay ?? 0.8,
      bossEveryNWaves: (data as any).boss_every_n_waves ?? 6,
      bossStartWave: (data as any).boss_start_wave ?? 12,
      bulletLevelWaves: (data as any).bullet_level_waves ?? { '2': 3, '3': 8 },
      waveDuration: (data as any).wave_duration ?? 60,
      phaseInDelay: (data as any).phase_in_delay ?? 12,
      scalingFormula: (data as any).scaling_formula ?? 'linear',
    };
  } catch {
    return DEFAULT_DIFFICULTY;
  }
}

export async function updateDifficultyProfile(profile: Partial<DifficultyProfile>): Promise<boolean> {
  const mapped: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (profile.baseMaxConcurrent !== undefined) mapped.base_max_concurrent = profile.baseMaxConcurrent;
  if (profile.maxConcurrentCap !== undefined) mapped.max_concurrent_cap = profile.maxConcurrentCap;
  if (profile.concurrentGrowth !== undefined) mapped.concurrent_growth = profile.concurrentGrowth;
  if (profile.baseSpawnInterval !== undefined) mapped.base_spawn_interval = profile.baseSpawnInterval;
  if (profile.minSpawnInterval !== undefined) mapped.min_spawn_interval = profile.minSpawnInterval;
  if (profile.spawnIntervalDecay !== undefined) mapped.spawn_interval_decay = profile.spawnIntervalDecay;
  if (profile.threatsUnlock !== undefined) mapped.threats_unlock = profile.threatsUnlock;
  if (profile.dronesUnlock !== undefined) mapped.drones_unlock = profile.dronesUnlock;
  if (profile.clusterSplitsBase !== undefined) mapped.cluster_splits_base = profile.clusterSplitsBase;
  if (profile.clusterSplitsGrowth !== undefined) mapped.cluster_splits_growth = profile.clusterSplitsGrowth;
  if (profile.clusterSplitsCap !== undefined) mapped.cluster_splits_cap = profile.clusterSplitsCap;
  if (profile.droneIntervalBase !== undefined) mapped.drone_interval_base = profile.droneIntervalBase;
  if (profile.droneIntervalMin !== undefined) mapped.drone_interval_min = profile.droneIntervalMin;
  if (profile.droneIntervalDecay !== undefined) mapped.drone_interval_decay = profile.droneIntervalDecay;
  if (profile.bossEveryNWaves !== undefined) mapped.boss_every_n_waves = profile.bossEveryNWaves;
  if (profile.bossStartWave !== undefined) mapped.boss_start_wave = profile.bossStartWave;
  if (profile.bulletLevelWaves !== undefined) mapped.bullet_level_waves = profile.bulletLevelWaves;
  if (profile.waveDuration !== undefined) mapped.wave_duration = profile.waveDuration;
  if (profile.phaseInDelay !== undefined) mapped.phase_in_delay = profile.phaseInDelay;
  if (profile.scalingFormula !== undefined) mapped.scaling_formula = profile.scalingFormula;

  const { data: rows } = await supabase.from('difficulty_profile' as any).select('id').limit(1);
  if (!rows || rows.length === 0) return false;
  const { error } = await supabase.from('difficulty_profile' as any).update(mapped).eq('id', (rows as any)[0].id);
  return !error;
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
  levelReached: number,
  stats?: { timeSurvived?: number; dronesDestroyed?: number; powerUpsCollected?: number; closeCalls?: number; bossesDefeated?: number }
): Promise<{ rank: number | null }> {
  try {
    // Insert leaderboard entry
    await supabase.from('leaderboard').insert({
      player_name: playerName.slice(0, 20),
      score,
      waves_reached: wavesReached,
      level_reached: levelReached,
    });

    // Insert session analytics
    await supabase.from('game_sessions').insert({
      player_name: playerName.slice(0, 20),
      score,
      waves_reached: wavesReached,
      level_reached: levelReached,
      duration_seconds: stats?.timeSurvived ?? 0,
      drones_destroyed: stats?.dronesDestroyed ?? 0,
      powerups_collected: stats?.powerUpsCollected ?? 0,
      close_calls: stats?.closeCalls ?? 0,
      bosses_defeated: stats?.bossesDefeated ?? 0,
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

// ─── Analytics Queries ───

export interface GameAnalytics {
  totalSessions: number;
  uniquePlayers: number;
  totalPlayTime: number;
  avgScore: number;
  avgDuration: number;
  avgWaves: number;
  maxScore: number;
  maxWaves: number;
  maxDuration: number;
  sessionsToday: number;
  sessionsThisWeek: number;
  topPlayers: { name: string; games: number; avgScore: number; bestScore: number; totalTime: number }[];
  recentSessions: { playerName: string; score: number; waves: number; duration: number; createdAt: string }[];
  hourlyDistribution: { hour: number; count: number }[];
  retentionData: { players1Game: number; players3Games: number; players5Games: number; players10Games: number };
}

export async function fetchAnalytics(): Promise<GameAnalytics> {
  try {
    const { data: sessions } = await supabase
      .from('game_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    const all = sessions || [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();

    const sessionsToday = all.filter(s => s.created_at >= todayStart).length;
    const sessionsThisWeek = all.filter(s => s.created_at >= weekStart).length;

    // Unique players
    const playerMap = new Map<string, typeof all>();
    for (const s of all) {
      const arr = playerMap.get(s.player_name) || [];
      arr.push(s);
      playerMap.set(s.player_name, arr);
    }

    const totalDuration = all.reduce((a, s) => a + (s.duration_seconds || 0), 0);
    const totalScore = all.reduce((a, s) => a + s.score, 0);

    // Top players by avg score
    const topPlayers = Array.from(playerMap.entries())
      .map(([name, games]) => ({
        name,
        games: games.length,
        avgScore: Math.round(games.reduce((a, g) => a + g.score, 0) / games.length),
        bestScore: Math.max(...games.map(g => g.score)),
        totalTime: Math.round(games.reduce((a, g) => a + (g.duration_seconds || 0), 0)),
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10);

    // Hourly distribution
    const hourCounts = new Array(24).fill(0);
    for (const s of all) {
      const h = new Date(s.created_at).getHours();
      hourCounts[h]++;
    }

    // Retention
    const players1 = Array.from(playerMap.values()).filter(g => g.length >= 1).length;
    const players3 = Array.from(playerMap.values()).filter(g => g.length >= 3).length;
    const players5 = Array.from(playerMap.values()).filter(g => g.length >= 5).length;
    const players10 = Array.from(playerMap.values()).filter(g => g.length >= 10).length;

    return {
      totalSessions: all.length,
      uniquePlayers: playerMap.size,
      totalPlayTime: totalDuration,
      avgScore: all.length > 0 ? Math.round(totalScore / all.length) : 0,
      avgDuration: all.length > 0 ? Math.round(totalDuration / all.length) : 0,
      avgWaves: all.length > 0 ? Math.round(all.reduce((a, s) => a + s.waves_reached, 0) / all.length * 10) / 10 : 0,
      maxScore: all.length > 0 ? Math.max(...all.map(s => s.score)) : 0,
      maxWaves: all.length > 0 ? Math.max(...all.map(s => s.waves_reached)) : 0,
      maxDuration: all.length > 0 ? Math.max(...all.map(s => s.duration_seconds || 0)) : 0,
      sessionsToday,
      sessionsThisWeek,
      topPlayers,
      recentSessions: all.slice(0, 20).map(s => ({
        playerName: s.player_name,
        score: s.score,
        waves: s.waves_reached,
        duration: Math.round(s.duration_seconds || 0),
        createdAt: s.created_at,
      })),
      hourlyDistribution: hourCounts.map((count, hour) => ({ hour, count })),
      retentionData: { players1Game: players1, players3Games: players3, players5Games: players5, players10Games: players10 },
    };
  } catch {
    return {
      totalSessions: 0, uniquePlayers: 0, totalPlayTime: 0, avgScore: 0, avgDuration: 0, avgWaves: 0,
      maxScore: 0, maxWaves: 0, maxDuration: 0, sessionsToday: 0, sessionsThisWeek: 0,
      topPlayers: [], recentSessions: [], hourlyDistribution: [], retentionData: { players1Game: 0, players3Games: 0, players5Games: 0, players10Games: 0 },
    };
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
  if (config.logoUrl !== undefined) mapped.logo_url = config.logoUrl;
  if (config.gameTitle !== undefined) mapped.game_title = config.gameTitle;
  if (config.gameSubtitle !== undefined) mapped.game_subtitle = config.gameSubtitle;
  if (config.developerName !== undefined) mapped.developer_name = config.developerName;
  if (config.developerUrl !== undefined) mapped.developer_url = config.developerUrl;
  if (config.showTitle !== undefined) mapped.show_title = config.showTitle;
  if (config.cameraMargin !== undefined) mapped.camera_margin = config.cameraMargin;
  if (config.bgLoop !== undefined) mapped.bg_loop = config.bgLoop;
  if (config.bgLoopFadeDuration !== undefined) mapped.bg_loop_fade_duration = config.bgLoopFadeDuration;

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

  const payload: Record<string, unknown> = {
    wave_number: wave.waveNumber,
    duration: wave.duration,
    threats: wave.threats as unknown as Json,
    max_concurrent: wave.maxConcurrent,
    spawn_rate: wave.spawnRate,
    surge_multiplier: wave.surgeMultiplier,
    drone_types: wave.droneTypes as unknown as Json,
    cluster_splits: wave.clusterSplits,
    bullet_level: wave.bulletLevel,
    phase_in_delay: wave.phaseInDelay,
    drone_interval: wave.droneInterval,
    has_boss: wave.hasBoss,
    has_chemical: wave.hasChemical,
    has_incendiary: wave.hasIncendiary,
    warning_text: wave.warningText,
    warning_color: wave.warningColor,
    warning_type: wave.warningType,
  };

  if (existing) {
    const { error } = await supabase.from('wave_configs').update(payload as any).eq('id', existing.id);
    return !error;
  } else {
    const { error } = await supabase.from('wave_configs').insert(payload as any);
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
  volume: number;
}

export type VolumeMode = 'group' | 'individual';

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
  allowOverlap: boolean;
  volumeMode: VolumeMode;
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
        volume: (f as any).volume ?? 1.0,
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
      allowOverlap: (r as any).allow_overlap ?? false,
      volumeMode: ((r as any).volume_mode || 'group') as VolumeMode,
      files: filesMap.get(r.id) || [],
    }));
  } catch {
    return [];
  }
}

export async function updateAudioEntry(id: string, updates: {
  volume?: number; enabled?: boolean; audioUrl?: string | null;
  playMode?: PlayMode; intervalSeconds?: number | null; maxConcurrent?: number;
  allowOverlap?: boolean; volumeMode?: VolumeMode;
}): Promise<boolean> {
  const mapped: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.volume !== undefined) mapped.volume = updates.volume;
  if (updates.enabled !== undefined) mapped.enabled = updates.enabled;
  if (updates.audioUrl !== undefined) mapped.audio_url = updates.audioUrl;
  if (updates.playMode !== undefined) mapped.play_mode = updates.playMode;
  if (updates.intervalSeconds !== undefined) mapped.interval_seconds = updates.intervalSeconds;
  if (updates.maxConcurrent !== undefined) mapped.max_concurrent = updates.maxConcurrent;
  if (updates.allowOverlap !== undefined) mapped.allow_overlap = updates.allowOverlap;
  if (updates.volumeMode !== undefined) mapped.volume_mode = updates.volumeMode;
  const { error } = await supabase.from('audio_config').update(mapped).eq('id', id);
  return !error;
}

export async function updateAudioFileVolume(fileId: string, volume: number): Promise<boolean> {
  const { error } = await supabase.from('audio_files').update({ volume } as any).eq('id', fileId);
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
  return { id: data.id, soundConfigId: data.sound_config_id, fileUrl: data.file_url, fileName: data.file_name, sortOrder: data.sort_order, volume: (data as any).volume ?? 1.0 };
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

export async function createAudioEntry(entry: {
  soundKey: string; category: string; label: string; labelAr: string;
  intervalSeconds?: number; playMode?: PlayMode;
}): Promise<AudioConfigEntry | null> {
  const { data, error } = await supabase.from('audio_config').insert({
    sound_key: entry.soundKey,
    category: entry.category,
    label: entry.label,
    label_ar: entry.labelAr,
    volume: 1.0,
    enabled: true,
    play_mode: entry.playMode || 'single',
    max_concurrent: 1,
    interval_seconds: entry.intervalSeconds ?? null,
  }).select().single();
  if (error || !data) return null;
  return {
    id: data.id,
    soundKey: data.sound_key,
    category: data.category,
    label: data.label,
    labelAr: data.label_ar,
    volume: data.volume,
    enabled: data.enabled,
    audioUrl: data.audio_url,
    playMode: (data.play_mode || 'single') as PlayMode,
    intervalSeconds: data.interval_seconds,
    maxConcurrent: data.max_concurrent,
    allowOverlap: (data as any).allow_overlap ?? false,
    volumeMode: ((data as any).volume_mode || 'group') as VolumeMode,
    files: [],
  };
}

export async function deleteAudioEntry(id: string): Promise<boolean> {
  // Delete associated files first
  await supabase.from('audio_files').delete().eq('sound_config_id', id);
  const { error } = await supabase.from('audio_config').delete().eq('id', id);
  return !error;
}
