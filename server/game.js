export const TOPICS = [
  '피자에 많이 추가하는 토핑?', '비 오는 날 생각나는 것?', '여름휴가 때 할 수 있는 것?',
  '냉장고에 꼭 있는 음식?', '아침에 가장 먼저 하는 일?', '여행 가면 사고 싶은 것?',
  '영화관에서 먹는 간식?', '스트레스 받을 때 하는 일?', '주말에 가고 싶은 곳?',
  '친구에게 선물하고 싶은 것?', '학교 또는 회사에서 자주 하는 말?', '밤에 먹고 싶은 야식?',
  '카페에서 자주 시키는 메뉴?', '집에 꼭 있어야 하는 물건?', '봄에 떠오르는 것?',
  '겨울에 하고 싶은 것?', '비밀로 하고 싶은 습관?', '가장 좋아하는 과일?',
  '라면에 넣고 싶은 재료?', '잠이 안 올 때 하는 일?', '사진 찍기 좋은 장소?',
  '친구와 만나면 가장 먼저 하는 일?', '하루 중 가장 좋아하는 시간?', '기분 전환이 필요할 때 하는 일?',
  '어릴 때 좋아했던 간식?', '집에서 가장 편한 장소?', '가방 안에 늘 있는 물건?',
  '운동하면 떠오르는 것?', '마법이 가능하다면 하고 싶은 것?', 'SNS에 올리고 싶은 순간?',
  '가장 듣고 싶은 칭찬?', '비 오는 날 먹고 싶은 음식?', '여행에 꼭 챙기는 물건?',
  '갑자기 시간이 생기면 하고 싶은 것?', '오늘 저녁 먹고 싶은 메뉴?', '가장 좋아하는 계절과 이유는?'
];
const punctuation = /[\p{P}\p{S}]/gu;
export const normalize = (value = '') => value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(punctuation, '').replace(/\s+/g, '').trim();
export const makeCode = () => Math.random().toString(36).slice(2, 7).toUpperCase();
export const isLargeRoom = room => room.players.size >= 8;
export function markForMatch(count, largeRoom) {
  if (largeRoom) return count >= 6 ? 'crowd' : count >= 4 ? 'circle' : count >= 2 ? 'star' : 'cross';
  return count === 2 ? 'star' : count >= 3 ? 'circle' : 'cross';
}

export function createRoom(code, hostId, hostName, bonus = 3) {
  return { code, hostId, bonus, phase: 'lobby', round: -1, topic: null, customTopics: [], players: new Map([[hostId, player(hostId, hostName)]]), submissions: new Map(), sharing: null, topics: shuffle([...TOPICS]), deadline: null, timer: null };
}
function player(id, name) { return { id, name: name.slice(0, 16), connected: true, board: Array(9).fill(null), stars: 0 }; }
function shuffle(values) { for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; } return values; }
export function startRound(room) {
  room.round += 1;
  room.phase = 'answering';
  room.topic = room.customTopics[room.round] ?? room.topics[room.round % room.topics.length];
  room.submissions.clear();
  room.deadline = Date.now() + 75_000;
}
export function submit(room, id, answers, slots) {
  if (room.phase !== 'answering' || room.submissions.has(id)) return false;
  const p = room.players.get(id); if (!p) return false;
  const usable = (Array.isArray(answers) ? answers : []).map(value => String(value ?? '').trim()).slice(0, 3);
  const normalized = usable.filter(Boolean).map(normalize);
  const usableSlots = (Array.isArray(slots) ? slots : []).map(Number).slice(0, 3);
  if (usable.length !== 3 || usable.some(answer => !answer || answer.split(/\s+/).length > 2) || new Set(normalized).size !== 3 || new Set(usableSlots).size !== 3 || usableSlots.some(slot => !Number.isInteger(slot) || slot < 0 || slot > 8 || p.board[slot])) return false;
  if (p.board.some(cell => cell && normalized.includes(normalize(cell.answer)))) return false;
  room.submissions.set(id, { answers: usable, slots: usableSlots });
  return true;
}
export function resolveRound(room) {
  if (room.phase !== 'answering') return;
  const groups = new Map();
  for (const [playerId, submission] of room.submissions) {
    for (const answer of submission.answers) {
      const key = normalize(answer);
      if (!key) continue;
      const group = groups.get(key) ?? new Set();
      group.add(playerId); groups.set(key, group);
    }
  }
  const largeRoom = isLargeRoom(room);
  for (const [id, p] of room.players) {
    const submission = room.submissions.get(id) ?? { answers: [], slots: [] };
    const answersWithState = Array.from({ length: 3 }, (_value, index) => {
      const answer = submission.answers[index] ?? '';
      const count = answer ? groups.get(normalize(answer))?.size ?? 1 : 1;
      return { slot: submission.slots[index], answer, mark: markForMatch(count, largeRoom) };
    });
    answersWithState.forEach(cell => { if (Number.isInteger(cell.slot)) p.board[cell.slot] = { answer: cell.answer, mark: cell.mark, topic: room.topic, topicIndex: room.round, shared: false }; });
    p.stars += answersWithState.filter(a => a.mark === 'star').length;
  }
  room.phase = 'sharing';
  room.sharing = { turnOrder: [...room.players.values()].filter(p => p.connected).map(p => p.id), turnIndex: 0, selected: null };
  room.deadline = null;
}
export function shareAnswer(room, id, slot) {
  if (room.phase !== 'sharing' || room.sharing?.turnOrder[room.sharing.turnIndex % room.sharing.turnOrder.length] !== id || room.sharing.selected) return false;
  const cell = room.players.get(id)?.board[Number(slot)];
  if (!cell || cell.shared || cell.topicIndex !== room.round) return false;
  room.sharing.selected = { playerId: id, slot: Number(slot) };
  return true;
}
export function nextShare(room, id) {
  if (room.phase !== 'sharing' || room.sharing?.selected?.playerId !== id) return false;
  const selectedPlayer = room.players.get(id); const selected = selectedPlayer?.board[room.sharing.selected.slot];
  if (!selected) return false;
  selected.shared = true; room.sharing.selected = null; room.sharing.turnIndex += 1;
  if (room.sharing.turnIndex >= room.sharing.turnOrder.length * 3) { room.phase = room.round === 2 ? 'results' : 'resolving'; room.sharing = null; }
  return true;
}
export function score(p, bonus = 3) {
  const circles = p.board.filter(cell => cell?.mark === 'circle').length;
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]].filter(line => line.every(index => ['circle','star'].includes(p.board[index]?.mark))).length;
  return { points: circles + p.stars * 2 + lines * bonus, lines, circles, stars: p.stars };
}
export function snapshot(room) {
  const selected = room.sharing?.selected;
  const selectedCell = selected && room.players.get(selected.playerId)?.board[selected.slot];
  return { code: room.code, hostId: room.hostId, phase: room.phase, round: room.round, topic: room.topic, customTopics: room.customTopics, deadline: room.deadline, bonus: room.bonus, largeRoom: isLargeRoom(room), sharing: room.sharing && { currentPlayerId: room.sharing.turnOrder[room.sharing.turnIndex % room.sharing.turnOrder.length], selected: selected && { ...selected, answer: selectedCell?.answer, topic: selectedCell?.topic, topicIndex: selectedCell?.topicIndex } }, players: [...room.players.values()].map(p => ({ ...p, score: score(p, room.bonus) })) };
}
