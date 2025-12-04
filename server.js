import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);

// CORS
app.use(cors({ origin: "*" }));

// Socket.io
const io = new Server(server, {
  cors: { 
    origin: "*", 
    methods: ["GET", "POST"],
    credentials: true 
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000
});

// ODA SİSTEMİ
const rooms = new Map();
const PLAYER_LIMIT = 8;

io.on("connection", (socket) => {
  console.log("🎮 BAĞLANDI:", socket.id);
  
  // Hemen cevap ver
  socket.emit("connected", { 
    id: socket.id, 
    message: "KralYarış Server Online!",
    time: Date.now() 
  });
  
  // Oda oluştur
  socket.on("create-room", (playerName) => {
    const code = generateRoomCode();
    rooms.set(code, {
      players: [{
        id: socket.id,
        name: playerName || "Sürücü",
        color: Math.floor(Math.random() * 0xFFFFFF),
        position: [0, 0.5, 0],
        lap: 0,
        progress: 0,
        nitroCount: 3
      }],
      gameState: "waiting",
      host: socket.id
    });
    
    socket.join(code);
    socket.roomCode = code;
    
    socket.emit("room-created", { 
      roomCode: code, 
      playerId: socket.id,
      isHost: true,
      color: rooms.get(code).players[0].color
    });
    
    console.log(`🏠 Oda: ${code} - ${playerName}`);
  });
  
  // Odaya katıl
  socket.on("join-room", (roomCode, playerName) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit("error", "Oda bulunamadı!");
      return;
    }
    if (room.players.length >= PLAYER_LIMIT) {
      socket.emit("error", "Oda dolu! Max 8 kişi.");
      return;
    }
    
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    const newPlayer = {
      id: socket.id,
      name: playerName || `Sürücü ${room.players.length + 1}`,
      color: Math.floor(Math.random() * 0xFFFFFF),
      position: [0, 0.5, room.players.length * 2],
      lap: 0,
      progress: 0,
      nitroCount: 3
    };
    
    room.players.push(newPlayer);
    
    // Yeni oyuncuya bilgi
    socket.emit("joined-room", {
      roomCode,
      playerId: socket.id,
      players: room.players,
      isHost: false
    });
    
    // Diğer oyunculara haber ver
    socket.to(roomCode).emit("player-joined", {
      id: socket.id,
      name: newPlayer.name,
      color: newPlayer.color
    });
    
    // Tüm odaya güncelle
    io.to(roomCode).emit("room-update", {
      playerCount: room.players.length,
      players: room.players
    });
    
    console.log(`🚗 ${newPlayer.name} katıldı: ${roomCode}`);
  });
  
  // Yarış başlat
  socket.on("start-race", () => {
    const roomCode = socket.roomCode;
    const room = rooms.get(roomCode);
    if (!room) return;
    
    room.gameState = "countdown";
    let countdown = 5;
    
    const interval = setInterval(() => {
      io.to(roomCode).emit("countdown", countdown);
      countdown--;
      
      if (countdown === 0) {
        clearInterval(interval);
        io.to(roomCode).emit("countdown", "GO!");
        room.gameState = "racing";
        room.startTime = Date.now();
        
        setTimeout(() => {
          io.to(roomCode).emit("race-started");
        }, 1000);
      }
    }, 1000);
    
    io.to(roomCode).emit("race-starting");
  });
  
  // Pozisyon güncelle
  socket.on("update-position", (data) => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    
    socket.to(roomCode).emit("player-update", {
      playerId: socket.id,
      position: data.position,
      rotation: data.rotation,
      lap: data.lap || 0,
      progress: data.progress || 0
    });
  });
  
  // Chat
  socket.on("chat-message", (message) => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    
    const room = rooms.get(roomCode);
    const player = room?.players.find(p => p.id === socket.id);
    
    if (player && message.length <= 100) {
      io.to(roomCode).emit("chat-message", {
        playerName: player.name,
        message: message.trim(),
        timestamp: Date.now()
      });
    }
  });
  
  // Ping
  socket.on("ping", (callback) => {
    if (typeof callback === "function") {
      callback(Date.now());
    }
  });
  
  // Bağlantı kesilince
  socket.on("disconnect", () => {
    console.log("❌ KOPTU:", socket.id);
    
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== -1) {
      const playerName = room.players[playerIndex].name;
      room.players.splice(playerIndex, 1);
      
      if (room.players.length === 0) {
        rooms.delete(roomCode);
        console.log(`🗑️ Oda silindi: ${roomCode}`);
      } else {
        io.to(roomCode).emit("player-left", {
          playerId: socket.id,
          playerName: playerName,
          players: room.players
        });
      }
    }
  });
});

function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "online",
    service: "KralYarış Socket Server",
    rooms: rooms.size,
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

app.get("/", (req, res) => {
  res.json({ 
    name: "🏁 KRAL YARIŞ - Socket Server",
    version: "2.0",
    status: "running",
    message: "Server çalışıyor! Netlify'den bağlanın.",
    endpoints: ["/health", "wss://" + req.get("host") + "/socket.io/"]
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server ${PORT} portunda çalışıyor`);
  console.log(`🌐 URL: https://sakasuka.onrender.com`);
  console.log(`📡 Socket: wss://sakasuka.onrender.com/socket.io/`);
});
