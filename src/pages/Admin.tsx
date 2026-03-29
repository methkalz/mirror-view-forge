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

type TabKey = 'analytics' | 'config' | 'branding' | 'waves' | 'leaderboard' | 'audio';

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: 'analytics', icon: '📊', label: 'Analytics' },
  { key: 'config', icon: '🎮', label: 'Config' },
  { key: 'branding', icon: '🎨', label: 'Brand' },
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
    const [c, w, l, a, an] = await Promise.all([fetchGameConfig(), fetchWaveConfigs(), fetchLeaderboard(), fetchAudioConfig(), fetchAnalytics()]);
    setConfig(c); setWaves(w); setLeaders(l); setAudioEntries(a); setAnalytics(an);
  }, []);

  useEffect(() => { if (isAdmin) loadAll(); }, [isAdmin, loadAll]);

  const [pendingChanges, setPendingChanges] = useState<Partial<RemoteGameConfig>>({});
  const hasPending = Object.keys(pendingChanges).length > 0;

  const stageChange = (updates: Partial<RemoteGameConfig>) => {
    if (!config) return;
    setConfig(prev => prev ? { ...prev, ...updates } : prev);
    setPendingChanges(prev => ({ ...prev, ...updates }));
  };

  const saveAllChanges = async () => {
    if (!hasPending) return;
    setSaving(true);
    await updateGameConfig(pendingChanges);
    setPendingChanges({});
    setSaving(false);
  };

  const discardChanges = async () => {
    setPendingChanges({});
    const c = await fetchGameConfig();
    setConfig(c);
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

        {tab === 'config' && config && <ConfigPanel config={config} saving={saving} onSave={stageChange} isDesktop={isDesktop} />}

        {tab === 'branding' && config && <BrandingPanel config={config} onSave={stageChange} isDesktop={isDesktop} />}

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

        {/* Floating Save Bar */}
        {hasPending && (
          <div style={{
            position: 'fixed', bottom: 0, left: isMobile ? 0 : sidebarWidth, right: 0,
            padding: '14px 24px', background: 'rgba(10,15,26,0.95)', backdropFilter: 'blur(12px)',
            borderTop: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 60,
          }}>
            <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.6)', marginRight: 8 }}>
              ⚠️ {Object.keys(pendingChanges).length} unsaved change{Object.keys(pendingChanges).length > 1 ? 's' : ''}
            </span>
            <button onClick={discardChanges} style={btnGhost}>Discard</button>
            <button onClick={saveAllChanges} disabled={saving} style={{
              padding: '10px 28px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'rgba(59,130,246,0.25)', color: '#60a5fa', fontSize: 13, fontWeight: 700,
              boxShadow: '0 0 20px rgba(59,130,246,0.15)',
            }}>
              {saving ? '⏳ Saving...' : '💾 Save Changes'}
            </button>
          </div>
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
