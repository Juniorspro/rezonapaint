// ============================================================
// Rezopaint Multiplayer Server — Multilang
// Raw WebSocket (ws package). Sin HTML, sin Socket.IO.
// Soporta ES / EN / PT con matchmaking por idioma.
// ============================================================
import { WebSocketServer } from "ws";
import http from "http";

const PORT = process.env.PORT || 8080;

const MAX_PLAYERS = 15;
const MIN_PLAYERS = 2;
const PRE_ROUND_DELAY_MS = 3000;
const ROUND_END_DELAY_MS = 4500;
const CHAT_RATE_LIMIT_MS = 600;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ============================================================
// PALABRAS POR IDIOMA
// ============================================================
const PALABRAS_BY_LANG = {
  es: {
    facil: ["gato","perro","sol","luna","casa","árbol","coche","pelota","plátano","manzana","libro","silla","mesa","reloj","zapato","sombrero","taza","tenedor","llave","escalera","pez","flor","nube","lápiz","ojo","mano","pie","boca","puerta","ventana","cama","tijeras","cuchara","vaso","paraguas","globo","pastel","estrella","corazón","fuego"],
    medio: ["pirata","dragón","robot","fantasma","vampiro","sirena","dinosaurio","astronauta","payaso","mago","bruja","pingüino","jirafa","elefante","tiburón","pulpo","mariposa","cangrejo","koala","unicornio","momia","guitarra","piano","micrófono","cohete","telescopio","brújula","faro","volcán","semáforo","cactus","sandía","hamburguesa","sushi","taco","helado","palomitas","bicicleta","castillo","puente","pizza","gafas","corona","anillo"],
    dificil: ["esqueleto","microondas","helicóptero","hipopótamo","rinoceronte","aspiradora","espantapájaros","gimnasio","malabarista","equilibrista","tobogán","columpio","zoológico","biblioteca","supermercado","terremoto","bombero","dentista","fontanero","jardinero","panadero","lavadora","refrigerador","serpiente","escorpión","cebra","camaleón","tortuga","murciélago","saxofón","acordeón","carpintero","veterinario"],
  },
  en: {
    facil: ["cat","dog","sun","moon","house","tree","car","ball","banana","apple","book","chair","table","clock","shoe","hat","cup","fork","key","ladder","fish","flower","cloud","pencil","eye","hand","foot","mouth","door","window","bed","scissors","spoon","glass","umbrella","balloon","cake","star","heart","fire"],
    medio: ["pirate","dragon","robot","ghost","vampire","mermaid","dinosaur","astronaut","clown","wizard","witch","penguin","giraffe","elephant","shark","octopus","butterfly","crab","koala","unicorn","mummy","guitar","piano","microphone","rocket","telescope","compass","lighthouse","volcano","traffic light","cactus","watermelon","hamburger","sushi","taco","ice cream","popcorn","bicycle","castle","bridge","pizza","glasses","crown","ring"],
    dificil: ["skeleton","microwave","helicopter","hippopotamus","rhinoceros","vacuum cleaner","scarecrow","gym","juggler","tightrope","slide","swing","zoo","library","supermarket","earthquake","firefighter","dentist","plumber","gardener","baker","washing machine","refrigerator","snake","scorpion","zebra","chameleon","turtle","bat","saxophone","accordion","carpenter","veterinarian"],
  },
  pt: {
    facil: ["gato","cachorro","sol","lua","casa","árvore","carro","bola","banana","maçã","livro","cadeira","mesa","relógio","sapato","chapéu","xícara","garfo","chave","escada","peixe","flor","nuvem","lápis","olho","mão","pé","boca","porta","janela","cama","tesoura","colher","copo","guarda-chuva","balão","bolo","estrela","coração","fogo"],
    medio: ["pirata","dragão","robô","fantasma","vampiro","sereia","dinossauro","astronauta","palhaço","mago","bruxa","pinguim","girafa","elefante","tubarão","polvo","borboleta","caranguejo","coala","unicórnio","múmia","violão","piano","microfone","foguete","telescópio","bússola","farol","vulcão","semáforo","cacto","melancia","hambúrguer","sushi","taco","sorvete","pipoca","bicicleta","castelo","ponte","pizza","óculos","coroa","anel"],
    dificil: ["esqueleto","micro-ondas","helicóptero","hipopótamo","rinoceronte","aspirador","espantalho","ginásio","malabarista","equilibrista","escorregador","balanço","zoológico","biblioteca","supermercado","terremoto","bombeiro","dentista","encanador","jardineiro","padeiro","máquina de lavar","geladeira","cobra","escorpião","zebra","camaleão","tartaruga","morcego","saxofone","acordeão","carpinteiro","veterinário"],
  },
};

