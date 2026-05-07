import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================
// CONFIG
// ============================================================
const MAX_PLAYERS = 15;
const MIN_PLAYERS = 2;
const PRE_ROUND_DELAY_MS = 3000;
const ROUND_END_DELAY_MS = 4500;
const CHAT_RATE_LIMIT_MS = 600;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ALLOW_EMBEDDING = true;

// ============================================================
// PALABRAS Y METADATOS
// ============================================================
const PALABRAS = {
  facil: [
    "gato", "perro", "sol", "luna", "casa", "árbol", "coche", "pelota",
    "plátano", "manzana", "libro", "silla", "mesa", "reloj", "zapato",
    "sombrero", "taza", "tenedor", "llave", "escalera", "pez", "flor",
    "nube", "lápiz", "ojo", "mano", "pie", "boca", "puerta", "ventana",
    "cama", "tijeras", "cuchara", "vaso", "paraguas", "globo", "pastel",
    "estrella", "corazón", "fuego",
  ],
  medio: [
    "pirata", "dragón", "robot", "fantasma", "vampiro", "sirena", "dinosaurio",
    "astronauta", "payaso", "mago", "bruja", "pingüino", "jirafa", "elefante",
    "tiburón", "pulpo", "mariposa", "cangrejo", "koala", "unicornio", "momia",
    "guitarra", "piano", "micrófono", "cohete", "telescopio", "brújula", "faro",
    "volcán", "semáforo", "cactus", "sandía", "hamburguesa", "sushi", "taco",
    "helado", "palomitas", "bicicleta", "castillo", "puente", "pizza",
    "gafas", "corona", "anillo",
  ],
  dificil: [
    "esqueleto", "microondas", "helicóptero", "hipopótamo", "rinoceronte",
    "aspiradora", "espantapájaros", "gimnasio", "malabarista", "equilibrista",
    "tobogán", "columpio", "zoológico", "biblioteca", "supermercado",
    "terremoto", "bombero", "dentista", "fontanero", "jardinero", "panadero",
    "lavadora", "refrigerador", "serpiente", "escorpión", "cebra", "camaleón",
    "tortuga", "murciélago", "saxofón", "acordeón", "carpintero", "veterinario",
  ],
};

const DIFFICULTY_META = {
  facil:   { time: 90, points: 10 },
  medio:   { time: 80, points: 15 },
  dificil: { time: 70, points: 25 },
};

const PLAYER_PALETTE = [
  "#EF4444", "#F59E0B", "#10B981", "#06B6D4",
  "#6366F1", "#8B5CF6", "#EC4899", "#84CC16",
  "#F97316", "#14B8A6", "#A855F7", "#3B82F6",
  "#FBBF24", "#22C55E", "#0EA5E9",
];

// ============================================================
// HELPERS
// ============================================================
const normalize = (s) =>
  s.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function pickRandom(arr, exclude = new Set()) {
  const pool = arr.filter((w) => !exclude.has(w));
  const src = pool.length > 0 ? pool : arr;
  return src[Math.floor(Math.random() * src.length)];
}

function generateRoomCode() {
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function uniqueRoomCode(rooms) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = generateRoomCode();
    if (!rooms.has(code)) return code;
  }
  return generateRoomCode() + Date.now().toString(36).slice(-3).toUpperCase();
}

function buildHint(word, revealedPositions, ratio) {
  const numReveals = ratio > 0.75 ? 2 : ratio > 0.5 ? 1 : 0;
  const active = new Set(revealedPositions.slice(0, numReveals));
  return [...word]
    .map((ch, i) => {
      if (ch === " ") return "/";
      if (active.has(i)) return ch.toUpperCase();
      return "_";
    })
    .join(" ");
}

// ============================================================
// CLASE ROOM
// ============================================================
class Room {
  constructor(code, hostSocketId, type = "private") {
    this.code = code;
    this.type = type;
    this.hostId = hostSocketId;
    this.players = [];
    this.stage = type === "public" ? "waiting" : "lobby";
    this.settings = { difficulty: "medio", cycles: 2 };
    this.round = 0;
    this.totalRounds = 0;
    this.currentDrawerIdx = -1;
    this.currentWord = null;
    this.usedWords = new Set();
    this.revealedPositions = [];
    this.timeLeft = 0;
    this.totalTime = 0;
    this.timerInterval = null;
    this.preRoundTimeout = null;
    this.roundEndTimeout = null;
    this.correctGuessers = new Set();
    this.lastResult = null;
    this.usedColors = new Set();
    this.currentStrokes = [];
    this.currentStrokeAccum = null;
    this.createdAt = Date.now();
  }

