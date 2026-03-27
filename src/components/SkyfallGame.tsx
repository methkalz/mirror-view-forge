import React, { useRef, useEffect, useState } from 'react';
import { GameData, InputState } from '@/game/types';
import { createGame, resetGame, update } from '@/game/engine';
import { render, renderStartScreen, renderGameOver } from '@/game/renderer';
import { resumeAudio } from '@/game/audio';

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create game ONCE
    const g = createGame(window.innerWidth, window.innerHeight);
    gameRef.current = g;

    // Resize handler
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

    // Stable game loop — no React state dependencies
    let prevState = g.state;
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
        } else if (g.state === 'playing') {
          update(g, inputRef.current, dt);
          render(ctx, g);
        } else if (g.state === 'gameover') {
          render(ctx, g);
          renderGameOver(ctx, w, h, g.score, g.highScore, g.stats);
        }

        ctx.restore();
      } catch (e) {
        console.error('Render error:', e);
        ctx.restore();
      }

      // Sync to React only on actual change
      if (g.state !== prevState) {
        prevState = g.state;
        setShowButtons(g.state === 'playing');
      }
      if (g.state === 'playing') {
        setPlayerAmmo(g.player.ammo);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // Start/restart helper
    const startOrRestart = () => {
      if (g.state === 'start' || g.state === 'gameover') {
        resumeAudio();
        resetGame(g);
        // prevState will be synced in next loop frame
      }
    };

    // Keyboard
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      inputRef.current.keys.add(key);
      if (key === ' ' || key === 'space') {
        e.preventDefault();
        inputRef.current.dash = true;
      }
      if (key === 'f') inputRef.current.shoot = true;
      if (key === 'enter') startOrRestart();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      inputRef.current.keys.delete(e.key.toLowerCase());
    };

    // Unified pointer for start/restart (no double-fire)
    const onPointerDown = (e: PointerEvent) => {
      // Ignore if it came from a control button
      if ((e.target as HTMLElement) !== canvas) return;
      e.preventDefault();
      startOrRestart();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointerDown);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // iOS haptic trick: hidden checkbox toggle triggers Taptic Engine
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
    // Android: Vibration API
    if (navigator.vibrate) {
      navigator.vibrate(ms);
      return;
    }
    // iOS: checkbox trick for Taptic Engine
    if (hapticRef.current) {
      hapticRef.current.label.click();
    }
  };

  // Button handlers
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

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100vw', height: '100vh', touchAction: 'none', userSelect: 'none' }}
      />
      {showButtons && (
        <>
          {/* FIRE button */}
          <button
            onPointerDown={(e) => { if (hasAmmo) { e.stopPropagation(); handleButtonDown('shoot'); } }}
            style={{
              position: 'absolute',
              left: 58, bottom: 158, width: 70, height: 44,
              borderRadius: 22,
              border: hasAmmo ? '1.5px solid rgba(168,85,247,0.4)' : '1.5px solid rgba(80,80,80,0.25)',
              background: hasAmmo ? 'rgba(168,85,247,0.12)' : 'rgba(40,40,40,0.08)',
              color: hasAmmo ? 'rgba(168,85,247,0.85)' : 'rgba(100,100,100,0.35)',
              fontSize: 10,
              fontFamily: "'SF Pro', system-ui, -apple-system, sans-serif",
              fontWeight: 600,
              letterSpacing: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              cursor: 'pointer',
              zIndex: 10,
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>⊕</span>
            <span>{hasAmmo ? playerAmmo : '—'}</span>
          </button>

          {/* Left arrow */}
          <button
            onPointerDown={(e) => { e.stopPropagation(); handleButtonDown('left'); }}
            onPointerUp={() => handleButtonUp('left')}
            onPointerLeave={() => handleButtonUp('left')}
            style={{
              position: 'absolute',
              left: 14, bottom: 72, width: 72, height: 56,
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.5)',
              fontSize: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              cursor: 'pointer',
              zIndex: 10,
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
            }}
          >‹</button>

          {/* Right arrow */}
          <button
            onPointerDown={(e) => { e.stopPropagation(); handleButtonDown('right'); }}
            onPointerUp={() => handleButtonUp('right')}
            onPointerLeave={() => handleButtonUp('right')}
            style={{
              position: 'absolute',
              left: 116, bottom: 72, width: 72, height: 56,
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.5)',
              fontSize: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              cursor: 'pointer',
              zIndex: 10,
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
            }}
          >›</button>

          {/* ROLL button */}
          <button
            onPointerDown={(e) => { e.stopPropagation(); handleButtonDown('roll'); }}
            style={{
              position: 'absolute',
              right: 16, bottom: 72, width: 80, height: 56,
              borderRadius: 16,
              border: '1px solid rgba(251,191,36,0.25)',
              background: 'rgba(251,191,36,0.06)',
              color: 'rgba(251,191,36,0.65)',
              fontSize: 11,
              fontFamily: "'SF Pro', system-ui, -apple-system, sans-serif",
              fontWeight: 600,
              letterSpacing: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              cursor: 'pointer',
              zIndex: 10,
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
            }}
          >ROLL</button>
        </>
      )}
    </div>
  );
};

export default SkyfallGame;