const DIFFICULTY_META = {
  facil:   { time: 90, points: 10 },
  medio:   { time: 80, points: 15 },
  dificil: { time: 70, points: 25 },
};

// ============================================================
// SYSTEM MESSAGES POR IDIOMA
// ============================================================
const SYSTEM_MSGS = {
  es: {
    drawing: '✏️ {name} está dibujando — {n} letras',
    won: '🎉 {n} jugador{plural} adivinó. Era "{word}"',
    skip: '⏭ {name} saltó. Era "{word}"',
    drawer_left: '👋 {name} salió. Era "{word}"',
    nobody: '⏰ Nadie adivinó. Era "{word}"',
    joined: '👋 {name} se unió',
    joined_room: '👋 {name} se unió a la sala',
    left: '👋 {name} salió',
    waiting: '❗ Esperando más jugadores...',
    too_few: '❗ Quedan muy pocos. Volviendo al lobby.',
    close: '🔥 {name} está cerca',
    correct: '¡adivinó la palabra! ✓',
  },
  en: {
    drawing: '✏️ {name} is drawing — {n} letters',
    won: '🎉 {n} player{plural} guessed. It was "{word}"',
    skip: '⏭ {name} skipped. It was "{word}"',
    drawer_left: '👋 {name} left. It was "{word}"',
    nobody: '⏰ Nobody guessed. It was "{word}"',
    joined: '👋 {name} joined',
    joined_room: '👋 {name} joined the room',
    left: '👋 {name} left',
    waiting: '❗ Waiting for more players...',
    too_few: '❗ Too few players. Returning to lobby.',
    close: '🔥 {name} is close',
    correct: 'guessed the word! ✓',
  },
  pt: {
    drawing: '✏️ {name} está desenhando — {n} letras',
    won: '🎉 {n} jogador{plural} adivinhou. Era "{word}"',
    skip: '⏭ {name} pulou. Era "{word}"',
    drawer_left: '👋 {name} saiu. Era "{word}"',
    nobody: '⏰ Ninguém adivinhou. Era "{word}"',
    joined: '👋 {name} entrou',
    joined_room: '👋 {name} entrou na sala',
    left: '👋 {name} saiu',
    waiting: '❗ Esperando mais jogadores...',
    too_few: '❗ Poucos jogadores. Voltando ao lobby.',
    close: '🔥 {name} está perto',
    correct: 'adivinhou a palavra! ✓',
  },
};

