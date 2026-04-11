import React, { useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';

const Communication = () => {
  const { user } = useAuth();
  const SSO_KEY = 'ciphergate_gowhats_secure_sso_key_2024';

  const targetUrl = useMemo(() => {
    if (!user?.username) return null;
    return `https://tech.gowhats.in/login?sso_username=${encodeURIComponent(user.username)}&sso_key=${SSO_KEY}&embed=true&role=staff`;
  }, [user?.username]);

  if (!targetUrl) {
    return (
      <div style={{
        height: 'calc(100vh - 65px)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12, color: '#64748b'
      }}>
        <div style={{
          width: 40, height: 40,
          border: '3px solid #e2e8f0',
          borderTop: '3px solid #0d9488',
          borderRadius: '50%',
          animation: 'spin 0.9s linear infinite'
        }} />
        <p style={{ fontSize: 14 }}>Loading communication...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      height: 'calc(100vh - 65px)',
      width: '100%',
      overflow: 'hidden',
      backgroundColor: '#fff'
    }}>
      <iframe
        key="gowhats-communication-iframe"
        src={targetUrl}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="GoWhats Communication"
        allow="microphone; camera; clipboard-read; clipboard-write; notifications"
      />
    </div>
  );
};

export default Communication;
