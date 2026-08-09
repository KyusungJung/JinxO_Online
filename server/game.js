export const TOPICS = [
  '피자에 많이 추가하는 토핑?', '비 오는 날 생각나는 것?', '여름휴가 때 할 수 있는 것?',
  '냉장고에 꼭 있는 음식?', '아침에 가장 먼저 하는 일?', '여행 가면 사고 싶은 것?',
  '영화관에서 먹는 간식?', '스트레스 받을 때 하는 일?', '주말에 가고 싶은 곳?',
  '친구에게 선물하고 싶은 것?', '학교 또는 회사에서 자주 하는 말?', '밤에 먹고 싶은 야식?'
];
const punctuation = /[\p{P}\p{S}]/gu;
export const normalize = (value = '') => value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(punctuation, '').replace(/\s+/g, '').trim();
export const makeCode = () => Math.random().toString(36).slice(2, 7).toUpperCase();

export function createRoom(code, hostId, hostName, bonus = 3) {
  return { code, hostId, bonus, phase: 'lobby', round: -1, topic: null, players: new Map([[hostId, player(hostId, hostName)]]), submissions: new Map(), topics: shuffle([...TOPICS]), deadline: null, timer: null };
}
function player(id, name) { return { id, name: name.slice(0, 16), connected: true, board: Array(9).fill(null), stars: 0 }; }
function shuffle(values) { for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; } return values; }
export function startRound(room) {
  room.round += 1;
  room.phase = 'answering';
  room.topic = room.topics[room.round % room.topics.length];
  room.submissions.clear();
  room.deadline = Date.now() + 75_000;
}
export function submit(room, id, answers) {
  if (room.phase !== 'answering' || room.submissions.has(id)) return false;
  const usable = answers.map(value => String(value ?? '').trim()).slice(0, 3);
  const normalized = usable.filter(Boolean).map(normalize);
  if (new Set(normalized).size !== normalized.length) return false;
  room.submissions.set(id, usable);
  return true;
}
export function resolveRound(room) {
  if (room.phase !== 'answering') return;
  const groups = new Map();
  for (const [playerId, answers] of room.submissions) {
    for (const answer of answers) {
      const key = normalize(answer);
      if (!key) continue;
      const group = groups.get(key) ?? new Set();
      group.add(playerId); groups.set(key, group);
    }
  }
  for (const [id, p] of room.players) {
    const answers = room.submissions.get(id) ?? [];
    const answersWithState = answers.filter(Boolean).map(answer => {
      const count = groups.get(normalize(answer))?.size ?? 1;
      return { answer, mark: count === 2 ? 'star' : count >= 3 ? 'circle' : 'cross' };
    });
    p.board[room.round] = { answers: answersWithState, mark: answersWithState.some(a => a.mark === 'star') ? 'star' : answersWithState.some(a => a.mark === 'circle') ? 'circle' : 'cross' };
    p.stars += answersWithState.filter(a => a.mark === 'star').length;
  }
  room.phase = room.round === 8 ? 'results' : 'resolving';
  room.deadline = null;
}
export function score(p, bonus = 3) {
  const circles = p.board.filter(cell => cell?.mark === 'circle' || cell?.mark === 'star').length;
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]].filter(line => line.every(index => ['circle','star'].includes(p.board[index]?.mark))).length;
  return { points: circles + p.stars * 2 + lines * bonus, lines, circles, stars: p.stars };
}
export function snapshot(room) {
  return { code: room.code, hostId: room.hostId, phase: room.phase, round: room.round, topic: room.topic, deadline: room.deadline, bonus: room.bonus, players: [...room.players.values()].map(p => ({ ...p, score: score(p, room.bonus) })) };
}