function tr(lang, key, vars = {}) {
  const dict = SYSTEM_MSGS[lang] || SYSTEM_MSGS.es;
  let s = dict[key] || SYSTEM_MSGS.es[key] || key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

const PLAYER_PALETTE = ["#EF4444","#F59E0B","#10B981","#06B6D4","#6366F1","#8B5CF6","#EC4899","#84CC16","#F97316","#14B8A6","#A855F7","#3B82F6","#FBBF24","#22C55E","#0EA5E9"];

// ============================================================
// HELPERS
// ============================================================
const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]/g,"").trim();

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  const prev = new Array(n+1), curr = new Array(n+1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      curr[j] = Math.min(curr[j-1]+1, prev[j]+1, prev[j-1]+cost);
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

function genCode() {
  let s = "";
  for (let i = 0; i < 5; i++) s += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  return s;
}

function uniqueCode(rooms) {
  for (let i = 0; i < 50; i++) { const c = genCode(); if (!rooms.has(c)) return c; }
  return genCode() + Date.now().toString(36).slice(-3).toUpperCase();
}

function buildHint(word, revealed, ratio) {
  const n = ratio > 0.75 ? 2 : ratio > 0.5 ? 1 : 0;
  const active = new Set(revealed.slice(0, n));
  return [...word].map((c, i) => (c === " " ? "/" : active.has(i) ? c.toUpperCase() : "_")).join(" ");
}

function pluralOf(lang, n) {
  if (lang === "es") return n > 1 ? "es" : "";
  if (lang === "en") return n > 1 ? "s" : "";
  if (lang === "pt") return n > 1 ? "es" : "";
  return n > 1 ? "es" : "";
}

// ============================================================
// ROOM
// ============================================================
class Room {
  constructor(code, hostId, type = "private", language = "es") {
    this.code = code;
    this.type = type;
    this.hostId = hostId;
    this.language = ["es","en","pt"].includes(language) ? language : "es";
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
  }

  pickColor() {
    for (const c of PLAYER_PALETTE) if (!this.usedColors.has(c)) { this.usedColors.add(c); return c; }
    return PLAYER_PALETTE[this.players.length % PLAYER_PALETTE.length];
  }

  addPlayer(id, name) {
    if (this.players.length >= MAX_PLAYERS) return null;
    const tn = (name || "").trim().slice(0, 14) || `Player ${this.players.length + 1}`;
    const p = { id, name: tn, color: this.pickColor(), score: 0 };
    this.players.push(p);
    return p;
  }

  removePlayer(id) {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    const removed = this.players[idx];
    this.usedColors.delete(removed.color);
    this.players.splice(idx, 1);
    let drawerLeft = false;
    if (this.stage !== "lobby" && this.stage !== "waiting") {
      if (idx < this.currentDrawerIdx) this.currentDrawerIdx -= 1;
      else if (idx === this.currentDrawerIdx) drawerLeft = true;
    }
    if (this.hostId === id) this.hostId = this.players[0]?.id || null;
    return { removed, drawerLeft };
  }

  getDrawer() { if (this.currentDrawerIdx < 0) return null; return this.players[this.currentDrawerIdx] || null; }

  getPublicState() {
    return {
      code: this.code,
      type: this.type,
      language: this.language,
      hostId: this.hostId,
      stage: this.stage,
      settings: this.settings,
      round: this.round,
      totalRounds: this.totalRounds,
      drawerId: this.getDrawer()?.id || null,
      letterCount: this.currentWord ? [...this.currentWord].filter((c) => c !== " ").length : 0,
      hint: this.currentWord ? buildHint(this.currentWord, this.revealedPositions, this.totalTime > 0 ? (this.totalTime - this.timeLeft) / this.totalTime : 0) : "",
      timeLeft: this.timeLeft,
      totalTime: this.totalTime,
      players: this.players.map((p) => ({ ...p })),
      correctGuessers: [...this.correctGuessers],
      lastResult: this.lastResult,
    };
  }

  broadcastState() {
    broadcastToRoom(this.code, { type: "room:state", state: this.getPublicState() });
    const drawer = this.getDrawer();
    if (drawer && (this.stage === "preRound" || this.stage === "drawing") && this.currentWord) {
      const ws = sockets.get(drawer.id);
      if (ws) sendMsg(ws, { type: "game:yourWord", word: this.currentWord });
    }
  }

  sendStrokesReplayTo(socketId) {
    if (this.currentStrokes.length === 0) return;
    const ws = sockets.get(socketId);
    if (ws) sendMsg(ws, { type: "game:strokesReplay", strokes: this.currentStrokes });
  }

  startGame() {
    if (this.players.length < MIN_PLAYERS) return false;
    this.totalRounds = this.type === "public" ? 0 : this.players.length * this.settings.cycles;
    this.round = 0;
    this.usedWords = new Set();
    this.players = this.players.map((p) => ({ ...p, score: 0 }));
    this.currentDrawerIdx = -1;
    this.lastResult = null;
    this.startNextRound();
    return true;
  }

  startNextRound() {
    if (this.totalRounds > 0 && this.round >= this.totalRounds) { this.endGame(); return; }
    if (this.players.length < MIN_PLAYERS) {
      this.stage = this.type === "public" ? "waiting" : "lobby";
      this.broadcastState();
      return;
    }
    this.round += 1;
    this.currentDrawerIdx = (this.currentDrawerIdx + 1) % this.players.length;
    const meta = DIFFICULTY_META[this.settings.difficulty] || DIFFICULTY_META.medio;
    const langWords = PALABRAS_BY_LANG[this.language] || PALABRAS_BY_LANG.es;
    const wordList = langWords[this.settings.difficulty] || langWords.medio;
    const word = pickRandom(wordList, this.usedWords);
    this.currentWord = word;
    this.usedWords.add(word);
    if (this.usedWords.size > wordList.length - 4) this.usedWords = new Set([word]);
    this.totalTime = meta.time;
    this.timeLeft = meta.time;
    this.correctGuessers = new Set();
    this.lastResult = null;
    this.currentStrokes = [];
    this.currentStrokeAccum = null;
    const valid = [...word].map((c, i) => (c !== " " ? i : -1)).filter((i) => i >= 0);
    const shuffled = [...valid].sort(() => Math.random() - 0.5);
    this.revealedPositions = shuffled.slice(0, Math.min(2, Math.max(0, valid.length - 2)));
    this.stage = "preRound";
    this.broadcastState();
    if (this.preRoundTimeout) clearTimeout(this.preRoundTimeout);
    this.preRoundTimeout = setTimeout(() => {
      this.stage = "drawing";
      broadcastToRoom(this.code, { type: "draw:clear" });
      const drawer = this.getDrawer();
      const letterCount = [...this.currentWord].filter((c) => c !== " ").length;
      broadcastToRoom(this.code, {
        type: "chat:new",
        msg: { id: `sys-${Date.now()}`, type: "system", text: tr(this.language, "drawing", { name: drawer.name, n: letterCount }) },
      });
      this.broadcastState();
      this.startTimer();
    }, PRE_ROUND_DELAY_MS);
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.timeLeft -= 1;
      const ratio = (this.totalTime - this.timeLeft) / this.totalTime;
      const sendFull = this.timeLeft % 5 === 0 || Math.abs(ratio - 0.5) < 0.02 || Math.abs(ratio - 0.75) < 0.02;
      if (sendFull) this.broadcastState();
      else broadcastToRoom(this.code, { type: "game:tick", timeLeft: this.timeLeft });
      if (this.timeLeft <= 0) this.endRound("timeup", null);
    }, 1000);
  }

  stopTimer() { if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; } }

  handleGuess(socketId, text) {
    if (this.stage !== "drawing") return;
    const player = this.players.find((p) => p.id === socketId);
    if (!player) return;
    const drawer = this.getDrawer();
    if (drawer && drawer.id === socketId) return;

    const trimmed = (text || "").trim().slice(0, 60);
    if (!trimmed) return;

    // 🔒 Si ya adivinó, su mensaje SOLO va a winners (drawer + otros que ya adivinaron)
    if (this.correctGuessers.has(socketId)) {
      broadcastToWinners(this.code, {
        type: "chat:new",
        msg: {
          id: `msg-${Date.now()}-${socketId}`,
          type: "guess-winners",
          playerId: socketId,
          playerName: player.name,
          playerColor: player.color,
          text: trimmed,
        },
      });
      return;
    }

    const guess = normalize(trimmed);
    const target = normalize(this.currentWord);

    if (guess === target) {
      this.correctGuessers.add(socketId);
      broadcastToRoom(this.code, {
        type: "chat:new",
        msg: {
          id: `msg-${Date.now()}-${socketId}`,
          type: "guess-correct",
          playerId: socketId,
          playerName: player.name,
          playerColor: player.color,
          text: tr(this.language, "correct"),
        },
      });
      const nonDrawer = this.players.length - 1;
      const meta = DIFFICULTY_META[this.settings.difficulty] || DIFFICULTY_META.medio;
      const order = this.correctGuessers.size;
      const baseBonus = Math.max(0, Math.floor(this.timeLeft / 5));
      const orderBonus = Math.max(0, nonDrawer - order);
      player.score += meta.points + baseBonus + orderBonus * 2;
      const drawerPts = Math.max(2, Math.floor(meta.points / 4));
      if (drawer) drawer.score += drawerPts;
      this.broadcastState();
      if (this.correctGuessers.size >= nonDrawer) setTimeout(() => this.endRound("win", socketId), 600);
    } else {
      const isClose = guess.length > 1 && levenshtein(guess, target) === 1;
      broadcastToRoom(this.code, {
        type: "chat:new",
        msg: {
          id: `msg-${Date.now()}-${socketId}`,
          type: isClose ? "guess-close" : "guess",
          playerId: socketId,
          playerName: player.name,
          playerColor: player.color,
          text: trimmed,
        },
      });
      if (isClose) {
        setTimeout(() => {
          broadcastToRoom(this.code, {
            type: "chat:new",
            msg: { id: `sys-close-${Date.now()}`, type: "system-close", text: tr(this.language, "close", { name: player.name }) },
          });
        }, 80);
      }
    }
  }

  endRound(type, winnerId) {
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
    let sysType = "system-fail";
    if (this.correctGuessers.size > 0) {
      sysText = tr(this.language, "won", { n: this.correctGuessers.size, plural: pluralOf(this.language, this.correctGuessers.size), word: this.currentWord });
      sysType = "system-success";
    } else if (type === "skip") {
      sysText = tr(this.language, "skip", { name: drawer?.name || "?", word: this.currentWord });
    } else if (type === "drawerLeft") {
      sysText = tr(this.language, "drawer_left", { name: drawer?.name || "?", word: this.currentWord });
    } else {
      sysText = tr(this.language, "nobody", { word: this.currentWord });
    }

    broadcastToRoom(this.code, {
      type: "chat:new",
      msg: { id: `sys-end-${Date.now()}`, type: sysType, text: sysText },
    });

    this.stage = "roundEnd";
    this.broadcastState();

    if (this.roundEndTimeout) clearTimeout(this.roundEndTimeout);
    this.roundEndTimeout = setTimeout(() => {
      if (this.type === "public") {
        if (this.players.length >= MIN_PLAYERS) this.startNextRound();
        else { this.stage = "waiting"; this.currentWord = null; this.broadcastState(); }
      } else {
        if (this.totalRounds > 0 && this.round >= this.totalRounds) this.endGame();
        else if (this.players.length >= MIN_PLAYERS) this.startNextRound();
        else this.resetToLobby();
      }
    }, ROUND_END_DELAY_MS);
  }

  skipRound(requesterId) {
    const drawer = this.getDrawer();
    if (!drawer || drawer.id !== requesterId) return;
    if (this.stage !== "drawing") return;
    this.endRound("skip", null);
  }

  endGame() {
    this.stopTimer();
    if (this.preRoundTimeout) clearTimeout(this.preRoundTimeout);
    if (this.roundEndTimeout) clearTimeout(this.roundEndTimeout);
    this.stage = "gameOver";
    this.currentWord = null;
    this.broadcastState();
  }

  resetToLobby() {
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
    this.broadcastState();
  }

  cleanup() {
    this.stopTimer();
    if (this.preRoundTimeout) clearTimeout(this.preRoundTimeout);
    if (this.roundEndTimeout) clearTimeout(this.roundEndTimeout);
  }

  handleDrawStart(d) {
    this.currentStrokeAccum = { color: d.color, size: d.size, isErasing: d.isErasing, points: [{ x: d.x, y: d.y }] };
    this.currentStrokes.push(this.currentStrokeAccum);
  }
  handleDrawMove(d) { if (this.currentStrokeAccum) this.currentStrokeAccum.points.push({ x: d.x, y: d.y }); }
  handleDrawEnd() { this.currentStrokeAccum = null; }
  handleDrawUndo() { this.currentStrokes.pop(); this.currentStrokeAccum = null; }
  handleDrawClear() { this.currentStrokes = []; this.currentStrokeAccum = null; }
}

