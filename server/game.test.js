import test from 'node:test';
import assert from 'node:assert/strict';
import { TOPICS, createRoom, markForMatch, nextShare, normalize, resolveRound, score, shareAnswer, startRound, submit } from './game.js';

function shareAll(room) { while (room.phase === 'sharing') { const id = room.sharing.turnOrder[room.sharing.turnIndex % room.sharing.turnOrder.length]; const slot = room.players.get(id).board.findIndex(cell => cell && !cell.shared); assert.equal(shareAnswer(room, id, slot), true); assert.equal(nextShare(room, id), true); } }

test('normalization ignores case, spaces and punctuation', () => assert.equal(normalize('  Pizza! 토핑 '), normalize('pizza 토핑')));
test('default topic catalog contains 36 topics', () => assert.equal(TOPICS.length, 36));
test('one topic fills three chosen board cells; matching two gets a star and solo answer is cross', () => {
  const room = createRoom('AAAAA', 'a', 'A'); room.players.set('b', { id: 'b', name: 'B', connected: true, board: Array(9).fill(null), stars: 0 });
  startRound(room); assert.equal(submit(room, 'a', ['피자', '콜라', '감자'], [8, 4, 0]), true); assert.equal(submit(room, 'b', [' 피자!', '치즈', '감자'], [1, 2, 3]), true); resolveRound(room);
  assert.deepEqual([room.players.get('a').board[8].mark, room.players.get('a').board[4].mark, room.players.get('a').board[0].mark], ['star', 'cross', 'star']); assert.equal(room.players.get('a').stars, 2);
  assert.equal(room.phase, 'resolving');
});
test('the third topic completes a nine-cell board and results', () => {
  const room = createRoom('AAAAA', 'a', 'A');
  const slotsByTopic = [[8, 0, 4], [3, 1, 7], [2, 6, 5]];
  for (let round = 0; round < 3; round += 1) { startRound(room); submit(room, 'a', [`a${round}`, `b${round}`, `c${round}`], slotsByTopic[round]); resolveRound(room); if (round === 2) shareAll(room); else assert.equal(room.phase, 'resolving'); }
  assert.equal(room.phase, 'results'); assert.equal(room.board, undefined); assert.equal(room.players.get('a').board.filter(Boolean).length, 9);
});
test('one read shares matching answers and skips duplicate reads', () => {
  const room = createRoom('AAAAA', 'a', 'A'); room.players.set('b', { id: 'b', name: 'B', connected: true, board: Array(9).fill(null), stars: 0 });
  for (let round = 0; round < 3; round += 1) {
    startRound(room);
    const aAnswers = round === 2 ? ['공통', 'a여덟', 'a아홉'] : [`a${round}가`, `a${round}나`, `a${round}다`];
    const bAnswers = round === 2 ? ['공통', 'b여덟', 'b아홉'] : [`b${round}가`, `b${round}나`, `b${round}다`];
    const slots = [round * 3, round * 3 + 1, round * 3 + 2]; assert.equal(submit(room, 'a', aAnswers, slots), true); assert.equal(submit(room, 'b', bAnswers, slots), true); resolveRound(room);
  }
  assert.equal(room.phase, 'sharing'); assert.equal(shareAnswer(room, 'a', 6), true); assert.equal(nextShare(room, 'a'), true);
  assert.equal(room.players.get('a').board[6].shared, true); assert.equal(room.players.get('b').board[6].shared, true); assert.equal(room.sharing.readCount, 1); assert.equal(shareAnswer(room, 'b', 6), false);
});
test('answers require empty distinct cells, two words or fewer, and no reuse on a board', () => {
  const room = createRoom('AAAAA', 'a', 'A'); startRound(room);
  assert.equal(submit(room, 'a', ['세 어절 답', '둘', '셋'], [0, 1, 2]), false);
  assert.equal(submit(room, 'a', ['하나', '둘', '셋'], [0, 0, 2]), false);
  assert.equal(submit(room, 'a', ['하나', '둘', '셋'], [0, 1, 2]), true); resolveRound(room); startRound(room);
  assert.equal(submit(room, 'a', ['하나', '넷', '다섯'], [3, 4, 5]), false);
});
test('a circle line receives configured bingo bonus', () => {
  const p = { board: Array.from({ length: 9 }, (_, i) => i < 3 ? { mark: 'circle' } : { mark: 'cross' }), stars: 0 };
  assert.deepEqual(score(p, 3), { points: 6, lines: 1, circles: 3, stars: 0 });
});
test('stars are worth two points without also counting as circles', () => {
  const p = { board: [{ mark: 'star' }, { mark: 'star' }, { mark: 'cross' }, ...Array(6).fill({ mark: 'cross' })], stars: 2 };
  assert.deepEqual(score(p, 3), { points: 4, lines: 0, circles: 0, stars: 2 });
});
test('large-room rules reward 2–3 matches, downgrade 4–5 matches, and reject 6+ crowd answers', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(count => markForMatch(count, true)), ['cross', 'star', 'star', 'circle', 'circle', 'crowd']);
});
test('host custom topics are used before random topics', () => {
  const room = createRoom('AAAAA', 'a', 'A'); room.customTopics = ['우리 주제']; startRound(room);
  assert.equal(room.topic, '우리 주제');
});
