import { supabase } from '@/integrations/supabase/client';

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
    }));
  } catch {
    return [];
  }
}

export async function updateBackgroundPhase(id: string, updates: Partial<BackgroundPhase>): Promise<boolean> {
  const mapped: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.imageUrl !== undefined) mapped.image_url = updates.imageUrl;
  if (updates.transitionStart !== undefined) mapped.transition_start = updates.transitionStart;
  if (updates.transitionEnd !== undefined) mapped.transition_end = updates.transitionEnd;
  if (updates.overlayTop !== undefined) mapped.overlay_top = updates.overlayTop;
  if (updates.overlayMid !== undefined) mapped.overlay_mid = updates.overlayMid;
  if (updates.overlayBottom !== undefined) mapped.overlay_bottom = updates.overlayBottom;
  if (updates.overlayOpacity !== undefined) mapped.overlay_opacity = updates.overlayOpacity;
  if (updates.fadeDuration !== undefined) mapped.fade_duration = updates.fadeDuration;
  if (updates.easingType !== undefined) mapped.easing_type = updates.easingType;
  const { error } = await supabase.from('background_config').update(mapped).eq('id', id);
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
