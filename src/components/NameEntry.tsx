import React, { useState, useEffect, useRef, useCallback } from 'react';
import { startMenuMusic, stopMenuMusic } from '@/game/audio';

interface BrandingConfig {
  logoUrl: string | null;
  gameTitle: string;
  gameSubtitle: string;
  developerName: string;
  showTitle: boolean;
}

interface NameEntryProps {
  onSubmit: (name: string) => void;
  defaultName?: string;
  branding?: BrandingConfig;
}

interface Spark {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number;
  hue: number; brightness: number;
}

const NameEntry: React.FC<NameEntryProps> = ({ onSubmit, defaultName = '', branding }) => {
  const [name, setName] = useState(defaultName);
  const [shake, setShake] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [focused, setFocused] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparksRef = useRef<Spark[]>([]);
  const rafRef = useRef<number>(0);
  const musicStarted = useRef(false);

  const title = branding?.gameTitle || 'SKYFALL';
  const subtitle = branding?.gameSubtitle || 'SURVIVAL';
  const developer = branding?.developerName || 'CAILOR GG';
  const logoUrl = branding?.logoUrl || null;
  const showTitle = branding?.showTitle ?? true;
  const hasName = name.trim().length > 0;

  // Music is now started from GameLoader button — no listeners needed here

  // Spark particles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const createSpark = (): Spark => ({
      x: Math.random() * canvas.width,
      y: canvas.height + Math.random() * 40,
      vx: (Math.random() - 0.5) * 1.5,
      vy: -(1 + Math.random() * 2.5),
      life: 0, maxLife: 80 + Math.random() * 120,
      size: 1 + Math.random() * 2.5,
      hue: 15 + Math.random() * 30,
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
        if (s.life >= s.maxLife) { sparks[i] = createSpark(); continue; }
        const glowSize = s.size * 4;
        const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, glowSize);
        glow.addColorStop(0, `hsla(${s.hue}, 100%, ${s.brightness}%, ${alpha * 0.6})`);
        glow.addColorStop(0.5, `hsla(${s.hue}, 90%, ${s.brightness * 0.7}%, ${alpha * 0.2})`);
        glow.addColorStop(1, `hsla(${s.hue}, 80%, 50%, 0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(s.x - glowSize, s.y - glowSize, glowSize * 2, glowSize * 2);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (1 - progress * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${s.hue}, 100%, ${s.brightness + 20}%, ${alpha * 0.9})`;
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); sparksRef.current = []; };
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) { setShake(true); setTimeout(() => setShake(false), 500); return; }
    setFadeOut(true);
    setTimeout(() => onSubmit(trimmed.slice(0, 20)), 400);
  }, [name, onSubmit]);

  const bevelRadius = 6;

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', zIndex: 50,
      background: 'radial-gradient(ellipse at 50% 40%, rgba(15,23,42,0.92) 0%, rgba(0,0,0,0.98) 100%)',
      opacity: fadeOut ? 0 : 1, transition: 'opacity 0.4s ease',
    }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>

        {/* Logo or Title */}
        {logoUrl ? (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <img src={logoUrl} alt={title} style={{
              width: 'clamp(80px, 25vw, 140px)', height: 'auto',
              filter: 'drop-shadow(0 0 30px rgba(220,38,38,0.4))',
              margin: '0 auto',
            }} />
            {showTitle && (
              <h1 style={{
                fontFamily: "'Tajawal', system-ui, sans-serif",
                fontSize: 'clamp(20px, 5vw, 32px)',
                fontWeight: 900,
                color: 'transparent',
                backgroundImage: 'linear-gradient(180deg, #f8fafc 0%, #94a3b8 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                marginTop: 8,
                letterSpacing: -0.5,
              }}>
                {title}
              </h1>
            )}
          </div>
        ) : (
          <h1 style={{
            fontFamily: "'Tajawal', system-ui, sans-serif",
            fontSize: 'clamp(32px, 8vw, 56px)',
            fontWeight: 900,
            color: 'transparent',
            backgroundImage: 'linear-gradient(180deg, #f8fafc 0%, #94a3b8 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            marginBottom: 4,
            letterSpacing: -1,
            filter: 'drop-shadow(0 0 30px rgba(220,38,38,0.25))',
          }}>
            ☄️ {title}
          </h1>
        )}

        {/* Subtitle with flicker */}
        <p style={{
          fontFamily: "'Tajawal', system-ui, sans-serif",
          fontSize: 'clamp(10px, 2.5vw, 14px)',
          color: 'rgba(148,163,184,0.6)',
          marginBottom: 36,
          letterSpacing: 6,
          textTransform: 'uppercase',
          animation: 'subtitleFlicker 4s ease-in-out infinite',
        }}>
          {subtitle}
        </p>

        {/* Glass Card with HUD corners */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '40px 28px 36px',
          width: 'min(340px, 88vw)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22,
          boxShadow: '0 8px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 100px rgba(220,38,38,0.06)',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Inner glow */}
          <div style={{
            position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)',
            width: 260, height: 160, borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(220,38,38,0.1) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          {/* HUD Corner brackets */}
          {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => {
            const isTop = pos.includes('top');
            const isLeft = pos.includes('left');
            const cornerRadius = 16;
            return (
              <div key={pos} style={{
                position: 'absolute',
                [isTop ? 'top' : 'bottom']: 6,
                [isLeft ? 'left' : 'right']: 6,
                width: 22, height: 22,
                borderColor: 'rgba(220,38,38,0.4)',
                borderStyle: 'solid',
                borderWidth: 0,
                ...(isTop && isLeft ? { borderTopWidth: 1.5, borderLeftWidth: 1.5, borderTopLeftRadius: cornerRadius } : {}),
                ...(isTop && !isLeft ? { borderTopWidth: 1.5, borderRightWidth: 1.5, borderTopRightRadius: cornerRadius } : {}),
                ...(!isTop && isLeft ? { borderBottomWidth: 1.5, borderLeftWidth: 1.5, borderBottomLeftRadius: cornerRadius } : {}),
                ...(!isTop && !isLeft ? { borderBottomWidth: 1.5, borderRightWidth: 1.5, borderBottomRightRadius: cornerRadius } : {}),
                pointerEvents: 'none',
              }} />
            );
          })}

          <label style={{
            fontFamily: "'Tajawal', system-ui, sans-serif",
            fontSize: 14,
            color: 'rgba(203,213,225,0.85)',
            letterSpacing: 1,
            zIndex: 1,
          }}>
            أدخل اسم البطل
          </label>

          {/* Input with beveled style */}
          <div style={{ width: '100%', position: 'relative', zIndex: 1 }}>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              maxLength={20}
              placeholder="HERO NAME"
              autoFocus
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: bevelRadius,
                border: `1.5px solid ${shake ? 'rgba(220,38,38,0.7)' : focused ? 'rgba(220,38,38,0.5)' : 'rgba(255,255,255,0.1)'}`,
                background: 'rgba(0,0,0,0.4)',
                color: '#f1f5f9',
                fontSize: 18,
                fontFamily: "'Tajawal', system-ui, sans-serif",
                fontWeight: 600,
                textAlign: 'center',
                outline: 'none',
                transition: 'border-color 0.3s, box-shadow 0.3s',
                boxShadow: shake
                  ? '0 0 16px rgba(220,38,38,0.3)'
                  : focused
                    ? '0 0 20px rgba(220,38,38,0.15), inset 0 0 20px rgba(220,38,38,0.05)'
                    : '0 2px 12px rgba(0,0,0,0.3)',
                animation: shake ? 'shake 0.5s ease' : 'none',
              }}
            />
          </div>

          {/* Battle Button — Beveled Military */}
          <div style={{ width: '100%', position: 'relative', zIndex: 1 }}>
            <button
              onClick={handleSubmit}
              style={{
                width: '100%',
                padding: '16px 24px',
                borderRadius: bevelRadius,
                border: hasName ? '1.5px solid rgba(220,38,38,0.6)' : '1.5px solid rgba(255,255,255,0.08)',
                background: hasName
                  ? 'linear-gradient(135deg, rgba(153,27,27,0.5) 0%, rgba(127,29,29,0.7) 50%, rgba(153,27,27,0.5) 100%)'
                  : 'rgba(255,255,255,0.03)',
                color: hasName ? '#fff' : 'rgba(255,255,255,0.25)',
                fontSize: 18,
                fontFamily: "'Tajawal', system-ui, sans-serif",
                fontWeight: 800,
                cursor: hasName ? 'pointer' : 'default',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                direction: 'rtl',
                position: 'relative',
                overflow: 'hidden',
                textShadow: hasName ? '0 0 16px rgba(220,38,38,0.7)' : 'none',
                boxShadow: hasName
                  ? '0 0 30px rgba(220,38,38,0.2), inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.4)'
                  : 'none',
                outline: 'none',
              }}
              onPointerDown={e => { if (hasName) (e.currentTarget as HTMLElement).style.transform = 'scale(0.96)'; }}
              onPointerUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
              onPointerLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            >
              {/* Energy pulse overlay */}
              {hasName && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'radial-gradient(ellipse at center, rgba(220,38,38,0.15) 0%, transparent 70%)',
                  animation: 'energyPulse 2.5s ease-in-out infinite',
                  pointerEvents: 'none',
                }} />
              )}

              {/* Scan line */}
              {hasName && (
                <div style={{
                  position: 'absolute', left: 0, right: 0, height: 1,
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
                  animation: 'scanLine 3s linear infinite',
                  pointerEvents: 'none',
                }} />
              )}

              <span style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span>ابدأ المعركة</span>
                {hasName && <span style={{ fontSize: 16, opacity: 0.8 }}>⚔</span>}
              </span>
            </button>
          </div>
        </div>

        {/* Developer credit */}
        <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 40, height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(100,116,139,0.3), transparent)',
          }} />
          <p style={{
            fontFamily: "'Tajawal', system-ui, sans-serif",
            fontSize: 11,
            color: 'rgba(100,116,139,0.5)',
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}>
            Developed by {developer}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes scanLine {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes energyPulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        @keyframes subtitleFlicker {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.85; }
          70% { opacity: 0.5; }
          85% { opacity: 0.75; }
        }
      `}</style>
    </div>
  );
};

export default NameEntry;