  pickColor() {
    for (const c of PLAYER_PALETTE) {
      if (!this.usedColors.has(c)) {
        this.usedColors.add(c);
        return c;
      }
    }
    return PLAYER_PALETTE[this.players.length % PLAYER_PALETTE.length];
  }

  addPlayer(socketId, name) {
    if (this.players.length >= MAX_PLAYERS) return null;
    const trimmed = (name || "").trim().slice(0, 14) || `Jugador ${this.players.length + 1}`;
    const player = { id: socketId, name: trimmed, color: this.pickColor(), score: 0 };
    this.players.push(player);
    return player;
  }

  removePlayer(socketId) {
    const idx = this.players.findIndex((p) => p.id === socketId);
    if (idx < 0) return null;
    const removed = this.players[idx];
    this.usedColors.delete(removed.color);
    this.players.splice(idx, 1);
    let drawerLeft = false;
    if (this.stage !== "lobby" && this.stage !== "waiting") {
      if (idx < this.currentDrawerIdx) {
        this.currentDrawerIdx -= 1;
      } else if (idx === this.currentDrawerIdx) {
        drawerLeft = true;
      }
    }
    if (this.hostId === socketId) {
      this.hostId = this.players[0]?.id || null;
    }
    return { removed, drawerLeft };
  }

  getDrawer() {
    if (this.currentDrawerIdx < 0) return null;
    return this.players[this.currentDrawerIdx] || null;
  }

  getPublicState() {
    return {
      code: this.code,
      type: this.type,
      hostId: this.hostId,
      stage: this.stage,
      settings: this.settings,
      round: this.round,
      totalRounds: this.totalRounds,
      drawerId: this.getDrawer()?.id || null,
      letterCount: this.currentWord
        ? [...this.currentWord].filter((c) => c !== " ").length
        : 0,
      hint: this.currentWord
        ? buildHint(
            this.currentWord,
            this.revealedPositions,
            this.totalTime > 0 ? (this.totalTime - this.timeLeft) / this.totalTime : 0
          )
        : "",
      timeLeft: this.timeLeft,
      totalTime: this.totalTime,
      players: this.players.map((p) => ({ ...p })),
      correctGuessers: [...this.correctGuessers],
      lastResult: this.lastResult,
    };
  }

  broadcastState(io) {
    const state = this.getPublicState();
    io.to(this.code).emit("room:state", state);
    const drawer = this.getDrawer();
    if (drawer && (this.stage === "preRound" || this.stage === "drawing") && this.currentWord) {
      io.to(drawer.id).emit("game:yourWord", { word: this.currentWord });
    }
  }

  sendStrokesReplayTo(io, socketId) {
    if (this.currentStrokes.length === 0) return;
    io.to(socketId).emit("game:strokesReplay", { strokes: this.currentStrokes });
  }

  startGame(io) {
    if (this.players.length < MIN_PLAYERS) return false;
    this.totalRounds = this.type === "public" ? 0 : this.players.length * this.settings.cycles;
    this.round = 0;
    this.usedWords = new Set();
    this.players = this.players.map((p) => ({ ...p, score: 0 }));
    this.currentDrawerIdx = -1;
    this.lastResult = null;
    this.startNextRound(io);
    return true;
  }

