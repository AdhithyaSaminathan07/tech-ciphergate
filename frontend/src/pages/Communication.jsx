import React, { useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const SSO_KEY = 'ciphergate_gowhats_secure_sso_key_2024';

const Communication = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('gowhats');

  const gowhatsUrl = useMemo(() => {
    if (!user?.username) return null;
    return `https://tech.gowhats.in/login?sso_username=${encodeURIComponent(user.username)}&sso_key=${SSO_KEY}&embed=true&role=staff`;
  }, [user?.username]);

  const instaxbotUrl = useMemo(() => {
    if (!user?.username) return null;
    return `https://tech.instaxbot.com/login?sso_username=${encodeURIComponent(user.username)}&sso_key=${SSO_KEY}&embed=true&role=staff`;
  }, [user?.username]);

  if (!gowhatsUrl || !instaxbotUrl) {
    return (
      <div style={{
        height: 'calc(100vh - 65px)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12, color: '#64748b',
      }}>
        <div style={{
          width: 40, height: 40, border: '3px solid #e2e8f0',
          borderTop: '3px solid #0d9488', borderRadius: '50%',
          animation: 'spin 0.9s linear infinite',
        }} />
        <p style={{ fontSize: 14 }}>Loading communication...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const tabs = [
    {
      key: 'gowhats',
      label: 'GoWhats',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      ),
    },
    {
      key: 'instaxbot',
      label: 'Instaxbot Messages',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
          <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/>
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
        </svg>
      ),
    },
  ];

  return (
    <div style={{ height: 'calc(100vh - 65px)', display: 'flex', flexDirection: 'column', background: '#fff' }}>

      {/* tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
        {tabs.map(tab => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '11px 22px', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 500,
                background: active ? '#fff' : 'transparent',
                color: active ? '#0d9488' : '#64748b',
                borderBottom: active ? '2px solid #0d9488' : '2px solid transparent',
                outline: 'none', transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              <span style={{ color: active ? '#0d9488' : '#94a3b8' }}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* panels */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'gowhats' ? 'flex' : 'none', flexDirection: 'column' }}>
        <iframe
          src={gowhatsUrl}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="GoWhats"
          allow="microphone; camera; clipboard-read; clipboard-write; notifications"
        />
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'instaxbot' ? 'flex' : 'none', flexDirection: 'column' }}>
        <iframe
          src={instaxbotUrl}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Instaxbot"
          allow="microphone; camera; clipboard-read; clipboard-write; notifications"
        />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Communication;
