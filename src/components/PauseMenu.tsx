import React, { useEffect } from 'react';

interface PauseMenuProps {
  open: boolean;
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onQuit: () => void;
}

/**
 * In-game pause overlay.
 * - Blocks pointer events through to the canvas while open
 * - Listens for ESC to resume
 * - Uses Tajawal font and the same glass-morphism style as the rest of the UI
 */
const PauseMenu: React.FC<PauseMenuProps> = ({
  open,
  onResume,
  onRestart,
  onOpenSettings,
  onQuit,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onResume();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onResume]);

  if (!open) return null;

  const btnStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 18px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    fontWeight: 700,
    fontFamily: "'Tajawal', system-ui, sans-serif",
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    direction: 'rtl',
  };

  const primaryBtnStyle: React.CSSProperties = {
    ...btnStyle,
    background: 'rgba(251,191,36,0.14)',
    border: '1px solid rgba(251,191,36,0.45)',
    color: '#fbbf24',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        animation: 'pmFade 0.2s ease',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <style>{`
        @keyframes pmFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pmSlide { from { transform: translateY(12px); opacity: 0 } to { transform: none; opacity: 1 } }
      `}</style>
      <div
        style={{
          width: 'min(320px, 88vw)',
          background: 'rgba(20,15,25,0.85)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          padding: '28px 22px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          animation: 'pmSlide 0.22s ease',
        }}
      >
        <h2
          style={{
            margin: '0 0 20px',
            textAlign: 'center',
            fontFamily: "'Tajawal', system-ui, sans-serif",
            fontSize: 22,
            fontWeight: 800,
            color: '#fff',
            letterSpacing: 1,
            direction: 'rtl',
          }}
        >
          إيقاف مؤقت
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button style={primaryBtnStyle} onClick={onResume}>
            ▶ متابعة اللعب
          </button>
          <button style={btnStyle} onClick={onOpenSettings}>
            ⚙ الإعدادات
          </button>
          <button style={btnStyle} onClick={onRestart}>
            ↻ إعادة البدء
          </button>
          <button
            style={{
              ...btnStyle,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: 'rgba(239,68,68,0.85)',
            }}
            onClick={onQuit}
          >
            ✕ خروج
          </button>
        </div>

        <p
          style={{
            margin: '18px 0 0',
            fontSize: 11,
            textAlign: 'center',
            color: 'rgba(255,255,255,0.35)',
            direction: 'rtl',
          }}
        >
          اضغط ESC للمتابعة
        </p>
      </div>
    </div>
  );
};

export default PauseMenu;
