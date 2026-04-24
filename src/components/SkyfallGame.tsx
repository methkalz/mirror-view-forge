import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameData, InputState } from '@/game/types';
import { loadAudioSettings, reloadAudioSettings } from '@/game/audio';
import { createGame, resetGame, update, updateIntro, updateCardsOnly, hasModalCard, _debug } from '@/game/engine';
import { render, renderStartScreen, renderGameOver } from '@/game/renderer';
import { resumeAudio, stopMenuMusic, cancelMenuMusicStart, sfxSlideTransition, sfxAmmoTutorial, stopGameOverVoice } from '@/game/audio';
import { fetchGameConfig, fetchLeaderboard, fetchDifficultyProfile, fetchWaveConfigs, submitScore, type RemoteGameConfig, type LeaderboardEntry, type DifficultyProfile, type RemoteWaveConfig } from '@/game/config';
import { fetchBackgroundConfig, fetchScenes, type Scene, type BackgroundPhase } from '@/game/backgroundConfig';
import { setBackgroundConfig, setBackgroundConfigForScene, setCameraMargin } from '@/game/renderer';
import { setOnSceneSwap } from '@/game/engine';
import { attachDebugAPI, getGameSpeed, isGodMode, isInfiniteAmmo, type DebugAPI } from '@/game/debugCommands';
import { supabase } from '@/integrations/supabase/client';
import NameEntry from './NameEntry';
import PrizeEntryCard from './PrizeEntryCard';
import Leaderboard from './Leaderboard';
import GameLoader from './GameLoader';
import SettingsDrawer from './SettingsDrawer';
import { setBloomQuality } from '@/game/render/postFx';
import { getSettings, subscribeSettings, hapticsEnabled } from '@/game/settings';

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
    pointer: {},
  });
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [showButtons, setShowButtons] = useState(false);
  const [playerAmmo, setPlayerAmmo] = useState(0);
  const [bulletLevel, setBulletLevel] = useState(1);
  const [controlTutorial, setControlTutorial] = useState<number>(-1); // -1=inactive, 0-3=step
  const [currentTutorialPage, setCurrentTutorialPage] = useState(0);
  const pauseRef = useRef(false);

  // LiveOps state — always show name entry on mount (different player may use same device)
  // EXCEPT when loaded inside the admin Simulator iframe (?sim=... query param)
  const isSimulatorMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sim');
  const [playerName, setPlayerName] = useState(() => isSimulatorMode ? 'SIM' : (localStorage.getItem('skyfall_name') || ''));
  const [showNameEntry, setShowNameEntry] = useState(!isSimulatorMode);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [gameOverData, setGameOverData] = useState<{ score: number; rank: number | null; waves: number } | null>(null);
  const [remoteConfig, setRemoteConfig] = useState<RemoteGameConfig | null>(null);
  // Skip loading screen entirely in simulator mode to avoid race conditions
  const [isLoading, setIsLoading] = useState(!isSimulatorMode);
  const [loadProgress, setLoadProgress] = useState(isSimulatorMode ? 100 : 0);
  const remoteConfigRef = useRef<RemoteGameConfig | null>(null);
  const difficultyProfileRef = useRef<DifficultyProfile | null>(null);
  const waveOverridesRef = useRef<RemoteWaveConfig[]>([]);
  const scoreSubmittedRef = useRef(false);
  const tutorialShownRef = useRef(false);
  const [ammoArrowVisible, setAmmoArrowVisible] = useState(false);
  const ammoTutorialShownRef = useRef(false);
  const ammoArrowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scenesRef = useRef<Scene[]>([]);
  const allBgPhasesRef = useRef<BackgroundPhase[]>([]);
  const [showPrizeCard, setShowPrizeCard] = useState(false);
  const prizeShownRef = useRef(false);

  // Settings drawer — reachable only between rounds (start screen / game over)
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Sync user settings → graphics quality
  useEffect(() => {
    const applyQuality = (s: ReturnType<typeof getSettings>) => {
      if (s.quality === 'low') {
        setBloomQuality({ enabled: false });
      } else if (s.quality === 'medium') {
        setBloomQuality({ enabled: true, intensity: 0.3 });
      } else {
        setBloomQuality({ enabled: true, intensity: 0.45 });
      }
    };
    applyQuality(getSettings());
    const unsub = subscribeSettings(applyQuality);
    return () => { unsub(); };
  }, []);

  // Load leaderboard on mount + presence tracking
  useEffect(() => {
    let mounted = true;
    setLoadProgress(10);

    const loadAll = async () => {
      try {
        const cfgPromise = fetchGameConfig();
        const lbPromise = fetchLeaderboard();
        const bgPromise = fetchBackgroundConfig();
        const dpPromise = fetchDifficultyProfile();
        const wcPromise = fetchWaveConfigs();
        const scenesPromise = fetchScenes();
        setLoadProgress(15);

        const [cfg, lb, bgPhases, dp, wc, scenes] = await Promise.all([cfgPromise, lbPromise, bgPromise, dpPromise, wcPromise, scenesPromise]);
        if (!mounted) return;
        setLoadProgress(40);

        setRemoteConfig(cfg);
        remoteConfigRef.current = cfg;
        setCameraMargin(cfg.cameraMargin);
        setLeaderboard(lb);
        difficultyProfileRef.current = dp;
        waveOverridesRef.current = wc;
        
        // Store scenes + phases for multi-scene support
        scenesRef.current = scenes;
        allBgPhasesRef.current = bgPhases;

        // Inject background config into renderer (first scene's phases)
        if (bgPhases.length > 0) {
          if (scenes.length > 1) {
            setBackgroundConfigForScene(bgPhases, scenes[0].id, cfg.bgLoop, cfg.bgLoopFadeDuration);
          } else {
            setBackgroundConfig(bgPhases, cfg.bgLoop, cfg.bgLoopFadeDuration);
          }
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
    // Realtime subscription for background config changes
    const bgChannel = supabase
      .channel('bg-config-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'background_config' }, () => {
        fetchBackgroundConfig().then(phases => {
          allBgPhasesRef.current = phases;
          if (phases.length > 0) {
            const scenes = scenesRef.current;
            const g = gameRef.current;
            if (scenes.length > 1 && g) {
              const currentScene = scenes[g.currentSceneIndex];
              if (currentScene) {
                setBackgroundConfigForScene(phases, currentScene.id, remoteConfigRef.current?.bgLoop, remoteConfigRef.current?.bgLoopFadeDuration);
              }
            } else {
              setBackgroundConfig(phases, remoteConfigRef.current?.bgLoop, remoteConfigRef.current?.bgLoopFadeDuration);
            }
          }
        });
      })
      .subscribe();

    // Realtime subscription for audio config changes
    const audioChannel = supabase
      .channel('audio-config-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audio_config' }, () => {
        reloadAudioSettings();
      })
      .subscribe();

    // Realtime subscription for wave config changes — admin edits apply live
    const waveChannel = supabase
      .channel('wave-config-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wave_configs' }, () => {
        fetchWaveConfigs().then(wc => {
          waveOverridesRef.current = wc;
          const g = gameRef.current;
          if (g) g.remoteWaveOverrides = wc;
        });
      })
      .subscribe();

    // Realtime subscription for difficulty profile (admin preset changes)
    const diffChannel = supabase
      .channel('difficulty-profile-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'difficulty_profile' }, () => {
        fetchDifficultyProfile().then(dp => {
          difficultyProfileRef.current = dp;
          const g = gameRef.current;
          if (g) g.difficultyProfile = dp;
        });
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      supabase.removeChannel(bgChannel);
      supabase.removeChannel(audioChannel);
      supabase.removeChannel(waveChannel);
      supabase.removeChannel(diffChannel);
    };
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

    // Expose debug API for simulator tab
    const dbgApi = attachDebugAPI(g, _debug);
    (window as any).__SKYFALL_DEBUG__ = dbgApi;

    // Simulator mode — skip tutorial, jump straight to gameplay
    if (isSimulatorMode) {
      g.tutorialPage = 3; // mark tutorial as complete
      tutorialShownRef.current = true; // skip control tutorial overlay too
    }

    // Apply remote config from ref (not state dependency)
    const cfg = remoteConfigRef.current;
    if (cfg) {
      g.player.speed = cfg.baseSpeed;
      g.spawnTimer = cfg.spawnInterval;
      g.difficulty = cfg.difficultyMultiplier;
    }
    // Apply difficulty profile and wave overrides
    g.difficultyProfile = difficultyProfileRef.current;
    g.remoteWaveOverrides = waveOverridesRef.current;

    // Inject scene data for multi-scene transitions
    g.scenes = scenesRef.current;
    g.allBgPhases = allBgPhasesRef.current;
    g.sceneChangeWaveInterval = cfg?.sceneChangeInterval ?? 6;
    g.currentSceneIndex = 0;

    // Wire up scene swap callback
    setOnSceneSwap((sceneIndex: number) => {
      const scenes = scenesRef.current;
      const allPhases = allBgPhasesRef.current;
      const remoteCfg = remoteConfigRef.current;
      if (scenes[sceneIndex]) {
        setBackgroundConfigForScene(allPhases, scenes[sceneIndex].id, remoteCfg?.bgLoop, remoteCfg?.bgLoopFadeDuration);
      }
    });

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
          if (g.tutorialFade < 1) {
            g.tutorialFade = Math.min(1, g.tutorialFade + dt * 4);
          }
          renderStartScreen(ctx, w, h, g.highScore, g.tutorialPage, g.tutorialFade);
        } else if (g.state === 'intro') {
          updateIntro(g, dt);
          render(ctx, g);
        } else if (g.state === 'playing') {
          // No user pause during gameplay — only the control tutorial and
          // admin-wide globalPause can freeze the simulation.
          const isFrozen = pauseRef.current || remoteConfig?.globalPause;
          if (isFrozen) {
            render(ctx, g);
          } else if (hasModalCard(g)) {
            // A purchase or upgrade card is visible — hard-freeze the
            // gameplay so the player can't be hit while reading it.
            updateCardsOnly(g, inputRef.current, dt);
            render(ctx, g);
          } else if (remoteConfig?.ddaEnabled && g.player.health >= g.player.maxHealth) {
            if (g.elapsed > 15 && g.difficulty < 5) {
              g.difficulty = Math.min(5, g.difficulty + 0.002 * dt);
            }
            update(g, inputRef.current, dt);
            render(ctx, g);
          } else {
            update(g, inputRef.current, dt);
            render(ctx, g);
          }
        } else if (g.state === 'gameover') {
          render(ctx, g);
          renderGameOver(ctx, w, h, g.score, g.highScore, g.stats,
            leaderboard, playerName, gameOverData?.rank ?? null, g.waveNumber);
          
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
              // Show prize-entry card if player landed in top 10
              if (rank && rank <= 10 && !prizeShownRef.current) {
                prizeShownRef.current = true;
                setShowPrizeCard(true);
              }
            });
          }
        }

        ctx.restore();
      } catch (e) {
        console.error('Render error:', e);
        ctx.restore();
      }

      if (g.state !== prevState) {
        const fromState = prevState;
        const wasStart = fromState === 'start';
        setShowButtons(g.state === 'playing');
        if (fromState === 'intro' && g.state === 'playing' && !tutorialShownRef.current) {
          tutorialShownRef.current = true;
          pauseRef.current = true;
          setControlTutorial(0);
        }
        if (wasStart && g.state === 'intro') {
          cancelMenuMusicStart();
          stopMenuMusic();
        }
        if (g.state === 'start') {
          setGameOverData(null);
          scoreSubmittedRef.current = false;
          setControlTutorial(-1);
          pauseRef.current = false;
          setAmmoArrowVisible(false);
          ammoTutorialShownRef.current = false;
          if (ammoArrowTimerRef.current) clearTimeout(ammoArrowTimerRef.current);
          prizeShownRef.current = false;
          setShowPrizeCard(false);
        }
        prevState = g.state;
      }
      if (g.state === 'start') {
        setCurrentTutorialPage(g.tutorialPage);
      }
      if (g.state === 'playing') {
        setPlayerAmmo(g.player.ammo);
        setBulletLevel(g.bulletLevel);
        // Detect first ammo pickup — show arrow pointing to FIRE button
        if (g.firstAmmoPickedUp && !ammoTutorialShownRef.current) {
          ammoTutorialShownRef.current = true;
          setAmmoArrowVisible(true);
          sfxAmmoTutorial();
          if (ammoArrowTimerRef.current) clearTimeout(ammoArrowTimerRef.current);
          ammoArrowTimerRef.current = setTimeout(() => setAmmoArrowVisible(false), 4000);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const startOrRestart = () => {
      if (g.state === 'start') {
        // Tutorial slide navigation
        if (g.tutorialPage < 3) {
          g.tutorialPage++;
          g.tutorialFade = 0;
          sfxSlideTransition();
          return;
        }
        // Last slide — start game
        resumeAudio();
        scoreSubmittedRef.current = false;
        setGameOverData(null);
        Promise.all([fetchGameConfig(), fetchDifficultyProfile(), fetchWaveConfigs()]).then(([cfg, dp, wc]) => {
          remoteConfigRef.current = cfg;
          setCameraMargin(cfg.cameraMargin);
          if (cfg) {
            g.player.speed = cfg.baseSpeed;
            g.spawnTimer = cfg.spawnInterval;
            g.difficulty = cfg.difficultyMultiplier;
          }
          g.difficultyProfile = dp;
          g.remoteWaveOverrides = wc;
          difficultyProfileRef.current = dp;
          waveOverridesRef.current = wc;
          g.scenes = scenesRef.current;
          g.allBgPhases = allBgPhasesRef.current;
          g.sceneChangeWaveInterval = cfg?.sceneChangeInterval ?? 6;
          g.currentSceneIndex = 0;
          g.sceneTransition = null;
          resetGame(g);
          // Reset background to first scene
          const scenes = scenesRef.current;
          const allPhases = allBgPhasesRef.current;
          if (scenes.length > 1 && allPhases.length > 0) {
            setBackgroundConfigForScene(allPhases, scenes[0].id, cfg?.bgLoop, cfg?.bgLoopFadeDuration);
          }
        });
      } else if (g.state === 'gameover') {
        // Only restart if clicking the restart button
        const cvs = canvasRef.current;
        if (cvs) {
          const rect = cvs.getBoundingClientRect();
          const pointer = inputRef.current.pointer;
          const rawX = pointer?.lastClickX;
          const rawY = pointer?.lastClickY;
          if (rawX !== undefined && rawY !== undefined) {
            const cx = rawX - rect.left;
            const cy = rawY - rect.top;
            const canvasW = rect.width;
            const canvasH = rect.height;
            const btnW = 220, btnH = 50;
            const btnX = canvasW / 2 - btnW / 2;
            const btnY = canvasH * 0.92 - btnH / 2;
            if (cx < btnX || cx > btnX + btnW || cy < btnY || cy > btnY + btnH) {
              if (inputRef.current.pointer) {
                inputRef.current.pointer.lastClickX = undefined;
                inputRef.current.pointer.lastClickY = undefined;
              }
              return;
            }
          }
          if (inputRef.current.pointer) {
            inputRef.current.pointer.lastClickX = undefined;
            inputRef.current.pointer.lastClickY = undefined;
          }
        }
        stopGameOverVoice();
        resumeAudio();
        scoreSubmittedRef.current = false;
        setGameOverData(null);
        Promise.all([fetchGameConfig(), fetchDifficultyProfile(), fetchWaveConfigs()]).then(([cfg, dp, wc]) => {
          remoteConfigRef.current = cfg;
          setCameraMargin(cfg.cameraMargin);
          if (cfg) {
            g.player.speed = cfg.baseSpeed;
            g.spawnTimer = cfg.spawnInterval;
            g.difficulty = cfg.difficultyMultiplier;
          }
          g.difficultyProfile = dp;
          g.remoteWaveOverrides = wc;
          difficultyProfileRef.current = dp;
          waveOverridesRef.current = wc;
          g.scenes = scenesRef.current;
          g.allBgPhases = allBgPhasesRef.current;
          g.sceneChangeWaveInterval = cfg?.sceneChangeInterval ?? 6;
          g.currentSceneIndex = 0;
          g.sceneTransition = null;
          g.tutorialPage = 3;
          resetGame(g);
          // Reset background to first scene
          const scenes = scenesRef.current;
          const allPhases = allBgPhasesRef.current;
          if (scenes.length > 1 && allPhases.length > 0) {
            setBackgroundConfigForScene(allPhases, scenes[0].id, cfg?.bgLoop, cfg?.bgLoopFadeDuration);
          }
        });
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

    const ensurePointer = () => {
      if (!inputRef.current.pointer) inputRef.current.pointer = {};
      return inputRef.current.pointer;
    };

    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement) !== canvas) return;
      e.preventDefault();
      const hasOfferCard =
        (g.gasMaskOffer && g.gasMaskOffer.active) ||
        (g.fireSuitOffer && g.fireSuitOffer.active);
      if ((g.wavePhase === 'cards' && g.upgradeCards.length > 0) || hasOfferCard) {
        const rect = canvas.getBoundingClientRect();
        inputRef.current.cardClick = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        return;
      }
      // Store swipe start + click position
      const pointer = ensurePointer();
      pointer.swipeStartX = e.clientX;
      pointer.swipeStartY = e.clientY;
      pointer.lastClickX = e.clientX;
      pointer.lastClickY = e.clientY;
      // Don't call startOrRestart here — wait for pointerup to detect swipe vs tap
      if (g.state !== 'start' || g.tutorialPage >= 3) {
        startOrRestart();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if ((e.target as HTMLElement) !== canvas) return;
      if (g.state !== 'start') return;
      const pointer = inputRef.current.pointer;
      const startX = pointer?.swipeStartX;
      if (startX === undefined) return;
      const deltaX = e.clientX - startX;
      const deltaY = Math.abs(e.clientY - (pointer?.swipeStartY ?? 0));
      if (pointer) {
        pointer.swipeStartX = undefined;
        pointer.swipeStartY = undefined;
      }

      // Horizontal swipe detected
      if (Math.abs(deltaX) > 50 && deltaY < 100) {
        if (deltaX < 0) {
          // Swipe left → next slide
          g.tutorialPage = Math.min(3, g.tutorialPage + 1);
        } else {
          // Swipe right → previous slide
          g.tutorialPage = Math.max(0, g.tutorialPage - 1);
        }
        g.tutorialFade = 0;
        sfxSlideTransition();
        return;
      }

      // Small movement = tap
      if (Math.abs(deltaX) < 15) {
        const p2 = ensurePointer();
        p2.lastClickX = e.clientX;
        p2.lastClickY = e.clientY;
        startOrRestart();
      }
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
    canvas.addEventListener('pointerup', onPointerUp);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('selectstart', preventSelect);
      document.removeEventListener('contextmenu', preventContext);
      canvas.removeEventListener('touchstart', preventTouch);
      setOnSceneSwap(null);
    };
  }, [showNameEntry, playerName, isLoading]);

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
    if (!hapticsEnabled()) return;
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

  // Simulator mode — auto-start game ONCE when game is created
  const simAutoStartedRef = useRef(false);
  useEffect(() => {
    if (!isSimulatorMode || simAutoStartedRef.current || isLoading) return;
    let attempts = 0;
    const tryStart = () => {
      const g = gameRef.current;
      if (g && g.state === 'start') {
        simAutoStartedRef.current = true;
        resumeAudio();
        g.tutorialPage = 3;
        tutorialShownRef.current = true;
        resetGame(g);
      } else if (attempts++ < 30) {
        // Game not yet created — retry next frame (canvas mount race)
        requestAnimationFrame(tryStart);
      }
    };
    requestAnimationFrame(tryStart);
  }, [isSimulatorMode, isLoading]);

  // Loading screen
  if (isLoading) {
    return (
      <div style={{ position: 'relative', width: '100vw', height: 'var(--app-height, 100vh)', overflow: 'hidden', background: '#000' }}>
        <GameLoader progress={loadProgress} onLoaded={() => setIsLoading(false)} autoStart={isSimulatorMode} />
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
            maxHeight: 'calc(45vh)', overflow: 'hidden',
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

      {/* Tutorial slide 1: help video overlay */}
      {currentTutorialPage === 1 && !showButtons && (
        <img
          src="/help-1.gif"
          alt=""
          style={{
            position: 'absolute',
            bottom: '22%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'clamp(180px, 60vw, 300px)',
            height: 'auto',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      )}

      {/* Tutorial slide 2: upgrade cards help video overlay */}
      {currentTutorialPage === 2 && !showButtons && (
        <img
          src="/help-2.gif"
          alt=""
          style={{
            position: 'absolute',
            bottom: '22%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'clamp(180px, 60vw, 300px)',
            height: 'auto',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      )}

      {/* Settings button — visible only on start/gameover screens (top-left so
          it never blocks the score HUD in the top-right). No in-game pause. */}
      {!showButtons && !showNameEntry && (
        <button
          id="btn-settings"
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setSettingsOpen(true); }}
          aria-label="settings"
          style={{
            position: 'absolute',
            top: 'calc(14px + env(safe-area-inset-top, 0px))',
            left: 'calc(14px + env(safe-area-inset-left, 0px))',
            width: 40,
            height: 40,
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(0,0,0,0.45)',
            color: 'rgba(255,255,255,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            cursor: 'pointer',
            zIndex: 15,
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}

      {/* Settings drawer */}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Prize entry card — only when player is in top 10 */}
      {showPrizeCard && gameOverData?.rank && playerName && gameOverData.rank <= 10 && (
        <PrizeEntryCard
          playerName={playerName}
          score={gameOverData.score}
          rank={gameOverData.rank}
          waves={gameOverData.waves}
          onSubmitted={() => setShowPrizeCard(false)}
          onDismiss={() => setShowPrizeCard(false)}
        />
      )}

      {/* Game Over: leaderboard is now rendered on Canvas */}
      {showButtons && (
        <>
           <button
             id="btn-fire"
             onPointerDown={(e) => { e.preventDefault(); if (hasAmmo && controlTutorial < 0) { e.stopPropagation(); handleButtonDown('shoot'); } }}
             style={{
               position: 'absolute', left: 220, bottom: 'calc(95px + env(safe-area-inset-bottom, 0px))', width: 72, height: 56,
              borderRadius: 16,
              border: hasAmmo ? '1.5px solid rgba(220,38,38,0.5)' : '1.5px solid rgba(100,100,100,0.3)',
              background: hasAmmo ? 'rgba(220,38,38,0.12)' : 'rgba(80,80,80,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'pointer', zIndex: 10,
              backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', transition: 'all 0.15s ease',
              opacity: controlTutorial >= 0 && controlTutorial !== 2 ? 0.15 : 1,
              transform: controlTutorial === 2 ? 'scale(1.15)' : 'scale(1)',
              boxShadow: controlTutorial === 2 ? '0 0 25px rgba(220,38,38,0.7), 0 0 50px rgba(220,38,38,0.3)' : 'none',
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
            id="btn-left"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); if (controlTutorial < 0) handleButtonDown('left'); }}
            onPointerUp={() => handleButtonUp('left')}
            onPointerLeave={() => handleButtonUp('left')}
            style={{
              position: 'absolute', left: 14, bottom: 'calc(95px + env(safe-area-inset-bottom, 0px))', width: 72, height: 56,
              borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)',
              fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'pointer', zIndex: 10,
              backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', transition: 'all 0.15s ease',
              opacity: controlTutorial >= 0 && controlTutorial !== 0 ? 0.15 : 1,
              transform: controlTutorial === 0 ? 'scale(1.15)' : 'scale(1)',
              boxShadow: controlTutorial === 0 ? '0 0 25px rgba(255,255,255,0.5), 0 0 50px rgba(255,255,255,0.2)' : 'none',
            }}
          >‹</button>

          <button
            id="btn-right"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); if (controlTutorial < 0) handleButtonDown('right'); }}
            onPointerUp={() => handleButtonUp('right')}
            onPointerLeave={() => handleButtonUp('right')}
            style={{
              position: 'absolute', left: 136, bottom: 'calc(95px + env(safe-area-inset-bottom, 0px))', width: 72, height: 56,
              borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)',
              fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'pointer', zIndex: 10,
              backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', transition: 'all 0.15s ease',
              opacity: controlTutorial >= 0 && controlTutorial !== 1 ? 0.15 : 1,
              transform: controlTutorial === 1 ? 'scale(1.15)' : 'scale(1)',
              boxShadow: controlTutorial === 1 ? '0 0 25px rgba(255,255,255,0.5), 0 0 50px rgba(255,255,255,0.2)' : 'none',
            }}
          >›</button>

          <button
            id="btn-roll"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); if (controlTutorial < 0) handleButtonDown('roll'); }}
            style={{
              position: 'absolute', right: 16, bottom: 'calc(95px + env(safe-area-inset-bottom, 0px))', width: 80, height: 56,
              borderRadius: 16, border: '1px solid rgba(251,191,36,0.25)',
              background: 'rgba(251,191,36,0.06)', color: 'rgba(251,191,36,0.65)',
              fontSize: 11, fontFamily: "'SF Pro', system-ui, -apple-system, sans-serif",
              fontWeight: 600, letterSpacing: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'pointer', zIndex: 10,
              backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', transition: 'all 0.15s ease',
              opacity: controlTutorial >= 0 && controlTutorial !== 3 ? 0.15 : 1,
              transform: controlTutorial === 3 ? 'scale(1.15)' : 'scale(1)',
              boxShadow: controlTutorial === 3 ? '0 0 25px rgba(251,191,36,0.6), 0 0 50px rgba(251,191,36,0.25)' : 'none',
            }}
          >شَقلِب</button>
        </>
      )}

      {/* Ammo Tutorial Arrow — bouncing arrow pointing to FIRE button */}
      {ammoArrowVisible && showButtons && (
        <div style={{
          position: 'absolute',
          left: 220 + 36, // center of FIRE button (left + width/2)
          bottom: 'calc(95px + env(safe-area-inset-bottom, 0px) + 60px)', // above FIRE button
          transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          zIndex: 50,
          pointerEvents: 'none',
          animation: 'ammoArrowBounce 0.8s ease-in-out infinite',
        }}>
          <div style={{
            background: 'rgba(220, 38, 38, 0.9)',
            color: '#fff',
            padding: '6px 14px',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "'SF Pro', system-ui, -apple-system, sans-serif",
            textAlign: 'center',
            boxShadow: '0 0 20px rgba(220, 38, 38, 0.5)',
            whiteSpace: 'nowrap',
          }}>
            اضرب من هون
          </div>
          <svg width="28" height="24" viewBox="0 0 28 24" fill="none">
            <path d="M14 24L2 8h24L14 24z" fill="rgba(220, 38, 38, 0.9)" />
            <path d="M14 20L5 8h18L14 20z" fill="rgba(220, 38, 38, 0.6)" />
          </svg>
        </div>
      )}

      <style>{`
        @keyframes ammoArrowBounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-10px); }
        }
      `}</style>

      {/* Control Tutorial Overlay — Spotlight Design */}
      {controlTutorial >= 0 && (() => {
        // Button positions matching the actual button styles
        const btnPositions = [
          { left: 14, width: 72, height: 56, label: 'btn-left' },    // 0: left
          { left: 136, width: 72, height: 56, label: 'btn-right' },  // 1: right
          { left: 220, width: 72, height: 56, label: 'btn-fire' },   // 2: fire
          { right: 16, width: 80, height: 56, label: 'btn-roll' },   // 3: roll
        ];
        const cur = btnPositions[controlTutorial];
        const spotX = 'left' in cur ? cur.left : undefined;
        const spotRight = 'right' in cur ? cur.right : undefined;
        const spotW = cur.width + 20; // padding around button
        const spotH = cur.height + 20;
        const bottomBase = 95; // matches button bottom

        const tutorialSteps = [
          {
            title: 'تحرّك لليسار',
            subtitle: 'اضغط مع الاستمرار للتحرك يساراً',
            svgIcon: (
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <defs>
                  <linearGradient id="arrowGradL" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffd700" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
                <path d="M36 28H16" stroke="url(#arrowGradL)" strokeWidth="3" strokeLinecap="round" />
                <path d="M24 20L14 28L24 36" stroke="url(#arrowGradL)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {/* Motion trails */}
                <line x1="40" y1="22" x2="32" y2="22" stroke="#ffd700" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
                <line x1="42" y1="28" x2="38" y2="28" stroke="#ffd700" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
                <line x1="40" y1="34" x2="32" y2="34" stroke="#ffd700" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
              </svg>
            ),
          },
          {
            title: 'تحرّك لليمين',
            subtitle: 'اضغط مع الاستمرار للتحرك يميناً',
            svgIcon: (
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <defs>
                  <linearGradient id="arrowGradR" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffd700" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
                <path d="M20 28H40" stroke="url(#arrowGradR)" strokeWidth="3" strokeLinecap="round" />
                <path d="M32 20L42 28L32 36" stroke="url(#arrowGradR)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="16" y1="22" x2="24" y2="22" stroke="#ffd700" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
                <line x1="14" y1="28" x2="18" y2="28" stroke="#ffd700" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
                <line x1="16" y1="34" x2="24" y2="34" stroke="#ffd700" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
              </svg>
            ),
          },
          {
            title: 'اطلق مضادات أرضية',
            subtitle: 'يمكنك اعتراض الصواريخ والشظايا والطائرات',
            svgIcon: (
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <defs>
                  <linearGradient id="crossGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="100%" stopColor="#ffd700" />
                  </linearGradient>
                </defs>
                <circle cx="28" cy="28" r="14" stroke="url(#crossGrad)" strokeWidth="2" fill="none" opacity="0.7" />
                <circle cx="28" cy="28" r="4" fill="url(#crossGrad)" opacity="0.6" />
                <line x1="28" y1="8" x2="28" y2="18" stroke="url(#crossGrad)" strokeWidth="2" strokeLinecap="round" />
                <line x1="28" y1="38" x2="28" y2="48" stroke="url(#crossGrad)" strokeWidth="2" strokeLinecap="round" />
                <line x1="8" y1="28" x2="18" y2="28" stroke="url(#crossGrad)" strokeWidth="2" strokeLinecap="round" />
                <line x1="38" y1="28" x2="48" y2="28" stroke="url(#crossGrad)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ),
          },
          {
            title: 'شَقلِب',
            subtitle: 'تفادى الخطر بدحرجة سريعة',
            svgIcon: (
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <defs>
                  <linearGradient id="rollGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
                <circle cx="28" cy="28" r="10" stroke="url(#rollGrad)" strokeWidth="2.5" fill="none" />
                <path d="M28 18 A10 10 0 0 1 38 28" stroke="#ffd700" strokeWidth="3" strokeLinecap="round" fill="none" />
                {/* Arc trail */}
                <path d="M18 22 C14 30, 18 40, 28 42" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.4" strokeDasharray="3 4" />
                <path d="M38 34 C42 26, 38 16, 28 14" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.4" strokeDasharray="3 4" />
                {/* Direction arrow */}
                <path d="M36 18L38 28L32 22" fill="#ffd700" opacity="0.8" />
              </svg>
            ),
          },
        ];
        const step = tutorialSteps[controlTutorial];

        return (
          <div
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
            style={{
              position: 'absolute', inset: 0, zIndex: 20,
              touchAction: 'none', pointerEvents: 'auto',
            }}
          >
            {/* Dark overlay with NO background — spotlight cutout handles dimming */}

            {/* Spotlight cutout — transparent hole with massive box-shadow */}
            <div style={{
              position: 'absolute',
              ...(spotX !== undefined ? { left: spotX - 10 } : {}),
              ...(spotRight !== undefined ? { right: spotRight - 10 } : {}),
              bottom: `calc(${bottomBase - 10}px + env(safe-area-inset-bottom, 0px))`,
              width: spotW,
              height: spotH,
              borderRadius: 20,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.82)',
              border: '1.5px solid rgba(255,215,0,0.5)',
              zIndex: 21,
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              pointerEvents: 'none',
            }} />

            {/* Pulse ring around spotlight */}
            <div style={{
              position: 'absolute',
              ...(spotX !== undefined ? { left: spotX - 16 } : {}),
              ...(spotRight !== undefined ? { right: spotRight - 16 } : {}),
              bottom: `calc(${bottomBase - 16}px + env(safe-area-inset-bottom, 0px))`,
              width: spotW + 12,
              height: spotH + 12,
              borderRadius: 24,
              border: '2px solid rgba(255,215,0,0.3)',
              zIndex: 21,
              pointerEvents: 'none',
              animation: 'spotlightPulse 1.8s ease-in-out infinite',
            }} />

            {/* Connecting golden line from card to button */}
            <div style={{
              position: 'absolute',
              ...(spotX !== undefined ? { left: spotX + cur.width / 2 } : {}),
              ...(spotRight !== undefined ? { right: spotRight + cur.width / 2 } : {}),
              bottom: `calc(${bottomBase + cur.height + 14}px + env(safe-area-inset-bottom, 0px))`,
              width: 2,
              height: 60,
              background: 'linear-gradient(to top, rgba(255,215,0,0.6), rgba(255,215,0,0.05))',
              zIndex: 22,
              pointerEvents: 'none',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            }} />

            {/* Glass card — positioned above the button area */}
            <div style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: `calc(${bottomBase + cur.height + 80}px + env(safe-area-inset-bottom, 0px))`,
              zIndex: 23,
              pointerEvents: 'auto',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
              <div style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))',
                border: '1px solid rgba(255,215,0,0.3)',
                borderRadius: 22, padding: '20px 28px 18px',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                width: 300, textAlign: 'center',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 30px rgba(255,215,0,0.08)',
              } as React.CSSProperties}>
                {/* Step dots inside card */}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
                  {[0,1,2,3].map(i => (
                    <div key={i} style={{
                      width: i === controlTutorial ? 22 : 7, height: 7, borderRadius: 4,
                      background: i === controlTutorial
                        ? 'linear-gradient(90deg, #ffd700, #f59e0b)'
                        : i < controlTutorial ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.15)',
                      transition: 'all 0.35s ease',
                      boxShadow: i === controlTutorial ? '0 0 8px rgba(255,215,0,0.4)' : 'none',
                    }} />
                  ))}
                </div>

                {/* SVG Icon */}
                <div style={{
                  marginBottom: 10,
                  filter: 'drop-shadow(0 0 14px rgba(255,215,0,0.35))',
                  display: 'flex', justifyContent: 'center',
                }}>
                  {step.svgIcon}
                </div>

                {/* Title */}
                <div style={{
                  fontFamily: "'Tajawal', sans-serif", fontSize: 21, fontWeight: 700,
                  color: '#ffd700', marginBottom: 6, direction: 'rtl',
                  textShadow: '0 0 18px rgba(255,215,0,0.35)',
                }}>
                  {step.title}
                </div>

                {/* Subtitle */}
                <div style={{
                  fontFamily: "'Tajawal', sans-serif", fontSize: 13, fontWeight: 400,
                  color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, direction: 'rtl',
                  marginBottom: 16,
                }}>
                  {step.subtitle}
                </div>

                {/* "فهمت" button inside card */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = controlTutorial + 1;
                    if (next > 3) {
                      setControlTutorial(-1);
                      pauseRef.current = false;
                    } else {
                      setControlTutorial(next);
                    }
                  }}
                  style={{
                    padding: '10px 36px', borderRadius: 12,
                    background: controlTutorial < 3
                      ? 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(245,158,11,0.1))'
                      : 'linear-gradient(135deg, rgba(255,215,0,0.3), rgba(245,158,11,0.2))',
                    border: '1.5px solid rgba(255,215,0,0.4)',
                    color: '#ffd700', fontFamily: "'Tajawal', sans-serif", fontSize: 16, fontWeight: 700,
                    cursor: 'pointer', touchAction: 'none',
                    boxShadow: '0 4px 16px rgba(255,215,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
                    transition: 'all 0.2s ease',
                    animation: controlTutorial === 3 ? 'spotlightPulse 2s ease-in-out infinite' : 'none',
                  }}
                >
                  {controlTutorial < 3 ? 'فهمت ←' : 'يلا يلا'}
                </button>
              </div>
            </div>

            {/* Tap anywhere hint */}
            <div style={{
              position: 'absolute', top: 40, left: '50%', transform: 'translateX(-50%)',
              fontFamily: "'Tajawal', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.3)',
              zIndex: 23, pointerEvents: 'none',
            }}>
              اضغط في أي مكان للمتابعة
            </div>

            {/* Full-screen tap handler (behind the card) */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                const next = controlTutorial + 1;
                if (next > 3) {
                  setControlTutorial(-1);
                  pauseRef.current = false;
                } else {
                  setControlTutorial(next);
                }
              }}
              style={{
                position: 'absolute', inset: 0, zIndex: 20,
                cursor: 'pointer',
              }}
            />
          </div>
        );
      })()}

      <style>{`
        @keyframes spotlightPulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.04); }
        }
      `}</style>
    </div>
  );
};

export default SkyfallGame;
