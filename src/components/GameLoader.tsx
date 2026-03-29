import React, { useState, useEffect, useRef } from 'react';

interface GameLoaderProps {
  onLoaded: () => void;
  progress: number; // 0-100
}

const GameLoader: React.FC<GameLoaderProps> = ({ onLoaded, progress }) => {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // Smooth progress animation
  useEffect(() => {
    const target = progress;
    const interval = setInterval(() => {
      setDisplayProgress(prev => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.5) return target;
        return prev + diff * 0.15;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [progress]);

  // Fade out when complete
  useEffect(() => {
    if (progress >= 100) {
      const timer = setTimeout(() => {
        setFadeOut(true);
        setTimeout(onLoaded, 600);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [progress, onLoaded]);

  // Particle background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    interface Particle {
      x: number; y: number; vx: number; vy: number;
      size: number; alpha: number; hue: number;
    }

    const particles: Particle[] = Array.from({ length: 40 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -(0.3 + Math.random() * 0.8),
      size: 1 + Math.random() * 2,
      alpha: 0.2 + Math.random() * 0.5,
      hue: 10 + Math.random() * 25,
    }));

    const animate = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx + Math.sin(Date.now() * 0.001 + p.y * 0.01) * 0.2;
        p.y += p.vy;
        if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }

        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        glow.addColorStop(0, `hsla(${p.hue}, 100%, 70%, ${p.alpha * 0.5})`);
        glow.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(p.x - p.size * 3, p.y - p.size * 3, p.size * 6, p.size * 6);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 85%, ${p.alpha})`;
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, []);

  const rounded = Math.round(displayProgress);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 60,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 40%, rgba(10,15,30,0.97) 0%, #000 100%)',
      opacity: fadeOut ? 0 : 1,
      transition: 'opacity 0.6s ease',
    }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
        {/* Pulsing icon */}
        <div style={{
          fontSize: 48,
          animation: 'loaderPulse 2s ease-in-out infinite',
          filter: 'drop-shadow(0 0 20px rgba(220,38,38,0.4))',
        }}>
          ☄️
        </div>

        {/* Progress bar container */}
        <div style={{
          width: 'min(280px, 70vw)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        }}>
          {/* Bar track */}
          <div style={{
            width: '100%', height: 4, borderRadius: 2,
            background: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
          }}>
            {/* Bar fill */}
            <div style={{
              height: '100%',
              width: `${displayProgress}%`,
              borderRadius: 2,
              background: 'linear-gradient(90deg, rgba(153,27,27,0.8) 0%, rgba(220,38,38,0.9) 60%, rgba(248,113,113,0.95) 100%)',
              boxShadow: '0 0 12px rgba(220,38,38,0.5), 0 0 4px rgba(220,38,38,0.8)',
              transition: 'width 0.1s linear',
            }} />
          </div>

          {/* Percentage */}
          <span style={{
            fontFamily: "'Tajawal', system-ui, sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(148,163,184,0.7)',
            letterSpacing: 3,
          }}>
            {rounded}%
          </span>
        </div>

        {/* Loading text */}
        <p style={{
          fontFamily: "'Tajawal', system-ui, sans-serif",
          fontSize: 12,
          color: 'rgba(100,116,139,0.5)',
          letterSpacing: 4,
          textTransform: 'uppercase',
          animation: 'subtitleFlicker 3s ease-in-out infinite',
        }}>
          جاري التحميل
        </p>
      </div>

      <style>{`
        @keyframes loaderPulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.12); opacity: 1; }
        }
        @keyframes subtitleFlicker {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.8; }
          70% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

export default GameLoader;
