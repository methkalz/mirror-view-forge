import React, { useState, useEffect, useRef } from 'react';

interface LoadingScreenProps {
  onComplete: () => void;
  loadingProgress: number; // 0-100
  loadingText?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ onComplete, loadingProgress, loadingText }) => {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const completedRef = useRef(false);

  // Smooth progress animation
  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayProgress(prev => {
        const target = loadingProgress;
        const diff = target - prev;
        if (Math.abs(diff) < 0.5) return target;
        return prev + diff * 0.08;
      });
    }, 16);
    return () => clearInterval(interval);
  }, [loadingProgress]);

  // Trigger fade-out when 100%
  useEffect(() => {
    if (displayProgress >= 99.5 && !completedRef.current) {
      completedRef.current = true;
      setTimeout(() => {
        setFadeOut(true);
        setTimeout(onComplete, 600);
      }, 400);
    }
  }, [displayProgress, onComplete]);

  // Particle canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    interface Particle { x: number; y: number; vx: number; vy: number; size: number; alpha: number; hue: number; }
    const particles: Particle[] = [];
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -(0.3 + Math.random() * 1),
        size: 0.5 + Math.random() * 1.5,
        alpha: Math.random() * 0.6,
        hue: 10 + Math.random() * 25,
      });
    }

    const animate = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx + Math.sin(Date.now() * 0.001 + p.y * 0.01) * 0.2;
        p.y += p.vy;
        if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${p.alpha})`;
        ctx.fill();
        // Glow
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        g.addColorStop(0, `hsla(${p.hue}, 100%, 60%, ${p.alpha * 0.3})`);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(p.x - p.size * 3, p.y - p.size * 3, p.size * 6, p.size * 6);
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, []);

  const pct = Math.round(displayProgress);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 40%, rgba(10,15,28,0.97) 0%, #000 100%)',
      opacity: fadeOut ? 0 : 1,
      transition: 'opacity 0.6s ease',
    }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
        {/* Logo / Title */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontFamily: "'Tajawal', system-ui, sans-serif",
            fontSize: 'clamp(28px, 7vw, 48px)',
            fontWeight: 900,
            color: 'transparent',
            backgroundImage: 'linear-gradient(180deg, #f8fafc 0%, #64748b 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            letterSpacing: -1,
            filter: 'drop-shadow(0 0 20px rgba(220,38,38,0.2))',
            margin: 0,
          }}>
            ☄️ SKYFALL
          </h1>
        </div>

        {/* Progress bar */}
        <div style={{ width: 'min(280px, 70vw)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          {/* Bar container */}
          <div style={{
            width: '100%', height: 3, borderRadius: 2,
            background: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {/* Fill */}
            <div style={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: 2,
              background: 'linear-gradient(90deg, rgba(220,38,38,0.6), rgba(220,38,38,0.9))',
              boxShadow: '0 0 12px rgba(220,38,38,0.4)',
              transition: 'width 0.1s linear',
            }} />
          </div>

          {/* Status text */}
          <div style={{
            fontFamily: "'Tajawal', system-ui, sans-serif",
            fontSize: 11,
            color: 'rgba(148,163,184,0.5)',
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}>
            {loadingText || 'LOADING'} {pct}%
          </div>
        </div>

        {/* Animated dots */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 4, height: 4, borderRadius: '50%',
              background: 'rgba(220,38,38,0.5)',
              animation: `loadDot 1.4s ease-in-out ${i * 0.2}s infinite`,
            }} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes loadDot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;
