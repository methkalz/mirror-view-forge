import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameData, InputState } from '@/game/types';
import { loadAudioSettings } from '@/game/audio';
import { createGame, resetGame, update, updateIntro } from '@/game/engine';
import { render, renderStartScreen, renderGameOver } from '@/game/renderer';
import { resumeAudio, stopMenuMusic, cancelMenuMusicStart } from '@/game/audio';
import { fetchGameConfig, fetchLeaderboard, submitScore, type RemoteGameConfig, type LeaderboardEntry } from '@/game/config';
import { fetchBackgroundConfig } from '@/game/backgroundConfig';
import { setBackgroundConfig, setCameraMargin } from '@/game/renderer';
import { supabase } from '@/integrations/supabase/client';
import NameEntry from './NameEntry';
import Leaderboard from './Leaderboard';
import GameLoader from './GameLoader';

const SkyfallGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameData | null>(null);
  const inputRef = useRef<InputState>({
    moveDir: { x: 0, y: 0 },
    dash: false,
    shoot: false,
    keys: new Set(),
    touchJoystick: { active: false, origin: { x: 0, y: 0 }, current: { x: 0, y: 0 } },
    touchDash: false,
  });
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [showButtons, setShowButtons] = useState(false);
  const [playerAmmo, setPlayerAmmo] = useState(0);
  const [bulletLevel, setBulletLevel] = useState(1);

  // LiveOps state — always show name entry on mount (different player may use same device)
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('skyfall_name') || '');
  const [showNameEntry, setShowNameEntry] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [gameOverData, setGameOverData] = useState<{ score: number; rank: number | null; waves: number } | null>(null);
  const [remoteConfig, setRemoteConfig] = useState<RemoteGameConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const remoteConfigRef = useRef<RemoteGameConfig | null>(null);
  const scoreSubmittedRef = useRef(false);

  // Load leaderboard on mount + presence tracking
  useEffect(() => {
    let mounted = true;
    setLoadProgress(10);

    const loadAll = async () => {
      try {
        const cfgPromise = fetchGameConfig();
        const lbPromise = fetchLeaderboard();
        const bgPromise = fetchBackgroundConfig();
        setLoadProgress(15);

        const [cfg, lb, bgPhases] = await Promise.all([cfgPromise, lbPromise, bgPromise]);
        if (!mounted) return;
        setLoadProgress(40);

        setRemoteConfig(cfg);
        remoteConfigRef.current = cfg;
        setCameraMargin(cfg.cameraMargin);
        setLeaderboard(lb);
        
        // Inject background config into renderer
        if (bgPhases.length > 0) {
          setBackgroundConfig(bgPhases);
        }

        // Load audio with progress tracking (40% → 95%)
        await loadAudioSettings((pct) => {
          if (mounted) setLoadProgress(40 + Math.round(pct * 55));
        });
        if (!mounted) return;
        setLoadProgress(100);
      } catch (e) {
        console.error('Loading error:', e);
        if (mounted) setLoadProgress(100);
      }
    };

    loadAll();

    // Track online presence
    const channel = supabase.channel('online-players', { config: { presence: { key: `player_${Date.now()}_${Math.random().toString(36).slice(2)}` } } });
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: new Date().toISOString() });
      }
    });
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);

  const handleNameSubmit = useCallback((name: string) => {
    setPlayerName(name);
    localStorage.setItem('skyfall_name', name);
    setShowNameEntry(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || showNameEntry) return;

    const g = createGame(window.innerWidth, window.innerHeight);
    gameRef.current = g;

    // Apply remote config from ref (not state dependency)
    const cfg = remoteConfigRef.current;
    if (cfg) {
      g.player.speed = cfg.baseSpeed;
      g.spawnTimer = cfg.spawnInterval;
      g.difficulty = cfg.difficultyMultiplier;
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
      }
      g.width = w;
      g.height = h;
    };
    resize();
    window.addEventListener('resize', resize);

    let prevState = g.state;
    scoreSubmittedRef.current = false;

    const loop = (time: number) => {
      const dt = lastTimeRef.current ? Math.min((time - lastTimeRef.current) / 1000, 0.05) : 0.016;
      lastTimeRef.current = time;

      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(loop); return; }

      const w = window.innerWidth;
      const h = window.innerHeight;

      try {
        ctx.save();
        ctx.clearRect(0, 0, w, h);

        if (g.state === 'start') {
          renderStartScreen(ctx, w, h, g.highScore);
        } else if (g.state === 'intro') {
          updateIntro(g, dt);
          render(ctx, g);
        } else if (g.state === 'playing') {
          // DDA: if health 100% for 15+ seconds, increase difficulty
          if (remoteConfig?.ddaEnabled && g.player.health >= g.player.maxHealth) {
            if (g.elapsed > 15 && g.difficulty < 5) {
              // Gradual increase
              g.difficulty = Math.min(5, g.difficulty + 0.002 * dt);
            }
          }
          // Global pause check
          if (remoteConfig?.globalPause) {
            // Don't spawn but still allow movement
            render(ctx, g);
          } else {
            update(g, inputRef.current, dt);
            render(ctx, g);
          }
        } else if (g.state === 'gameover') {
          render(ctx, g);
          renderGameOver(ctx, w, h, g.score, g.highScore, g.stats);
          
          // Submit score once
          if (!scoreSubmittedRef.current) {
            scoreSubmittedRef.current = true;
            submitScore(playerName, g.score, g.waveNumber, g.levelNumber, {
              timeSurvived: g.stats.timeSurvived,
              dronesDestroyed: g.stats.dronesDestroyed,
              powerUpsCollected: g.stats.powerUpsCollected,
              closeCalls: g.stats.closeCalls,
              bossesDefeated: g.stats.bossesDefeated,
            }).then(({ rank }) => {
              setGameOverData({ score: g.score, rank, waves: g.waveNumber });
              fetchLeaderboard().then(setLeaderboard);
            });
          }
        }

        ctx.restore();
      } catch (e) {
        console.error('Render error:', e);
        ctx.restore();
      }

      if (g.state !== prevState) {
        const wasStart = prevState === 'start';
        prevState = g.state;
        setShowButtons(g.state === 'playing');
        if (wasStart && g.state === 'intro') {
          cancelMenuMusicStart();
          stopMenuMusic();
        }
        if (g.state === 'start') {
          setGameOverData(null);
          scoreSubmittedRef.current = false;
        }
      }
      if (g.state === 'playing') {
        setPlayerAmmo(g.player.ammo);
        setBulletLevel(g.bulletLevel);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const startOrRestart = () => {
      if (g.state === 'start' || g.state === 'gameover') {
        resumeAudio();
        scoreSubmittedRef.current = false;
        setGameOverData(null);
        // Re-fetch config for next game (apply directly, no re-render)
        fetchGameConfig().then(cfg => {
          remoteConfigRef.current = cfg;
          setCameraMargin(cfg.cameraMargin);
          if (cfg) {
            g.player.speed = cfg.baseSpeed;
            g.spawnTimer = cfg.spawnInterval;
            g.difficulty = cfg.difficultyMultiplier;
          }
        });
        resetGame(g);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      inputRef.current.keys.add(key);
      if (key === ' ' || key === 'space') { e.preventDefault(); inputRef.current.dash = true; }
      if (key === 'f') inputRef.current.shoot = true;
      if (key === 'enter') startOrRestart();
    };
    const onKeyUp = (e: KeyboardEvent) => { inputRef.current.keys.delete(e.key.toLowerCase()); };

    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement) !== canvas) return;
      e.preventDefault();
      if (g.wavePhase === 'cards' && g.upgradeCards.length > 0) {
        const rect = canvas.getBoundingClientRect();
        inputRef.current.cardClick = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        return;
      }
      startOrRestart();
    };

    const preventSelect = (e: Event) => e.preventDefault();
    const preventContext = (e: Event) => e.preventDefault();
    document.addEventListener('selectstart', preventSelect);
    document.addEventListener('contextmenu', preventContext);
    const preventTouch = (e: TouchEvent) => { e.preventDefault(); };
    canvas.addEventListener('touchstart', preventTouch, { passive: false });

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointerDown);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('selectstart', preventSelect);
      document.removeEventListener('contextmenu', preventContext);
      canvas.removeEventListener('touchstart', preventTouch);
    };
  }, [showNameEntry, playerName]);

  const hapticRef = useRef<{ checkbox: HTMLInputElement; label: HTMLLabelElement } | null>(null);
  useEffect(() => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = '_haptic_cb';
    checkbox.style.cssText = 'position:fixed;left:-9999px;opacity:0;pointer-events:none';
    const label = document.createElement('label');
    label.htmlFor = '_haptic_cb';
    label.style.cssText = 'position:fixed;left:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(checkbox);
    document.body.appendChild(label);
    hapticRef.current = { checkbox, label };
    return () => { checkbox.remove(); label.remove(); };
  }, []);

  const vibrate = (ms: number = 15) => {
    if (navigator.vibrate) { navigator.vibrate(ms); return; }
    if (hapticRef.current) { hapticRef.current.label.click(); }
  };

  const handleButtonDown = (action: 'left' | 'right' | 'roll' | 'shoot') => {
    vibrate(action === 'roll' ? 30 : 12);
    if (action === 'left') inputRef.current.keys.add('arrowleft');
    else if (action === 'right') inputRef.current.keys.add('arrowright');
    else if (action === 'roll') inputRef.current.dash = true;
    else if (action === 'shoot') inputRef.current.shoot = true;
  };
  const handleButtonUp = (action: 'left' | 'right' | 'roll' | 'shoot') => {
    if (action === 'left') inputRef.current.keys.delete('arrowleft');
    else if (action === 'right') inputRef.current.keys.delete('arrowright');
  };

  const hasAmmo = playerAmmo > 0;

  // Loading screen
  if (isLoading) {
    return (
      <div style={{ position: 'relative', width: '100vw', height: 'var(--app-height, 100vh)', overflow: 'hidden', background: '#000' }}>
        <GameLoader progress={loadProgress} onLoaded={() => setIsLoading(false)} />
      </div>
    );
  }

  // Name entry screen
  if (showNameEntry) {
    return (
      <div style={{ position: 'relative', width: '100vw', height: 'var(--app-height, 100vh)', overflow: 'hidden', background: '#000' }}>
        <NameEntry
          onSubmit={handleNameSubmit}
          defaultName={playerName}
          branding={remoteConfig ? {
            logoUrl: remoteConfig.logoUrl,
            gameTitle: remoteConfig.gameTitle,
            gameSubtitle: remoteConfig.gameSubtitle,
            developerName: remoteConfig.developerName,
            showTitle: remoteConfig.showTitle,
          } : undefined}
        />
        {leaderboard.length > 0 && (
          <div style={{
            position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            zIndex: 51, width: 'min(340px, 85vw)',
          }}>
            <Leaderboard entries={leaderboard} compact />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'relative', width: '100vw', height: 'var(--app-height, 100vh)', overflow: 'hidden', background: '#000',
        userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation',
      } as React.CSSProperties}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100vw', height: 'var(--app-height, 100vh)', touchAction: 'none', userSelect: 'none' }}
      />

      {/* Game Over overlay with leaderboard */}
      {gameOverData && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, width: 'min(340px, 85vw)',
        }}>
          {gameOverData.rank && gameOverData.rank <= 10 && (
            <div style={{
              textAlign: 'center', marginBottom: 12, padding: '10px 16px',
              borderRadius: 12, background: 'rgba(250,204,21,0.15)',
              border: '1px solid rgba(250,204,21,0.3)',
              color: '#fbbf24', fontSize: 14, fontWeight: 700,
              fontFamily: "'Tajawal', system-ui, sans-serif",
            }}>
              🎉 أنت ضمن العشرة الأوائل! المركز #{gameOverData.rank}
            </div>
          )}
          <Leaderboard
            entries={leaderboard}
            currentPlayerName={playerName}
            currentScore={gameOverData.score}
            currentRank={gameOverData.rank}
            compact
          />
        </div>
      )}

      {showButtons && (
        <>
           <button
             onPointerDown={(e) => { e.preventDefault(); if (hasAmmo) { e.stopPropagation(); handleButtonDown('shoot'); } }}
             style={{
               position: 'absolute', left: 220, bottom: 'calc(95px + env(safe-area-inset-bottom, 0px))', width: 72, height: 56,
              borderRadius: 16,
              border: hasAmmo ? '1.5px solid rgba(220,38,38,0.5)' : '1.5px solid rgba(100,100,100,0.3)',
              background: hasAmmo ? 'rgba(220,38,38,0.12)' : 'rgba(80,80,80,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'pointer', zIndex: 10,
              backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', transition: 'all 0.15s ease',
            }}
          >
            <svg width="24" height="28" viewBox="0 0 24 28" fill="none" style={{ opacity: hasAmmo ? 0.95 : 0.4 }}>
              <defs>
                <linearGradient id="bulletBodyGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={hasAmmo ? '#b8860b' : '#888'} />
                  <stop offset="40%" stopColor={hasAmmo ? '#daa520' : '#aaa'} />
                  <stop offset="60%" stopColor={hasAmmo ? '#ffd700' : '#bbb'} />
                  <stop offset="100%" stopColor={hasAmmo ? '#b8860b' : '#888'} />
                </linearGradient>
                <linearGradient id="bulletTipGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={hasAmmo ? '#cd853f' : '#999'} />
                  <stop offset="100%" stopColor={hasAmmo ? '#8b6914' : '#777'} />
                </linearGradient>
              </defs>
              {bulletLevel === 1 && (
                <>
                  <rect x="9" y="10" width="6" height="13" rx="1" fill="url(#bulletBodyGrad)" />
                  <path d="M9,10 Q9,4 12,2 Q15,4 15,10 Z" fill="url(#bulletTipGrad)" />
                  <rect x="9" y="21" width="6" height="2" rx="0.5" fill={hasAmmo ? '#8b6914' : '#666'} />
                  <rect x="10.5" y="14" width="3" height="1" rx="0.3" fill="rgba(255,255,255,0.2)" />
                </>
              )}
              {bulletLevel === 2 && (
                <>
                  <rect x="3" y="10" width="5.5" height="13" rx="1" fill="url(#bulletBodyGrad)" />
                  <path d="M3,10 Q3,4.5 5.75,2.5 Q8.5,4.5 8.5,10 Z" fill="url(#bulletTipGrad)" />
                  <rect x="3" y="21" width="5.5" height="2" rx="0.5" fill={hasAmmo ? '#8b6914' : '#666'} />
                  <rect x="15.5" y="10" width="5.5" height="13" rx="1" fill="url(#bulletBodyGrad)" />
                  <path d="M15.5,10 Q15.5,4.5 18.25,2.5 Q21,4.5 21,10 Z" fill="url(#bulletTipGrad)" />
                  <rect x="15.5" y="21" width="5.5" height="2" rx="0.5" fill={hasAmmo ? '#8b6914' : '#666'} />
                </>
              )}
              {bulletLevel >= 3 && (
                <>
                  <g transform="translate(1,2) rotate(-12, 5.5, 14)">
                    <rect x="2.5" y="8" width="5" height="12" rx="1" fill="url(#bulletBodyGrad)" />
                    <path d="M2.5,8 Q2.5,3 5,1.5 Q7.5,3 7.5,8 Z" fill="url(#bulletTipGrad)" />
                    <rect x="2.5" y="18.5" width="5" height="1.5" rx="0.4" fill={hasAmmo ? '#8b6914' : '#666'} />
                  </g>
                  <rect x="9.5" y="8" width="5" height="12" rx="1" fill="url(#bulletBodyGrad)" />
                  <path d="M9.5,8 Q9.5,3 12,1.5 Q14.5,3 14.5,8 Z" fill="url(#bulletTipGrad)" />
                  <rect x="9.5" y="18.5" width="5" height="1.5" rx="0.4" fill={hasAmmo ? '#8b6914' : '#666'} />
                  <g transform="translate(-1,2) rotate(12, 18.5, 14)">
                    <rect x="16.5" y="8" width="5" height="12" rx="1" fill="url(#bulletBodyGrad)" />
                    <path d="M16.5,8 Q16.5,3 19,1.5 Q21.5,3 21.5,8 Z" fill="url(#bulletTipGrad)" />
                    <rect x="16.5" y="18.5" width="5" height="1.5" rx="0.4" fill={hasAmmo ? '#8b6914' : '#666'} />
                  </g>
                </>
              )}
            </svg>
            <span style={{
              position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%',
              background: hasAmmo ? 'rgba(220,38,38,0.9)' : 'rgba(100,100,100,0.75)',
              color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: "'SF Pro', system-ui, sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1.5px solid rgba(0,0,0,0.3)',
              boxShadow: hasAmmo ? '0 0 8px rgba(220,38,38,0.5)' : '0 0 4px rgba(100,100,100,0.3)',
            }}>
              {hasAmmo ? playerAmmo : '0'}
            </span>
          </button>

          <button
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleButtonDown('left'); }}
            onPointerUp={() => handleButtonUp('left')}
            onPointerLeave={() => handleButtonUp('left')}
            style={{
              position: 'absolute', left: 14, bottom: 'calc(95px + env(safe-area-inset-bottom, 0px))', width: 72, height: 56,
              borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)',
              fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'pointer', zIndex: 10,
              backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
            }}
          >‹</button>

          <button
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleButtonDown('right'); }}
            onPointerUp={() => handleButtonUp('right')}
            onPointerLeave={() => handleButtonUp('right')}
            style={{
              position: 'absolute', left: 136, bottom: 'calc(95px + env(safe-area-inset-bottom, 0px))', width: 72, height: 56,
              borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)',
              fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'pointer', zIndex: 10,
              backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
            }}
          >›</button>

          <button
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleButtonDown('roll'); }}
            style={{
              position: 'absolute', right: 16, bottom: 'calc(95px + env(safe-area-inset-bottom, 0px))', width: 80, height: 56,
              borderRadius: 16, border: '1px solid rgba(251,191,36,0.25)',
              background: 'rgba(251,191,36,0.06)', color: 'rgba(251,191,36,0.65)',
              fontSize: 11, fontFamily: "'SF Pro', system-ui, -apple-system, sans-serif",
              fontWeight: 600, letterSpacing: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'pointer', zIndex: 10,
              backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
            }}
          >ROLL</button>
        </>
      )}
    </div>
  );
};

export default SkyfallGame;