// ============================================================
// GLOBAL STATE
// ============================================================
const rooms = new Map();
const sockets = new Map();
const socketToRoom = new Map();
const lastChatTime = new Map();
let nextSocketId = 1;

function getRoomBySocket(id) { const c = socketToRoom.get(id); return c ? rooms.get(c) : null; }

function findOrCreatePublicRoom(socketId, language = "es") {
  const lang = ["es","en","pt"].includes(language) ? language : "es";
  // Solo matchea salas públicas del MISMO idioma
  const cands = [...rooms.values()]
    .filter((r) => r.type === "public" && r.language === lang && r.players.length < MAX_PLAYERS)
    .sort((a, b) => b.players.length - a.players.length);
  if (cands.length > 0) return cands[0];
  const code = uniqueCode(rooms);
  const room = new Room(code, socketId, "public", lang);
  rooms.set(code, room);
  console.log(`[room ${code}] (public/${lang}) creada por matchmaking`);
  return room;
}

function deleteRoomIfEmpty(code) {
  const r = rooms.get(code);
  if (r && r.players.length === 0) {
    r.cleanup();
    rooms.delete(code);
    console.log(`[room ${code}] eliminada`);
  }
}

// ============================================================
// SEND HELPERS
// ============================================================
function sendMsg(ws, msg) {
  if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(msg)); } catch (e) {} }
}

