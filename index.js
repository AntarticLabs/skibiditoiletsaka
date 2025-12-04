import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);

// CORS - HER YERDEN İZİN VER
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(cors());
app.use(express.json());

// ODA SİSTEMİ
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('✅ Yeni bağlantı:', socket.id);
    
    // TEST: Hemen bağlantıyı onayla
    socket.emit('connected', { 
        message: 'Socket server çalışıyor!',
        serverTime: Date.now()
    });
    
    // Oda oluştur
    socket.on('create-room', (playerName) => {
        const roomCode = generateRoomCode();
        rooms.set(roomCode, {
            players: [{ 
                id: socket.id, 
                name: playerName || 'Sürücü',
                color: Math.floor(Math.random() * 0xFFFFFF)
            }],
            gameState: 'waiting',
            createdAt: Date.now()
        });
        
        socket.join(roomCode);
        socket.roomCode = roomCode;
        
        socket.emit('room-created', { 
            roomCode, 
            playerId: socket.id,
            playerName: playerName,
            color: rooms.get(roomCode).players[0].color,
            isHost: true
        });
        
        console.log(`🏠 Oda oluşturuldu: ${roomCode} - ${playerName}`);
    });
    
    // Odaya katıl
    socket.on('join-room', (roomCode, playerName) => {
        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', 'Oda bulunamadı!');
            return;
        }
        
        if (room.players.length >= 8) {
            socket.emit('error', 'Oda dolu! (Max 8 kişi)');
            return;
        }
        
        socket.join(roomCode);
        socket.roomCode = roomCode;
        
        const newPlayer = {
            id: socket.id,
            name: playerName || `Sürücü ${room.players.length + 1}`,
            color: Math.floor(Math.random() * 0xFFFFFF)
        };
        
        room.players.push(newPlayer);
        
        // Mevcut oyunculara yeni oyuncuyu bildir
        socket.to(roomCode).emit('player-joined', {
            id: socket.id,
            name: newPlayer.name,
            color: newPlayer.color
        });
        
        // Yeni oyuncuya bilgileri gönder
        socket.emit('joined-room', {
            roomCode,
            playerId: socket.id,
            players: room.players,
            isHost: false
        });
        
        // Tüm odaya güncelleme gönder
        io.to(roomCode).emit('room-update', {
            playerCount: room.players.length,
            players: room.players
        });
        
        console.log(`🚗 ${newPlayer.name} odaya katıldı: ${roomCode}`);
    });
    
    // Yarış başlat
    socket.on('start-race', () => {
        const roomCode = socket.roomCode;
        const room = rooms.get(roomCode);
        if (!room) return;
        
        room.gameState = 'countdown';
        
        // Countdown
        let countdown = 5;
        const interval = setInterval(() => {
            io.to(roomCode).emit('countdown', countdown);
            countdown--;
            
            if (countdown === 0) {
                clearInterval(interval);
                io.to(roomCode).emit('countdown', 'GO!');
                room.gameState = 'racing';
                
                setTimeout(() => {
                    io.to(roomCode).emit('race-started');
                }, 1000);
            }
        }, 1000);
        
        io.to(roomCode).emit('race-starting');
    });
    
    // Oyuncu pozisyonu
    socket.on('update-position', (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode) return;
        
        socket.to(roomCode).emit('player-update', {
            playerId: socket.id,
            position: data.position,
            rotation: data.rotation,
            lap: data.lap || 0,
            progress: data.progress || 0
        });
    });
    
    // Chat
    socket.on('chat-message', (message) => {
        const roomCode = socket.roomCode;
        if (!roomCode) return;
        
        const room = rooms.get(roomCode);
        const player = room?.players.find(p => p.id === socket.id);
        
        if (player && message.length <= 100) {
            io.to(roomCode).emit('chat-message', {
                playerName: player.name,
                message: message.trim(),
                timestamp: Date.now()
            });
        }
    });
    
    // Ping
    socket.on('ping', (callback) => {
        if (typeof callback === 'function') {
            callback();
        }
    });
    
    // Bağlantı kesilince
    socket.on('disconnect', () => {
        console.log('❌ Bağlantı kesildi:', socket.id);
        
        const roomCode = socket.roomCode;
        if (!roomCode) return;
        
        const room = rooms.get(roomCode);
        if (!room) return;
        
        // Oyuncuyu çıkar
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            const playerName = room.players[playerIndex].name;
            room.players.splice(playerIndex, 1);
            
            if (room.players.length === 0) {
                rooms.delete(roomCode);
                console.log(`🗑️ Oda silindi: ${roomCode}`);
            } else {
                io.to(roomCode).emit('player-left', {
                    playerId: socket.id,
                    playerName: playerName,
                    players: room.players
                });
                
                io.to(roomCode).emit('room-update', {
                    playerCount: room.players.length,
                    players: room.players
                });
            }
        }
    });
});

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return rooms.has(code) ? generateRoomCode() : code;
}

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        rooms: rooms.size,
        uptime: process.uptime(),
        timestamp: Date.now()
    });
});

app.get('/', (req, res) => {
    res.json({
        name: 'KralYarış Socket Server',
        version: '1.0.0',
        status: 'running',
        message: 'Socket server çalışıyor!'
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Socket server ${PORT} portunda çalışıyor`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
    console.log(`🌐 WebSocket: ws://localhost:${PORT}`);
});