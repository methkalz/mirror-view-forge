import React, { useRef, useEffect, useCallback } from 'react';
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
  const joystickTouchIdRef = useRef<number | null>(null);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
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

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (g.state === 'start') {
      renderStartScreen(ctx, w, h, g.highScore);
    } else if (g.state === 'playing') {
      update(g, inputRef.current, dt);
      render(ctx, g);

      // Draw joystick overlay
      const joy = inputRef.current.touchJoystick;
      if (joy.active) {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(joy.origin.x, joy.origin.y, 50, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        const dx = joy.current.x - joy.origin.x;
        const dy = joy.current.y - joy.origin.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxR = 40;
        const cx = dist > maxR ? joy.origin.x + (dx / dist) * maxR : joy.current.x;
        const cy = dist > maxR ? joy.origin.y + (dy / dist) * maxR : joy.current.y;
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else if (g.state === 'gameover') {
      render(ctx, g);
      renderGameOver(ctx, w, h, g.score, g.highScore);
    }

    ctx.restore();
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    gameRef.current = createGame(window.innerWidth, window.innerHeight);
    resize();
    window.addEventListener('resize', resize);
    rafRef.current = requestAnimationFrame(loop);

    // Keyboard
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      inputRef.current.keys.add(key);
      if (key === ' ' || key === 'space') {
        e.preventDefault();
        inputRef.current.dash = true;
      }
      if (key === 'enter') {
        const g = gameRef.current;
        if (g && (g.state === 'start' || g.state === 'gameover')) {
          resumeAudio();
          resetGame(g);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      inputRef.current.keys.delete(e.key.toLowerCase());
    };

    // Touch
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const g = gameRef.current;
      if (!g) return;

      if (g.state === 'start' || g.state === 'gameover') {
        resumeAudio();
        resetGame(g);
        return;
      }

      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX < window.innerWidth / 2) {
          // Left side = joystick
          joystickTouchIdRef.current = t.identifier;
          inputRef.current.touchJoystick = {
            active: true,
            origin: { x: t.clientX, y: t.clientY },
            current: { x: t.clientX, y: t.clientY },
          };
        } else {
          // Right side = dash
          inputRef.current.touchDash = true;
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === joystickTouchIdRef.current) {
          inputRef.current.touchJoystick.current = { x: t.clientX, y: t.clientY };
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === joystickTouchIdRef.current) {
          joystickTouchIdRef.current = null;
          inputRef.current.touchJoystick.active = false;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [resize, loop]);

  return (
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
  );
};

export default SkyfallGame;
