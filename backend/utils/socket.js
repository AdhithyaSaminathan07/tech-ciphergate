const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const Worker = require('../models/Worker');
const Admin = require('../models/Admin');

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
        transports: ['websocket', 'polling'],
        path: '/socket.io/',
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    // Authentication Middleware for Socket.IO
    io.use(async (socket, next) => {
        let token;
        
        // Extract token from cookie
        if (socket.handshake.headers.cookie) {
            const cookies = cookie.parse(socket.handshake.headers.cookie);
            token = cookies.token;
        }
        
        // Fallback to auth payload (for testing or legacy)
        if (!token && socket.handshake.auth?.token) {
            token = socket.handshake.auth.token;
        }

        if (!token) {
            console.warn(`[Socket] Connection from ${socket.id} blocked: missing token`);
            return next(new Error('Authentication required')); 
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Verify active status in DB
            let user;
            if (decoded.role === 'worker') {
                user = await Worker.findById(decoded.id);
                if (!user || user.status !== 'Active') {
                    throw new Error('Worker account inactive or revoked');
                }
            } else if (decoded.role === 'admin') {
                user = await Admin.findById(decoded.id);
                if (!user) {
                    throw new Error('Admin not found');
                }
            } else {
                throw new Error('Invalid role');
            }

            // Check if password changed after token issuance
            if (user.passwordChangedAt) {
                const changedTimestamp = parseInt(user.passwordChangedAt.getTime() / 1000, 10);
                if (decoded.iat < changedTimestamp) {
                    throw new Error('Session invalidated (password changed)');
                }
            }

            socket.user = { id: decoded.id, role: decoded.role, subdomain: user.subdomain }; 
            next();
        } catch (err) {
            console.warn(`[Socket] Auth failed for ${socket.id}: ${err.message}`);
            return next(new Error('Authentication failed'));
        }
    });

    io.on('connection', (socket) => {
        const transport = socket.conn.transport.name;
        const userId = socket.user?.id || 'Unknown';
        console.log(`[Socket] Client connected: ${socket.id} (User: ${userId}, Transport: ${transport})`);

        socket.on('join-subdomain', (subdomain) => {
            // Validate tenant before joining
            if (subdomain && socket.user && socket.user.subdomain === subdomain) {
                socket.join(subdomain);
                console.log(`[Socket] ${socket.id} joined room: ${subdomain}`);
            } else {
                console.warn(`[Socket] ${socket.id} attempted to join unauthorized subdomain: ${subdomain}`);
            }
        });

        socket.on('join-user', (requestedUserId) => {
            if (requestedUserId && socket.user && socket.user.id === requestedUserId) {
                socket.join(requestedUserId);
                console.log(`[Socket] ${socket.id} joined user room: ${requestedUserId}`);
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
