import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, normalize, resolveRound, score, startRound, submit } from './game.js';

test('normalization ignores case, spaces and punctuation', () => assert.equal(normalize('  Pizza! 토핑 '), normalize('pizza 토핑')));
test('two matching players receive a star and solo answer is cross', () => {
  const room = createRoom('AAAAA', 'a', 'A'); room.players.set('b', { id: 'b', name: 'B', connected: true, board: Array(9).fill(null), stars: 0 });
  startRound(room); assert.equal(submit(room, 'a', ['피자', '', '']), true); assert.equal(submit(room, 'b', [' 피자!', '', '']), true); resolveRound(room);
  assert.equal(room.players.get('a').board[0].mark, 'star'); assert.equal(room.players.get('a').stars, 1);
});
test('a circle line receives configured bingo bonus', () => {
  const p = { board: Array.from({ length: 9 }, (_, i) => i < 3 ? { mark: 'circle' } : { mark: 'cross' }), stars: 0 };
  assert.deepEqual(score(p, 3), { points: 6, lines: 1, circles: 3, stars: 0 });
});