  startNextRound(io) {
    if (this.totalRounds > 0 && this.round >= this.totalRounds) {
      this.endGame(io);
      return;
    }
    if (this.players.length < MIN_PLAYERS) {
      this.stage = this.type === "public" ? "waiting" : "lobby";
      this.broadcastState(io);
      return;
    }
    this.round += 1;
    this.currentDrawerIdx = (this.currentDrawerIdx + 1) % this.players.length;
    const meta = DIFFICULTY_META[this.settings.difficulty] || DIFFICULTY_META.medio;
    const word = pickRandom(PALABRAS[this.settings.difficulty] || PALABRAS.medio, this.usedWords);
    this.currentWord = word;
    this.usedWords.add(word);
    if (this.usedWords.size > (PALABRAS[this.settings.difficulty]?.length || 40) - 4) {
      this.usedWords = new Set([word]);
    }
    this.totalTime = meta.time;
    this.timeLeft = meta.time;
    this.correctGuessers = new Set();
    this.lastResult = null;
    this.currentStrokes = [];
    this.currentStrokeAccum = null;

    const validPositions = [...word]
      .map((c, i) => (c !== " " ? i : -1))
      .filter((i) => i >= 0);
    const shuffled = [...validPositions].sort(() => Math.random() - 0.5);
    this.revealedPositions = shuffled.slice(0, Math.min(2, Math.max(0, validPositions.length - 2)));

    this.stage = "preRound";
    this.broadcastState(io);

    if (this.preRoundTimeout) clearTimeout(this.preRoundTimeout);
    this.preRoundTimeout = setTimeout(() => {
      this.stage = "drawing";
      io.to(this.code).emit("draw:clear");
      const drawer = this.getDrawer();
      io.to(this.code).emit("chat:new", {
        id: `sys-${Date.now()}`,
        type: "system",
        text: `✏️ ${drawer.name} está dibujando — ${[...this.currentWord].filter((c) => c !== " ").length} letras`,
      });
      this.broadcastState(io);
      this.startTimer(io);
    }, PRE_ROUND_DELAY_MS);
  }

