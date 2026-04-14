import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Top-level error boundary for the game.
 * Catches render errors from any child component and shows a recovery UI
 * instead of dropping the user to a blank screen.
 */
class GameErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Surface the error for debugging/monitoring
    console.error('[GameErrorBoundary]', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'linear-gradient(180deg, #0a0a0f 0%, #1a0a1a 100%)',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: "'Tajawal', system-ui, sans-serif",
          zIndex: 99999,
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: '100%',
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: 20,
            padding: '32px 24px',
            textAlign: 'center',
            boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: '#fbbf24',
              margin: '0 0 10px',
              direction: 'rtl',
            }}
          >
            حدث خطأ غير متوقع
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.65)',
              margin: '0 0 20px',
              direction: 'rtl',
              lineHeight: 1.6,
            }}
          >
            عذرًا، انهارت اللعبة بسبب خطأ برمجي. يمكنك إعادة التشغيل أو المحاولة مرة أخرى.
          </p>

          {this.state.error && (
            <pre
              style={{
                textAlign: 'left',
                direction: 'ltr',
                fontSize: 10,
                color: 'rgba(239,68,68,0.8)',
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8,
                padding: 10,
                overflow: 'auto',
                maxHeight: 120,
                marginBottom: 18,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error.name}: {this.state.error.message}
            </pre>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={this.handleReset}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              حاول مجددًا
            </button>
            <button
              onClick={this.handleReload}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: 12,
                border: '1px solid rgba(251,191,36,0.4)',
                background: 'rgba(251,191,36,0.12)',
                color: '#fbbf24',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              إعادة تحميل
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default GameErrorBoundary;
