import React, { useRef, useEffect, useCallback, useState } from 'react';
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
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover'>('start');

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap DPR for performance
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
    if (gameRef.current) {
      gameRef.current.width = w;
      gameRef.current.height = h;
    }
  }, []);

  const loop = useCallback((time: number) => {
    const dt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0.016;
    lastTimeRef.current = time;

    const g = gameRef.current;
    const canvas = canvasRef.current;
    if (!g || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    try {
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

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

      // Sync state for button visibility
      if (g.state !== gameState) setGameState(g.state);
    } catch (e) {
      console.error('Render error:', e);
      ctx.restore();
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [gameState]);

  const startOrRestart = useCallback(() => {
    const g = gameRef.current;
    if (g && (g.state === 'start' || g.state === 'gameover')) {
      resumeAudio();
      resetGame(g);
      setGameState('playing');
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    gameRef.current = createGame(window.innerWidth, window.innerHeight);
    resize();
    window.addEventListener('resize', resize);
    rafRef.current = requestAnimationFrame(loop);

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

    // Touch/click on canvas for start/gameover
    const onCanvasClick = () => {
      startOrRestart();
    };
    const onTouchStart = (e: TouchEvent) => {
      const g = gameRef.current;
      if (g && (g.state === 'start' || g.state === 'gameover')) {
        e.preventDefault();
        startOrRestart();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('click', onCanvasClick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('click', onCanvasClick);
    };
  }, [resize, loop, startOrRestart]);

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

  const showButtons = gameState === 'playing';

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100vw',
          height: '100vh',
          touchAction: 'none',
          userSelect: 'none',
        }}
      />

      {/* Fixed Control Buttons */}
      {showButtons && (
        <>
          {/* Left Arrow */}
          <button
            onTouchStart={(e) => { e.preventDefault(); handleButtonDown('left'); }}
            onTouchEnd={(e) => { e.preventDefault(); handleButtonUp('left'); }}
            onMouseDown={() => handleButtonDown('left')}
            onMouseUp={() => handleButtonUp('left')}
            onMouseLeave={() => handleButtonUp('left')}
            style={{
              position: 'absolute',
              left: 16,
              bottom: 40,
              width: 64,
              height: 64,
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
            }}
          >
            ◀
          </button>

          {/* Right Arrow */}
          <button
            onTouchStart={(e) => { e.preventDefault(); handleButtonDown('right'); }}
            onTouchEnd={(e) => { e.preventDefault(); handleButtonUp('right'); }}
            onMouseDown={() => handleButtonDown('right')}
            onMouseUp={() => handleButtonUp('right')}
            onMouseLeave={() => handleButtonUp('right')}
            style={{
              position: 'absolute',
              left: 92,
              bottom: 40,
              width: 64,
              height: 64,
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
            }}
          >
            ▶
          </button>

          {/* Roll / Dash Button */}
          <button
            onTouchStart={(e) => { e.preventDefault(); handleButtonDown('roll'); }}
            onMouseDown={() => handleButtonDown('roll')}
            style={{
              position: 'absolute',
              right: 16,
              bottom: 40,
              width: 72,
              height: 72,
              borderRadius: '50%',
              border: '2px solid rgba(251,191,36,0.5)',
              background: 'rgba(251,191,36,0.15)',
              color: '#fbbf24',
              fontSize: 13,
              fontFamily: 'monospace',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              cursor: 'pointer',
              backdropFilter: 'blur(4px)',
              zIndex: 10,
            }}
          >
            ROLL
          </button>
        </>
      )}
    </div>
  );
};

export default SkyfallGame;
