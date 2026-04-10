import React, { useState, useEffect, useRef } from 'react';
import { startMenuMusic } from '@/game/audio';

interface GameLoaderProps {
  onLoaded: () => void;
  progress: number;
}

const GameLoader: React.FC<GameLoaderProps> = ({ onLoaded, progress }) => {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [dots, setDots] = useState('');

  // Animated dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Smooth progress
  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayProgress(prev => {
        const diff = progress - prev;
        if (Math.abs(diff) < 0.5) return progress;
        return prev + diff * 0.12;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [progress]);

  const [ready, setReady] = useState(false);

  // Show button when loading complete
  useEffect(() => {
    if (progress >= 100) {
      const timer = setTimeout(() => setReady(true), 400);
      return () => clearTimeout(timer);
    }
  }, [progress]);

  const handleStart = async () => {
    startMenuMusic();
    setFadeOut(true);
    setTimeout(onLoaded, 700);
  };

  // Particle ring + floating particles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => { canvas.width = window.innerWidth * 2; canvas.height = window.innerHeight * 2; canvas.style.width = window.innerWidth + 'px'; canvas.style.height = window.innerHeight + 'px'; };
    resize();
    window.addEventListener('resize', resize);

    interface Particle {
      x: number; y: number; vx: number; vy: number;
      size: number; alpha: number; hue: number; speed: number;
    }

    const particles: Particle[] = Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -(0.2 + Math.random() * 0.6),
      size: 0.5 + Math.random() * 1.5,
      alpha: 0.15 + Math.random() * 0.35,
      hue: 5 + Math.random() * 30,
      speed: 0.5 + Math.random(),
    }));

    let startTime = Date.now();

    const animate = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const elapsed = (Date.now() - startTime) * 0.001;

      // Draw orbital ring
      const cx = w / 2;
      const cy = h / 2 - 60;
      const ringRadius = 90;

      for (let i = 0; i < 3; i++) {
        const angle = elapsed * (0.8 + i * 0.3) + i * (Math.PI * 2 / 3);
        const ox = cx + Math.cos(angle) * ringRadius;
        const oy = cy + Math.sin(angle) * ringRadius * 0.35;
        const orbitGlow = ctx.createRadialGradient(ox, oy, 0, ox, oy, 12);
        orbitGlow.addColorStop(0, `hsla(${10 + i * 8}, 100%, 70%, 0.7)`);
        orbitGlow.addColorStop(0.5, `hsla(${10 + i * 8}, 100%, 50%, 0.2)`);
        orbitGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = orbitGlow;
        ctx.fillRect(ox - 12, oy - 12, 24, 24);

        ctx.beginPath();
        ctx.arc(ox, oy, 2, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${15 + i * 8}, 100%, 90%, 0.9)`;
        ctx.fill();
      }

      // Draw faint ring path
      ctx.beginPath();
      ctx.ellipse(cx, cy, ringRadius, ringRadius * 0.35, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(220,38,38,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Floating particles
      for (const p of particles) {
        p.x += p.vx + Math.sin(elapsed * 0.5 + p.y * 0.005) * 0.15;
        p.y += p.vy * p.speed;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;

        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
        glow.addColorStop(0, `hsla(${p.hue}, 100%, 75%, ${p.alpha * 0.4})`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(p.x - p.size * 4, p.y - p.size * 4, p.size * 8, p.size * 8);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 88%, ${p.alpha * 0.8})`;
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
      background: 'radial-gradient(ellipse at 50% 35%, rgba(15,10,25,0.98) 0%, #000 100%)',
      opacity: fadeOut ? 0 : 1,
      transition: 'opacity 0.7s ease',
    }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40,
      }}>
        {/* Pulsing meteor icon with glow ring */}
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', inset: -20,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(220,38,38,0.12) 0%, transparent 70%)',
            animation: 'ringPulse 2.5s ease-in-out infinite',
          }} />
          <img
            src="/loader-logo.png"
            alt="Logo"
            style={{
              width: 120,
              height: 'auto',
              animation: 'loaderFloat 3s ease-in-out infinite',
              filter: 'drop-shadow(0 0 24px rgba(220,38,38,0.5)) drop-shadow(0 0 60px rgba(220,38,38,0.15))',
            }}
          />
        </div>

        {/* Progress section */}
        <div style={{
          width: 'min(300px, 75vw)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}>
          {/* Track with glow */}
          <div style={{ width: '100%', position: 'relative' }}>
            {/* Glow behind bar */}
            <div style={{
              position: 'absolute', top: -6, left: 0, right: 0, height: 16,
              background: `linear-gradient(90deg, transparent 0%, rgba(220,38,38,${0.15 * displayProgress / 100}) ${displayProgress}%, transparent ${displayProgress + 5}%)`,
              filter: 'blur(8px)',
              borderRadius: 8,
              pointerEvents: 'none',
            }} />
            <div style={{
              width: '100%', height: 3, borderRadius: 2,
              background: 'rgba(255,255,255,0.04)',
              overflow: 'hidden',
              position: 'relative',
            }}>
              <div style={{
                height: '100%',
                width: `${displayProgress}%`,
                borderRadius: 2,
                background: 'linear-gradient(90deg, rgba(127,29,29,0.7) 0%, rgba(220,38,38,0.85) 50%, rgba(252,165,165,0.95) 100%)',
                boxShadow: '0 0 8px rgba(220,38,38,0.6)',
                transition: 'width 0.08s linear',
              }} />
            </div>
          </div>

          {/* Percentage with monospace feel */}
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 6,
          }}>
            <span style={{
              fontFamily: "'Tajawal', system-ui, sans-serif",
              fontSize: 28,
              fontWeight: 300,
              color: 'rgba(248,250,252,0.8)',
              letterSpacing: 2,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {rounded}
            </span>
            <span style={{
              fontFamily: "'Tajawal', system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 400,
              color: 'rgba(148,163,184,0.5)',
            }}>
              %
            </span>
          </div>
        </div>

        {/* Loading text or Start button */}
        {!ready ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            direction: 'rtl',
          }}>
            <span style={{
              fontFamily: "'Tajawal', sans-serif",
              fontSize: 14,
              fontWeight: 500,
              color: 'rgba(148,163,184,0.45)',
              letterSpacing: 1,
            }}>
              جارٍ التحميل
            </span>
            <span style={{
              fontFamily: "monospace",
              fontSize: 14,
              color: 'rgba(148,163,184,0.35)',
              width: 20,
              display: 'inline-block',
              textAlign: 'left',
            }}>
              {dots}
            </span>
          </div>
        ) : (
          <button
            onClick={handleStart}
            style={{
              fontFamily: "'Tajawal', sans-serif",
              fontSize: 18,
              fontWeight: 700,
              color: '#fef2f2',
              background: 'linear-gradient(135deg, rgba(127,29,29,0.85) 0%, rgba(220,38,38,0.75) 100%)',
              border: '1px solid rgba(252,165,165,0.2)',
              borderRadius: 6,
              padding: '14px 40px',
              cursor: 'pointer',
              letterSpacing: 0,
              direction: 'rtl',
              boxShadow: '0 0 20px rgba(220,38,38,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
              animation: 'buttonAppear 0.6s ease-out',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.96)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.96)')}
            onTouchEnd={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            التالي
          </button>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700&display=swap');
        @keyframes loaderFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-8px) scale(1.05); }
        }
        @keyframes buttonAppear {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.3); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default GameLoader;
