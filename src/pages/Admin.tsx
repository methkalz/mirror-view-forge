import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsDesktop } from '@/hooks/use-desktop';
import {
  fetchGameConfig, updateGameConfig, fetchLeaderboard, deleteLeaderboardEntry, clearLeaderboard,
  fetchWaveConfigs, upsertWaveConfig, deleteWaveConfig,
  fetchAudioConfig, updateAudioEntry, updateAudioCategory, uploadAudioFile, deleteAudioFile, listAudioLibrary,
  addAudioFile, removeAudioFile, fetchAnalytics, createAudioEntry, deleteAudioEntry,
  type RemoteGameConfig, type RemoteWaveConfig, type LeaderboardEntry, type AudioConfigEntry, type AudioFileEntry, type PlayMode, type GameAnalytics,
} from '@/game/config';
import {
  fetchBackgroundConfig, updateBackgroundPhase, uploadBackgroundImage, deleteBackgroundImage,
  type BackgroundPhase,
} from '@/game/backgroundConfig';

type TabKey = 'analytics' | 'config' | 'branding' | 'backgrounds' | 'waves' | 'leaderboard' | 'audio';

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: 'analytics', icon: '📊', label: 'Analytics' },
  { key: 'config', icon: '🎮', label: 'Config' },
  { key: 'branding', icon: '🎨', label: 'Brand' },
  { key: 'backgrounds', icon: '🌅', label: 'Backgrounds' },
  { key: 'waves', icon: '🌊', label: 'Waves' },
  { key: 'audio', icon: '🔊', label: 'Audio' },
  { key: 'leaderboard', icon: '🏆', label: 'Leaders' },
];

const Admin: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('analytics');

  const [config, setConfig] = useState<RemoteGameConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [waves, setWaves] = useState<RemoteWaveConfig[]>([]);
  const [editingWave, setEditingWave] = useState<RemoteWaveConfig | null>(null);
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [audioEntries, setAudioEntries] = useState<AudioConfigEntry[]>([]);
  const [analytics, setAnalytics] = useState<GameAnalytics | null>(null);
  const [bgPhases, setBgPhases] = useState<BackgroundPhase[]>([]);

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/admin/login'); return; }
      const { data: roles } = await supabase
        .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin');
      if (!roles || roles.length === 0) { navigate('/admin/login'); return; }
      setIsAdmin(true);
      setLoading(false);
    };
    check();
  }, [navigate]);

  const loadAll = useCallback(async () => {
    const [c, w, l, a, an, bg] = await Promise.all([fetchGameConfig(), fetchWaveConfigs(), fetchLeaderboard(), fetchAudioConfig(), fetchAnalytics(), fetchBackgroundConfig()]);
    setConfig(c); setWaves(w); setLeaders(l); setAudioEntries(a); setAnalytics(an); setBgPhases(bg);
  }, []);

  useEffect(() => { if (isAdmin) loadAll(); }, [isAdmin, loadAll]);

  const saveConfig = async (updates: Partial<RemoteGameConfig>) => {
    if (!config) return;
    setConfig({ ...config, ...updates });
    setSaving(true);
    await updateGameConfig(updates);
    setSaving(false);
  };

  const handleDeleteEntry = async (id: string) => {
    await deleteLeaderboardEntry(id);
    setLeaders(prev => prev.filter(e => e.id !== id));
  };

  const handleClearAll = async () => {
    if (!confirm('Clear ALL leaderboard entries?')) return;
    await clearLeaderboard();
    setLeaders([]);
  };

  const handleSaveWave = async (wave: RemoteWaveConfig) => {
    await upsertWaveConfig(wave);
    setEditingWave(null);
    setWaves(await fetchWaveConfigs());
  };

  const handleDeleteWave = async (waveNumber: number) => {
    await deleteWaveConfig(waveNumber);
    setWaves(prev => prev.filter(w => w.waveNumber !== waveNumber));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0a0f1a', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>☄️</div>
        <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: 2 }}>LOADING...</div>
      </div>
    </div>
  );

  const sidebarWidth = isDesktop ? 240 : isMobile ? 0 : 72;
  const currentTab = TABS.find(t => t.key === tab);

  // ─── Render ───
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0f1a',
      color: '#e2e8f0',
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex',
    }}>
      {/* ─── SIDEBAR (Desktop & Tablet) ─── */}
      {!isMobile && (
        <aside style={{
          width: sidebarWidth,
          minHeight: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
          background: 'rgba(255,255,255,0.02)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          padding: isDesktop ? '28px 16px' : '28px 8px',
          zIndex: 50,
          transition: 'width 0.2s',
        }}>
          {/* Logo */}
          <div style={{
            textAlign: isDesktop ? 'left' : 'center',
            marginBottom: 32,
            paddingBottom: 20,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: isDesktop ? 20 : 24 }}>☄️</div>
            {isDesktop && (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginTop: 4, letterSpacing: 0.5 }}>Skyfall</div>
                <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.5)', letterSpacing: 2, marginTop: 2 }}>ADMIN PANEL</div>
              </>
            )}
          </div>

          {/* Nav Items */}
          <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TABS.map(t => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  title={!isDesktop ? t.label : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: isDesktop ? '10px 14px' : '12px 0',
                    borderRadius: 10,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: isDesktop ? 13 : 18,
                    fontWeight: active ? 600 : 400,
                    background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
                    color: active ? '#60a5fa' : 'rgba(148,163,184,0.6)',
                    borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
                    justifyContent: isDesktop ? 'flex-start' : 'center',
                    transition: 'all 0.15s',
                    width: '100%',
                  }}
                >
                  <span>{t.icon}</span>
                  {isDesktop && <span>{t.label}</span>}
                </button>
              );
            })}
          </nav>

          {/* Logout */}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: isDesktop ? '10px 14px' : '12px 0',
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              fontSize: isDesktop ? 13 : 18,
              fontWeight: 500,
              background: 'transparent',
              color: 'rgba(148,163,184,0.4)',
              justifyContent: isDesktop ? 'flex-start' : 'center',
              width: '100%',
              marginTop: 8,
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: 16,
            }}
          >
            <span>🚪</span>
            {isDesktop && <span>Logout</span>}
          </button>
        </aside>
      )}

      {/* ─── MAIN CONTENT ─── */}
      <main style={{
        flex: 1,
        marginLeft: isMobile ? 0 : sidebarWidth,
        padding: isMobile ? '16px' : '32px 40px',
        maxWidth: 1200,
        width: '100%',
      }}>
        {/* Mobile: top tabs */}
        {isMobile && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>☄️ Skyfall</div>
                <div style={{ fontSize: 9, color: 'rgba(148,163,184,0.4)', letterSpacing: 2 }}>ADMIN</div>
              </div>
              <button onClick={handleLogout} style={{
                padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.5)', fontSize: 11, fontWeight: 500,
              }}>Logout</button>
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    flex: '0 0 auto', padding: '8px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600,
                    background: tab === t.key ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                    color: tab === t.key ? '#60a5fa' : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Desktop/Tablet: Page Header */}
        {!isMobile && (
          <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
                {currentTab?.icon} {currentTab?.label}
              </h1>
              <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.4)', margin: '4px 0 0' }}>
                {tab === 'analytics' ? 'Real-time game analytics & player insights' :
                 tab === 'config' ? 'Game physics & difficulty settings' :
                 tab === 'branding' ? 'Logo, title & developer branding' :
                 tab === 'backgrounds' ? 'Day/night cycle & background images' :
                 tab === 'waves' ? 'Wave configuration & enemy patterns' :
                 tab === 'audio' ? 'Professional audio system management' :
                 'Leaderboard management'}
              </p>
            </div>
            {tab === 'analytics' && (
              <button onClick={async () => { setAnalytics(await fetchAnalytics()); }} style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(59,130,246,0.2)',
                background: 'rgba(59,130,246,0.08)', color: '#60a5fa', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>↻ Refresh</button>
            )}
          </div>
        )}

        {/* ─── TAB CONTENT ─── */}
        {tab === 'analytics' && analytics && <AnalyticsPanel data={analytics} onRefresh={async () => setAnalytics(await fetchAnalytics())} isMobile={isMobile} isDesktop={isDesktop} />}

        {tab === 'config' && config && <ConfigPanel config={config} saving={saving} onSave={saveConfig} isDesktop={isDesktop} />}

        {tab === 'branding' && config && <BrandingPanel config={config} onSave={saveConfig} isDesktop={isDesktop} />}

        {tab === 'backgrounds' && <BackgroundsPanel phases={bgPhases} setPhases={setBgPhases} isDesktop={isDesktop} />}

        {tab === 'waves' && (
          <WavesPanel waves={waves} editingWave={editingWave} setEditingWave={setEditingWave} onSaveWave={handleSaveWave} onDeleteWave={handleDeleteWave} isDesktop={isDesktop} />
        )}

        {tab === 'audio' && (
          <AudioPanel
            entries={audioEntries}
            setEntries={setAudioEntries}
            onCategoryUpdate={(cat, updates) => {
              setAudioEntries(prev => prev.map(e => e.category === cat ? { ...e, ...updates } : e));
              updateAudioCategory(cat, updates);
            }}
          />
        )}

        {tab === 'leaderboard' && (
          <LeaderboardPanel leaders={leaders} onDelete={handleDeleteEntry} onClearAll={handleClearAll} isDesktop={isDesktop} />
        )}
      </main>
    </div>
  );
};

