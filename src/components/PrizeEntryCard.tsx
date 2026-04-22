import React, { useState, useCallback } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { submitPrizeEntry } from '@/game/config';

interface PrizeEntryCardProps {
  playerName: string;
  score: number;
  rank: number;
  waves: number;
  onSubmitted: () => void;
  onDismiss: () => void;
}

const phoneSchema = z
  .string()
  .trim()
  .min(6, { message: 'الرقم قصير جداً' })
  .max(20, { message: 'الرقم طويل جداً' })
  .regex(/^[+0-9\s\-]+$/, { message: 'الرقم يحتوي رموزاً غير مسموحة' });

const PrizeEntryCard: React.FC<PrizeEntryCardProps> = ({ playerName, score, rank, waves, onSubmitted, onDismiss }) => {
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = useCallback(async () => {
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) {
      triggerShake();
      toast.error(parsed.error.issues[0]?.message ?? 'رقم غير صالح');
      return;
    }
    setSubmitting(true);
    const ok = await submitPrizeEntry(playerName, parsed.data, score, rank, waves);
    setSubmitting(false);
    if (!ok) {
      toast.error('تعذر إرسال الرقم — حاول لاحقاً');
      return;
    }
    toast.success('مبروك يا كبير');
    setFadeOut(true);
    setTimeout(() => onSubmitted(), 350);
  }, [phone, playerName, score, rank, waves, onSubmitted]);

  const handleDismiss = useCallback(() => {
    setFadeOut(true);
    setTimeout(() => onDismiss(), 300);
  }, [onDismiss]);

  const bevelRadius = 8;
  const hasPhone = phone.trim().length >= 6;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 80,
        background: 'radial-gradient(ellipse at 50% 40%, rgba(15,23,42,0.85) 0%, rgba(0,0,0,0.92) 100%)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.35s ease',
        padding: '20px',
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          borderRadius: 22,
          border: '1px solid rgba(255,215,0,0.25)',
          padding: '32px 24px 28px',
          width: 'min(380px, 92vw)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          boxShadow:
            '0 8px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 100px rgba(220,38,38,0.08), 0 0 60px rgba(255,215,0,0.06)',
          position: 'relative',
          overflow: 'hidden',
          animation: 'prizeCardIn 0.5s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Inner glow */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 300,
            height: 200,
            borderRadius: '50%',
            background:
              'radial-gradient(ellipse, rgba(255,215,0,0.12) 0%, rgba(220,38,38,0.06) 50%, transparent 80%)',
            pointerEvents: 'none',
          }}
        />

        {/* HUD Corner brackets */}
        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => {
          const isTop = pos.includes('top');
          const isLeft = pos.includes('left');
          const cornerRadius = 16;
          return (
            <div
              key={pos}
              style={{
                position: 'absolute',
                [isTop ? 'top' : 'bottom']: 6,
                [isLeft ? 'left' : 'right']: 6,
                width: 22,
                height: 22,
                borderColor: 'rgba(255,215,0,0.5)',
                borderStyle: 'solid',
                borderWidth: 0,
                ...(isTop && isLeft ? { borderTopWidth: 1.5, borderLeftWidth: 1.5, borderTopLeftRadius: cornerRadius } : {}),
                ...(isTop && !isLeft ? { borderTopWidth: 1.5, borderRightWidth: 1.5, borderTopRightRadius: cornerRadius } : {}),
                ...(!isTop && isLeft ? { borderBottomWidth: 1.5, borderLeftWidth: 1.5, borderBottomLeftRadius: cornerRadius } : {}),
                ...(!isTop && !isLeft ? { borderBottomWidth: 1.5, borderRightWidth: 1.5, borderBottomRightRadius: cornerRadius } : {}),
                pointerEvents: 'none',
              } as React.CSSProperties}
            />
          );
        })}

        {/* Trophy */}
        <div
          style={{
            fontSize: 48,
            lineHeight: 1,
            filter: 'drop-shadow(0 0 24px rgba(255,215,0,0.5))',
            animation: 'trophyFloat 3s ease-in-out infinite',
            zIndex: 1,
          }}
        >
          🏆
        </div>

        {/* Headline */}
        <div
          style={{
            fontFamily: "'Tajawal', system-ui, sans-serif",
            fontSize: 18,
            fontWeight: 800,
            color: '#ffd700',
            direction: 'rtl',
            textAlign: 'center',
            lineHeight: 1.5,
            textShadow: '0 0 20px rgba(255,215,0,0.4)',
            zIndex: 1,
          }}
        >
          أنت من أول 10 أبطال
        </div>

        {/* Subtext */}
        <p
          style={{
            fontFamily: "'Tajawal', system-ui, sans-serif",
            fontSize: 13.5,
            color: 'rgba(226,232,240,0.85)',
            direction: 'rtl',
            textAlign: 'center',
            lineHeight: 1.7,
            margin: 0,
            zIndex: 1,
            maxWidth: 320,
          }}
        >
          اترك رقمك وادخل السحب على جوائز مش قيّمة بس مليحة
        </p>

        {/* Player info chip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 16px',
            borderRadius: 10,
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.06)',
            fontFamily: "'Tajawal', system-ui, sans-serif",
            fontSize: 12,
            color: 'rgba(203,213,225,0.85)',
            direction: 'rtl',
            zIndex: 1,
          }}
        >
          <span style={{ color: 'rgba(148,163,184,0.7)' }}>اللاعب:</span>
          <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{playerName}</span>
          <span style={{ color: 'rgba(148,163,184,0.4)' }}>•</span>
          <span style={{ color: 'rgba(148,163,184,0.7)' }}>المرتبة</span>
          <span style={{ color: '#ffd700', fontWeight: 700 }}>#{rank}</span>
        </div>

        {/* Phone Input */}
        <div style={{ width: '100%', position: 'relative', zIndex: 1 }}>
          <label
            style={{
              fontFamily: "'Tajawal', system-ui, sans-serif",
              fontSize: 12,
              color: 'rgba(203,213,225,0.7)',
              direction: 'rtl',
              display: 'block',
              marginBottom: 8,
              textAlign: 'right',
            }}
          >
            رقم الهاتف
          </label>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            maxLength={20}
            placeholder="0526444414"
            disabled={submitting}
            autoFocus
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: bevelRadius,
              border: `1.5px solid ${shake ? 'rgba(220,38,38,0.7)' : 'rgba(255,215,0,0.3)'}`,
              background: 'rgba(0,0,0,0.45)',
              color: '#f1f5f9',
              fontSize: 17,
              fontFamily: "'SF Pro', system-ui, sans-serif",
              fontWeight: 600,
              textAlign: 'center',
              outline: 'none',
              direction: 'ltr',
              transition: 'border-color 0.25s, box-shadow 0.25s',
              boxShadow: shake
                ? '0 0 16px rgba(220,38,38,0.3)'
                : '0 0 20px rgba(255,215,0,0.08), inset 0 0 20px rgba(255,215,0,0.03)',
              animation: shake ? 'prizeShake 0.5s ease' : 'none',
              opacity: submitting ? 0.6 : 1,
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, width: '100%', zIndex: 1 }}>
          {/* Send Phone — Primary (Red/Gold) */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !hasPhone}
            style={{
              flex: 1.4,
              padding: '14px 20px',
              borderRadius: bevelRadius,
              border: hasPhone && !submitting ? '1.5px solid rgba(220,38,38,0.6)' : '1.5px solid rgba(255,255,255,0.08)',
              background:
                hasPhone && !submitting
                  ? 'linear-gradient(135deg, rgba(153,27,27,0.55) 0%, rgba(127,29,29,0.75) 50%, rgba(153,27,27,0.55) 100%)'
                  : 'rgba(255,255,255,0.04)',
              color: hasPhone && !submitting ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: 15,
              fontFamily: "'Tajawal', system-ui, sans-serif",
              fontWeight: 800,
              cursor: hasPhone && !submitting ? 'pointer' : 'default',
              transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
              direction: 'rtl',
              boxShadow:
                hasPhone && !submitting
                  ? '0 0 30px rgba(220,38,38,0.22), inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.4)'
                  : 'none',
              outline: 'none',
              textShadow: hasPhone && !submitting ? '0 0 16px rgba(220,38,38,0.7)' : 'none',
            }}
          >
            {submitting ? '...جاري الإرسال' : 'ابعث الرقم'}
          </button>

          {/* Dismiss — Secondary (Ghost) */}
          <button
            onClick={handleDismiss}
            disabled={submitting}
            style={{
              flex: 1,
              padding: '14px 16px',
              borderRadius: bevelRadius,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.03)',
              color: 'rgba(203,213,225,0.7)',
              fontSize: 13.5,
              fontFamily: "'Tajawal', system-ui, sans-serif",
              fontWeight: 600,
              cursor: submitting ? 'default' : 'pointer',
              transition: 'all 0.2s ease',
              direction: 'rtl',
              outline: 'none',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            بدّيش جوائز
          </button>
        </div>

        {/* Privacy hint */}
        <p
          style={{
            fontFamily: "'Tajawal', system-ui, sans-serif",
            fontSize: 10.5,
            color: 'rgba(100,116,139,0.6)',
            direction: 'rtl',
            textAlign: 'center',
            margin: 0,
            zIndex: 1,
          }}>
          رقمك بيوصلنا فقط — منستخدمه للتواصل بخصوص الجائزة
        </p>
      </div>

      <style>{`
        @keyframes prizeCardIn {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes prizeShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes trophyFloat {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-6px) rotate(2deg); }
        }
        input[type="tel"]::placeholder {
          color: rgba(148, 163, 184, 0.35);
          font-weight: 500;
          letter-spacing: 1px;
        }
      `}</style>
    </div>
  );
};

export default PrizeEntryCard;
