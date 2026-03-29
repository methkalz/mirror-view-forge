import React from 'react';
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
      }}>
        🏆 TOP 10 SURVIVORS
      </h3>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: 20 }}>
          Loading...
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: 20 }}>
          No scores yet — be the first!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
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
                }}
              >
                <span style={{
                  fontSize: compact ? 14 : 18,
                  width: 28,
                  textAlign: 'center',
                  flexShrink: 0,
                }}>
                  {i < 3 ? MEDALS[i] : <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: 600 }}>{i + 1}</span>}
                </span>

                <span style={{
                  flex: 1,
                  fontFamily: "'SF Pro', system-ui, sans-serif",
                  fontSize: compact ? 12 : 14,
                  fontWeight: isCurrentPlayer ? 700 : 500,
                  color: isCurrentPlayer ? 'rgba(250,204,21,0.95)' : 'rgba(226,232,240,0.85)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {entry.playerName}
                </span>

                <span style={{
                  fontFamily: "'SF Pro Mono', 'Menlo', monospace",
                  fontSize: compact ? 11 : 13,
                  fontWeight: 700,
                  color: i < 3 ? 'rgba(250,204,21,0.9)' : 'rgba(148,163,184,0.8)',
                  flexShrink: 0,
                }}>
                  {entry.score.toLocaleString()}
                </span>

                <span style={{
                  fontFamily: "system-ui, sans-serif",
                  fontSize: compact ? 10 : 11,
                  color: 'rgba(148,163,184,0.5)',
                  flexShrink: 0,
                  width: compact ? 30 : 40,
                  textAlign: 'right',
                }}>
                  W{entry.wavesReached}
                </span>
              </div>
            );
          })}
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
        }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', width: 28, textAlign: 'center' }}>
            #{currentRank}
          </span>
          <span style={{ flex: 1, fontSize: 13, color: 'rgba(226,232,240,0.7)', fontWeight: 600 }}>
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