function broadcastToRoom(roomCode, msg, exceptId = null) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const payload = JSON.stringify(msg);
  for (const p of room.players) {
    if (p.id === exceptId) continue;
    const ws = sockets.get(p.id);
    if (ws && ws.readyState === 1) { try { ws.send(payload); } catch (e) {} }
  }
}

// 🔒 Solo a los que ya adivinaron + dibujante (chat post-adivinanza)
function broadcastToWinners(roomCode, msg, exceptId = null) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const payload = JSON.stringify(msg);
  const recipients = new Set([...room.correctGuessers]);
  const drawer = room.getDrawer();
  if (drawer) recipients.add(drawer.id);
  for (const pid of recipients) {
    if (pid === exceptId) continue;
    const ws = sockets.get(pid);
    if (ws && ws.readyState === 1) { try { ws.send(payload); } catch (e) {} }
  }
}

function sendResponse(ws, requestId, payload) {
  if (!requestId) return;
  sendMsg(ws, { type: "response", requestId, ...payload });
}

// ============================================================
// HTTP SERVER (solo /health + /api/stats — sin HTML)
// ============================================================
const httpServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", players: sockets.size, rooms: rooms.size }));
    return;
  }
  if (req.url === "/api/stats") {
    const all = [...rooms.values()];
    const pub = all.filter((r) => r.type === "public");
    const byLang = {};
    for (const r of pub) byLang[r.language] = (byLang[r.language] || 0) + r.players.length;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      rooms: all.length,
      players: all.reduce((s, r) => s + r.players.length, 0),
      publicRooms: pub.length,
      publicPlayers: pub.reduce((s, r) => s + r.players.length, 0),
      byLanguage: byLang,
      uptime: process.uptime(),
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// ============================================================
// WEBSOCKET SERVER
// ============================================================
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  const id = "p" + nextSocketId++;
  ws.socketId = id;
  sockets.set(id, ws);
  console.log(`[+] ${id} conectado · total: ${sockets.size}`);
  sendMsg(ws, { type: "welcome", id });

  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    handleMessage(ws, msg);
  });

  ws.on("close", () => {
    console.log(`[-] ${id} desconectado · total: ${sockets.size - 1}`);
    handleLeave(ws);
    sockets.delete(id);
    lastChatTime.delete(id);
  });

  ws.on("error", () => { try { ws.close(); } catch (e) {} });
});

