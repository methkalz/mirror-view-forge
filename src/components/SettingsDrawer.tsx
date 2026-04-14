import React, { useState, useEffect } from 'react';
import {
  getSettings,
  updateSettings,
  type UserSettings,
} from '@/game/settings';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Side drawer that exposes per-user settings (volume, haptics, quality).
 * Uses plain React state + localStorage so it never blocks on network.
 */
const SettingsDrawer: React.FC<Props> = ({ open, onClose }) => {
  const [settings, setSettings] = useState<UserSettings>(() => getSettings());

  useEffect(() => {
    if (open) setSettings(getSettings());
  }, [open]);

  const apply = (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    updateSettings(patch);
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'flex-end',
        animation: 'sdFade 0.2s ease',
      }}
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <style>{`
        @keyframes sdFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes sdSlide { from { transform: translateX(24px); opacity: 0 } to { transform: none; opacity: 1 } }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(340px, 90vw)',
          height: '100%',
          background: 'rgba(14,10,18,0.96)',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
          padding: '28px 22px',
          overflowY: 'auto',
          color: '#fff',
          fontFamily: "'Tajawal', system-ui, sans-serif",
          animation: 'sdSlide 0.22s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 22,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, direction: 'rtl' }}>
            الإعدادات
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              fontSize: 22,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Volume Sliders */}
        <Section title="الصوت">
          <Slider
            label="الصوت العام"
            value={settings.masterVolume}
            onChange={(v) => apply({ masterVolume: v })}
          />
          <Slider
            label="المؤثرات"
            value={settings.sfxVolume}
            onChange={(v) => apply({ sfxVolume: v })}
          />
          <Slider
            label="الموسيقى"
            value={settings.musicVolume}
            onChange={(v) => apply({ musicVolume: v })}
          />
        </Section>

        {/* Graphics Quality */}
        <Section title="الجودة">
          <div style={{ display: 'flex', gap: 6, direction: 'rtl' }}>
            {(['low', 'medium', 'high'] as const).map((q) => (
              <button
                key={q}
                onClick={() => apply({ quality: q })}
                style={{
                  flex: 1,
                  padding: '10px 8px',
                  borderRadius: 10,
                  border:
                    settings.quality === q
                      ? '1px solid rgba(251,191,36,0.6)'
                      : '1px solid rgba(255,255,255,0.12)',
                  background:
                    settings.quality === q
                      ? 'rgba(251,191,36,0.12)'
                      : 'rgba(255,255,255,0.04)',
                  color: settings.quality === q ? '#fbbf24' : 'rgba(255,255,255,0.7)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {q === 'low' ? 'منخفضة' : q === 'medium' ? 'متوسطة' : 'عالية'}
              </button>
            ))}
          </div>
        </Section>

        {/* Toggles */}
        <Section title="الأخرى">
          <Toggle
            label="اهتزاز اللمس"
            value={settings.haptics}
            onChange={(v) => apply({ haptics: v })}
          />
          <Toggle
            label="تقليل الحركة"
            value={settings.reducedMotion}
            onChange={(v) => apply({ reducedMotion: v })}
          />
        </Section>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div style={{ marginBottom: 26 }}>
    <h4
      style={{
        margin: '0 0 12px',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 1.5,
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        direction: 'rtl',
      }}
    >
      {title}
    </h4>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
  </div>
);

const Slider: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
}> = ({ label, value, onChange }) => (
  <div>
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 13,
        marginBottom: 6,
        color: 'rgba(255,255,255,0.8)',
        direction: 'rtl',
      }}
    >
      <span>{label}</span>
      <span style={{ color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(value * 100)}%
      </span>
    </div>
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={{
        width: '100%',
        accentColor: '#fbbf24',
      }}
    />
  </div>
);

const Toggle: React.FC<{
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, value, onChange }) => (
  <label
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: 13,
      color: 'rgba(255,255,255,0.85)',
      direction: 'rtl',
      cursor: 'pointer',
    }}
  >
    <span>{label}</span>
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: value ? 'rgba(34,197,94,0.65)' : 'rgba(255,255,255,0.12)',
        position: 'relative',
        transition: 'background 0.2s',
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          position: 'absolute',
          top: 2,
          left: value ? 20 : 2,
          transition: 'left 0.2s',
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
        }}
      />
    </div>
  </label>
);

export default SettingsDrawer;
