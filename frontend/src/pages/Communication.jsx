import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';

// ── helpers ──────────────────────────────────────────────────────────────────

const API_BASE = (import.meta.env?.VITE_API_URL || process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

function fmtTime(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const lastWeek = new Date(today); lastWeek.setDate(today.getDate() - 7);
  if (d > lastWeek) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  return d.toLocaleDateString();
}

function fmtChatTime(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDateLabel(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

const TEAM_COLORS = {
  GoWhats: '#16a34a',
  'Website Development': '#000000',
  Instaxbot: '#f43f5e',
  Billzzy: '#3b82f6',
  Ciphergate: '#a16207',
  Branding: '#ea580c',
  'F3-Engine': '#dc2626',
  'F3 Engine': '#dc2626',
};
const teamColor = (t) => TEAM_COLORS[t] || '#6b7280';

const DEFAULT_PIC = 'https://cdn-icons-png.flaticon.com/512/6596/6596121.png';

// ── helper: resolve tenentId from all possible storage locations ──────────────
function resolveTenentId(user) {
  // Try every key variant that might have been stored at login
  const candidates = [
    localStorage.getItem('tenentId'),
    localStorage.getItem('tenentid'),
    localStorage.getItem('tenantId'),
    localStorage.getItem('tenantid'),
    localStorage.getItem('TenentId'),
    // Also check if it's nested inside a stored user/auth JSON
    (() => {
      try {
        const raw = localStorage.getItem('user') || localStorage.getItem('authUser') || localStorage.getItem('userData');
        if (raw) {
          const parsed = JSON.parse(raw);
          return parsed?.tenentId || parsed?.tenentid || parsed?.tenantId || parsed?.tenantid;
        }
      } catch (_) {}
      return null;
    })(),
    // Check user object from auth context
    user?.tenentId,
    user?.tenentid,
    user?.tenantId,
    user?.tenantid,
  ];

  for (const val of candidates) {
    if (val && typeof val === 'string' && val.trim()) {
      console.log('[Communication] Resolved tenentId:', val);
      return val.trim();
    }
  }

  // Last resort: dump all localStorage keys to help debug
  console.warn('[Communication] Could not resolve tenentId. All localStorage keys:', Object.keys(localStorage));
  console.warn('[Communication] localStorage values:', Object.fromEntries(
    Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])
  ));
  return null;
}

// ── InstaxBot native chat panel ───────────────────────────────────────────────

function InstaxbotPanel({ tenentId }) {
  const [contacts, setContacts]         = useState([]);
  const [selected, setSelected]         = useState(null);
  const [messages, setMessages]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [msgLoading, setMsgLoading]     = useState(false);
  const [search, setSearch]             = useState('');
  const [filter, setFilter]             = useState('all');
  const [page, setPage]                 = useState(1);
  const [hasMore, setHasMore]           = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);

  const bottomRef  = useRef(null);
  const wsRef      = useRef(null);
  const processed  = useRef(new Set());

  // ── WebSocket to Instaxbot backend via proxy ──────────────────────────────
  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = API_BASE
      .replace(/^https/, 'wss')
      .replace(/^http/, 'ws')
      + `/instaxbot/ws-proxy?tenentId=${tenentId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'get_contacts', tenentId, page: 1, limit: 10, filter }));
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        handleWsMsg(data);
      } catch (_) {}
    };

    ws.onclose = () => {
      setTimeout(connectWS, 3000);
    };
  }, [tenentId, filter]);

  const handleWsMsg = useCallback((data) => {
    switch (data.type) {
      case 'contact_list':
        setContacts(prev => {
          const map = new Map(prev.map(c => [c.senderId, c]));
          (data.contacts || []).forEach(c => map.set(c.senderId, c));
          const sorted = [...map.values()].sort((a, b) => {
            const at = a.lastMessage?.Timestamp || a.createdAt;
            const bt = b.lastMessage?.Timestamp || b.createdAt;
            return new Date(bt) - new Date(at);
          });
          setHasMore(data.hasMore !== false && (data.contacts||[]).length === 10);
          setLoadingMore(false);
          return sorted;
        });
        setLoading(false);
        break;

      case 'history':
        setMessages([...(data.messages || [])].reverse());
        setMsgLoading(false);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
        break;

      case 'new_message': {
        const msg = data.message;
        const key = `${msg.senderId}_${msg.Timestamp}`;
        if (processed.current.has(key)) break;
        processed.current.add(key);
        setContacts(prev => prev.map(c =>
          (c.senderId === msg.senderId || c.senderId === msg.recipientId)
            ? { ...c, lastMessage: { message: msg.message, response: msg.response||'', Timestamp: msg.Timestamp, messageType: msg.messageType } }
            : c
        ).sort((a,b) => new Date(b.lastMessage?.Timestamp||b.createdAt) - new Date(a.lastMessage?.Timestamp||a.createdAt)));

        setSelected(sel => {
          if (sel?.senderId === msg.senderId) {
            setMessages(prev => {
              if (prev.some(m => `${m.senderId}_${m.Timestamp}` === key)) return prev;
              setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
              return [...prev, msg];
            });
          }
          return sel;
        });
        break;
      }

      case 'search_results':
        setContacts(data.contacts || []);
        setLoading(false);
        break;

      default: break;
    }
  }, []);

  useEffect(() => {
    if (!tenentId) return;
    connectWS();
    return () => { wsRef.current?.close(); };
  }, [tenentId, connectWS]);

  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setLoading(true);
    setContacts([]);
    setPage(1);
    wsRef.current.send(JSON.stringify({ type: 'get_contacts', tenentId, page: 1, limit: 10, filter }));
  }, [filter, tenentId]);

  const selectContact = (contact) => {
    setSelected(contact);
    setMessages([]);
    setMsgLoading(true);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'init', senderId: contact.senderId, tenentId }));
    }
  };

  const loadMore = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setLoadingMore(true);
    const next = page + 1;
    setPage(next);
    wsRef.current.send(JSON.stringify({ type: 'get_contacts', tenentId, page: next, limit: 10, filter }));
  };

  const doSearch = (q) => {
    setSearch(q);
    if (!q.trim()) {
      wsRef.current?.send(JSON.stringify({ type: 'get_contacts', tenentId, page: 1, limit: 10, filter }));
      return;
    }
    setTimeout(() => {
      wsRef.current?.send(JSON.stringify({ type: 'search_contacts', tenentId, query: q.trim(), filter }));
    }, 300);
  };

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.name||'').toLowerCase().includes(q)
      || (c.username||'').toLowerCase().includes(q)
      || (c.assignedTo||'').toLowerCase().includes(q)
      || (c.assignedTeam||'').toLowerCase().includes(q);
  });

  const showDate = (msgs, idx) => {
    if (idx === 0) return true;
    return new Date(msgs[idx].Timestamp).toDateString() !== new Date(msgs[idx-1].Timestamp).toDateString();
  };

  const ContactCard = ({ contact }) => {
    const assigned = !!(contact.assignedTo?.trim());
    const color    = teamColor(contact.assignedTeam);
    const bg       = assigned ? `${color}0d` : undefined;
    const isSelected = selected?.senderId === contact.senderId;
    const displayName = contact.name === 'Nil' ? contact.username : (contact.name || contact.username);

    return (
      <div
        onClick={() => selectContact(contact)}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
          marginBottom: 4, position: 'relative',
          backgroundColor: isSelected ? '#fff1e3' : (bg || 'transparent'),
          borderLeft: `4px solid ${assigned ? color : 'transparent'}`,
          outline: isSelected ? '2px solid #f2d4b7' : 'none',
          transition: 'background 0.15s',
        }}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img
            src={contact.profile_pic || DEFAULT_PIC}
            alt={displayName}
            onError={e => { e.currentTarget.src = DEFAULT_PIC; }}
            style={{
              width: 44, height: 44, borderRadius: '50%', objectFit: 'cover',
              border: `3px solid ${assigned ? color : 'transparent'}`,
            }}
          />
          <div style={{
            position: 'absolute', top: -2, right: -2,
            width: 18, height: 18, borderRadius: '50%',
            background: assigned ? color : '#d1d5db',
            border: '2px solid white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="white">
              {assigned
                ? <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                : <path d="M12 9v2m0 4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z"/>}
            </svg>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </span>
              {assigned && contact.assignedTeam && (
                <span style={{
                  background: color, color: '#fff', fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', borderRadius: 9999, flexShrink: 0,
                }}>
                  {contact.assignedTeam.charAt(0)}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0, marginLeft: 4 }}>
              {fmtTime(contact.lastMessage?.Timestamp || contact.createdAt)}
            </span>
          </div>

          <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
            {contact.lastMessage ? (
              {
                audio: '🎤 Voice message',
                image: '🖼 Image',
                video: '📹 Video',
                template: '📋 Template',
                carousel: '🛒 Product carousel',
                ig_reel: '🎬 IG Reel',
              }[contact.lastMessage.messageType] || contact.lastMessage.response || contact.lastMessage.message || 'No message'
            ) : 'No messages yet'}
          </div>

          {assigned ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
              <span style={{ fontSize: 11, color, fontWeight: 500 }}>{contact.assignedTo}</span>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>Unassigned</div>
          )}
        </div>
      </div>
    );
  };

  const Bubble = ({ msg }) => {
    const isIncoming = msg.senderId === selected?.senderId;
    const color = selected?.assignedTeam ? teamColor(selected.assignedTeam) : '#e56a0b';

    return (
      <>
        {msg.message && (
          <div style={{ display: 'flex', justifyContent: isIncoming ? 'flex-start' : 'flex-end', marginBottom: 6 }}>
            <div style={{
              maxWidth: 340, padding: '10px 14px', borderRadius: 18,
              background: isIncoming ? '#fff' : color,
              color: isIncoming ? '#111' : '#fff',
              border: isIncoming ? '1px solid #ebe4d8' : 'none',
              fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word',
            }}>
              {msg.message}
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, textAlign: 'right' }}>
                {fmtChatTime(msg.Timestamp)}
              </div>
            </div>
          </div>
        )}
        {msg.response && typeof msg.response === 'string' && msg.response !== 'Audio message' && msg.response !== 'Carousel Message' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <div style={{
              maxWidth: 340, padding: '10px 14px', borderRadius: 18,
              background: color, color: '#fff',
              fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word',
            }}>
              {msg.response}
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, textAlign: 'right' }}>
                {fmtChatTime(msg.Timestamp)}
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>

      {/* ── left: contact list ── */}
      <div style={{
        width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid #ebe4d8', background: '#fcfbf8', overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 12px 8px' }}>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              value={search}
              onChange={e => doSearch(e.target.value)}
              placeholder="Search contacts, teams..."
              style={{
                width: '100%', padding: '8px 10px 8px 32px', border: '1px solid #e2e8f0',
                borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {['all','unassigned'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  flex: 1, padding: '6px 0', border: `1px solid ${filter===f?'#e56a0b':'#e2e8f0'}`,
                  borderRadius: 7, background: filter===f ? '#e56a0b' : '#fff',
                  color: filter===f ? '#fff' : '#374151', fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {f === 'all' ? 'All Chats' : 'Unassigned'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8, color: '#6b7280', fontSize: 13 }}>
              <div style={{ width: 18, height: 18, border: '2px solid #e2e8f0', borderTop: '2px solid #e56a0b', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Loading contacts...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: 24, fontSize: 13 }}>
              No contacts found
            </div>
          ) : (
            <>
              {filtered.map(c => <ContactCard key={c._id || c.senderId} contact={c} />)}
              {hasMore && !search && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{
                    width: '100%', padding: '8px 0', marginTop: 4,
                    background: '#fff', border: '1px solid #e56a0b',
                    color: '#e56a0b', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── right: chat area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selected ? (
          <>
            <div style={{
              padding: '10px 16px', borderBottom: '1px solid #ebe4d8',
              background: '#fffdf9', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            }}>
              <div style={{ position: 'relative' }}>
                {selected.profile_pic ? (
                  <img src={selected.profile_pic} alt="" onError={e=>e.currentTarget.src=DEFAULT_PIC}
                    style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover',
                      border: `2px solid ${teamColor(selected.assignedTeam)}` }} />
                ) : (
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', background: teamColor(selected.assignedTeam),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 500, fontSize: 15,
                  }}>
                    {(selected.name === 'Nil' ? selected.username : selected.name).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 500, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {selected.name === 'Nil' ? selected.username : selected.name}
                  {selected.assignedTeam && (
                    <span style={{
                      background: teamColor(selected.assignedTeam), color: '#fff',
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
                    }}>
                      {selected.assignedTeam}
                    </span>
                  )}
                </div>
                {selected.assignedTo
                  ? <div style={{ fontSize: 12, color: teamColor(selected.assignedTeam) }}>Assigned to: {selected.assignedTo}</div>
                  : <div style={{ fontSize: 12, color: '#9ca3af' }}>Unassigned contact</div>}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', background: '#f8f6f0', padding: 16 }}>
              {msgLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24, color: '#6b7280', fontSize: 13 }}>
                  Loading messages...
                </div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: 24, fontSize: 13 }}>No messages yet</div>
              ) : (
                messages.map((msg, i) => (
                  <div key={msg._id || i}>
                    {showDate(messages, i) && (
                      <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
                        <span style={{ background: '#e5e7eb', borderRadius: 9999, padding: '3px 12px', fontSize: 12, color: '#6b7280' }}>
                          {fmtDateLabel(msg.Timestamp)}
                        </span>
                      </div>
                    )}
                    <Bubble msg={msg} />
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>
          </>
        ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#f8f6f0', color: '#9ca3af', textAlign: 'center', padding: 24,
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" style={{ marginBottom: 12 }}>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Select a contact to start chatting</div>
            <div style={{ fontSize: 13 }}>Choose from your contacts on the left</div>
            <div style={{ marginTop: 12 }}>
              <span style={{ background: '#fff1e3', color: '#c95508', fontSize: 12, padding: '4px 12px', borderRadius: 9999 }}>
                {filter === 'all' ? 'Showing All Chats' : 'Showing Unassigned Chats Only'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── main Communication component ──────────────────────────────────────────────

const SSO_KEY = 'ciphergate_gowhats_secure_sso_key_2024';

const Communication = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('gowhats');

  // Resolve tenentId from all possible storage locations
  const tenentId = useMemo(() => resolveTenentId(user), [user]);

  const gowhatsUrl = useMemo(() => {
    if (!user?.username) return null;
    return `https://tech.gowhats.in/login?sso_username=${encodeURIComponent(user.username)}&sso_key=${SSO_KEY}&embed=true&role=staff`;
  }, [user?.username]);

  if (!gowhatsUrl) {
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
        {tenentId
          ? <InstaxbotPanel tenentId={tenentId} />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: 14, gap: 8 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
              </svg>
              <span>Tenant ID not found in session.</span>
              <span style={{ fontSize: 12, color: '#cbd5e1' }}>Open browser console for debug info, then log out and log back in.</span>
            </div>
          )
        }
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Communication;
