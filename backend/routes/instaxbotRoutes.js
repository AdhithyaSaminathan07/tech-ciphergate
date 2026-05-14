// backend/routes/instaxbotRoutes.js
const express   = require('express');
const router    = express.Router();
const WebSocket = require('ws');
const { receiveMessage, getMessages } = require('../controllers/instaxbotController');

router.post('/messages', receiveMessage);
router.get('/messages',  getMessages);

function attachInstaxbotWsProxy(httpServer) {
  const wss = new WebSocket.Server({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (!url.pathname.startsWith('/api/instaxbot/ws-proxy')) {
        return; // Pass to next upgrade handler (socket.io etc.)
      }

      const tenentId = url.searchParams.get('tenentId');
      if (!tenentId) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (clientWs) => {
        wss.emit('connection', clientWs, req, tenentId);
      });
    } catch (err) {
      console.error('[WsProxy] upgrade error:', err.message);
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs, _req, tenentId) => {
    const INSTAXBOT_WS = (process.env.INSTAXBOT_WS_URL || 'wss://tech.instaxbot.com')
      .replace(/\/$/, '');

    console.log(`[WsProxy] New client for tenentId=${tenentId}`);

    // Buffer messages sent before upstream is ready
    const pending = [];
    let upstreamReady = false;
    let closing = false;

    const upstream = new WebSocket(
      `${INSTAXBOT_WS}?tenentId=${encodeURIComponent(tenentId)}`,
      { handshakeTimeout: 10000 }
    );

    upstream.on('open', () => {
      console.log(`[WsProxy] Upstream open for tenentId=${tenentId}`);
      upstreamReady = true;
      // Flush buffered messages
      while (pending.length) {
        upstream.send(pending.shift());
      }
    });

    upstream.on('error', (err) => {
      console.error(`[WsProxy] Upstream error: ${err.message}`);
      if (!closing && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'error', message: 'Upstream error: ' + err.message }));
      }
    });

    // client → upstream
    clientWs.on('message', (data) => {
      if (closing) return;
      if (upstreamReady && upstream.readyState === WebSocket.OPEN) {
        upstream.send(data);
      } else {
        pending.push(data); // buffer until upstream ready
      }
    });

    // upstream → client
    upstream.on('message', (data) => {
      if (!closing && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data);
      }
    });

    // Cleanup on either side closing
    const cleanup = (reason) => {
      if (closing) return;
      closing = true;
      console.log(`[WsProxy] Cleanup for tenentId=${tenentId}: ${reason}`);
      try { upstream.terminate(); } catch (_) {}
      try { clientWs.terminate(); } catch (_) {}
    };

    clientWs.on('close', () => cleanup('client closed'));
    clientWs.on('error', (e) => cleanup(`client error: ${e.message}`));
    upstream.on('close', () => cleanup('upstream closed'));

    // Keep-alive ping every 25s
    const ping = setInterval(() => {
      if (closing) { clearInterval(ping); return; }
      if (clientWs.readyState === WebSocket.OPEN) clientWs.ping();
      if (upstream.readyState === WebSocket.OPEN) upstream.ping();
    }, 25000);

    clientWs.on('close', () => clearInterval(ping));
  });

  console.log('✅ Instaxbot WebSocket proxy attached');
}

module.exports = router;
module.exports.attachInstaxbotWsProxy = attachInstaxbotWsProxy;