// ─── Shared Styles ───
const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.06)',
  padding: '24px 20px',
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  color: 'rgba(148,163,184,0.7)', fontSize: 12, fontWeight: 500, marginBottom: 6, display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)',
  color: '#f1f5f9', fontSize: 13, outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 10,
  border: '1px solid rgba(59,130,246,0.2)',
  background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

const btnDanger: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 10,
  border: '1px solid rgba(220,38,38,0.15)',
  background: 'rgba(220,38,38,0.1)', color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

const btnGhost: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 10, border: 'none',
  background: 'rgba(255,255,255,0.04)', color: 'rgba(148,163,184,0.6)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
};

// ─── Config Panel ───
const ConfigPanel: React.FC<{ config: RemoteGameConfig; saving: boolean; onSave: (u: Partial<RemoteGameConfig>) => void; isDesktop: boolean }> = ({ config, saving, onSave, isDesktop }) => (
  <div style={cardStyle}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Game Configuration</h3>
      {saving && <span style={{ fontSize: 11, color: 'rgba(59,130,246,0.6)' }}>Saving...</span>}
    </div>

    {/* Kill Switch */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, padding: 14, borderRadius: 12,
      background: config.globalPause ? 'rgba(220,38,38,0.08)' : 'rgba(34,197,94,0.06)',
      border: `1px solid ${config.globalPause ? 'rgba(220,38,38,0.15)' : 'rgba(34,197,94,0.12)'}`,
    }}>
      <span style={{ fontSize: 13, flex: 1, fontWeight: 500 }}>{config.globalPause ? '⛔ Spawning PAUSED' : '✅ Spawning Active'}</span>
      <button onClick={() => onSave({ globalPause: !config.globalPause })} style={config.globalPause ? { ...btnPrimary, background: 'rgba(34,197,94,0.12)', color: '#4ade80', borderColor: 'rgba(34,197,94,0.2)' } : { ...btnDanger }}>
        {config.globalPause ? 'Resume' : 'Pause'}
      </button>
    </div>

    {/* DDA */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
      <span style={{ fontSize: 13, flex: 1, color: 'rgba(148,163,184,0.7)' }}>Dynamic Difficulty (DDA)</span>
      <button onClick={() => onSave({ ddaEnabled: !config.ddaEnabled })} style={config.ddaEnabled ? btnPrimary : btnGhost}>
        {config.ddaEnabled ? 'ON' : 'OFF'}
      </button>
    </div>

    {/* Sliders Grid */}
    <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: 20 }}>
      {([
        { key: 'gravity', label: 'Gravity', min: 0.1, max: 3, step: 0.1 },
        { key: 'baseSpeed', label: 'Base Speed', min: 100, max: 600, step: 10 },
        { key: 'spawnInterval', label: 'Spawn Interval (s)', min: 0.5, max: 10, step: 0.5 },
        { key: 'difficultyMultiplier', label: 'Difficulty Multiplier', min: 0.5, max: 5, step: 0.1 },
      ] as const).map(({ key, label, min, max, step }) => (
        <div key={key} style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>{label}</label>
            <span style={{ color: '#60a5fa', fontSize: 13, fontWeight: 700 }}>{config[key]}</span>
          </div>
          <input type="range" min={min} max={max} step={step} value={config[key]}
            onChange={e => onSave({ [key]: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: '#3b82f6' }} />
        </div>
      ))}
    </div>
  </div>
);

// ─── Leaderboard Panel ───
const LeaderboardPanel: React.FC<{ leaders: LeaderboardEntry[]; onDelete: (id: string) => void; onClearAll: () => void; isDesktop: boolean }> = ({ leaders, onDelete, onClearAll, isDesktop }) => (
  <div style={cardStyle}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Leaderboard ({leaders.length})</h3>
      <button onClick={onClearAll} style={btnDanger}>Clear All</button>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: 8 }}>
      {leaders.map((e, i) => (
        <div key={e.id} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
        }}>
          <span style={{ width: 28, fontSize: 12, color: 'rgba(148,163,184,0.4)', textAlign: 'center', fontWeight: 700 }}>#{i + 1}</span>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.playerName}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa' }}>{e.score.toLocaleString()}</span>
          <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)' }}>W{e.wavesReached}</span>
          <button onClick={() => onDelete(e.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, padding: '2px 6px' }}>✕</button>
        </div>
      ))}
    </div>
  </div>
);

