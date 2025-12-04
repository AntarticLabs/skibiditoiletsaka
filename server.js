// server.js - KESİN ÇALIŞIR
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);

// CORS AYARI - KRİTİK!
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true
}));

app.use(express.json());

// Socket.io - BASİT ve ETKİLİ
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

// TEST: Bağlantıyı hemen onayla
io.on('connection', (socket) => {
    console.log('🎮 YENİ BAĞLANTI:', socket.id);
    
    // HEMEN cevap gönder
    socket.emit('connected', { 
        status: 'success',
        id: socket.id,
        message: 'Socket server çalışıyor!',
        timestamp: Date.now()
    });
    
    // Ping-pong test
    socket.on('ping', (callback) => {
        if (typeof callback === 'function') {
            callback({ pong: Date.now() });
        }
    });
    
    // Oda test
    socket.on('create-room', (playerName) => {
        const roomCode = Math.random().toString(36).substring(2,8).toUpperCase();
        console.log(`🏠 Oda oluşturuldu: ${roomCode} - ${playerName}`);
        socket.emit('room-created', { 
            roomCode, 
            playerId: socket.id,
            playerName: playerName
        });
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Bağlantı kesildi:', socket.id);
    });
});

// Health check - MUTLAKA OLSUN
app.get('/health', (req, res) => {
    res.json({ 
        status: 'online',
        service: 'KralYarış Socket Server',
        timestamp: Date.now(),
        node: process.version,
        uptime: process.uptime()
    });
});

app.get('/', (req, res) => {
    res.json({ 
        name: '🏁 KRAL YARIŞ - Socket Server',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            websocket: 'wss://' + req.get('host') + '/socket.io/',
            docs: 'Netlify: index.html + assets/'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server ${PORT} portunda çalışıyor`);
    console.log(`📡 WebSocket: wss://localhost:${PORT}/socket.io/`);
    console.log(`🌐 HTTP: http://localhost:${PORT}/health`);
});