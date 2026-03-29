import React, { useState } from 'react';

interface NameEntryProps {
  onSubmit: (name: string) => void;
  defaultName?: string;
}

const NameEntry: React.FC<NameEntryProps> = ({ onSubmit, defaultName = '' }) => {
  const [name, setName] = useState(defaultName);
  const [shake, setShake] = useState(false);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    onSubmit(trimmed.slice(0, 20));
  };

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      background: 'radial-gradient(ellipse at center, rgba(15,23,42,0.95) 0%, rgba(0,0,0,0.98) 100%)',
    }}>
      {/* Title */}
      <h1 style={{
        fontFamily: "'Tajawal', 'SF Pro Display', system-ui, sans-serif",
        fontSize: 'clamp(28px, 7vw, 48px)',
        fontWeight: 800,
        color: '#f1f5f9',
        textShadow: '0 0 40px rgba(220,38,38,0.3), 0 2px 10px rgba(0,0,0,0.5)',
        marginBottom: 8,
        letterSpacing: -1,
      }}>
        ☄️ SKYFALL
      </h1>
      <p style={{
        fontFamily: "'Tajawal', system-ui, sans-serif",
        fontSize: 'clamp(12px, 3vw, 16px)',
        color: 'rgba(148,163,184,0.8)',
        marginBottom: 40,
        letterSpacing: 3,
        textTransform: 'uppercase',
      }}>
        SURVIVAL
      </p>

      {/* Glassmorphism card */}
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '32px 28px',
        width: 'min(320px, 85vw)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}>
        <label style={{
          fontFamily: "'Tajawal', system-ui, sans-serif",
          fontSize: 14,
          color: 'rgba(203,213,225,0.9)',
          letterSpacing: 1,
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
            borderRadius: 12,
            border: `1.5px solid ${shake ? 'rgba(220,38,38,0.7)' : 'rgba(255,255,255,0.15)'}`,
            background: 'rgba(0,0,0,0.3)',
            color: '#f1f5f9',
            fontSize: 18,
            fontFamily: "'SF Pro', system-ui, sans-serif",
            fontWeight: 600,
            textAlign: 'center',
            letterSpacing: 2,
            outline: 'none',
            transition: 'border-color 0.3s, box-shadow 0.3s',
            boxShadow: shake ? '0 0 12px rgba(220,38,38,0.3)' : 'none',
            animation: shake ? 'shake 0.5s ease' : 'none',
          }}
        />

        <button
          onClick={handleSubmit}
          style={{
            width: '100%',
            padding: '14px 0',
            borderRadius: 12,
            border: 'none',
            background: name.trim()
              ? 'linear-gradient(135deg, rgba(220,38,38,0.85), rgba(185,28,28,0.95))'
              : 'rgba(100,100,100,0.2)',
            color: name.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
            fontSize: 16,
            fontFamily: "'Tajawal', system-ui, sans-serif",
            fontWeight: 700,
            letterSpacing: 2,
            cursor: name.trim() ? 'pointer' : 'default',
            transition: 'all 0.3s ease',
            boxShadow: name.trim() ? '0 4px 20px rgba(220,38,38,0.3)' : 'none',
          }}
        >
          ابدأ المعركة ⚔️
        </button>
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
