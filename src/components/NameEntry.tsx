import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { loadAudioSettings, startMenuMusic, stopMenuMusic } from '@/game/audio';

interface BrandingConfig {
  logoUrl: string | null;
  gameTitle: string;
  gameSubtitle: string;
  developerName: string;
}

interface NameEntryProps {
  onSubmit: (name: string) => void;
  defaultName?: string;
  branding?: BrandingConfig;
}

// Spark particle
interface Spark {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number;
  hue: number; brightness: number;
}

const NameEntry: React.FC<NameEntryProps> = ({ onSubmit, defaultName = '', branding }) => {
  const [name, setName] = useState(defaultName);
  const [shake, setShake] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparksRef = useRef<Spark[]>([]);
  const rafRef = useRef<number>(0);
  const musicStarted = useRef(false);

  const title = branding?.gameTitle || 'SKYFALL';
  const subtitle = branding?.gameSubtitle || 'SURVIVAL';
  const developer = branding?.developerName || 'CAILOR GG';
  const logoUrl = branding?.logoUrl || null;

  // Start menu music on mount
  useEffect(() => {
    const init = async () => {
      await loadAudioSettings();
      startMenuMusic();
      musicStarted.current = true;
    };
    // Delay slightly for user gesture context
    const timer = setTimeout(init, 300);
    return () => {
      clearTimeout(timer);
      stopMenuMusic();
    };
  }, []);

  // Spark particles canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize sparks
    const createSpark = (): Spark => ({
      x: Math.random() * canvas.width,
      y: canvas.height + Math.random() * 40,
      vx: (Math.random() - 0.5) * 1.5,
      vy: -(1 + Math.random() * 2.5),
      life: 0,
      maxLife: 80 + Math.random() * 120,
      size: 1 + Math.random() * 2.5,
      hue: 15 + Math.random() * 30, // orange-gold range
      brightness: 60 + Math.random() * 40,
    });

    for (let i = 0; i < 60; i++) {
      const s = createSpark();
      s.y = Math.random() * canvas.height;
      s.life = Math.random() * s.maxLife;
      sparksRef.current.push(s);
    }

    const animate = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life++;
        s.x += s.vx + Math.sin(s.life * 0.02) * 0.3;
        s.y += s.vy;
        s.vy *= 0.998;

        const progress = s.life / s.maxLife;
        const alpha = progress < 0.1 ? progress * 10 : progress > 0.7 ? (1 - progress) / 0.3 : 1;

        if (s.life >= s.maxLife) {
          sparks[i] = createSpark();
          continue;
        }

        // Glow
        const glowSize = s.size * 4;
        const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, glowSize);
        glow.addColorStop(0, `hsla(${s.hue}, 100%, ${s.brightness}%, ${alpha * 0.6})`);
        glow.addColorStop(0.5, `hsla(${s.hue}, 90%, ${s.brightness * 0.7}%, ${alpha * 0.2})`);
        glow.addColorStop(1, `hsla(${s.hue}, 80%, 50%, 0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(s.x - glowSize, s.y - glowSize, glowSize * 2, glowSize * 2);

        // Core
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (1 - progress * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${s.hue}, 100%, ${s.brightness + 20}%, ${alpha * 0.9})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      sparksRef.current = [];
    };
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    setFadeOut(true);
    stopMenuMusic();
    setTimeout(() => onSubmit(trimmed.slice(0, 20)), 400);
  }, [name, onSubmit]);

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', zIndex: 50,
      background: 'radial-gradient(ellipse at 50% 40%, rgba(15,23,42,0.92) 0%, rgba(0,0,0,0.98) 100%)',
      opacity: fadeOut ? 0 : 1, transition: 'opacity 0.4s ease',
    }}>
      {/* Spark Canvas */}
      <canvas ref={canvasRef} style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
      }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>

        {/* Logo or Title */}
        {logoUrl ? (
          <img src={logoUrl} alt={title} style={{
            width: 'clamp(80px, 25vw, 140px)', height: 'auto', marginBottom: 12,
            filter: 'drop-shadow(0 0 30px rgba(220,38,38,0.4))',
          }} />
        ) : (
          <h1 style={{
            fontFamily: "'Tajawal', 'SF Pro Display', system-ui, sans-serif",
            fontSize: 'clamp(32px, 8vw, 56px)',
            fontWeight: 900,
            color: 'transparent',
            backgroundImage: 'linear-gradient(180deg, #f8fafc 0%, #94a3b8 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            textShadow: 'none',
            marginBottom: 4,
            letterSpacing: -1,
            filter: 'drop-shadow(0 0 30px rgba(220,38,38,0.25))',
          }}>
            ☄️ {title}
          </h1>
        )}

        <p style={{
          fontFamily: "'Tajawal', system-ui, sans-serif",
          fontSize: 'clamp(10px, 2.5vw, 14px)',
          color: 'rgba(148,163,184,0.6)',
          marginBottom: 36,
          letterSpacing: 6,
          textTransform: 'uppercase',
        }}>
          {subtitle}
        </p>

        {/* Glassmorphism Card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: 24,
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '36px 28px',
          width: 'min(330px, 85vw)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 80px rgba(220,38,38,0.05)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Subtle inner glow */}
          <div style={{
            position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)',
            width: 200, height: 120, borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(220,38,38,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <label style={{
            fontFamily: "'Tajawal', system-ui, sans-serif",
            fontSize: 14,
            color: 'rgba(203,213,225,0.85)',
            letterSpacing: 1,
            zIndex: 1,
          }}>
            أدخل اسم البطل
          </label>

          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            maxLength={20}
            placeholder="HERO NAME"
            autoFocus
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: 14,
              border: `1.5px solid ${shake ? 'rgba(220,38,38,0.7)' : 'rgba(255,255,255,0.1)'}`,
              background: 'rgba(0,0,0,0.35)',
              color: '#f1f5f9',
              fontSize: 18,
              fontFamily: "'SF Pro', system-ui, sans-serif",
              fontWeight: 600,
              textAlign: 'center',
              letterSpacing: 2,
              outline: 'none',
              transition: 'border-color 0.3s, box-shadow 0.3s',
              boxShadow: shake ? '0 0 16px rgba(220,38,38,0.3)' : '0 2px 12px rgba(0,0,0,0.3)',
              animation: shake ? 'shake 0.5s ease' : 'none',
              zIndex: 1,
            }}
          />

          <button
            onClick={handleSubmit}
            onPointerDown={e => { if (name.trim()) (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'; }}
            onPointerUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            onPointerLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            style={{
              width: '100%',
              padding: '16px 0',
              borderRadius: 14,
              border: name.trim() ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.04)',
              background: name.trim()
                ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 50%, #7f1d1d 100%)'
                : 'rgba(100,100,100,0.1)',
              color: name.trim() ? '#fff' : 'rgba(255,255,255,0.2)',
              fontSize: 17,
              fontFamily: "'Tajawal', system-ui, sans-serif",
              fontWeight: 800,
              letterSpacing: 3,
              cursor: name.trim() ? 'pointer' : 'default',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: name.trim()
                ? '0 6px 28px rgba(220,38,38,0.35), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -2px 4px rgba(0,0,0,0.2)'
                : 'none',
              zIndex: 1,
              position: 'relative',
              overflow: 'hidden',
              transform: 'scale(1)',
            }}
          >
            {/* Shine sweep overlay */}
            {name.trim() && (
              <span style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 45%, rgba(255,255,255,0.06) 50%, transparent 55%)',
                animation: 'btnShineSweep 3s ease-in-out infinite',
                pointerEvents: 'none',
              }} />
            )}
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span>ابدأ المعركة</span>
              <span style={{ fontSize: 20, filter: name.trim() ? 'drop-shadow(0 0 4px rgba(255,200,50,0.5))' : 'none' }}>⚔️</span>
            </span>
          </button>
        </div>

        {/* Developer credit */}
        <p style={{
          marginTop: 32,
          fontFamily: "'SF Pro', system-ui, sans-serif",
          fontSize: 11,
          color: 'rgba(100,116,139,0.5)',
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}>
          Developed by {developer}
        </p>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
};

export default NameEntry;
