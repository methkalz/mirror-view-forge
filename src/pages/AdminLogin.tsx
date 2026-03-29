import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !data.user) {
      setError(authError?.message || 'Login failed');
      setLoading(false);
      return;
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', data.user.id)
      .eq('role', 'admin');

    if (!roles || roles.length === 0) {
      setError('Access denied — admin role required');
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    navigate('/admin');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0f1a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <form onSubmit={handleLogin} style={{
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.06)',
        padding: '44px 36px',
        width: 'min(420px, 90vw)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>☄️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', letterSpacing: 0.5 }}>Skyfall Admin</div>
          <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)', letterSpacing: 3, marginTop: 4 }}>CONTROL PANEL</div>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 12,
            background: 'rgba(220,38,38,0.08)',
            border: '1px solid rgba(220,38,38,0.15)',
            color: '#f87171',
            fontSize: 12,
            textAlign: 'center',
          }}>{error}</div>
        )}

        <div>
          <label style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', marginBottom: 6, display: 'block', fontWeight: 500 }}>Email</label>
          <input
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '12px 16px', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(0,0,0,0.25)', color: '#f1f5f9',
              fontSize: 14, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', marginBottom: 6, display: 'block', fontWeight: 500 }}>Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '12px 16px', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(0,0,0,0.25)', color: '#f1f5f9',
              fontSize: 14, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '14px',
            borderRadius: 14,
            border: '1px solid rgba(59,130,246,0.2)',
            background: 'rgba(59,130,246,0.12)',
            color: '#60a5fa',
            fontSize: 14,
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.6 : 1,
            marginTop: 4,
            letterSpacing: 0.5,
          }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
};

export default AdminLogin;
