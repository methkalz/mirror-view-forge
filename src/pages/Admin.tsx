import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import {
  fetchGameConfig, updateGameConfig, fetchLeaderboard, deleteLeaderboardEntry, clearLeaderboard,
  fetchWaveConfigs, upsertWaveConfig, deleteWaveConfig,
  fetchAudioConfig, updateAudioEntry, updateAudioCategory, uploadAudioFile, deleteAudioFile, listAudioLibrary,
  addAudioFile, removeAudioFile, fetchAnalytics,
  type RemoteGameConfig, type RemoteWaveConfig, type LeaderboardEntry, type AudioConfigEntry, type AudioFileEntry, type PlayMode, type GameAnalytics,
} from '@/game/config';

const Admin: React.FC = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'analytics' | 'config' | 'branding' | 'waves' | 'leaderboard' | 'audio'>('analytics');

  // Config state
  const [config, setConfig] = useState<RemoteGameConfig | null>(null);
  const [saving, setSaving] = useState(false);

  // Wave state
  const [waves, setWaves] = useState<RemoteWaveConfig[]>([]);
  const [editingWave, setEditingWave] = useState<RemoteWaveConfig | null>(null);

  // Leaderboard state
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);

  // Audio state
  const [audioEntries, setAudioEntries] = useState<AudioConfigEntry[]>([]);
  const [analytics, setAnalytics] = useState<GameAnalytics | null>(null);

  // Auth check
  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/admin/login'); return; }
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin');
      if (!roles || roles.length === 0) { navigate('/admin/login'); return; }
      setIsAdmin(true);
      setLoading(false);
    };
    check();
  }, [navigate]);

  const loadAll = useCallback(async () => {
    const [c, w, l, a, an] = await Promise.all([fetchGameConfig(), fetchWaveConfigs(), fetchLeaderboard(), fetchAudioConfig(), fetchAnalytics()]);
    setConfig(c);
    setWaves(w);
    setLeaders(l);
    setAudioEntries(a);
    setAnalytics(an);
  }, []);

  useEffect(() => { if (isAdmin) loadAll(); }, [isAdmin, loadAll]);

  const saveConfig = async (updates: Partial<RemoteGameConfig>) => {
    if (!config) return;
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
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
    const w = await fetchWaveConfigs();
    setWaves(w);
  };

  const handleDeleteWave = async (waveNumber: number) => {
    await deleteWaveConfig(waveNumber);
    setWaves(prev => prev.filter(w => w.waveNumber !== waveNumber));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  if (loading) return <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;

  const sectionStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '20px 16px',
    marginBottom: 16,
  };

  const labelStyle: React.CSSProperties = {
    color: 'rgba(203,213,225,0.8)', fontSize: 13, fontWeight: 500, marginBottom: 4, display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)',
    color: '#f1f5f9', fontSize: 14, outline: 'none',
  };

  const btnStyle = (color: string): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, border: 'none',
    background: color, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      color: '#f1f5f9',
      fontFamily: "'SF Pro', system-ui, sans-serif",
      padding: '20px 16px',
      maxWidth: 600,
      margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>⚙️ Skyfall Admin</h1>
        <button onClick={handleLogout} style={btnStyle('rgba(100,116,139,0.3)')}>Logout</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {([
          { key: 'analytics' as const, icon: '📊', label: 'Analytics' },
          { key: 'config' as const, icon: '🎮', label: 'Config' },
          { key: 'branding' as const, icon: '🎨', label: 'Brand' },
          { key: 'waves' as const, icon: '🌊', label: 'Waves' },
          { key: 'audio' as const, icon: '🔊', label: 'Audio' },
          { key: 'leaderboard' as const, icon: '🏆', label: 'Leaders' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 600,
              background: tab === t.key ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
              color: tab === t.key ? '#60a5fa' : 'rgba(255,255,255,0.5)',
              cursor: 'pointer', minWidth: 60,
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ANALYTICS TAB */}
      {tab === 'analytics' && analytics && <AnalyticsPanel data={analytics} onRefresh={async () => { const an = await fetchAnalytics(); setAnalytics(an); }} />}

      {/* CONFIG TAB */}
      {tab === 'config' && config && (
        <div style={sectionStyle}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Game Configuration {saving && '(saving...)'}</h3>

          {/* Kill Switch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '12px', borderRadius: 10, background: config.globalPause ? 'rgba(220,38,38,0.15)' : 'rgba(34,197,94,0.1)', border: `1px solid ${config.globalPause ? 'rgba(220,38,38,0.3)' : 'rgba(34,197,94,0.2)'}` }}>
            <span style={{ fontSize: 14, flex: 1 }}>{config.globalPause ? '⛔ Spawning PAUSED' : '✅ Spawning Active'}</span>
            <button onClick={() => saveConfig({ globalPause: !config.globalPause })} style={btnStyle(config.globalPause ? '#22c55e' : '#dc2626')}>
              {config.globalPause ? 'Resume' : 'Pause'}
            </button>
          </div>

          {/* DDA toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <span style={{ fontSize: 13, flex: 1, color: 'rgba(203,213,225,0.8)' }}>Dynamic Difficulty (DDA)</span>
            <button onClick={() => saveConfig({ ddaEnabled: !config.ddaEnabled })} style={btnStyle(config.ddaEnabled ? '#3b82f6' : 'rgba(100,116,139,0.4)')}>
              {config.ddaEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Sliders */}
          {([
            { key: 'gravity', label: 'Gravity', min: 0.1, max: 3, step: 0.1 },
            { key: 'baseSpeed', label: 'Base Speed', min: 100, max: 600, step: 10 },
            { key: 'spawnInterval', label: 'Spawn Interval (s)', min: 0.5, max: 10, step: 0.5 },
            { key: 'difficultyMultiplier', label: 'Difficulty Multiplier', min: 0.5, max: 5, step: 0.1 },
          ] as const).map(({ key, label, min, max, step }) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={labelStyle}>{label}</label>
                <span style={{ color: '#60a5fa', fontSize: 13, fontWeight: 600 }}>{config[key]}</span>
              </div>
              <input
                type="range" min={min} max={max} step={step}
                value={config[key]}
                onChange={e => saveConfig({ [key]: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#3b82f6' }}
              />
            </div>
          ))}
        </div>
      )}

      {/* BRANDING TAB */}
      {tab === 'branding' && config && (
        <BrandingPanel config={config} onSave={saveConfig} inputStyle={inputStyle} labelStyle={labelStyle} btnStyle={btnStyle} sectionStyle={sectionStyle} />
      )}

      {/* WAVES TAB */}
      {tab === 'waves' && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Wave Recipes</h3>
            <button
              onClick={() => setEditingWave({
                waveNumber: waves.length > 0 ? Math.max(...waves.map(w => w.waveNumber)) + 1 : 1,
                duration: 60, threats: ['shrapnel'], maxConcurrent: 5, spawnRate: 3.5, surgeMultiplier: 1.0, droneTypes: [],
              })}
              style={btnStyle('#3b82f6')}
            >+ Add Wave</button>
          </div>

          {waves.map(w => (
            <div key={w.waveNumber} style={{
              padding: '12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)', marginBottom: 8,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontWeight: 700, color: '#60a5fa', width: 40 }}>W{w.waveNumber}</span>
              <span style={{ flex: 1, fontSize: 12, color: 'rgba(203,213,225,0.7)' }}>
                {w.threats.join(', ')} | {w.duration}s | max:{w.maxConcurrent}
              </span>
              <button onClick={() => setEditingWave({ ...w })} style={btnStyle('rgba(59,130,246,0.3)')}>Edit</button>
              <button onClick={() => handleDeleteWave(w.waveNumber)} style={btnStyle('rgba(220,38,38,0.3)')}>✕</button>
            </div>
          ))}

          {waves.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              No wave configs — game uses built-in defaults
            </p>
          )}

          {/* Wave Editor Modal */}
          {editingWave && (
            <WaveEditor
              wave={editingWave}
              onSave={handleSaveWave}
              onCancel={() => setEditingWave(null)}
            />
          )}
        </div>
      )}

      {/* AUDIO TAB */}
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

      {/* LEADERBOARD TAB */}
      {tab === 'leaderboard' && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Leaderboard ({leaders.length})</h3>
            <button onClick={handleClearAll} style={btnStyle('rgba(220,38,38,0.4)')}>Clear All</button>
          </div>

          {leaders.map((e, i) => (
            <div key={e.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 8, background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
            }}>
              <span style={{ width: 24, fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>#{i + 1}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{e.playerName}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa' }}>{e.score.toLocaleString()}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>W{e.wavesReached}</span>
              <button onClick={() => handleDeleteEntry(e.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Analytics Panel ───

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

const AnalyticsPanel: React.FC<{ data: GameAnalytics; onRefresh: () => void }> = ({ data, onRefresh }) => {
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    const channel = supabase.channel('online-players');
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      setOnlineCount(Object.keys(state).length);
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);
  const panelStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.08)', padding: '20px 16px', marginBottom: 16,
  };

  const statCard = (icon: string, label: string, value: string | number, color: string, sub?: string): React.ReactNode => (
    <div style={{
      flex: '1 1 45%', minWidth: 120, padding: '14px 12px', borderRadius: 12,
      background: `${color}11`, border: `1px solid ${color}22`,
    }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const maxHourCount = Math.max(...data.hourlyDistribution.map(h => h.count), 1);

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>📊 Game Analytics</h3>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>إحصائيات مباشرة — بيانات حقيقية عن اللاعبين</p>
        </div>
        <button onClick={onRefresh} style={{
          padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'rgba(59,130,246,0.2)', color: '#93c5fd', fontSize: 11, fontWeight: 600,
        }}>🔄 Refresh</button>
      </div>

      {/* Key Metrics */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {statCard('🟢', 'Online Now — متواجدون الآن', onlineCount, '#10b981')}
        {statCard('🎮', 'Total Sessions', data.totalSessions, '#3b82f6', `${data.sessionsToday} today · ${data.sessionsThisWeek} this week`)}
        {statCard('👥', 'Unique Players', data.uniquePlayers, '#8b5cf6')}
        {statCard('⏱️', 'Avg Duration', formatTime(data.avgDuration), '#f59e0b', `Max: ${formatTime(data.maxDuration)}`)}
        {statCard('⭐', 'Avg Score', data.avgScore.toLocaleString(), '#22c55e', `Max: ${data.maxScore.toLocaleString()}`)}
        {statCard('🌊', 'Avg Waves', data.avgWaves.toString(), '#06b6d4', `Max: ${data.maxWaves}`)}
        {statCard('🕐', 'Total Play Time', formatTime(data.totalPlayTime), '#ec4899')}
      </div>

      {/* Retention Funnel */}
      <div style={{ marginBottom: 16, padding: '14px', borderRadius: 12, background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', marginBottom: 10 }}>🔁 Player Retention — بقاء اللاعبين</div>
        {[
          { label: '1+ game', count: data.retentionData.players1Game, color: '#22c55e' },
          { label: '3+ games', count: data.retentionData.players3Games, color: '#3b82f6' },
          { label: '5+ games', count: data.retentionData.players5Games, color: '#f59e0b' },
          { label: '10+ games', count: data.retentionData.players10Games, color: '#ef4444' },
        ].map(({ label, count, color }) => {
          const pct = data.retentionData.players1Game > 0 ? (count / data.retentionData.players1Game) * 100 : 0;
          return (
            <div key={label} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
                <span style={{ color, fontWeight: 700 }}>{count} ({Math.round(pct)}%)</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ height: '100%', borderRadius: 3, background: color, width: `${pct}%`, transition: 'width 0.5s' }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Hourly Distribution */}
      <div style={{ marginBottom: 16, padding: '14px', borderRadius: 12, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', marginBottom: 10 }}>🕐 Peak Hours — أوقات الذروة</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
          {data.hourlyDistribution.map(({ hour, count }) => (
            <div key={hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{
                width: '100%', borderRadius: 3,
                height: Math.max(2, (count / maxHourCount) * 50),
                background: count > maxHourCount * 0.7 ? '#3b82f6' : count > maxHourCount * 0.3 ? 'rgba(59,130,246,0.4)' : 'rgba(59,130,246,0.15)',
                transition: 'height 0.3s',
              }} />
              {hour % 4 === 0 && <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>{hour}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Top Players */}
      <div style={{ marginBottom: 16, padding: '14px', borderRadius: 12, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', marginBottom: 10 }}>🏅 Top Players — أفضل اللاعبين</div>
        {data.topPlayers.length === 0 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 12 }}>No data yet</div>}
        {data.topPlayers.map((p, i) => (
          <div key={p.name} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
            borderBottom: i < data.topPlayers.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
          }}>
            <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>{p.games} games · {formatTime(p.totalTime)} total</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>{p.avgScore.toLocaleString()}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>best: {p.bestScore.toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Sessions */}
      <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 10 }}>📋 Recent Sessions — الجلسات الأخيرة</div>
        {data.recentSessions.length === 0 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 12 }}>No sessions yet</div>}
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {data.recentSessions.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
              borderBottom: i < data.recentSessions.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
              fontSize: 11,
            }}>
              <span style={{ color: '#e2e8f0', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.playerName}</span>
              <span style={{ color: '#4ade80', fontWeight: 700 }}>{s.score.toLocaleString()}</span>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>W{s.waves}</span>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>{formatTime(s.duration)}</span>
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 8 }}>{new Date(s.createdAt).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- Audio Panel Sub-Component ---
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

  const panelStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.08)', padding: '20px 16px', marginBottom: 16,
  };
  const smallBtn = (bg: string, color = '#fff'): React.CSSProperties => ({
    padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: bg, color, fontSize: 10, fontWeight: 600,
  });
  const chipBtn = (active: boolean, color: string): React.CSSProperties => ({
    padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
    background: active ? color + '33' : 'rgba(255,255,255,0.06)', color: active ? color : 'rgba(255,255,255,0.4)',
  });

  return (
    <div style={panelStyle}>
      <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => {
        const file = e.target.files?.[0]; const eid = fileInputRef.current?.dataset.entryId; const sk = fileInputRef.current?.dataset.soundKey;
        if (file && eid && sk) handleUploadFile(eid, sk, file); e.target.value = '';
      }} />

      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>🔊 Professional Audio System</h3>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>نظام صوتي احترافي — أصوات متعددة لكل مصدر مع أوضاع تشغيل ذكية</p>

      {/* Master volume */}
      <div style={{ padding: '12px 14px', borderRadius: 12, marginBottom: 16, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>🎚️</span>
          <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>Master Volume</span>
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
          <div key={cat} style={{ marginBottom: 10, borderRadius: 12, overflow: 'hidden', border: `1px solid ${expanded ? meta.color + '33' : 'rgba(255,255,255,0.06)'}`, background: expanded ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
            <div onClick={() => setExpandedCat(expanded ? null : cat)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ fontSize: 20 }}>{meta.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>{meta.label}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{meta.labelAr} · {items.length} sounds</div>
              </div>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginRight: 6 }}>{Math.round(catAvgVol * 100)}%</span>
              <button onClick={e => { e.stopPropagation(); onCategoryUpdate(cat, { enabled: !catEnabled }); }} style={{
                width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: catEnabled ? meta.color + '55' : 'rgba(255,255,255,0.1)', position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{ width: 16, height: 16, borderRadius: 8, background: catEnabled ? meta.color : 'rgba(255,255,255,0.3)', position: 'absolute', top: 2, left: catEnabled ? 18 : 2, transition: 'all 0.2s' }} />
              </button>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
            </div>

            {expanded && <div style={{ padding: '0 14px 8px' }}>
              <input type="range" min={0} max={1} step={0.05} value={catAvgVol} onChange={e => onCategoryUpdate(cat, { volume: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: meta.color }} />
            </div>}

            {expanded && items.map(item => {
              const isOpen = expandedItem === item.id;
              return (
                <div key={item.id} style={{ padding: '10px 14px 10px 20px', borderTop: '1px solid rgba(255,255,255,0.04)', opacity: item.enabled ? 1 : 0.4, transition: 'opacity 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setExpandedItem(isOpen ? null : item.id)}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                        {item.label}
                        {item.files.length > 0 && <span style={{ fontSize: 9, color: meta.color, marginLeft: 4 }}>🎵×{item.files.length}</span>}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{item.labelAr}</div>
                    </div>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', width: 30, textAlign: 'right' }}>{Math.round(item.volume * 100)}%</span>
                    <input type="range" min={0} max={2} step={0.05} value={item.volume} onChange={e => handleUpdate(item.id, { volume: parseFloat(e.target.value) })} style={{ width: 70, accentColor: meta.color }} />
                    <button onClick={() => handleUpdate(item.id, { enabled: !item.enabled })} style={{
                      width: 28, height: 16, borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: item.enabled ? meta.color + '44' : 'rgba(255,255,255,0.08)', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    }}>
                      <div style={{ width: 12, height: 12, borderRadius: 6, background: item.enabled ? meta.color : 'rgba(255,255,255,0.25)', position: 'absolute', top: 2, left: item.enabled ? 14 : 2, transition: 'all 0.2s' }} />
                    </button>
                    <span onClick={() => setExpandedItem(isOpen ? null : item.id)} style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', cursor: 'pointer', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      {/* Play Mode */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Play Mode — وضع التشغيل</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {PLAY_MODES.map(m => (
                            <button key={m.value} onClick={() => handleUpdate(item.id, { playMode: m.value })} style={chipBtn(item.playMode === m.value, meta.color)}>
                              {m.icon} {m.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Interval */}
                      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>⏱ Interval (sec)</div>
                        <input type="number" min={0} step={1} value={item.intervalSeconds ?? ''} placeholder="—"
                          onChange={e => handleUpdate(item.id, { intervalSeconds: e.target.value ? parseFloat(e.target.value) : null } as any)}
                          style={{ width: 60, padding: '4px 6px', borderRadius: 6, fontSize: 11, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: '#f1f5f9', outline: 'none' }}
                        />
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{item.intervalSeconds ? `كل ${item.intervalSeconds} ثانية` : 'عند الحدث فقط'}</div>
                      </div>

                      {/* Files list */}
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                          🎵 Audio Files ({item.files.length})
                          {item.files.length > 1 && <span style={{ color: meta.color }}> — {item.playMode === 'random' ? 'عشوائي' : item.playMode === 'sequential' ? 'تسلسلي' : item.playMode === 'loop' ? 'متكرر' : 'أول ملف'}</span>}
                        </div>
                        {item.files.length === 0 && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', padding: '6px 0' }}>🔊 Using synthesized sound — أضف ملفات صوتية</div>}
                        {item.files.map((f, idx) => (
                          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: idx < item.files.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', width: 16 }}>#{idx + 1}</span>
                            <span style={{ fontSize: 10, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fileName}</span>
                            <button onClick={() => handlePreview(f.fileUrl)} style={smallBtn('rgba(59,130,246,0.25)', '#93c5fd')}>▶</button>
                            <button onClick={stopPreview} style={smallBtn('rgba(255,255,255,0.1)', 'rgba(255,255,255,0.4)')}>⏹</button>
                            <button onClick={() => handleRemoveFile(item.id, f.id, f.fileUrl)} style={smallBtn('rgba(220,38,38,0.2)', '#fca5a5')}>✕</button>
                          </div>
                        ))}
                      </div>

                      {/* Upload + Library */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button disabled={uploading === item.id} onClick={() => { if (fileInputRef.current) { fileInputRef.current.dataset.entryId = item.id; fileInputRef.current.dataset.soundKey = item.soundKey; fileInputRef.current.click(); } }}
                          style={smallBtn('rgba(59,130,246,0.2)', '#93c5fd')}>{uploading === item.id ? '⏳...' : '📁 Upload'}</button>
                        <button onClick={() => { setLibraryOpen(libraryOpen === item.id ? null : item.id); loadLibrary(); }} style={smallBtn('rgba(168,85,247,0.2)', '#c4b5fd')}>📚 Library</button>
                      </div>

                      {/* Library picker */}
                      {libraryOpen === item.id && (
                        <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', maxHeight: 150, overflowY: 'auto' }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>📚 ({library.length} files)</div>
                          {library.length === 0 && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', padding: 8, textAlign: 'center' }}>Upload files first</div>}
                          {library.map(f => (
                            <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <span style={{ fontSize: 10, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                              <button onClick={() => handlePreview(f.url)} style={smallBtn('rgba(59,130,246,0.2)', '#93c5fd')}>▶</button>
                              <button onClick={() => handleAddFromLibrary(item.id, f.url, f.name)} style={smallBtn('rgba(34,197,94,0.2)', '#86efac')}>+ Add</button>
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
    </div>
  );
};

// ─── Branding Panel ───
const BrandingPanel: React.FC<{
  config: RemoteGameConfig;
  onSave: (updates: Partial<RemoteGameConfig>) => void;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  btnStyle: (color: string) => React.CSSProperties;
  sectionStyle: React.CSSProperties;
}> = ({ config, onSave, inputStyle, labelStyle, sectionStyle }) => {
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
    <div style={sectionStyle}>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>🎨 Branding — العلامة التجارية</h3>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>تحكم بالشعار والهوية البصرية لشاشة البداية</p>

      {/* Logo */}
      <div style={{ marginBottom: 20, padding: 16, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <label style={labelStyle}>Logo — الشعار</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          {config.logoUrl ? (
            <img src={config.logoUrl} alt="Logo" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 10, background: 'rgba(0,0,0,0.3)', padding: 6 }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 10, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 24 }}>☄️</div>
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ''; }} />
            <button onClick={() => logoInputRef.current?.click()} disabled={logoUploading} style={{
              padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: 'rgba(59,130,246,0.2)', color: '#93c5fd',
            }}>
              {logoUploading ? '⏳ Uploading...' : '📁 Upload Logo'}
            </button>
            {config.logoUrl && (
              <button onClick={() => onSave({ logoUrl: null })} style={{
                padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: 'rgba(220,38,38,0.15)', color: '#fca5a5',
              }}>✕ Remove Logo</button>
            )}
          </div>
        </div>
      </div>

      {/* Game Title */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Game Title — اسم اللعبة</label>
        <input value={config.gameTitle} onChange={e => onSave({ gameTitle: e.target.value })} style={inputStyle} />
      </div>

      {/* Subtitle */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Subtitle — العنوان الفرعي</label>
        <input value={config.gameSubtitle} onChange={e => onSave({ gameSubtitle: e.target.value })} style={inputStyle} />
      </div>

      {/* Developer Name */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Developer Name — اسم المطور</label>
        <input value={config.developerName} onChange={e => onSave({ developerName: e.target.value })} style={inputStyle} />
      </div>

      {/* Preview */}
      <div style={{
        marginTop: 20, padding: 20, borderRadius: 16, textAlign: 'center',
        background: 'radial-gradient(ellipse at 50% 40%, rgba(15,23,42,0.95) 0%, rgba(0,0,0,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 10, letterSpacing: 2 }}>PREVIEW — معاينة</div>
        {config.logoUrl ? (
          <img src={config.logoUrl} alt="Logo" style={{ width: 60, height: 60, objectFit: 'contain', marginBottom: 6 }} />
        ) : (
          <div style={{ fontSize: 28, fontWeight: 900, color: '#f1f5f9', marginBottom: 2 }}>☄️ {config.gameTitle}</div>
        )}
        <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.5)', letterSpacing: 4, marginBottom: 8 }}>{config.gameSubtitle}</div>
        <div style={{ fontSize: 9, color: 'rgba(100,116,139,0.4)', letterSpacing: 2 }}>Developed by {config.developerName}</div>
      </div>
    </div>
  );
};

// --- Wave Editor Sub-Component ---
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

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)',
    color: '#f1f5f9', fontSize: 14, outline: 'none', width: '100%',
  };

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: 'none',
    background: active ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.05)',
    color: active ? '#93c5fd' : 'rgba(255,255,255,0.4)',
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20,
    }}>
      <div style={{
        background: '#1e293b', borderRadius: 16, padding: '24px 20px',
        width: 'min(400px, 90vw)', maxHeight: '80vh', overflowY: 'auto',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#f1f5f9' }}>
          Wave {w.waveNumber} Editor
        </h3>

        <label style={{ color: 'rgba(203,213,225,0.8)', fontSize: 12, display: 'block', marginBottom: 4 }}>Wave Number</label>
        <input type="number" value={w.waveNumber} onChange={e => setW({ ...w, waveNumber: parseInt(e.target.value) || 1 })} style={{ ...inputStyle, marginBottom: 12 }} />

        <label style={{ color: 'rgba(203,213,225,0.8)', fontSize: 12, display: 'block', marginBottom: 4 }}>Duration (seconds)</label>
        <input type="number" value={w.duration} onChange={e => setW({ ...w, duration: parseFloat(e.target.value) || 60 })} style={{ ...inputStyle, marginBottom: 12 }} />

        <label style={{ color: 'rgba(203,213,225,0.8)', fontSize: 12, display: 'block', marginBottom: 4 }}>Max Concurrent</label>
        <input type="number" value={w.maxConcurrent} onChange={e => setW({ ...w, maxConcurrent: parseInt(e.target.value) || 5 })} style={{ ...inputStyle, marginBottom: 12 }} />

        <label style={{ color: 'rgba(203,213,225,0.8)', fontSize: 12, display: 'block', marginBottom: 4 }}>Spawn Rate</label>
        <input type="number" step="0.5" value={w.spawnRate} onChange={e => setW({ ...w, spawnRate: parseFloat(e.target.value) || 3.5 })} style={{ ...inputStyle, marginBottom: 12 }} />

        <label style={{ color: 'rgba(203,213,225,0.8)', fontSize: 12, display: 'block', marginBottom: 4 }}>Surge Multiplier</label>
        <input type="number" step="0.1" value={w.surgeMultiplier} onChange={e => setW({ ...w, surgeMultiplier: parseFloat(e.target.value) || 1 })} style={{ ...inputStyle, marginBottom: 16 }} />

        <label style={{ color: 'rgba(203,213,225,0.8)', fontSize: 12, display: 'block', marginBottom: 6 }}>Threats</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {THREAT_TYPES.map(t => (
            <button key={t} onClick={() => setW({ ...w, threats: toggle(w.threats, t) })} style={chipStyle(w.threats.includes(t))}>{t}</button>
          ))}
        </div>

        <label style={{ color: 'rgba(203,213,225,0.8)', fontSize: 12, display: 'block', marginBottom: 6 }}>Drone Types</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {DRONE_TYPES.map(t => (
            <button key={t} onClick={() => setW({ ...w, droneTypes: toggle(w.droneTypes, t) })} style={chipStyle(w.droneTypes.includes(t))}>{t}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => onSave(w)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save</button>
          <button onClick={onCancel} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: 'rgba(100,116,139,0.3)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default Admin;
