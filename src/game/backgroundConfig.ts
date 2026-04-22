import { supabase } from '@/integrations/supabase/client';

export type DisplayMode = 'single' | 'tiled' | 'blur-edge';

export interface Scene {
  id: string;
  name: string;
  sortOrder: number;
}

export interface BackgroundPhase {
  id: string;
  phase: string;
  imageUrl: string | null;
  transitionStart: number;
  transitionEnd: number;
  overlayTop: string;
  overlayMid: string;
  overlayBottom: string;
  overlayOpacity: number;
  sortOrder: number;
  fadeDuration: number;
  easingType: string;
  displayMode: DisplayMode;
  bgMargin: number;
  sceneId: string;
}

export async function fetchBackgroundConfig(): Promise<BackgroundPhase[]> {
  try {
    const { data, error } = await supabase
      .from('background_config')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error || !data) return [];
    return data.map(r => ({
      id: r.id,
      phase: r.phase,
      imageUrl: r.image_url,
      transitionStart: r.transition_start,
      transitionEnd: r.transition_end,
      overlayTop: r.overlay_top ?? '12,20,69',
      overlayMid: r.overlay_mid ?? '26,16,46',
      overlayBottom: r.overlay_bottom ?? '26,10,46',
      overlayOpacity: r.overlay_opacity ?? 0.4,
      sortOrder: r.sort_order ?? 0,
      fadeDuration: r.fade_duration ?? 60,
      easingType: r.easing_type ?? 'smoothstep',
      displayMode: ((r as any).display_mode || 'single') as DisplayMode,
      bgMargin: (r as any).bg_margin ?? 400,
      sceneId: (r as any).scene_id ?? '00000000-0000-0000-0000-000000000001',
    }));
  } catch {
    return [];
  }
}

export async function updateBackgroundPhase(id: string, updates: Partial<BackgroundPhase>): Promise<boolean> {
  const mapped: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.phase !== undefined) mapped.phase = updates.phase;
  if (updates.imageUrl !== undefined) mapped.image_url = updates.imageUrl;
  if (updates.transitionStart !== undefined) mapped.transition_start = updates.transitionStart;
  if (updates.transitionEnd !== undefined) mapped.transition_end = updates.transitionEnd;
  if (updates.overlayTop !== undefined) mapped.overlay_top = updates.overlayTop;
  if (updates.overlayMid !== undefined) mapped.overlay_mid = updates.overlayMid;
  if (updates.overlayBottom !== undefined) mapped.overlay_bottom = updates.overlayBottom;
  if (updates.overlayOpacity !== undefined) mapped.overlay_opacity = updates.overlayOpacity;
  if (updates.fadeDuration !== undefined) mapped.fade_duration = updates.fadeDuration;
  if (updates.easingType !== undefined) mapped.easing_type = updates.easingType;
  if (updates.sortOrder !== undefined) mapped.sort_order = updates.sortOrder;
  if (updates.displayMode !== undefined) mapped.display_mode = updates.displayMode;
  if (updates.bgMargin !== undefined) mapped.bg_margin = updates.bgMargin;
  if (updates.sceneId !== undefined) mapped.scene_id = updates.sceneId;
  const { error } = await supabase.from('background_config').update(mapped).eq('id', id);
  return !error;
}

export async function createBackgroundPhase(phase: string, sceneId?: string): Promise<BackgroundPhase | null> {
  // Get max sort_order
  const { data: existing } = await supabase.from('background_config').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
  const insertPayload: Record<string, unknown> = {
    phase,
    transition_start: nextOrder * 120,
    transition_end: nextOrder * 120 + 90,
    sort_order: nextOrder,
  };
  if (sceneId) insertPayload.scene_id = sceneId;
  const { data, error } = await supabase.from('background_config').insert(insertPayload as any).select().single();
  if (error || !data) return null;
  return {
    id: data.id,
    phase: data.phase,
    imageUrl: data.image_url,
    transitionStart: data.transition_start,
    transitionEnd: data.transition_end,
    overlayTop: data.overlay_top ?? '12,20,69',
    overlayMid: data.overlay_mid ?? '26,16,46',
    overlayBottom: data.overlay_bottom ?? '26,10,46',
    overlayOpacity: data.overlay_opacity ?? 0.4,
    sortOrder: data.sort_order ?? 0,
    fadeDuration: data.fade_duration ?? 60,
    easingType: data.easing_type ?? 'smoothstep',
    displayMode: ((data as any).display_mode || 'single') as DisplayMode,
    bgMargin: (data as any).bg_margin ?? 400,
    sceneId: (data as any).scene_id ?? '00000000-0000-0000-0000-000000000001',
  };
}

export async function deleteBackgroundPhase(id: string, imageUrl: string | null): Promise<boolean> {
  if (imageUrl) await deleteBackgroundImage(imageUrl);
  const { error } = await supabase.from('background_config').delete().eq('id', id);
  return !error;
}

export async function uploadBackgroundImage(file: File, phase: string): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `bg_${phase}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('game-backgrounds').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) return null;
  const { data } = supabase.storage.from('game-backgrounds').getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteBackgroundImage(url: string): Promise<boolean> {
  const match = url.match(/game-backgrounds\/(.+)$/);
  if (!match) return false;
  const { error } = await supabase.storage.from('game-backgrounds').remove([match[1]]);
  return !error;
}

// ─── Scene CRUD ───

export async function fetchScenes(): Promise<Scene[]> {
  try {
    const { data, error } = await supabase
      .from('scenes' as any)
      .select('*')
      .order('sort_order', { ascending: true });
    if (error || !data) return [];
    return (data as any[]).map(r => ({
      id: r.id,
      name: r.name,
      sortOrder: r.sort_order,
    }));
  } catch {
    return [];
  }
}

export async function createScene(name: string): Promise<Scene | null> {
  const { data: existing } = await supabase.from('scenes' as any).select('sort_order').order('sort_order', { ascending: false }).limit(1);
  const nextOrder = ((existing as any)?.[0]?.sort_order ?? -1) + 1;
  const { data, error } = await supabase.from('scenes' as any).insert({ name, sort_order: nextOrder }).select().single();
  if (error || !data) return null;
  const row = data as any;
  return { id: row.id, name: row.name, sortOrder: row.sort_order };
}

export async function updateScene(id: string, updates: Partial<Scene>): Promise<boolean> {
  const mapped: Record<string, unknown> = {};
  if (updates.name !== undefined) mapped.name = updates.name;
  if (updates.sortOrder !== undefined) mapped.sort_order = updates.sortOrder;
  const { error } = await supabase.from('scenes' as any).update(mapped).eq('id', id);
  return !error;
}

export async function deleteScene(id: string): Promise<boolean> {
  const { error } = await supabase.from('scenes' as any).delete().eq('id', id);
  return !error;
}