// ─── Waves Panel ───
const WavesPanel: React.FC<{
  waves: RemoteWaveConfig[]; editingWave: RemoteWaveConfig | null;
  setEditingWave: (w: RemoteWaveConfig | null) => void;
  onSaveWave: (w: RemoteWaveConfig) => void; onDeleteWave: (n: number) => void; isDesktop: boolean;
}> = ({ waves, editingWave, setEditingWave, onSaveWave, onDeleteWave, isDesktop }) => (
  <div style={cardStyle}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Wave Recipes</h3>
      <button onClick={() => setEditingWave({
        waveNumber: waves.length > 0 ? Math.max(...waves.map(w => w.waveNumber)) + 1 : 1,
        duration: 60, threats: ['shrapnel'], maxConcurrent: 5, spawnRate: 3.5, surgeMultiplier: 1.0, droneTypes: [],
      })} style={btnPrimary}>+ Add Wave</button>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: 8 }}>
      {waves.map(w => (
        <div key={w.waveNumber} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <span style={{ fontWeight: 700, color: '#60a5fa', fontSize: 14 }}>W{w.waveNumber}</span>
          <span style={{ flex: 1, fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>
            {w.threats.join(', ')} · {w.duration}s · max:{w.maxConcurrent}
          </span>
          <button onClick={() => setEditingWave({ ...w })} style={btnPrimary}>Edit</button>
          <button onClick={() => onDeleteWave(w.waveNumber)} style={{ ...btnDanger, padding: '6px 10px' }}>✕</button>
        </div>
      ))}
    </div>

    {waves.length === 0 && (
      <p style={{ color: 'rgba(148,163,184,0.3)', fontSize: 13, textAlign: 'center', padding: 24 }}>
        No wave configs — game uses built-in defaults
      </p>
    )}

    {editingWave && <WaveEditor wave={editingWave} onSave={onSaveWave} onCancel={() => setEditingWave(null)} />}
  </div>
);

// ─── Analytics Panel ───
function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

const AnalyticsPanel: React.FC<{ data: GameAnalytics; onRefresh: () => void; isMobile: boolean; isDesktop: boolean }> = ({ data, onRefresh, isMobile, isDesktop }) => {
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    const channel = supabase.channel('online-players');
    channel.on('presence', { event: 'sync' }, () => {
      setOnlineCount(Object.keys(channel.presenceState()).length);
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const statCard = (icon: string, label: string, value: string | number, color: string, sub?: string) => (
    <div style={{
      padding: '18px 16px', borderRadius: 14,
      background: `${color}08`, border: `1px solid ${color}15`,
    }}>
      <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.3)', marginTop: 3 }}>{sub}</div>}
    </div>
  );

  const maxHourCount = Math.max(...data.hourlyDistribution.map(h => h.count), 1);
  const gridCols = isDesktop ? '1fr 1fr 1fr 1fr' : isMobile ? '1fr 1fr' : '1fr 1fr 1fr';

  return (
    <div>
      {/* Mobile refresh */}
      {isMobile && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>📊 Analytics</h3>
          <button onClick={onRefresh} style={btnPrimary}>↻ Refresh</button>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 10, marginBottom: 20 }}>
        {statCard('🟢', 'Online Now', onlineCount, '#10b981')}
        {statCard('🎮', 'Total Sessions', data.totalSessions, '#3b82f6', `${data.sessionsToday} today`)}
        {statCard('👥', 'Unique Players', data.uniquePlayers, '#8b5cf6')}
        {statCard('⏱️', 'Avg Duration', formatTime(data.avgDuration), '#f59e0b')}
        {statCard('⭐', 'Avg Score', data.avgScore.toLocaleString(), '#22c55e', `Max: ${data.maxScore.toLocaleString()}`)}
        {statCard('🌊', 'Avg Waves', data.avgWaves.toString(), '#06b6d4', `Max: ${data.maxWaves}`)}
        {statCard('🕐', 'Total Play Time', formatTime(data.totalPlayTime), '#ec4899')}
        {statCard('📅', 'This Week', data.sessionsThisWeek.toString(), '#f97316')}
      </div>

      {/* Bottom sections in grid on desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: 16 }}>
        {/* Retention */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', marginBottom: 14 }}>🔁 Player Retention</div>
          {[
            { label: '1+ game', count: data.retentionData.players1Game, color: '#22c55e' },
            { label: '3+ games', count: data.retentionData.players3Games, color: '#3b82f6' },
            { label: '5+ games', count: data.retentionData.players5Games, color: '#f59e0b' },
            { label: '10+ games', count: data.retentionData.players10Games, color: '#ef4444' },
          ].map(({ label, count, color }) => {
            const pct = data.retentionData.players1Game > 0 ? (count / data.retentionData.players1Game) * 100 : 0;
            return (
              <div key={label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: 'rgba(148,163,184,0.6)' }}>{label}</span>
                  <span style={{ color, fontWeight: 700 }}>{count} ({Math.round(pct)}%)</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: color, width: `${pct}%`, transition: 'width 0.5s' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Peak Hours */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', marginBottom: 14 }}>🕐 Peak Hours</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 70 }}>
            {data.hourlyDistribution.map(({ hour, count }) => (
              <div key={hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{
                  width: '100%', borderRadius: 3,
                  height: Math.max(2, (count / maxHourCount) * 60),
                  background: count > maxHourCount * 0.7 ? '#3b82f6' : count > maxHourCount * 0.3 ? 'rgba(59,130,246,0.4)' : 'rgba(59,130,246,0.12)',
                  transition: 'height 0.3s',
                }} />
                {hour % 4 === 0 && <span style={{ fontSize: 8, color: 'rgba(148,163,184,0.3)' }}>{hour}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Top Players */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', marginBottom: 14 }}>🏅 Top Players</div>
          {data.topPlayers.length === 0 && <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.3)', textAlign: 'center', padding: 16 }}>No data yet</div>}
          {data.topPlayers.map((p, i) => (
            <div key={p.name} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
              borderBottom: i < data.topPlayers.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}>
              <span style={{ fontSize: 14, width: 22, textAlign: 'center' }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontSize: 9, color: 'rgba(148,163,184,0.35)' }}>{p.games} games · {formatTime(p.totalTime)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>{p.avgScore.toLocaleString()}</div>
                <div style={{ fontSize: 9, color: 'rgba(148,163,184,0.35)' }}>best: {p.bestScore.toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent Sessions */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 14 }}>📋 Recent Sessions</div>
          {data.recentSessions.length === 0 && <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.3)', textAlign: 'center', padding: 16 }}>No sessions yet</div>}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {data.recentSessions.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                borderBottom: i < data.recentSessions.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                fontSize: 11,
              }}>
                <span style={{ color: '#e2e8f0', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.playerName}</span>
                <span style={{ color: '#4ade80', fontWeight: 700 }}>{s.score.toLocaleString()}</span>
                <span style={{ color: 'rgba(148,163,184,0.3)', fontSize: 9 }}>W{s.waves}</span>
                <span style={{ color: 'rgba(148,163,184,0.3)', fontSize: 9 }}>{formatTime(s.duration)}</span>
                <span style={{ color: 'rgba(148,163,184,0.2)', fontSize: 8 }}>{new Date(s.createdAt).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Audio Panel ───
const CATEGORY_META: Record<string, { icon: string; label: string; labelAr: string; color: string }> = {
  ambient: { icon: '🌬️', label: 'Ambient', labelAr: 'خلفية', color: '#22d3ee' },
  threats: { icon: '💥', label: 'Threats', labelAr: 'تهديدات', color: '#f87171' },
  combat: { icon: '🔫', label: 'Combat', labelAr: 'قتال', color: '#fb923c' },
  player: { icon: '🏃', label: 'Player', labelAr: 'اللاعب', color: '#a78bfa' },
  powerups: { icon: '⚡', label: 'Power-ups', labelAr: 'تعزيزات', color: '#34d399' },
  boss: { icon: '👹', label: 'Boss', labelAr: 'الزعيم', color: '#f472b6' },
  motorcycle: { icon: '🏍️', label: 'Motorcycle', labelAr: 'الدراجة النارية', color: '#f59e0b' },
  warnings: { icon: '⚠️', label: 'Warnings & Upgrades', labelAr: 'تحذيرات وتطويرات', color: '#eab308' },
  gamestate: { icon: '🎮', label: 'Game State', labelAr: 'حالة اللعبة', color: '#60a5fa' },
  ui: { icon: '🖱️', label: 'UI Sounds', labelAr: 'أصوات الواجهة', color: '#94a3b8' },
};

const PLAY_MODES: { value: PlayMode; label: string; icon: string }[] = [
  { value: 'single', label: 'Single', icon: '1️⃣' },
  { value: 'random', label: 'Random', icon: '🎲' },
  { value: 'sequential', label: 'Sequential', icon: '🔄' },
  { value: 'loop', label: 'Loop', icon: '♾️' },
];

const AudioPanel: React.FC<{
  entries: AudioConfigEntry[];
  setEntries: React.Dispatch<React.SetStateAction<AudioConfigEntry[]>>;
  onCategoryUpdate: (cat: string, updates: { volume?: number; enabled?: boolean }) => void;
}> = ({ entries, setEntries, onCategoryUpdate }) => {
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState<string | null>(null);
  const [library, setLibrary] = useState<{ name: string; url: string }[]>([]);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [addingSound, setAddingSound] = useState(false);
  const [newSoundKey, setNewSoundKey] = useState('');
  const [newSoundLabel, setNewSoundLabel] = useState('');
  const [newSoundLabelAr, setNewSoundLabelAr] = useState('');
  const [newSoundCategory, setNewSoundCategory] = useState('ambient');

  const loadLibrary = useCallback(async () => { setLibrary(await listAudioLibrary()); }, []);

  const categories = Array.from(new Set(entries.map(e => e.category)));
  const grouped = categories.map(cat => ({
    cat,
    meta: CATEGORY_META[cat] || { icon: '🔈', label: cat, labelAr: cat, color: '#94a3b8' },
    items: entries.filter(e => e.category === cat),
  }));

  const handleUpdate = (id: string, updates: Partial<AudioConfigEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    const db: any = {};
    if (updates.volume !== undefined) db.volume = updates.volume;
    if (updates.enabled !== undefined) db.enabled = updates.enabled;
    if (updates.playMode !== undefined) db.playMode = updates.playMode;
    if (updates.intervalSeconds !== undefined) db.intervalSeconds = updates.intervalSeconds;
    if (updates.maxConcurrent !== undefined) db.maxConcurrent = updates.maxConcurrent;
    if (Object.keys(db).length > 0) updateAudioEntry(id, db);
  };

  const handleUploadFile = async (entryId: string, soundKey: string, file: File) => {
    setUploading(entryId);
    const result = await uploadAudioFile(file, soundKey);
    if (result) {
      const entry = entries.find(e => e.id === entryId);
      const newFile = await addAudioFile(entryId, result.url, result.name, entry ? entry.files.length : 0);
      if (newFile) setEntries(prev => prev.map(e => e.id === entryId ? { ...e, files: [...e.files, newFile] } : e));
    }
    setUploading(null);
  };

  const handleRemoveFile = async (entryId: string, fileId: string, fileUrl: string) => {
    await removeAudioFile(fileId);
    await deleteAudioFile(fileUrl);
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, files: e.files.filter(f => f.id !== fileId) } : e));
  };

  const handleAddFromLibrary = async (entryId: string, url: string, name: string) => {
    const entry = entries.find(e => e.id === entryId);
    const newFile = await addAudioFile(entryId, url, name, entry ? entry.files.length : 0);
    if (newFile) setEntries(prev => prev.map(e => e.id === entryId ? { ...e, files: [...e.files, newFile] } : e));
    setLibraryOpen(null);
  };

  const handlePreview = (url: string) => {
    if (previewAudio) { previewAudio.pause(); previewAudio.currentTime = 0; }
    const a = new Audio(url); a.volume = 0.5; a.play(); setPreviewAudio(a);
  };
  const stopPreview = () => { if (previewAudio) { previewAudio.pause(); previewAudio.currentTime = 0; setPreviewAudio(null); } };

  const smallBtn = (bg: string, color = '#fff'): React.CSSProperties => ({
    padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: bg, color, fontSize: 10, fontWeight: 600,
  });
  const chipBtn = (active: boolean, color: string): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
    background: active ? color + '22' : 'rgba(255,255,255,0.04)', color: active ? color : 'rgba(148,163,184,0.4)',
  });

  return (
    <div style={cardStyle}>
      <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => {
        const file = e.target.files?.[0]; const eid = fileInputRef.current?.dataset.entryId; const sk = fileInputRef.current?.dataset.soundKey;
        if (file && eid && sk) handleUploadFile(eid, sk, file); e.target.value = '';
      }} />

      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>🔊 Audio System</h3>
      <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', marginBottom: 20 }}>Professional multi-file audio management</p>

      {/* Master volume */}
      <div style={{ padding: '14px 16px', borderRadius: 12, marginBottom: 20, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>🎚️</span>
          <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Master Volume</span>
          <span style={{ fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>{entries.length > 0 ? Math.round(entries.reduce((a, e) => a + e.volume, 0) / entries.length * 100) : 100}%</span>
        </div>
        <input type="range" min={0} max={1} step={0.05}
          value={entries.length > 0 ? entries.reduce((a, e) => a + e.volume, 0) / entries.length : 1}
          onChange={e => { const v = parseFloat(e.target.value); for (const cat of categories) onCategoryUpdate(cat, { volume: v }); }}
          style={{ width: '100%', accentColor: '#3b82f6' }} />
      </div>

      {/* Categories */}
      {grouped.map(({ cat, meta, items }) => {
        const expanded = expandedCat === cat;
        const catEnabled = items.some(i => i.enabled);
        const catAvgVol = items.reduce((a, i) => a + i.volume, 0) / items.length;
        return (
          <div key={cat} style={{ marginBottom: 8, borderRadius: 14, overflow: 'hidden', border: `1px solid ${expanded ? meta.color + '22' : 'rgba(255,255,255,0.04)'}`, background: expanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
            <div onClick={() => setExpandedCat(expanded ? null : cat)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ fontSize: 20 }}>{meta.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>{meta.label}</div>
                <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.35)' }}>{meta.labelAr} · {items.length} sounds</div>
              </div>
              <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', marginRight: 8 }}>{Math.round(catAvgVol * 100)}%</span>
              <button onClick={e => { e.stopPropagation(); onCategoryUpdate(cat, { enabled: !catEnabled }); }} style={{
                width: 38, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: catEnabled ? meta.color + '33' : 'rgba(255,255,255,0.08)', position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{ width: 16, height: 16, borderRadius: 8, background: catEnabled ? meta.color : 'rgba(148,163,184,0.3)', position: 'absolute', top: 2, left: catEnabled ? 20 : 2, transition: 'all 0.2s' }} />
              </button>
              <span style={{ fontSize: 13, color: 'rgba(148,163,184,0.3)', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
            </div>

            {expanded && <div style={{ padding: '0 16px 10px' }}>
              <input type="range" min={0} max={1} step={0.05} value={catAvgVol} onChange={e => onCategoryUpdate(cat, { volume: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: meta.color }} />
            </div>}

            {expanded && items.map(item => {
              const isOpen = expandedItem === item.id;
              return (
                <div key={item.id} style={{ padding: '12px 16px 12px 24px', borderTop: '1px solid rgba(255,255,255,0.03)', opacity: item.enabled ? 1 : 0.4, transition: 'opacity 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {/* Quick play button */}
                    <button
                      onClick={e => { e.stopPropagation(); item.files.length > 0 ? handlePreview(item.files[0].fileUrl) : null; }}
                      style={{
                        ...smallBtn(item.files.length > 0 ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                          item.files.length > 0 ? '#93c5fd' : 'rgba(148,163,184,0.25)'),
                        fontSize: 12, padding: '4px 6px', flexShrink: 0,
                        cursor: item.files.length > 0 ? 'pointer' : 'default',
                      }}
                      title={item.files.length > 0 ? 'Preview sound' : 'Synthesized (built-in)'}
                    >▶</button>
                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setExpandedItem(isOpen ? null : item.id)}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                        {item.label}
                        {item.files.length > 0
                          ? <span style={{ fontSize: 9, color: meta.color, marginLeft: 6 }}>🎵×{item.files.length}</span>
                          : <span style={{ fontSize: 9, color: 'rgba(148,163,184,0.25)', marginLeft: 6 }}>synth</span>
                        }
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.3)' }}>{item.labelAr}</div>
                    </div>
                    <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.35)', width: 34, textAlign: 'right' }}>{Math.round(item.volume * 100)}%</span>
                    <input type="range" min={0} max={2} step={0.05} value={item.volume} onChange={e => handleUpdate(item.id, { volume: parseFloat(e.target.value) })} style={{ width: 80, accentColor: meta.color }} />
                    <button onClick={() => handleUpdate(item.id, { enabled: !item.enabled })} style={{
                      width: 30, height: 16, borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: item.enabled ? meta.color + '33' : 'rgba(255,255,255,0.06)', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    }}>
                      <div style={{ width: 12, height: 12, borderRadius: 6, background: item.enabled ? meta.color : 'rgba(148,163,184,0.25)', position: 'absolute', top: 2, left: item.enabled ? 16 : 2, transition: 'all 0.2s' }} />
                    </button>
                    <span onClick={() => setExpandedItem(isOpen ? null : item.id)} style={{ fontSize: 12, color: 'rgba(148,163,184,0.3)', cursor: 'pointer', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)', marginBottom: 6 }}>Play Mode</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {PLAY_MODES.map(m => (
                            <button key={m.value} onClick={() => handleUpdate(item.id, { playMode: m.value })} style={chipBtn(item.playMode === m.value, meta.color)}>
                              {m.icon} {m.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)', whiteSpace: 'nowrap' }}>⏱ Interval (sec)</div>
                        <input type="number" min={0} step={1} value={item.intervalSeconds ?? ''} placeholder="—"
                          onChange={e => handleUpdate(item.id, { intervalSeconds: e.target.value ? parseFloat(e.target.value) : null } as any)}
                          style={{ width: 64, padding: '5px 8px', borderRadius: 8, fontSize: 11, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.25)', color: '#f1f5f9', outline: 'none' }}
                        />
                      </div>

                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)', marginBottom: 6 }}>🎵 Audio Files ({item.files.length})</div>
                        {item.files.length === 0 && <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.2)', padding: '6px 0' }}>Using synthesized sound</div>}
                        {item.files.map((f, idx) => (
                          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: idx < item.files.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                            <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.3)', width: 18 }}>#{idx + 1}</span>
                            <span style={{ fontSize: 10, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fileName}</span>
                            <button onClick={() => handlePreview(f.fileUrl)} style={smallBtn('rgba(59,130,246,0.15)', '#93c5fd')}>▶</button>
                            <button onClick={stopPreview} style={smallBtn('rgba(255,255,255,0.06)', 'rgba(148,163,184,0.4)')}>⏹</button>
                            <button onClick={() => handleRemoveFile(item.id, f.id, f.fileUrl)} style={smallBtn('rgba(220,38,38,0.12)', '#fca5a5')}>✕</button>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button disabled={uploading === item.id} onClick={() => { if (fileInputRef.current) { fileInputRef.current.dataset.entryId = item.id; fileInputRef.current.dataset.soundKey = item.soundKey; fileInputRef.current.click(); } }}
                          style={smallBtn('rgba(59,130,246,0.12)', '#93c5fd')}>{uploading === item.id ? '⏳...' : '📁 Upload'}</button>
                        <button onClick={() => { setLibraryOpen(libraryOpen === item.id ? null : item.id); loadLibrary(); }} style={smallBtn('rgba(168,85,247,0.12)', '#c4b5fd')}>📚 Library</button>
                        <div style={{ flex: 1 }} />
                        <button onClick={async () => {
                          if (!confirm(`Delete "${item.label}"?`)) return;
                          await deleteAudioEntry(item.id);
                          setEntries(prev => prev.filter(e => e.id !== item.id));
                        }} style={smallBtn('rgba(220,38,38,0.1)', '#f87171')}>🗑 Delete Sound</button>
                      </div>

                      {libraryOpen === item.id && (
                        <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', maxHeight: 160, overflowY: 'auto' }}>
                          <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)', marginBottom: 8 }}>📚 ({library.length} files)</div>
                          {library.length === 0 && <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.25)', padding: 10, textAlign: 'center' }}>Upload files first</div>}
                          {library.map(f => (
                            <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                              <span style={{ fontSize: 10, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                              <button onClick={() => handlePreview(f.url)} style={smallBtn('rgba(59,130,246,0.12)', '#93c5fd')}>▶</button>
                              <button onClick={() => handleAddFromLibrary(item.id, f.url, f.name)} style={smallBtn('rgba(34,197,94,0.12)', '#86efac')}>+ Add</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Add New Sound */}
      <div style={{ marginTop: 16, padding: '16px 18px', borderRadius: 14, border: '1px dashed rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.01)' }}>
        {!addingSound ? (
          <button onClick={() => setAddingSound(true)} style={{ ...btnPrimary, width: '100%', textAlign: 'center', justifyContent: 'center', display: 'flex' }}>
            ➕ Add New Sound
          </button>
        ) : (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#e2e8f0' }}>New Sound Entry</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ ...labelStyle, fontSize: 10 }}>Sound Key (unique)</label>
                <input value={newSoundKey} onChange={e => setNewSoundKey(e.target.value)} placeholder="e.g. laserBlast" style={inputStyle} />
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: 10 }}>Category</label>
                <select value={newSoundCategory} onChange={e => setNewSoundCategory(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {Object.entries(CATEGORY_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: 10 }}>Label (EN)</label>
                <input value={newSoundLabel} onChange={e => setNewSoundLabel(e.target.value)} placeholder="Laser Blast" style={inputStyle} />
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: 10 }}>Label (AR)</label>
                <input value={newSoundLabelAr} onChange={e => setNewSoundLabelAr(e.target.value)} placeholder="ليزر" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={!newSoundKey.trim() || !newSoundLabel.trim()}
                onClick={async () => {
                  const entry = await createAudioEntry({
                    soundKey: newSoundKey.trim(),
                    category: newSoundCategory,
                    label: newSoundLabel.trim(),
                    labelAr: newSoundLabelAr.trim(),
                  });
                  if (entry) {
                    setEntries(prev => [...prev, entry]);
                    setNewSoundKey(''); setNewSoundLabel(''); setNewSoundLabelAr('');
                    setAddingSound(false);
                  }
                }}
                style={{ ...btnPrimary, opacity: (!newSoundKey.trim() || !newSoundLabel.trim()) ? 0.4 : 1 }}
              >
                Create
              </button>
              <button onClick={() => setAddingSound(false)} style={btnGhost}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Backgrounds Panel ───
const PHASE_META: Record<string, { icon: string; label: string; color: string }> = {
  day:    { icon: '☀️', label: 'Day',    color: '#f59e0b' },
  sunset: { icon: '🌅', label: 'Sunset', color: '#f97316' },
  night:  { icon: '🌙', label: 'Night',  color: '#6366f1' },
};

// Helper: RGB string "R,G,B" → hex "#RRGGBB"
const rgbToHex = (rgb: string): string => {
  const parts = rgb.split(',').map(s => parseInt(s.trim(), 10));
  if (parts.length < 3 || parts.some(isNaN)) return '#000000';
  return '#' + parts.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
};

// Helper: hex "#RRGGBB" → RGB string "R,G,B"
const hexToRgb = (hex: string): string => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)].join(',');
};

// Easing curve SVG preview
const EasingCurvePreview: React.FC<{ type: string; color: string }> = ({ type, color }) => {
  const points: string[] = [];
  const w = 80, h = 40;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    let v: number;
    switch (type) {
      case 'ease-in': v = t * t; break;
      case 'ease-out': v = 1 - (1 - t) * (1 - t); break;
      case 'smoothstep': v = t * t * (3 - 2 * t); break;
      default: v = t;
    }
    points.push(`${(t * w).toFixed(1)},${(h - v * h).toFixed(1)}`);
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <rect x={0} y={0} width={w} height={h} rx={6} fill="rgba(0,0,0,0.25)" />
      <line x1={0} y1={h} x2={w} y2={0} stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray="3,3" />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' as const,
  color: 'rgba(148,163,184,0.45)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
};

// ─── Easing helpers (shared with renderer) ───
function previewSmoothstep(t: number): number { return t * t * (3 - 2 * t); }
function previewEaseIn(t: number): number { return t * t; }
function previewEaseOut(t: number): number { return 1 - (1 - t) * (1 - t); }
function previewApplyEasing(t: number, type: string): number {
  const c = Math.max(0, Math.min(1, t));
  switch (type) {
    case 'smoothstep': return previewSmoothstep(c);
    case 'ease-in': return previewEaseIn(c);
    case 'ease-out': return previewEaseOut(c);
    default: return c;
  }
}

function previewParseRGB(str: string): number[] {
  return str.split(',').map(s => parseInt(s.trim(), 10) || 0);
}

function previewLerpColor(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

// ─── Background Preview Player ───
const PREVIEW_PHASE_DURATION = 5; // seconds per phase in preview

const BackgroundPreviewPlayer: React.FC<{ phases: BackgroundPhase[] }> = ({ phases }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const imagesRef = useRef<(HTMLImageElement | null)[]>([]);

  const totalDuration = phases.length * PREVIEW_PHASE_DURATION;

  // Load images
  useEffect(() => {
    imagesRef.current = phases.map(p => {
      if (!p.imageUrl) return null;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = p.imageUrl;
      return img;
    });
  }, [phases]);

  const getBlendAtTime = useCallback((t: number) => {
    if (phases.length === 0) return null;
    const phaseIdx = Math.min(Math.floor(t / PREVIEW_PHASE_DURATION), phases.length - 1);
    const localT = (t / PREVIEW_PHASE_DURATION) - phaseIdx;

    const current = phases[phaseIdx];
    const nextIdx = phaseIdx + 1;
    const imgA = imagesRef.current[phaseIdx];

    if (nextIdx < phases.length) {
      const next = phases[nextIdx];
      const easingType = next.easingType || 'smoothstep';
      // Fade occupies the last 60% of each phase segment
      const fadeStart = 0.4;
      if (localT >= fadeStart) {
        const linearFade = (localT - fadeStart) / (1 - fadeStart);
        const fade = previewApplyEasing(linearFade, easingType);
        const imgB = imagesRef.current[nextIdx];
        const topA = previewParseRGB(current.overlayTop), topB = previewParseRGB(next.overlayTop);
        const midA = previewParseRGB(current.overlayMid), midB = previewParseRGB(next.overlayMid);
        const botA = previewParseRGB(current.overlayBottom), botB = previewParseRGB(next.overlayBottom);
        return {
          imgA, imgB, fade,
          overlayTop: previewLerpColor(topA, topB, fade),
          overlayMid: previewLerpColor(midA, midB, fade),
          overlayBottom: previewLerpColor(botA, botB, fade),
          overlayOpacity: current.overlayOpacity + (next.overlayOpacity - current.overlayOpacity) * fade,
          phaseIdx,
        };
      }
    }
    return {
      imgA, imgB: null, fade: 0,
      overlayTop: previewParseRGB(current.overlayTop),
      overlayMid: previewParseRGB(current.overlayMid),
      overlayBottom: previewParseRGB(current.overlayBottom),
      overlayOpacity: current.overlayOpacity,
      phaseIdx,
    };
  }, [phases]);

  const drawFrame = useCallback((timestamp: number) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const elapsed = (timestamp - startTimeRef.current) / 1000;
    const t = elapsed % totalDuration;
    setProgress(t / totalDuration);

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const blend = getBlendAtTime(t);
    if (!blend) {
      ctx.fillStyle = '#0c1445';
      ctx.fillRect(0, 0, w, h);
    } else {
      // Draw primary image (cover)
      if (blend.imgA && blend.imgA.complete && blend.imgA.naturalWidth > 0) {
        drawCoverImage(ctx, blend.imgA, w, h);
      } else {
        ctx.fillStyle = '#0c1445';
        ctx.fillRect(0, 0, w, h);
      }
      // Cross-fade
      if (blend.imgB && blend.imgB.complete && blend.imgB.naturalWidth > 0 && blend.fade > 0) {
        ctx.save();
        ctx.globalAlpha = blend.fade;
        drawCoverImage(ctx, blend.imgB, w, h);
        ctx.restore();
      }
      // Overlay gradient
      const overlayGrad = ctx.createLinearGradient(0, 0, 0, h);
      const op = blend.overlayOpacity;
      overlayGrad.addColorStop(0, `rgba(${blend.overlayTop[0]},${blend.overlayTop[1]},${blend.overlayTop[2]},${op})`);
      overlayGrad.addColorStop(0.5, `rgba(${blend.overlayMid[0]},${blend.overlayMid[1]},${blend.overlayMid[2]},${op * 0.85})`);
      overlayGrad.addColorStop(1, `rgba(${blend.overlayBottom[0]},${blend.overlayBottom[1]},${blend.overlayBottom[2]},${op * 0.95})`);
      ctx.fillStyle = overlayGrad;
      ctx.fillRect(0, 0, w, h);
    }

    if (playing) {
      rafRef.current = requestAnimationFrame(drawFrame);
    }
  }, [playing, totalDuration, getBlendAtTime]);

  const handlePlay = () => {
    if (playing) {
      cancelAnimationFrame(rafRef.current);
      setPlaying(false);
    } else {
      setPlaying(true);
      startTimeRef.current = performance.now();
      setProgress(0);
    }
  };

  useEffect(() => {
    if (playing) {
      rafRef.current = requestAnimationFrame(drawFrame);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, drawFrame]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const activePhaseIdx = Math.min(Math.floor(progress * phases.length), phases.length - 1);

  return (
    <div style={{
      marginBottom: 24, padding: '18px', borderRadius: 14,
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.6)', letterSpacing: 1.5 }}>
          🎬 LIVE PREVIEW
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Active phase indicator */}
          {playing && phases[activePhaseIdx] && (() => {
            const meta = PHASE_META[phases[activePhaseIdx].phase] || { icon: '🖼️', label: phases[activePhaseIdx].phase, color: '#94a3b8' };
            return (
              <span style={{ fontSize: 10, color: meta.color, fontWeight: 700 }}>
                {meta.icon} {meta.label}
              </span>
            );
          })()}
          <button onClick={handlePlay} style={{
            ...btnPrimary, padding: '6px 16px', fontSize: 11,
            background: playing ? 'rgba(220,38,38,0.12)' : 'rgba(59,130,246,0.15)',
            color: playing ? '#f87171' : '#60a5fa',
            borderColor: playing ? 'rgba(220,38,38,0.2)' : 'rgba(59,130,246,0.2)',
          }}>
            {playing ? '⏹ Stop' : '▶ Preview'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <canvas ref={canvasRef} style={{
        width: '100%', aspectRatio: '16/9', borderRadius: 10, display: 'block',
        background: '#0c1445', border: '1px solid rgba(255,255,255,0.06)',
      }} />

      {/* Progress bar */}
      <div style={{ marginTop: 10, position: 'relative' }}>
        <div style={{
          height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${progress * 100}%`,
            background: 'linear-gradient(90deg, #f59e0b, #f97316, #6366f1)',
            borderRadius: 3, transition: playing ? 'none' : 'width 0.3s',
          }} />
        </div>
        {/* Phase markers */}
        <div style={{ display: 'flex', marginTop: 4 }}>
          {phases.map((p, i) => {
            const meta = PHASE_META[p.phase] || { icon: '🖼️', label: p.phase, color: '#94a3b8' };
            return (
              <div key={p.id} style={{
                flex: 1, textAlign: 'center', fontSize: 9, color: activePhaseIdx === i && playing ? meta.color : 'rgba(148,163,184,0.3)',
                fontWeight: activePhaseIdx === i && playing ? 700 : 400, transition: 'all 0.3s',
              }}>
                {meta.icon} {PREVIEW_PHASE_DURATION}s
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cw: number, ch: number) {
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const canvasAspect = cw / ch;
  let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
  if (imgAspect > canvasAspect) {
    sw = img.naturalHeight * canvasAspect;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / canvasAspect;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
}

const BackgroundsPanel: React.FC<{
  phases: BackgroundPhase[];
  setPhases: React.Dispatch<React.SetStateAction<BackgroundPhase[]>>;
  isDesktop: boolean;
}> = ({ phases, setPhases, isDesktop }) => {
  const [uploading, setUploading] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [timelineHover, setTimelineHover] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (phaseId: string, phaseName: string, file: File) => {
    setUploading(phaseId);
    const url = await uploadBackgroundImage(file, phaseName);
    if (url) {
      await updateBackgroundPhase(phaseId, { imageUrl: url });
      setPhases(prev => prev.map(p => p.id === phaseId ? { ...p, imageUrl: url } : p));
    }
    setUploading(null);
  };

  const handleRemoveImage = async (phaseId: string, imageUrl: string) => {
    await deleteBackgroundImage(imageUrl);
    await updateBackgroundPhase(phaseId, { imageUrl: null });
    setPhases(prev => prev.map(p => p.id === phaseId ? { ...p, imageUrl: null } : p));
  };

  const handleUpdate = async (phaseId: string, updates: Partial<BackgroundPhase>) => {
    setSaving(phaseId);
    setPhases(prev => prev.map(p => p.id === phaseId ? { ...p, ...updates } : p));
    await updateBackgroundPhase(phaseId, updates);
    setSaving(null);
  };

  const maxTime = Math.max(...phases.map(p => p.transitionEnd), 600);

  return (
    <div style={cardStyle}>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
        const file = e.target.files?.[0];
        const phaseId = fileInputRef.current?.dataset.phaseId;
        const phaseName = fileInputRef.current?.dataset.phaseName;
        if (file && phaseId && phaseName) handleUpload(phaseId, phaseName, file);
        e.target.value = '';
      }} />

      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>🌅 Background Cycle</h3>
      <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', marginBottom: 24 }}>
        Day → Sunset → Night with smooth cross-fade transitions
      </p>

      {/* ─── Enhanced Timeline ─── */}
      <div style={{ marginBottom: 28, padding: '16px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left - 18) / (rect.width - 36);
          setTimelineHover(Math.max(0, Math.min(1, x)) * maxTime);
        }}
        onMouseLeave={() => setTimelineHover(null)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', fontWeight: 600 }}>📊 Timeline</span>
          {timelineHover !== null && (
            <span style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700 }}>
              ▶ {Math.round(timelineHover)}s
            </span>
          )}
        </div>
        {/* Thumbnails row */}
        <div style={{ display: 'flex', height: 36, borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.3)', position: 'relative' }}>
          {phases.map((p, i) => {
            const meta = PHASE_META[p.phase] || { icon: '🖼️', label: p.phase, color: '#94a3b8' };
            const start = p.transitionStart;
            const end = i < phases.length - 1 ? phases[i + 1].transitionStart : maxTime;
            const widthPct = ((end - start) / maxTime) * 100;
            return (
              <div key={p.id} style={{
                width: `${widthPct}%`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundImage: p.imageUrl ? `url(${p.imageUrl})` : undefined,
                backgroundSize: 'cover', backgroundPosition: 'center',
                borderRight: i < phases.length - 1 ? `2px solid ${meta.color}60` : 'none',
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: p.imageUrl ? `${meta.color}55` : `${meta.color}25`,
                }} />
                <span style={{ position: 'relative', fontSize: 10, color: '#fff', fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  {meta.icon} {Math.round(start)}s–{Math.round(end)}s
                </span>
              </div>
            );
          })}
          {/* NOW indicator */}
          {timelineHover !== null && (
            <div style={{
              position: 'absolute', top: 0, bottom: 0, width: 2,
              left: `${(timelineHover / maxTime) * 100}%`,
              background: '#60a5fa', boxShadow: '0 0 8px rgba(96,165,250,0.6)',
              pointerEvents: 'none', zIndex: 5,
            }}>
              <div style={{
                position: 'absolute', top: -6, left: -4, width: 10, height: 10,
                borderRadius: '50%', background: '#60a5fa', border: '2px solid #0a0f1a',
              }} />
            </div>
          )}
        </div>
      </div>

      {/* ─── Live Preview ─── */}
      <BackgroundPreviewPlayer phases={phases} />

      {/* ─── Phase Cards ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr 1fr' : '1fr', gap: 16 }}>
        {phases.map(p => {
          const meta = PHASE_META[p.phase] || { icon: '🖼️', label: p.phase, color: '#94a3b8' };
          const isUploading = uploading === p.id;
          const isSaving = saving === p.id;

          return (
            <div key={p.id} style={{
              borderRadius: 16,
              background: `${meta.color}06`, border: `1px solid ${meta.color}15`,
              overflow: 'hidden',
            }}>
              {/* Phase header */}
              <div style={{ padding: '16px 18px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${meta.color}10` }}>
                <span style={{ fontSize: 22 }}>{meta.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: meta.color }}>{meta.label}</div>
                </div>
                {isSaving && <span style={{ fontSize: 9, color: 'rgba(59,130,246,0.6)', fontWeight: 600 }}>✓ Saving...</span>}
              </div>

              {/* ─── Section: Image ─── */}
              <div style={{ padding: '14px 18px' }}>
                <div style={sectionHeaderStyle}>📷 Image</div>

                {/* Image preview with overlay gradient preview */}
                <div style={{
                  width: '100%', aspectRatio: '16/9', borderRadius: 12, marginBottom: 10,
                  background: 'rgba(0,0,0,0.3)', overflow: 'hidden', position: 'relative',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.phase} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(148,163,184,0.25)' }}>
                      <span style={{ fontSize: 32, marginBottom: 6 }}>🖼️</span>
                      <span style={{ fontSize: 10 }}>No image</span>
                    </div>
                  )}
                  {/* Live overlay gradient preview */}
                  <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: `linear-gradient(180deg, rgba(${p.overlayTop},${p.overlayOpacity}) 0%, rgba(${p.overlayMid},${p.overlayOpacity * 0.8}) 50%, rgba(${p.overlayBottom},${p.overlayOpacity}) 100%)`,
                  }} />
                  <div style={{
                    position: 'absolute', bottom: 4, right: 4, fontSize: 8, color: 'rgba(255,255,255,0.4)',
                    background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 4,
                  }}>OVERLAY PREVIEW</div>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.dataset.phaseId = p.id;
                      fileInputRef.current.dataset.phaseName = p.phase;
                      fileInputRef.current.click();
                    }
                  }} disabled={isUploading} style={{ ...btnPrimary, flex: 1, fontSize: 11, padding: '8px 10px' }}>
                    {isUploading ? '⏳ Uploading...' : '📁 Upload'}
                  </button>
                  {p.imageUrl && (
                    <button onClick={() => handleRemoveImage(p.id, p.imageUrl!)} style={{ ...btnDanger, fontSize: 11, padding: '8px 10px' }}>✕</button>
                  )}
                </div>
              </div>

              {/* ─── Section: Timing ─── */}
              <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={sectionHeaderStyle}>⏱ Timing</div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Start</label>
                    <span style={{ color: meta.color, fontSize: 12, fontWeight: 700 }}>{p.transitionStart}s</span>
                  </div>
                  <input type="range" min={0} max={600} step={10} value={p.transitionStart}
                    onChange={e => handleUpdate(p.id, { transitionStart: parseFloat(e.target.value) })}
                    style={{ width: '100%', accentColor: meta.color }} />
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>End</label>
                    <span style={{ color: meta.color, fontSize: 12, fontWeight: 700 }}>{p.transitionEnd}s</span>
                  </div>
                  <input type="range" min={0} max={900} step={10} value={p.transitionEnd}
                    onChange={e => handleUpdate(p.id, { transitionEnd: parseFloat(e.target.value) })}
                    style={{ width: '100%', accentColor: meta.color }} />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Fade Duration</label>
                    <span style={{ color: meta.color, fontSize: 12, fontWeight: 700 }}>{p.fadeDuration || 60}s</span>
                  </div>
                  <input type="range" min={10} max={180} step={5} value={p.fadeDuration || 60}
                    onChange={e => handleUpdate(p.id, { fadeDuration: parseFloat(e.target.value) })}
                    style={{ width: '100%', accentColor: meta.color }} />
                </div>
              </div>

              {/* ─── Section: Overlay ─── */}
              <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={sectionHeaderStyle}>🎨 Overlay</div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Opacity</label>
                    <span style={{ color: meta.color, fontSize: 12, fontWeight: 700 }}>{(p.overlayOpacity * 100).toFixed(0)}%</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.05} value={p.overlayOpacity}
                    onChange={e => handleUpdate(p.id, { overlayOpacity: parseFloat(e.target.value) })}
                    style={{ width: '100%', accentColor: meta.color }} />
                </div>

                {/* Color pickers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {([
                    { key: 'overlayTop' as const, label: 'Top' },
                    { key: 'overlayMid' as const, label: 'Mid' },
                    { key: 'overlayBottom' as const, label: 'Bottom' },
                  ]).map(({ key, label }) => (
                    <div key={key} style={{ textAlign: 'center' }}>
                      <label style={{ ...labelStyle, marginBottom: 4, fontSize: 10 }}>{label}</label>
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <input
                          type="color"
                          value={rgbToHex(p[key])}
                          onChange={e => handleUpdate(p.id, { [key]: hexToRgb(e.target.value) })}
                          style={{
                            width: 36, height: 36, borderRadius: 8, border: '2px solid rgba(255,255,255,0.1)',
                            cursor: 'pointer', background: 'transparent', padding: 0,
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 9, color: 'rgba(148,163,184,0.35)', marginTop: 2 }}>{p[key]}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ─── Section: Easing ─── */}
              <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={sectionHeaderStyle}>⚡ Easing</div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <select
                      value={p.easingType || 'smoothstep'}
                      onChange={e => handleUpdate(p.id, { easingType: e.target.value })}
                      style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }}
                    >
                      <option value="linear">Linear</option>
                      <option value="smoothstep">Smoothstep</option>
                      <option value="ease-in">Ease In</option>
                      <option value="ease-out">Ease Out</option>
                    </select>
                  </div>
                  <EasingCurvePreview type={p.easingType || 'smoothstep'} color={meta.color} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {phases.length === 0 && (
        <p style={{ color: 'rgba(148,163,184,0.3)', fontSize: 13, textAlign: 'center', padding: 24 }}>
          No background phases configured
        </p>
      )}
    </div>
  );
};

// ─── Branding Panel ───
const BrandingPanel: React.FC<{
  config: RemoteGameConfig;
  onSave: (updates: Partial<RemoteGameConfig>) => void;
  isDesktop: boolean;
}> = ({ config, onSave, isDesktop }) => {
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    const ext = file.name.split('.').pop() || 'png';
    const path = `logo_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('game-audio').upload(path, file, { cacheControl: '3600', upsert: false });
    if (!error) {
      const { data } = supabase.storage.from('game-audio').getPublicUrl(path);
      onSave({ logoUrl: data.publicUrl });
    }
    setLogoUploading(false);
  };

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>🎨 Branding</h3>
      <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', marginBottom: 24 }}>Logo, title & developer identity</p>

      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: 20 }}>
        {/* Left: Fields */}
        <div>
          {/* Logo */}
          <div style={{ marginBottom: 20, padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <label style={labelStyle}>Logo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
              {config.logoUrl ? (
                <img src={config.logoUrl} alt="Logo" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 12, background: 'rgba(0,0,0,0.25)', padding: 6 }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(148,163,184,0.2)', fontSize: 24 }}>☄️</div>
              )}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ''; }} />
                <button onClick={() => logoInputRef.current?.click()} disabled={logoUploading} style={btnPrimary}>
                  {logoUploading ? '⏳ Uploading...' : '📁 Upload Logo'}
                </button>
                {config.logoUrl && (
                  <button onClick={() => onSave({ logoUrl: null })} style={{ ...btnDanger, padding: '6px 12px', fontSize: 11 }}>✕ Remove</button>
                )}
              </div>
            </div>
          </div>

          {/* Show Title Toggle (when logo exists) */}
          {config.logoUrl && (
            <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, flex: 1, color: 'rgba(148,163,184,0.7)' }}>Show title text with logo</span>
              <button onClick={() => onSave({ showTitle: !config.showTitle })} style={{
                width: 42, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                background: config.showTitle ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)', position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: config.showTitle ? '#60a5fa' : 'rgba(148,163,184,0.3)', position: 'absolute', top: 2, left: config.showTitle ? 22 : 2, transition: 'all 0.2s' }} />
              </button>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Game Title</label>
            <input value={config.gameTitle} onChange={e => onSave({ gameTitle: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Subtitle</label>
            <input value={config.gameSubtitle} onChange={e => onSave({ gameSubtitle: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Developer Name</label>
            <input value={config.developerName} onChange={e => onSave({ developerName: e.target.value })} style={inputStyle} />
          </div>
        </div>

        {/* Right: Preview */}
        <div style={{
          padding: 28, borderRadius: 16, textAlign: 'center',
          background: 'radial-gradient(ellipse at 50% 40%, rgba(15,23,42,0.95) 0%, rgba(0,0,0,0.98) 100%)',
          border: '1px solid rgba(255,255,255,0.04)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.3)', marginBottom: 16, letterSpacing: 3 }}>PREVIEW</div>
          {config.logoUrl ? (
            <div style={{ textAlign: 'center' }}>
              <img src={config.logoUrl} alt="Logo" style={{ width: 64, height: 64, objectFit: 'contain', marginBottom: config.showTitle ? 6 : 10 }} />
              {config.showTitle && <div style={{ fontSize: 18, fontWeight: 900, color: '#f1f5f9', marginBottom: 4 }}>{config.gameTitle}</div>}
            </div>
          ) : (
            <div style={{ fontSize: 32, fontWeight: 900, color: '#f1f5f9', marginBottom: 6 }}>☄️ {config.gameTitle}</div>
          )}
          <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', letterSpacing: 4, marginBottom: 12 }}>{config.gameSubtitle}</div>
          <div style={{ fontSize: 10, color: 'rgba(100,116,139,0.35)', letterSpacing: 2 }}>Developed by {config.developerName}</div>
        </div>
      </div>
    </div>
  );
};

// ─── Wave Editor Modal ───
const THREAT_TYPES = ['shrapnel', 'missile', 'cluster'];
const DRONE_TYPES = ['scout', 'tracker', 'bomber', 'cargo', 'incendiary', 'chemical'];

const WaveEditor: React.FC<{
  wave: RemoteWaveConfig;
  onSave: (w: RemoteWaveConfig) => void;
  onCancel: () => void;
}> = ({ wave, onSave, onCancel }) => {
  const [w, setW] = useState(wave);

  const toggle = (arr: string[], item: string) =>
    arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
    background: active ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
    color: active ? '#60a5fa' : 'rgba(148,163,184,0.4)',
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20,
    }}>
      <div style={{
        background: '#111827', borderRadius: 20, padding: '28px 24px',
        width: 'min(440px, 90vw)', maxHeight: '80vh', overflowY: 'auto',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20, color: '#f1f5f9' }}>
          Wave {w.waveNumber} Editor
        </h3>

        {[
          { label: 'Wave Number', value: w.waveNumber, onChange: (v: string) => setW({ ...w, waveNumber: parseInt(v) || 1 }), type: 'number' },
          { label: 'Duration (sec)', value: w.duration, onChange: (v: string) => setW({ ...w, duration: parseFloat(v) || 60 }), type: 'number' },
          { label: 'Max Concurrent', value: w.maxConcurrent, onChange: (v: string) => setW({ ...w, maxConcurrent: parseInt(v) || 5 }), type: 'number' },
          { label: 'Spawn Rate', value: w.spawnRate, onChange: (v: string) => setW({ ...w, spawnRate: parseFloat(v) || 3.5 }), type: 'number', step: '0.5' },
          { label: 'Surge Multiplier', value: w.surgeMultiplier, onChange: (v: string) => setW({ ...w, surgeMultiplier: parseFloat(v) || 1 }), type: 'number', step: '0.1' },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{f.label}</label>
            <input type={f.type} step={f.step} value={f.value} onChange={e => f.onChange(e.target.value)} style={inputStyle} />
          </div>
        ))}

        <label style={{ ...labelStyle, marginBottom: 8 }}>Threats</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
          {THREAT_TYPES.map(t => (
            <button key={t} onClick={() => setW({ ...w, threats: toggle(w.threats, t) })} style={chipStyle(w.threats.includes(t))}>{t}</button>
          ))}
        </div>

        <label style={{ ...labelStyle, marginBottom: 8 }}>Drone Types</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
          {DRONE_TYPES.map(t => (
            <button key={t} onClick={() => setW({ ...w, droneTypes: toggle(w.droneTypes, t) })} style={chipStyle(w.droneTypes.includes(t))}>{t}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => onSave(w)} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: 'rgba(59,130,246,0.2)', color: '#60a5fa', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Save</button>
          <button onClick={onCancel} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.04)', color: 'rgba(148,163,184,0.5)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default Admin;