function handleMessage(ws, msg) {
  switch (msg.type) {
    case "room:quickjoin":   return onQuickJoin(ws, msg);
    case "room:create":      return onCreate(ws, msg);
    case "room:join":        return onJoin(ws, msg);
    case "room:settings":    return onSettings(ws, msg);
    case "room:leave":       return handleLeave(ws);
    case "game:start":       return onGameStart(ws);
    case "game:backToLobby": return onBackToLobby(ws);
    case "game:skip":        return onSkip(ws);
    case "draw:start":       return onDraw(ws, "draw:start", msg);
    case "draw:move":        return onDraw(ws, "draw:move", msg);
    case "draw:end":         return onDraw(ws, "draw:end", null);
    case "draw:undo":        return onDraw(ws, "draw:undo", null);
    case "draw:clear":       return onDraw(ws, "draw:clear", null);
    case "chat:message":     return onChat(ws, msg);
    case "ping":             return sendMsg(ws, { type: "pong", t: msg.t });
  }
}

function onQuickJoin(ws, msg) {
  try {
    const lang = ["es","en","pt"].includes(msg.language) ? msg.language : "es";
    const room = findOrCreatePublicRoom(ws.socketId, lang);
    const player = room.addPlayer(ws.socketId, msg.name);
    if (!player) return sendResponse(ws, msg.requestId, { ok: false, error: "Room full" });
    socketToRoom.set(ws.socketId, room.code);
    sendResponse(ws, msg.requestId, { ok: true, code: room.code, you: player });
    room.broadcastState();
    broadcastToRoom(room.code, {
      type: "chat:new",
      msg: { id: `sys-join-${Date.now()}`, type: "system", text: tr(room.language, "joined", { name: player.name }) },
    });
    if (room.stage === "drawing" || room.stage === "preRound") room.sendStrokesReplayTo(ws.socketId);
    if (room.stage === "waiting" && room.players.length >= MIN_PLAYERS) {
      setTimeout(() => {
        if (rooms.get(room.code) && room.stage === "waiting" && room.players.length >= MIN_PLAYERS) room.startGame();
      }, 1500);
    }
    console.log(`[room ${room.code}] (public/${room.language}) ${player.name} se unió. Total: ${room.players.length}`);
  } catch (e) {
    console.error("quickjoin error", e);
    sendResponse(ws, msg.requestId, { ok: false, error: "Server error" });
  }
}