  startTimer(io) {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.timeLeft -= 1;
      const ratio = (this.totalTime - this.timeLeft) / this.totalTime;
      const sendFull =
        this.timeLeft % 5 === 0 ||
        Math.abs(ratio - 0.5) < 0.02 ||
        Math.abs(ratio - 0.75) < 0.02;
      if (sendFull) {
        this.broadcastState(io);
      } else {
        io.to(this.code).emit("game:tick", { timeLeft: this.timeLeft });
      }
      if (this.timeLeft <= 0) {
        this.endRound(io, "timeup", null);
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  handleGuess(io, socketId, text) {
    if (this.stage !== "drawing") return;
    const player = this.players.find((p) => p.id === socketId);
    if (!player) return;
    const drawer = this.getDrawer();
    if (drawer && drawer.id === socketId) return;
    if (this.correctGuessers.has(socketId)) return;

    const trimmed = (text || "").trim().slice(0, 60);
    if (!trimmed) return;

    const guess = normalize(trimmed);
    const target = normalize(this.currentWord);

    if (guess === target) {
      this.correctGuessers.add(socketId);
      io.to(this.code).emit("chat:new", {
        id: `msg-${Date.now()}-${socketId}`,
        type: "guess-correct",
        playerId: socketId,
        playerName: player.name,
        playerColor: player.color,
        text: "¡adivinó la palabra! ✓",
      });
      const nonDrawerCount = this.players.length - 1;
      const meta = DIFFICULTY_META[this.settings.difficulty] || DIFFICULTY_META.medio;
      const order = this.correctGuessers.size; // 1, 2, 3...
      const baseBonus = Math.max(0, Math.floor(this.timeLeft / 5));
      const orderBonus = Math.max(0, nonDrawerCount - order);
      const guesserPoints = meta.points + baseBonus + orderBonus * 2;
      player.score += guesserPoints;
      const drawerPoints = Math.max(2, Math.floor(meta.points / 4));
      if (drawer) drawer.score += drawerPoints;

      this.broadcastState(io);

      if (this.correctGuessers.size >= nonDrawerCount) {
        setTimeout(() => this.endRound(io, "win", socketId), 600);
      }
    } else {
      const isClose = guess.length > 1 && levenshtein(guess, target) === 1;
      io.to(this.code).emit("chat:new", {
        id: `msg-${Date.now()}-${socketId}`,
        type: isClose ? "guess-close" : "guess",
        playerId: socketId,
        playerName: player.name,
        playerColor: player.color,
        text: trimmed,
      });
      if (isClose) {
        setTimeout(() => {
          io.to(this.code).emit("chat:new", {
            id: `sys-close-${Date.now()}`,
            type: "system-close",
            text: `🔥 ${player.name} está cerca`,
          });
        }, 80);
      }
    }
  }

  endRound(io, type, winnerId) {
    if (this.stage === "roundEnd" || this.stage === "gameOver") return;
    this.stopTimer();
    if (this.preRoundTimeout) clearTimeout(this.preRoundTimeout);

    const drawer = this.getDrawer();
    const pointsAwarded = {};
    for (const pid of this.correctGuessers) pointsAwarded[pid] = "✓";
    if (drawer && this.correctGuessers.size > 0) pointsAwarded[drawer.id] = "🎨";

    this.lastResult = {
      type,
      word: this.currentWord,
      winnerId: winnerId || (this.correctGuessers.size > 0 ? [...this.correctGuessers][0] : null),
      pointsAwarded,
      drawerId: drawer?.id || null,
      correctCount: this.correctGuessers.size,
    };

    let sysText = "";
    if (this.correctGuessers.size > 0) {
      sysText = `🎉 ${this.correctGuessers.size} jugador${this.correctGuessers.size > 1 ? "es" : ""} adivinó. Era "${this.currentWord}"`;
    } else if (type === "skip") {
      sysText = `⏭ ${drawer?.name || "Dibujante"} saltó. Era "${this.currentWord}"`;
    } else if (type === "drawerLeft") {
      sysText = `👋 ${drawer?.name || "Dibujante"} salió. Era "${this.currentWord}"`;
    } else {
      sysText = `⏰ Nadie adivinó. Era "${this.currentWord}"`;
    }
    io.to(this.code).emit("chat:new", {
      id: `sys-end-${Date.now()}`,
      type: this.correctGuessers.size > 0 ? "system-success" : "system-fail",
      text: sysText,
    });

    this.stage = "roundEnd";
    this.broadcastState(io);

    if (this.roundEndTimeout) clearTimeout(this.roundEndTimeout);
    this.roundEndTimeout = setTimeout(() => {
      if (this.type === "public") {
        if (this.players.length >= MIN_PLAYERS) {
          this.startNextRound(io);
        } else {
          this.stage = "waiting";
          this.currentWord = null;
          this.broadcastState(io);
        }
      } else {
        if (this.totalRounds > 0 && this.round >= this.totalRounds) {
          this.endGame(io);
        } else if (this.players.length >= MIN_PLAYERS) {
          this.startNextRound(io);
        } else {
          this.resetToLobby(io);
        }
      }
    }, ROUND_END_DELAY_MS);
  }

  skipRound(io, requesterId) {
    const drawer = this.getDrawer();
    if (!drawer || drawer.id !== requesterId) return;
    if (this.stage !== "drawing") return;
    this.endRound(io, "skip", null);
  }

  endGame(io) {
    this.stopTimer();
    if (this.preRoundTimeout) clearTimeout(this.preRoundTimeout);
    if (this.roundEndTimeout) clearTimeout(this.roundEndTimeout);
    this.stage = "gameOver";
    this.currentWord = null;
    this.broadcastState(io);
  }

  resetToLobby(io) {
    this.stopTimer();
    if (this.preRoundTimeout) clearTimeout(this.preRoundTimeout);
    if (this.roundEndTimeout) clearTimeout(this.roundEndTimeout);
    this.stage = this.type === "public" ? "waiting" : "lobby";
    this.round = 0;
    this.currentWord = null;
    this.currentDrawerIdx = -1;
    this.usedWords = new Set();
    this.correctGuessers = new Set();
    this.lastResult = null;
    this.players = this.players.map((p) => ({ ...p, score: 0 }));
    this.currentStrokes = [];
    this.currentStrokeAccum = null;
    this.broadcastState(io);
  }

  cleanup() {
    this.stopTimer();
    if (this.preRoundTimeout) clearTimeout(this.preRoundTimeout);
    if (this.roundEndTimeout) clearTimeout(this.roundEndTimeout);
  }

  handleDrawStart(data) {
    this.currentStrokeAccum = {
      color: data.color,
      size: data.size,
      isErasing: data.isErasing,
      points: [{ x: data.x, y: data.y }],
    };
    this.currentStrokes.push(this.currentStrokeAccum);
  }
  handleDrawMove(data) {
    if (this.currentStrokeAccum) {
      this.currentStrokeAccum.points.push({ x: data.x, y: data.y });
    }
  }
  handleDrawEnd() {
    this.currentStrokeAccum = null;
  }
  handleDrawUndo() {
    this.currentStrokes.pop();
    this.currentStrokeAccum = null;
  }
  handleDrawClear() {
    this.currentStrokes = [];
    this.currentStrokeAccum = null;
  }
}

// ============================================================
// MANAGER GLOBAL DE SALAS
// ============================================================
const rooms = new Map();
const socketToRoom = new Map();
const lastChatTime = new Map();

function getRoomBySocket(socketId) {
  const code = socketToRoom.get(socketId);
  return code ? rooms.get(code) : null;
}

function deleteRoomIfEmpty(code) {
  const room = rooms.get(code);
  if (room && room.players.length === 0) {
    room.cleanup();
    rooms.delete(code);
    console.log(`[room ${code}] (${room.type}) eliminada (vacía)`);
  }
}

function findOrCreatePublicRoom(socketId) {
  const candidates = [...rooms.values()]
    .filter((r) => r.type === "public" && r.players.length < MAX_PLAYERS)
    .sort((a, b) => b.players.length - a.players.length);
  if (candidates.length > 0) return candidates[0];
  const code = uniqueRoomCode(rooms);
  const room = new Room(code, socketId, "public");
  rooms.set(code, room);
  console.log(`[room ${code}] (public) creada por matchmaking`);
  return room;
}

// ============================================================
// EXPRESS + SOCKET.IO
// ============================================================
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
  pingTimeout: 30000,
  pingInterval: 25000,
});

