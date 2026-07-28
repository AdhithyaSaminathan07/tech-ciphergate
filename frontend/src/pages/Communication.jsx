import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getActiveInstagramAccount } from '../services/instagramService';

const SSO_KEY = 'ciphergate_gowhats_secure_sso_key_2024';

const Communication = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('chat'); // 'chat' or 'comments'
  const [activeTab, setActiveTab] = useState('gowhats');
  
  // Centralized active Instagram account details
  const [activeInstagramAccount, setActiveInstagramAccount] = useState(null);
  const [loadingActiveAccount, setLoadingActiveAccount] = useState(true);
  
  // Keys to force iframe-only reloads
  const [messagesRefreshKey, setMessagesRefreshKey] = useState(0);
  const [commentsRefreshKey, setCommentsRefreshKey] = useState(0);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const fetchActiveAccount = async () => {
      try {
        const data = await getActiveInstagramAccount();
        setActiveInstagramAccount(data);
      } catch (err) {
        console.error('Failed to fetch active Instagram account', err);
      } finally {
        setLoadingActiveAccount(false);
      }
    };
    fetchActiveAccount();
  }, []);

  const storedSSOUser = useMemo(() => {
    try {
      const saved = localStorage.getItem('ciphergate_user_sso');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }, []);

  const effectiveUsername = user?.username || user?.email || user?.name || storedSSOUser?.username;
  const effectiveRole = user?.role || storedSSOUser?.role || 'staff';

  const gowhatsUrl = useMemo(() => {
    if (!effectiveUsername) return null;
    const roleParam = effectiveRole === 'admin' ? 'admin' : 'staff';
    return `https://tech.gowhats.in/login?sso_username=${encodeURIComponent(effectiveUsername)}&sso_key=${SSO_KEY}&embed=true&role=${roleParam}`;
  }, [effectiveUsername, effectiveRole]);

  const instaxbotUrl = useMemo(() => {
    const ssoUser = activeInstagramAccount?.username || effectiveUsername;
    if (!ssoUser) return null;

    const baseUrl = window.location.hostname === 'localhost'
      ? 'http://localhost:3001'
      : 'https://tech.instaxbot.com';

    const roleParam = effectiveRole === 'admin' ? 'admin' : 'staff';
    return `${baseUrl}/login?sso_username=${encodeURIComponent(ssoUser)}&sso_key=${SSO_KEY}&embed=true&role=${roleParam}`;
  }, [activeInstagramAccount?.username, effectiveUsername, effectiveRole]);

  const instaxbotCommentsUrl = useMemo(() => {
    const ssoUser = activeInstagramAccount?.username || effectiveUsername;
    if (!ssoUser) return null;

    const baseUrl = window.location.hostname === 'localhost'
      ? 'http://localhost:3001'
      : 'https://tech.instaxbot.com';

    const roleParam = effectiveRole === 'admin' ? 'admin' : 'staff';
    return `${baseUrl}/login?sso_username=${encodeURIComponent(ssoUser)}&sso_key=${SSO_KEY}&embed=true&role=${roleParam}&redirect=comments`;
  }, [activeInstagramAccount?.username, effectiveUsername, effectiveRole]);

  const youtubeCommentsUrl = useMemo(() => {
    const ssoUser = effectiveUsername;
    if (!ssoUser) return null;

    const roleParam = effectiveRole === 'admin' ? 'admin' : 'staff';
    return `https://channelbot.in/login?sso_username=${encodeURIComponent(ssoUser)}&sso_key=${SSO_KEY}&embed=true&hide_shell=true&role=${roleParam}&redirect=videos`;
  }, [effectiveUsername, effectiveRole]);

  if (loadingActiveAccount || !gowhatsUrl) {
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
      shortLabel: 'GoWhats',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      ),
    },
    {
      key: 'instaxbot',
      label: 'Instaxbot Messages',
      shortLabel: 'Instaxbot',
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
      shortLabel: 'Instagram',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      ),
    },
    {
      key: 'youtube_comments',
      label: 'YouTube Comments',
      shortLabel: 'YouTube',
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

  const handleRefresh = () => {
    if (activeTab === 'instaxbot') {
      setMessagesRefreshKey(prev => prev + 1);
    } else if (activeTab === 'insta_comments') {
      setCommentsRefreshKey(prev => prev + 1);
    }
  };

  const showRefreshButton = activeTab === 'instaxbot' || activeTab === 'insta_comments';
  const refreshButtonLabel = activeTab === 'instaxbot' ? 'Refresh Messages' : 'Refresh Comments';

  const renderPlaceholder = () => {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        background: '#f8fafc',
        textAlign: 'center',
      }}>
        <div style={{
          width: 80,
          height: 80,
          background: '#fdf2f8',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#db2777',
          marginBottom: 20,
          boxShadow: '0 4px 6px -1px rgba(219, 39, 119, 0.1), 0 2px 4px -1px rgba(219, 39, 119, 0.06)'
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
        </div>

        {isAdmin ? (
          <div style={{ maxWidth: 460 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
              Instagram Connection Required
            </h3>
            <p style={{ fontSize: 14, color: '#64748b', lineHeight: '20px', marginBottom: 24 }}>
              To view comments and messages directly, you need to connect and activate an Instagram account in the system settings.
            </p>
            <button
              onClick={() => navigate('/admin/instagram')}
              style={{
                background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                color: '#fff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(236, 72, 153, 0.3)',
                transition: 'transform 0.2s',
              }}
              onMouseOver={e => e.currentTarget.style.transform = 'scale(1.03)'}
              onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              Configure Instaxbot
            </button>
          </div>
        ) : (
          <div style={{ maxWidth: 460 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
              Instagram Integration Unavailable
            </h3>
            <p style={{ fontSize: 14, color: '#64748b', lineHeight: '20px' }}>
              No active Instagram account has been configured by the administrator. Please ask your administrator to connect an Instagram account in the Admin Panel.
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ height: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '8px', overflow: 'hidden' }}>

      {/* Ultra Compact Single-Row Header */}
      <div className="comm-header-uk">
        {/* Mode Switcher (Segmented Control) */}
        <div className="comm-mode-switcher">
            <button
              onClick={() => handleModeChange('chat')}
              className={`comm-mode-btn ${viewMode === 'chat' ? 'active' : ''}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Chats
            </button>
            <button
              onClick={() => handleModeChange('comments')}
              className={`comm-mode-btn ${viewMode === 'comments' ? 'active' : ''}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              Comments
            </button>
        </div>

        {/* Sub-tabs & Actions */}
        <div className="comm-sub-header">
          <div className="comm-tabs-pills">
            {tabs.map(tab => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`comm-pill-btn ${active ? 'active' : ''}`}
                >
                  <span className="comm-pill-icon">{tab.icon}</span>
                  <span className="comm-label-full">{tab.label}</span>
                  <span className="comm-label-short">{tab.shortLabel || tab.label}</span>
                </button>
              );
            })}
          </div>
          
          {showRefreshButton && activeInstagramAccount && (
             <button onClick={handleRefresh} className="comm-refresh-btn" title={refreshButtonLabel}>
               <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 4s linear infinite paused' }}>
                 <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
               </svg>
               <span className="comm-refresh-text">{refreshButtonLabel}</span>
             </button>
          )}
        </div>
      </div>

      {/* panels */}
      <div style={{ flex: 1, height: '100%', minHeight: 0, overflow: 'hidden', display: activeTab === 'gowhats' ? 'flex' : 'none', flexDirection: 'column' }}>
        <iframe
          src={gowhatsUrl}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="GoWhats"
          allow="microphone; camera; clipboard-read; clipboard-write; notifications"
        />
      </div>

      <div style={{ flex: 1, height: '100%', minHeight: 0, overflow: 'hidden', display: activeTab === 'instaxbot' ? 'flex' : 'none', flexDirection: 'column' }}>
        {activeInstagramAccount ? (
          <iframe
            key={`instaxbot-messages-${messagesRefreshKey}`}
            src={instaxbotUrl}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            title="Instaxbot"
            allow="microphone; camera; clipboard-read; clipboard-write; notifications"
          />
        ) : (
          renderPlaceholder()
        )}
      </div>

      <div style={{ flex: 1, height: '100%', minHeight: 0, overflow: 'hidden', display: activeTab === 'insta_comments' ? 'flex' : 'none', flexDirection: 'column' }}>
        {activeInstagramAccount ? (
          <iframe
            key={`instaxbot-comments-${commentsRefreshKey}`}
            src={instaxbotCommentsUrl}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            title="Instagram Comments"
            allow="microphone; camera; clipboard-read; clipboard-write; notifications"
          />
        ) : (
          renderPlaceholder()
        )}
      </div>

      <div style={{ flex: 1, height: '100%', minHeight: 0, overflow: 'hidden', display: activeTab === 'youtube_comments' ? 'flex' : 'none', flexDirection: 'column' }}>
        <iframe
          src={youtubeCommentsUrl}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="YouTube Comments"
          allow="microphone; camera; clipboard-read; clipboard-write; notifications"
        />
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .comm-header-uk {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          padding: 4px 8px;
          gap: 6px;
          flex-shrink: 0;
          height: 36px;
          box-sizing: border-box;
        }

        /* Segmented Control - Sleek Pill */
        .comm-mode-switcher {
          display: flex;
          align-items: center;
          background: #f1f5f9;
          border-radius: 9999px;
          padding: 2px;
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.03);
          flex-shrink: 0;
          height: 28px;
          box-sizing: border-box;
        }
        .comm-mode-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 2px 8px;
          height: 24px;
          border-radius: 9999px;
          border: none;
          background: transparent;
          color: #64748b;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          outline: none;
          transition: all 0.15s ease;
          white-space: nowrap;
          box-sizing: border-box;
        }
        .comm-mode-btn:hover {
          color: #334155;
        }
        .comm-mode-btn.active {
          background: #ffffff;
          color: #0d9488;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }

        /* Sub-Header */
        .comm-sub-header {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          flex: 1;
          min-width: 0;
          height: 28px;
        }

        /* Tabs as Sleek Cards */
        .comm-tabs-pills {
          display: flex;
          align-items: center;
          gap: 4px;
          flex: 1;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
          height: 28px;
        }
        .comm-tabs-pills::-webkit-scrollbar { display: none; }
        
        .comm-pill-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 2px 8px;
          height: 26px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #64748b;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          outline: none;
          transition: all 0.15s ease;
          box-shadow: 0 1px 2px rgba(0,0,0,0.02);
          white-space: nowrap;
          flex-shrink: 0;
          box-sizing: border-box;
        }
        .comm-pill-btn:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }
        .comm-pill-btn.active {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border-color: transparent;
          color: #ffffff;
          box-shadow: 0 2px 6px -1px rgba(16, 185, 129, 0.3);
        }
        .comm-pill-btn.active .comm-pill-icon {
          color: #ffffff;
        }
        .comm-pill-icon {
          display: flex;
          color: inherit;
        }
        .comm-pill-icon svg {
          width: 12px;
          height: 12px;
        }

        .comm-label-full {
          display: inline;
        }
        .comm-label-short {
          display: none;
        }

        /* Refresh Button - Modern Icon/Compact */
        .comm-refresh-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 2px 8px;
          height: 26px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #475569;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          outline: none;
          transition: all 0.15s ease;
          white-space: nowrap;
          flex-shrink: 0;
          box-sizing: border-box;
        }
        .comm-refresh-btn:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        /* Mobile specific adjustments */
        @media (max-width: 650px) {
          .comm-label-full {
            display: none;
          }
          .comm-label-short {
            display: inline;
          }
          .comm-header-uk {
            padding: 3px 6px;
            gap: 4px;
            height: 34px;
          }
          .comm-mode-switcher {
            height: 26px;
            padding: 1px;
          }
          .comm-mode-btn {
            height: 22px;
            padding: 2px 6px;
            font-size: 10.5px;
          }
          .comm-sub-header {
            height: 26px;
            gap: 4px;
          }
          .comm-tabs-pills {
            height: 26px;
            gap: 3px;
          }
          .comm-pill-btn {
            height: 24px;
            padding: 2px 6px;
            font-size: 10.5px;
            border-radius: 5px;
          }
          .comm-pill-icon svg {
            width: 11px;
            height: 11px;
          }
          .comm-refresh-btn {
            height: 24px;
            width: 24px;
            padding: 0;
            border-radius: 5px;
          }
          .comm-refresh-text {
            display: none;
          }
        }
      `}</style>
    </div>
  );
};

export default Communication;