function onCreate(ws, msg) {
  try {
    const code = uniqueCode(rooms);
    const lang = ["es","en","pt"].includes(msg.language) ? msg.language : "es";
    const room = new Room(code, ws.socketId, "private", lang);
    if (msg.settings) {
      if (["facil","medio","dificil"].includes(msg.settings.difficulty)) room.settings.difficulty = msg.settings.difficulty;
      if ([1,2,3].includes(msg.settings.cycles)) room.settings.cycles = msg.settings.cycles;
    }
    const player = room.addPlayer(ws.socketId, msg.name);
    if (!player) return sendResponse(ws, msg.requestId, { ok: false, error: "Could not create" });
    rooms.set(code, room);
    socketToRoom.set(ws.socketId, code);
    sendResponse(ws, msg.requestId, { ok: true, code, you: player });
    room.broadcastState();
    console.log(`[room ${code}] (private/${lang}) creada por ${player.name}`);
  } catch (e) {
    console.error("create error", e);
    sendResponse(ws, msg.requestId, { ok: false, error: "Server error" });
  }
}

function onJoin(ws, msg) {
  try {
    const code = (msg.code || "").toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return sendResponse(ws, msg.requestId, { ok: false, error: "Room not found" });
    if (room.players.length >= MAX_PLAYERS) return sendResponse(ws, msg.requestId, { ok: false, error: "Room full" });
    if (room.type === "private" && room.stage !== "lobby") return sendResponse(ws, msg.requestId, { ok: false, error: "Game in progress" });
    const player = room.addPlayer(ws.socketId, msg.name);
    if (!player) return sendResponse(ws, msg.requestId, { ok: false, error: "Could not join" });
    socketToRoom.set(ws.socketId, code);
    sendResponse(ws, msg.requestId, { ok: true, code, you: player });
    room.broadcastState();
    broadcastToRoom(code, {
      type: "chat:new",
      msg: { id: `sys-join-${Date.now()}`, type: "system", text: tr(room.language, "joined_room", { name: player.name }) },
    });
    if (room.type === "public" && (room.stage === "drawing" || room.stage === "preRound")) {
      room.sendStrokesReplayTo(ws.socketId);
    }
    if (room.type === "public" && room.stage === "waiting" && room.players.length >= MIN_PLAYERS) {
      setTimeout(() => {
        if (rooms.get(code) && room.stage === "waiting" && room.players.length >= MIN_PLAYERS) room.startGame();
      }, 1500);
    }
  } catch (e) {
    console.error("join error", e);
    sendResponse(ws, msg.requestId, { ok: false, error: "Server error" });
  }
}

function onSettings(ws, msg) {
  const room = getRoomBySocket(ws.socketId);
  if (!room || room.type !== "private" || room.hostId !== ws.socketId || room.stage !== "lobby") return;
  if (msg.settings?.difficulty && ["facil","medio","dificil"].includes(msg.settings.difficulty)) room.settings.difficulty = msg.settings.difficulty;
  if (msg.settings?.cycles && [1,2,3].includes(msg.settings.cycles)) room.settings.cycles = msg.settings.cycles;
  room.broadcastState();
}

function onGameStart(ws) {
  const room = getRoomBySocket(ws.socketId);
  if (!room || room.type !== "private" || room.hostId !== ws.socketId || room.stage !== "lobby") return;
  if (room.players.length < MIN_PLAYERS) return;
  room.startGame();
}

function onBackToLobby(ws) {
  const room = getRoomBySocket(ws.socketId);
  if (!room || room.type !== "private" || room.hostId !== ws.socketId || room.stage !== "gameOver") return;
  room.resetToLobby();
}

