import { useEffect, useState } from 'react';
import axios from 'axios';

const AdminCommunication = () => {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getToken = async () => {
      try {
        const res = await axios.post('https://tech.gowhats.in/api/auth/embed-login', {
          embedSecret: 'ciphergate_gowhats_2026'
        });
        if (res.data?.token) {
          localStorage.setItem('gowhats_admin_token', res.data.token);
          setToken(res.data.token);
        }
      } catch (err) {
        console.error('Embed login failed:', err);
      } finally {
        setLoading(false);
      }
    };
    getToken();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
        <p style={{ color: '#0d9488', fontSize: 14 }}>Connecting to GoWhats...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
        <p style={{ color: 'red' }}>Failed to connect to GoWhats.</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .gowhats-wrapper {
          position: fixed;
          top: 0;
          left: 256px;
          right: 0;
          bottom: 0;
          z-index: 50;
        }

        @media (max-width: 768px) {
          .gowhats-wrapper {
            left: 0;
            top: 0;
          }
        }
      `}</style>

      <div className="gowhats-wrapper">
        <iframe
          src={'https://tech.gowhats.in/dashboard?embed=true&role=admin&token=' + token}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          allow="fullscreen microphone"
          title="GoWhats Admin"
        />
      </div>
    </>
  );
};

export default AdminCommunication;
