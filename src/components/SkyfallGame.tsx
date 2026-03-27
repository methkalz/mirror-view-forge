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
    keys: new Set(),
    touchJoystick: { active: false, origin: { x: 0, y: 0 }, current: { x: 0, y: 0 } },
    touchDash: false,
  });
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [showButtons, setShowButtons] = useState(false);

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

  // Button handlers
  const handleButtonDown = (action: 'left' | 'right' | 'roll') => {
    if (action === 'left') inputRef.current.keys.add('arrowleft');
    else if (action === 'right') inputRef.current.keys.add('arrowright');
    else if (action === 'roll') inputRef.current.dash = true;
  };
  const handleButtonUp = (action: 'left' | 'right' | 'roll') => {
    if (action === 'left') inputRef.current.keys.delete('arrowleft');
    else if (action === 'right') inputRef.current.keys.delete('arrowright');
  };

  const btnStyle = (extra: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.3)',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    cursor: 'pointer',
    backdropFilter: 'blur(4px)',
    zIndex: 10,
    ...extra,
  });

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100vw', height: '100vh', touchAction: 'none', userSelect: 'none' }}
      />
      {showButtons && (
        <>
          <button
            onPointerDown={(e) => { e.stopPropagation(); handleButtonDown('left'); }}
            onPointerUp={() => handleButtonUp('left')}
            onPointerLeave={() => handleButtonUp('left')}
            style={btnStyle({ left: 16, bottom: 40, width: 64, height: 64 })}
          >◀</button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); handleButtonDown('right'); }}
            onPointerUp={() => handleButtonUp('right')}
            onPointerLeave={() => handleButtonUp('right')}
            style={btnStyle({ left: 104, bottom: 40, width: 64, height: 64 })}
          >▶</button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); handleButtonDown('roll'); }}
            style={btnStyle({
              right: 16, bottom: 40, width: 72, height: 72,
              border: '2px solid rgba(251,191,36,0.5)',
              background: 'rgba(251,191,36,0.15)',
              color: '#fbbf24',
              fontSize: 13,
              fontFamily: 'monospace',
              fontWeight: 'bold',
            })}
          >ROLL</button>
        </>
      )}
    </div>
  );
};

export default SkyfallGame;
