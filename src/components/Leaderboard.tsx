import React, { useRef, useEffect, useState } from 'react';
import type { LeaderboardEntry } from '@/game/config';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentPlayerName?: string;
  currentScore?: number;
  currentRank?: number | null;
  loading?: boolean;
  compact?: boolean;
}

const MEDALS = ['🥇', '🥈', '🥉'];

const Leaderboard: React.FC<LeaderboardProps> = ({
  entries,
  currentPlayerName,
  currentScore,
  currentRank,
  loading,
  compact,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);

  // Auto-scroll animation: scroll down then back up to hint there's more
  useEffect(() => {
    const el = listRef.current;
    if (!el || entries.length <= 3) return;

    const hasOverflow = el.scrollHeight > el.clientHeight;
    setShowFade(hasOverflow);
    if (!hasOverflow) return;

    let timeout: ReturnType<typeof setTimeout>;
    const animate = () => {
      timeout = setTimeout(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        setTimeout(() => {
          el.scrollTo({ top: 0, behavior: 'smooth' });
        }, 1500);
      }, 2000);
    };
    animate();
    const interval = setInterval(animate, 8000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [entries.length]);

  // Check overflow on resize
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const check = () => setShowFade(el.scrollHeight > el.clientHeight);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [entries]);

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderRadius: compact ? 14 : 20,
      border: '1px solid rgba(255,255,255,0.08)',
      padding: compact ? '16px 14px' : '24px 20px',
      width: compact ? '100%' : 'min(360px, 90vw)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    }}>
      <h3 style={{
        fontFamily: "'Tajawal', system-ui, sans-serif",
        fontSize: compact ? 14 : 16,
        fontWeight: 700,
        color: 'rgba(250,204,21,0.9)',
        textAlign: 'center',
        marginBottom: compact ? 10 : 16,
        letterSpacing: 1,
        direction: 'rtl',
      }}>
        أقوى ناس 🏆
      </h3>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: 20 }}>
          جاري التحميل...
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: 20, direction: 'rtl' }}>
          لا توجد نتائج بعد — كن الأول!
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div
            ref={listRef}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: compact ? 4 : 6,
              maxHeight: 'calc(35vh)',
              overflowY: 'auto',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(250,204,21,0.3) transparent',
              direction: 'rtl',
            }}
          >
            {entries.map((entry, i) => {
              const isCurrentPlayer = currentPlayerName && entry.playerName === currentPlayerName && entry.score === currentScore;
              return (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: compact ? '6px 10px' : '8px 12px',
                    borderRadius: 10,
                    background: isCurrentPlayer
                      ? 'rgba(250,204,21,0.1)'
                      : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                    border: isCurrentPlayer ? '1px solid rgba(250,204,21,0.25)' : '1px solid transparent',
                    transition: 'background 0.2s',
                    direction: 'ltr',
                  }}
                >
                  {/* Score on the left */}
                  <span style={{
                    fontFamily: "'SF Pro Mono', 'Menlo', monospace",
                    fontSize: compact ? 11 : 13,
                    fontWeight: 700,
                    color: i < 3 ? 'rgba(250,204,21,0.9)' : 'rgba(148,163,184,0.8)',
                    flexShrink: 0,
                    minWidth: 40,
                  }}>
                    {entry.score.toLocaleString()}
                  </span>

                  {/* Wave badge */}
                  <span style={{
                    fontFamily: "system-ui, sans-serif",
                    fontSize: compact ? 10 : 11,
                    color: 'rgba(148,163,184,0.5)',
                    flexShrink: 0,
                  }}>
                    W{entry.wavesReached}
                  </span>

                  {/* Name - fills remaining space, right-aligned */}
                  <span style={{
                    flex: 1,
                    fontFamily: "'Tajawal', 'SF Pro', system-ui, sans-serif",
                    fontSize: compact ? 12 : 14,
                    fontWeight: isCurrentPlayer ? 700 : 500,
                    color: isCurrentPlayer ? 'rgba(250,204,21,0.95)' : 'rgba(226,232,240,0.85)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textAlign: 'right',
                  }}>
                    {entry.playerName}
                  </span>

                  {/* Medal/rank on the right */}
                  <span style={{
                    fontSize: compact ? 14 : 18,
                    width: 28,
                    textAlign: 'center',
                    flexShrink: 0,
                  }}>
                    {i < 3 ? MEDALS[i] : <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: 600 }}>{i + 1}</span>}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Fade gradient at bottom to hint scrollable content */}
          {showFade && (
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 32,
              background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
              pointerEvents: 'none',
              borderRadius: '0 0 10px 10px',
            }} />
          )}
        </div>
      )}

      {/* Current player rank if not in top 10 */}
      {currentRank && currentRank > 10 && currentPlayerName && (
        <div style={{
          marginTop: 12,
          padding: '8px 12px',
          borderRadius: 10,
          background: 'rgba(100,116,139,0.1)',
          border: '1px solid rgba(100,116,139,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          direction: 'rtl',
        }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', width: 28, textAlign: 'center' }}>
            #{currentRank}
          </span>
          <span style={{ flex: 1, fontSize: 13, color: 'rgba(226,232,240,0.7)', fontWeight: 600, textAlign: 'right' }}>
            {currentPlayerName}
          </span>
          <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.6)', fontWeight: 700 }}>
            {currentScore?.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
