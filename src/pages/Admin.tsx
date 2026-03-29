import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import {
  fetchGameConfig, updateGameConfig, fetchLeaderboard, deleteLeaderboardEntry, clearLeaderboard,
  fetchWaveConfigs, upsertWaveConfig, deleteWaveConfig,
  fetchAudioConfig, updateAudioEntry, updateAudioCategory,
  type RemoteGameConfig, type RemoteWaveConfig, type LeaderboardEntry, type AudioConfigEntry,
} from '@/game/config';

const Admin: React.FC = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'config' | 'waves' | 'leaderboard' | 'audio'>('config');

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
    const [c, w, l, a] = await Promise.all([fetchGameConfig(), fetchWaveConfigs(), fetchLeaderboard(), fetchAudioConfig()]);
    setConfig(c);
    setWaves(w);
    setLeaders(l);
    setAudioEntries(a);
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['config', 'waves', 'leaderboard'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 600,
              background: tab === t ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
              color: tab === t ? '#60a5fa' : 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
            }}
          >
            {t === 'config' ? '🎮 Config' : t === 'waves' ? '🌊 Waves' : '🏆 Leaders'}
          </button>
        ))}
      </div>

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
