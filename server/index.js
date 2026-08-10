import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createRoom, makeCode, nextShare, resolveRound, shareAnswer, snapshot, startRound, submit } from './game.js';

const app = express(); const http = createServer(app); const io = new Server(http, { cors: { origin: process.env.CLIENT_ORIGIN?.split(',') ?? true } });
const rooms = new Map(); const bonus = Number(process.env.BINGO_BONUS ?? 3);
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
app.use(express.static('dist'));
app.get('/{*splat}', (_req, res) => res.sendFile('index.html', { root: 'dist' }));
function broadcast(room) { io.to(room.code).emit('room:update', snapshot(room)); }
function roomFor(code) { return rooms.get(code?.toUpperCase()); }
function schedule(room) { clearTimeout(room.timer); room.timer = setTimeout(() => finish(room), Math.max(0, room.deadline - Date.now())); }
function scheduleNextRound(room) { if (room.phase === 'resolving') setTimeout(() => { startRound(room); schedule(room); broadcast(room); }, 5_000); }
function finish(room) { if (room.phase !== 'answering') return; resolveRound(room); broadcast(room); scheduleNextRound(room); }
io.on('connection', socket => {
  socket.on('room:create', ({ name, playerId }, done) => {
    if (!name?.trim() || !playerId) return done({ error: '닉네임을 입력해 주세요.' });
    let code; do { code = makeCode(); } while (rooms.has(code)); const room = createRoom(code, playerId, name, bonus); rooms.set(code, room); socket.join(code); socket.data = { code, playerId }; done({ room: snapshot(room), playerId });
  });
  socket.on('room:join', ({ code, name, playerId }, done) => {
    const room = roomFor(code); if (!room) return done({ error: '방을 찾을 수 없어요.' });
    let p = room.players.get(playerId);
    if (!p && room.players.size >= 10) return done({ error: '방이 가득 찼어요.' });
    if (!p) { if (room.phase !== 'lobby') return done({ error: '이미 시작한 게임이에요.' }); p = { id: playerId, name: name.slice(0, 16), connected: true, board: Array(9).fill(null), stars: 0 }; room.players.set(playerId, p); }
    p.connected = true; socket.join(room.code); socket.data = { code: room.code, playerId }; broadcast(room); done({ room: snapshot(room), playerId });
  });
  socket.on('room:topics', ({ code, playerId, topics }, done) => {
    const room = roomFor(code); if (!room || room.hostId !== playerId || room.phase !== 'lobby') return done?.({ error: '방장만 시작 전에 주제를 설정할 수 있어요.' });
    const cleaned = (topics ?? []).map(topic => String(topic ?? '').trim()).filter(Boolean).slice(0, 3);
    if (cleaned.some(topic => topic.length > 64) || new Set(cleaned.map(topic => topic.toLocaleLowerCase('ko-KR'))).size !== cleaned.length) return done?.({ error: '주제는 64자 이내로 서로 다르게 입력해 주세요.' });
    room.customTopics = cleaned; broadcast(room); done?.({ ok: true });
  });
  socket.on('game:start', ({ code, playerId }, done) => { const room = roomFor(code); if (!room || room.hostId !== playerId) return done?.({ error: '방장만 시작할 수 있어요.' }); if (room.players.size < 2) return done?.({ error: '2명부터 시작할 수 있어요.' }); startRound(room); schedule(room); broadcast(room); done?.({ ok: true }); });
  socket.on('answers:submit', ({ code, playerId, answers, slots }, done) => { const room = roomFor(code); if (!room || !submit(room, playerId, answers ?? [], slots ?? [])) return done?.({ error: '빈 칸 3개를 고르고, 두 어절 이하의 서로 다른 답을 입력해 주세요.' }); if ([...room.players.keys()].every(id => room.submissions.has(id) || !room.players.get(id).connected)) finish(room); else broadcast(room); done?.({ ok: true }); });
  socket.on('answer:share', ({ code, playerId, slot }, done) => { const room = roomFor(code); if (!room || !shareAnswer(room, playerId, slot)) return done?.({ error: '내 차례에 아직 공개하지 않은 이번 주제의 답을 골라 주세요.' }); broadcast(room); done?.({ ok: true }); });
  socket.on('sharing:next', ({ code, playerId }, done) => { const room = roomFor(code); if (!room || !nextShare(room, playerId)) return done?.({ error: '답을 고른 참가자만 다음 순서로 넘길 수 있어요.' }); broadcast(room); scheduleNextRound(room); done?.({ ok: true }); });
  socket.on('game:rematch', ({ code, playerId }, done) => { const room = roomFor(code); if (!room || room.hostId !== playerId || room.phase !== 'results') return done?.({ error: '재대결을 시작할 수 없어요.' }); for (const p of room.players.values()) { p.board = Array(9).fill(null); p.stars = 0; } room.round = -1; startRound(room); schedule(room); broadcast(room); done?.({ ok: true }); });
  socket.on('disconnect', () => { const room = roomFor(socket.data?.code); const p = room?.players.get(socket.data?.playerId); if (p) { p.connected = false; broadcast(room); } });
});
http.listen(process.env.PORT ?? 3000, () => console.log('JinxO server ready'));
