import React, { useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const SSO_KEY = 'ciphergate_gowhats_secure_sso_key_2024';

const Communication = () => {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState('chat'); // 'chat' or 'comments'
  const [activeTab, setActiveTab] = useState('gowhats');

  const gowhatsUrl = useMemo(() => {
    if (!user?.username) return null;
    return `https://tech.gowhats.in/login?sso_username=${encodeURIComponent(user.username)}&sso_key=${SSO_KEY}&embed=true&role=staff`;
  }, [user?.username]);

  const instaxbotUrl = useMemo(() => {
    const ssoUser = user?.email || user?.username;
    if (!ssoUser) return null;

    // For local testing, change 3001 to the port your local Instaxbot is running on (e.g. 3001, 5173, etc.)
    const baseUrl = window.location.hostname === 'localhost'
      ? 'http://localhost:3001'
      : 'https://app.instaxbot.com';

    return `${baseUrl}/login?sso_username=${encodeURIComponent(ssoUser)}&sso_key=${SSO_KEY}&embed=true&role=staff`;
  }, [user?.email, user?.username]);

  const instaxbotCommentsUrl = useMemo(() => {
    const ssoUser = user?.email || user?.username;
    if (!ssoUser) return null;

    const baseUrl = window.location.hostname === 'localhost'
      ? 'http://localhost:3001'
      : 'https://app.instaxbot.com';

    return `${baseUrl}/login?sso_username=${encodeURIComponent(ssoUser)}&sso_key=${SSO_KEY}&embed=true&role=staff&redirect=comments`;
  }, [user?.email, user?.username]);

  const youtubeCommentsUrl = useMemo(() => {
    const ssoUser = user?.email || user?.username;
    if (!ssoUser) return null;

    const baseUrl = window.location.hostname === 'localhost'
      ? 'http://localhost:5173'
      : 'https://youtubeai-client.vercel.app';

    return `${baseUrl}/?sso_username=${encodeURIComponent(ssoUser)}&sso_key=${SSO_KEY}&embed=true&role=staff&redirect=comments`;
  }, [user?.email, user?.username]);

  if (!gowhatsUrl || !instaxbotUrl || !instaxbotCommentsUrl || !youtubeCommentsUrl) {
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

  const chatTabs = [
    {
      key: 'gowhats',
      label: 'GoWhats',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      ),
    },
    {
      key: 'instaxbot',
      label: 'Instaxbot Messages',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      ),
    },
  ];

  const commentsTabs = [
    {
      key: 'insta_comments',
      label: 'Insta Comments',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      ),
    },
    {
      key: 'youtube_comments',
      label: 'YouTube Comments',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
          <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" />
        </svg>
      ),
    },
  ];

  const tabs = viewMode === 'chat' ? chatTabs : commentsTabs;

  const handleModeChange = (newMode) => {
    setViewMode(newMode);
    if (newMode === 'chat') {
      setActiveTab('gowhats');
    } else {
      setActiveTab('insta_comments');
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 65px)', display: 'flex', flexDirection: 'column', background: '#fff' }}>

      {/* tab bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #e2e8f0',
        background: '#f8fafc',
        flexShrink: 0,
        paddingRight: '16px'
      }}>
        <div style={{ display: 'flex' }}>
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

        {/* View Mode Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: '#e2e8f0',
          borderRadius: '20px',
          padding: '2px',
          gap: '2px',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)'
        }}>
          <button
            onClick={() => handleModeChange('chat')}
            style={{
              padding: '6px 14px',
              borderRadius: '18px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              background: viewMode === 'chat' ? '#0d9488' : 'transparent',
              color: viewMode === 'chat' ? '#fff' : '#64748b',
              transition: 'all 0.2s ease',
              outline: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Chats
          </button>
          <button
            onClick={() => handleModeChange('comments')}
            style={{
              padding: '6px 14px',
              borderRadius: '18px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              background: viewMode === 'comments' ? '#0d9488' : 'transparent',
              color: viewMode === 'comments' ? '#fff' : '#64748b',
              transition: 'all 0.2s ease',
              outline: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            Comments
          </button>
        </div>
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

      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'insta_comments' ? 'flex' : 'none', flexDirection: 'column' }}>
        <iframe
          src={instaxbotCommentsUrl}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Instagram Comments"
          allow="microphone; camera; clipboard-read; clipboard-write; notifications"
        />
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'youtube_comments' ? 'flex' : 'none', flexDirection: 'column' }}>
        <iframe
          src={youtubeCommentsUrl}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="YouTube Comments"
          allow="microphone; camera; clipboard-read; clipboard-write; notifications"
        />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Communication;