if (ALLOW_EMBEDDING) {
  app.use((req, res, next) => {
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    next();
  });
}

app.get("/health", (req, res) => res.send("ok"));

app.get("/api/stats", (req, res) => {
  const allRooms = [...rooms.values()];
  const publicRooms = allRooms.filter((r) => r.type === "public");
  res.json({
    rooms: allRooms.length,
    players: allRooms.reduce((s, r) => s + r.players.length, 0),
    publicRooms: publicRooms.length,
    publicPlayers: publicRooms.reduce((s, r) => s + r.players.length, 0),
    publicPlaying: publicRooms.filter(
      (r) => r.stage === "drawing" || r.stage === "preRound" || r.stage === "roundEnd"
    ).length,
    uptime: process.uptime(),
  });
});

app.get("/", (req, res) => res.sendFile(join(__dirname, "index.html")));
app.get("/index.html", (req, res) => res.sendFile(join(__dirname, "index.html")));
app.get("*", (req, res) => {
  if (req.path.startsWith("/socket.io") || req.path.startsWith("/api")) {
    return res.status(404).end();
  }
  res.sendFile(join(__dirname, "index.html"));
});

// ============================================================
// SOCKET HANDLERS
// ============================================================
io.on("connection", (socket) => {
  console.log(`[+] socket ${socket.id} conectado · total: ${io.engine.clientsCount}`);

  // QUICK PLAY ===========================================================
  socket.on("room:quickjoin", ({ name }, ack) => {
    try {
      const room = findOrCreatePublicRoom(socket.id);
      const player = room.addPlayer(socket.id, name);
      if (!player) return ack?.({ ok: false, error: "No hay lugar disponible" });
      socketToRoom.set(socket.id, room.code);
      socket.join(room.code);
      ack?.({ ok: true, code: room.code, you: player });
      room.broadcastState(io);
      io.to(room.code).emit("chat:new", {
        id: `sys-join-${Date.now()}`,
        type: "system",
        text: `👋 ${player.name} se unió`,
      });
      if (room.stage === "drawing" || room.stage === "preRound") {
        room.sendStrokesReplayTo(io, socket.id);
      }
      if (room.stage === "waiting" && room.players.length >= MIN_PLAYERS) {
        setTimeout(() => {
          if (rooms.get(room.code) && room.stage === "waiting" && room.players.length >= MIN_PLAYERS) {
            room.startGame(io);
          }
        }, 1500);
      }
      console.log(`[room ${room.code}] (public) ${player.name} se unió. Total: ${room.players.length}`);
    } catch (e) {
      console.error("error room:quickjoin", e);
      ack?.({ ok: false, error: "Error del servidor" });
    }
  });

  // CREAR PRIVADA ========================================================
  socket.on("room:create", ({ name, settings }, ack) => {
    try {
      const code = uniqueRoomCode(rooms);
      const room = new Room(code, socket.id, "private");
      if (settings) {
        if (["facil", "medio", "dificil"].includes(settings.difficulty)) {
          room.settings.difficulty = settings.difficulty;
        }
        if ([1, 2, 3].includes(settings.cycles)) {
          room.settings.cycles = settings.cycles;
        }
      }
      const player = room.addPlayer(socket.id, name);
      if (!player) return ack?.({ ok: false, error: "No se pudo crear sala" });
      rooms.set(code, room);
      socketToRoom.set(socket.id, code);
      socket.join(code);
      ack?.({ ok: true, code, you: player });
      room.broadcastState(io);
      console.log(`[room ${code}] (private) creada por ${player.name}`);
    } catch (e) {
      console.error("error room:create", e);
      ack?.({ ok: false, error: "Error del servidor" });
    }
  });

  // UNIRSE POR CÓDIGO ====================================================
  socket.on("room:join", ({ code, name }, ack) => {
    try {
      const upperCode = (code || "").toUpperCase().trim();
      const room = rooms.get(upperCode);
      if (!room) return ack?.({ ok: false, error: "Sala no encontrada" });
      if (room.players.length >= MAX_PLAYERS) return ack?.({ ok: false, error: "Sala llena" });
      if (room.type === "private" && room.stage !== "lobby") {
        return ack?.({ ok: false, error: "Partida en curso, espera al lobby" });
      }
      const player = room.addPlayer(socket.id, name);
      if (!player) return ack?.({ ok: false, error: "No se pudo unir" });
      socketToRoom.set(socket.id, upperCode);
      socket.join(upperCode);
      ack?.({ ok: true, code: upperCode, you: player });
      room.broadcastState(io);
      io.to(upperCode).emit("chat:new", {
        id: `sys-join-${Date.now()}`,
        type: "system",
        text: `👋 ${player.name} se unió a la sala`,
      });
      if (room.type === "public" && (room.stage === "drawing" || room.stage === "preRound")) {
        room.sendStrokesReplayTo(io, socket.id);
      }
      if (room.type === "public" && room.stage === "waiting" && room.players.length >= MIN_PLAYERS) {
        setTimeout(() => {
          if (rooms.get(upperCode) && room.stage === "waiting" && room.players.length >= MIN_PLAYERS) {
            room.startGame(io);
          }
        }, 1500);
      }
      console.log(`[room ${upperCode}] (${room.type}) ${player.name} se unió`);
    } catch (e) {
      console.error("error room:join", e);
      ack?.({ ok: false, error: "Error del servidor" });
    }
  });

  socket.on("room:settings", (newSettings) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.type !== "private" || room.hostId !== socket.id || room.stage !== "lobby") return;
    if (newSettings.difficulty && ["facil", "medio", "dificil"].includes(newSettings.difficulty)) {
      room.settings.difficulty = newSettings.difficulty;
    }
    if (newSettings.cycles && [1, 2, 3].includes(newSettings.cycles)) {
      room.settings.cycles = newSettings.cycles;
    }
    room.broadcastState(io);
  });

  socket.on("game:start", () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    if (room.type !== "private") return;
    if (room.hostId !== socket.id) return;
    if (room.stage !== "lobby") return;
    if (room.players.length < MIN_PLAYERS) return;
    room.startGame(io);
  });

  socket.on("game:backToLobby", () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.type !== "private" || room.hostId !== socket.id) return;
    if (room.stage !== "gameOver") return;
    room.resetToLobby(io);
  });

  socket.on("game:skip", () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    room.skipRound(io, socket.id);
  });

  function isDrawer(room) {
    return room && room.getDrawer()?.id === socket.id && room.stage === "drawing";
  }

  socket.on("draw:start", (data) => {
    const room = getRoomBySocket(socket.id);
    if (!isDrawer(room)) return;
    room.handleDrawStart(data);
    socket.to(room.code).emit("draw:start", data);
  });
  socket.on("draw:move", (data) => {
    const room = getRoomBySocket(socket.id);
    if (!isDrawer(room)) return;
    room.handleDrawMove(data);
    socket.to(room.code).emit("draw:move", data);
  });
  socket.on("draw:end", () => {
    const room = getRoomBySocket(socket.id);
    if (!isDrawer(room)) return;
    room.handleDrawEnd();
    socket.to(room.code).emit("draw:end");
  });
  socket.on("draw:undo", () => {
    const room = getRoomBySocket(socket.id);
    if (!isDrawer(room)) return;
    room.handleDrawUndo();
    socket.to(room.code).emit("draw:undo");
  });
  socket.on("draw:clear", () => {
    const room = getRoomBySocket(socket.id);
    if (!isDrawer(room)) return;
    room.handleDrawClear();
    socket.to(room.code).emit("draw:clear");
  });

  // CHAT (rate limited) ==================================================
  socket.on("chat:message", ({ text }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const now = Date.now();
    const last = lastChatTime.get(socket.id) || 0;
    if (now - last < CHAT_RATE_LIMIT_MS) return;
    lastChatTime.set(socket.id, now);

    if (room.stage === "drawing") {
      room.handleGuess(io, socket.id, text);
    } else {
      // chat libre en lobby/waiting/preRound/roundEnd/gameOver
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;
      const trimmed = (text || "").trim().slice(0, 60);
      if (!trimmed) return;
      io.to(room.code).emit("chat:new", {
        id: `msg-${Date.now()}-${socket.id}`,
        type: "guess",
        playerId: socket.id,
        playerName: player.name,
        playerColor: player.color,
        text: trimmed,
      });
    }
  });

  socket.on("room:leave", () => handleLeave(socket));

  socket.on("disconnect", () => {
    console.log(`[-] socket ${socket.id} desconectado · total: ${io.engine.clientsCount - 1}`);
    handleLeave(socket);
    lastChatTime.delete(socket.id);
  });
});

