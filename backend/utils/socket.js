const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');

let io;

const init = (server) => {
    io = socketIO(server, {
        cors: {
            origin: (origin, callback) => {
                const allowedOrigins = [
                    'http://localhost:3000',
                    'http://localhost:5173',
                    'https://tvtasks.netlify.app',
                    'https://ciphergate.techvaseegrah.com',
                ];
                const subdomainRegex = /^(https?:\/\/)?([\w-]+\.)+(localhost:3000|netlify\.app|techvaseegrah\.com)$/;
                
                if (!origin || allowedOrigins.includes(origin) || subdomainRegex.test(origin)) {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
            credentials: true
        },
        // Allow fallback to polling if websocket fails initially
        transports: ['websocket', 'polling'],
        path: '/socket.io/',
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    // Authentication Middleware for Socket.IO (Non-blocking)
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;

        if (!token) {
            console.warn(`[Socket] Connection from ${socket.id} without token - unauthenticated`);
            return next(); // Proceed without user info
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded; 
            next();
        } catch (err) {
            console.warn(`[Socket] Auth failed for ${socket.id}: ${err.message}`);
            next(); // Proceed without user info
        }
    });

    io.on('connection', (socket) => {
        const transport = socket.conn.transport.name;
        const userId = socket.user?.id || 'Unknown';
        console.log(`[Socket] Client connected: ${socket.id} (User: ${userId}, Transport: ${transport})`);

        socket.on('join-subdomain', (subdomain) => {
            if (subdomain) {
                socket.join(subdomain);
                console.log(`[Socket] ${socket.id} joined room: ${subdomain}`);
            }
        });

        socket.on('join-user', (userId) => {
            if (userId) {
                socket.join(userId);
                console.log(`[Socket] ${socket.id} joined user room: ${userId}`);
            }
        });

        socket.on('disconnect', (reason) => {
            console.log(`[Socket] Client disconnected: ${socket.id} — reason: ${reason}`);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};

module.exports = { init, getIO };