function onSkip(ws) { const room = getRoomBySocket(ws.socketId); if (room) room.skipRound(ws.socketId); }

function isDrawer(room, socketId) { return room && room.getDrawer()?.id === socketId && room.stage === "drawing"; }

function onDraw(ws, type, data) {
  const room = getRoomBySocket(ws.socketId);
  if (!isDrawer(room, ws.socketId)) return;
  if (type === "draw:start") room.handleDrawStart(data);
  else if (type === "draw:move") room.handleDrawMove(data);
  else if (type === "draw:end") room.handleDrawEnd();
  else if (type === "draw:undo") room.handleDrawUndo();
  else if (type === "draw:clear") room.handleDrawClear();
  const out = type === "draw:end" || type === "draw:undo" || type === "draw:clear" ? { type } : { type, ...data };
  broadcastToRoom(room.code, out, ws.socketId);
}

function onChat(ws, msg) {
  const room = getRoomBySocket(ws.socketId);
  if (!room) return;
  const now = Date.now();
  if (now - (lastChatTime.get(ws.socketId) || 0) < CHAT_RATE_LIMIT_MS) return;
  lastChatTime.set(ws.socketId, now);

  if (room.stage === "drawing") {
    room.handleGuess(ws.socketId, msg.text);
  } else {
    const player = room.players.find((p) => p.id === ws.socketId);
    if (!player) return;
    const t = (msg.text || "").trim().slice(0, 60);
    if (!t) return;
    broadcastToRoom(room.code, {
      type: "chat:new",
      msg: {
        id: `msg-${Date.now()}-${ws.socketId}`,
        type: "guess",
        playerId: ws.socketId,
        playerName: player.name,
        playerColor: player.color,
        text: t,
      },
    });
  }
}

function handleLeave(ws) {
  const room = getRoomBySocket(ws.socketId);
  if (!room) return;
  socketToRoom.delete(ws.socketId);
  const result = room.removePlayer(ws.socketId);
  if (!result) return;
  const { removed, drawerLeft } = result;
  broadcastToRoom(room.code, {
    type: "chat:new",
    msg: { id: `sys-leave-${Date.now()}`, type: "system", text: tr(room.language, "left", { name: removed.name }) },
  });
  if (drawerLeft && room.stage === "drawing") {
    room.endRound("drawerLeft", null);
  } else if (drawerLeft && room.stage === "preRound") {
    if (room.preRoundTimeout) clearTimeout(room.preRoundTimeout);
    if (room.players.length >= MIN_PLAYERS) {
      room.currentDrawerIdx -= 1;
      room.round -= 1;
      room.startNextRound();
    } else {
      room.stage = room.type === "public" ? "waiting" : "lobby";
      room.broadcastState();
    }
  } else {
    room.broadcastState();
  }
  if (room.players.length < MIN_PLAYERS && room.stage !== "lobby" && room.stage !== "waiting" && room.stage !== "gameOver") {
    if (room.type === "public") {
      room.stopTimer();
      if (room.preRoundTimeout) clearTimeout(room.preRoundTimeout);
      if (room.roundEndTimeout) clearTimeout(room.roundEndTimeout);
      room.stage = "waiting";
      room.currentWord = null;
      broadcastToRoom(room.code, {
        type: "chat:new",
        msg: { id: `sys-empty-${Date.now()}`, type: "system", text: tr(room.language, "waiting") },
      });
      room.broadcastState();
    } else {
      broadcastToRoom(room.code, {
        type: "chat:new",
        msg: { id: `sys-empty-${Date.now()}`, type: "system", text: tr(room.language, "too_few") },
      });
      room.resetToLobby();
    }
  }
  setTimeout(() => deleteRoomIfEmpty(room.code), 2000);
}

setInterval(() => {
  for (const [code, r] of rooms.entries()) {
    if (r.players.length === 0) { r.cleanup(); rooms.delete(code); console.log(`[cleanup] ${code} eliminada`); }
  }
}, 5 * 60 * 1000);

httpServer.listen(PORT, () => {
  console.log(`🎨 Rezopaint WS server (multilang) corriendo en :${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Health:    http://localhost:${PORT}/health`);
  console.log(`   Idiomas:   ES, EN, PT`);
});