function handleLeave(socket) {
  const room = getRoomBySocket(socket.id);
  if (!room) return;
  socketToRoom.delete(socket.id);
  socket.leave(room.code);
  const result = room.removePlayer(socket.id);
  if (!result) return;
  const { removed, drawerLeft } = result;
  io.to(room.code).emit("chat:new", {
    id: `sys-leave-${Date.now()}`,
    type: "system",
    text: `👋 ${removed.name} salió`,
  });
  if (drawerLeft && room.stage === "drawing") {
    room.endRound(io, "drawerLeft", null);
  } else if (drawerLeft && room.stage === "preRound") {
    if (room.preRoundTimeout) clearTimeout(room.preRoundTimeout);
    if (room.players.length >= MIN_PLAYERS) {
      room.currentDrawerIdx -= 1;
      room.round -= 1;
      room.startNextRound(io);
    } else {
      room.stage = room.type === "public" ? "waiting" : "lobby";
      room.broadcastState(io);
    }
  } else {
    room.broadcastState(io);
  }
  if (room.players.length < MIN_PLAYERS && room.stage !== "lobby" && room.stage !== "waiting" && room.stage !== "gameOver") {
    if (room.type === "public") {
      room.stopTimer();
      if (room.preRoundTimeout) clearTimeout(room.preRoundTimeout);
      if (room.roundEndTimeout) clearTimeout(room.roundEndTimeout);
      room.stage = "waiting";
      room.currentWord = null;
      io.to(room.code).emit("chat:new", {
        id: `sys-empty-${Date.now()}`,
        type: "system",
        text: "❗ Esperando más jugadores...",
      });
      room.broadcastState(io);
    } else {
      io.to(room.code).emit("chat:new", {
        id: `sys-empty-${Date.now()}`,
        type: "system",
        text: "❗ Quedan muy pocos jugadores. Volviendo al lobby.",
      });
      room.resetToLobby(io);
    }
  }
  setTimeout(() => deleteRoomIfEmpty(room.code), 2000);
}

// Cleanup periódico de salas vacías "fantasma"
setInterval(() => {
  for (const [code, room] of rooms.entries()) {
    if (room.players.length === 0) {
      room.cleanup();
      rooms.delete(code);
      console.log(`[cleanup] sala ${code} (${room.type}) eliminada`);
    }
  }
}, 5 * 60 * 1000);

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🎨 Rezopaint server corriendo en puerto ${PORT}`);
  console.log(`   → http://localhost:${PORT}`);
  console.log(`   → max ${MAX_PLAYERS} jugadores por sala`);
});
