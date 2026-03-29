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

    // Check admin role
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
      background: '#0f172a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <form onSubmit={handleLogin} style={{
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '40px 32px',
        width: 'min(380px, 90vw)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        <h2 style={{
          fontFamily: "'SF Pro Display', system-ui, sans-serif",
          fontSize: 22,
          fontWeight: 700,
          color: '#f1f5f9',
          textAlign: 'center',
          marginBottom: 8,
        }}>
          🔐 Admin Panel
        </h2>

        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(220,38,38,0.15)',
            border: '1px solid rgba(220,38,38,0.3)',
            color: '#fca5a5',
            fontSize: 13,
            textAlign: 'center',
          }}>{error}</div>
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{
            padding: '12px 16px', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(0,0,0,0.3)', color: '#f1f5f9',
            fontSize: 15, outline: 'none',
          }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{
            padding: '12px 16px', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(0,0,0,0.3)', color: '#f1f5f9',
            fontSize: 15, outline: 'none',
          }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '14px',
            borderRadius: 12,
            border: 'none',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
};

export default AdminLogin;
