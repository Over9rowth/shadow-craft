'use strict';
const test = require('node:test');
const assert = require('node:assert');
const g = require('../src/domain/geometry.cjs');

test('位似比例：纸点 = 灯 + (d/h)×(墙点-灯)', () => {
  const p = g.wallToPaper({ x: 10, y: 0 }, { x: 0, y: 0 }, 0.2);
  assert.ok(Math.abs(p.x - 2) < 1e-9 && Math.abs(p.y) < 1e-9);
});

test('位似中心不动点：墙上位于灯正下方的点映射到自身', () => {
  const L = { x: 3, y: 4 };
  const p = g.wallToPaper({ x: 3, y: 4 }, L, 0.35);
  assert.ok(Math.abs(p.x - 3) < 1e-9 && Math.abs(p.y - 4) < 1e-9);
});

test('比例单调：d 越小纸越小', () => {
  const W = { x: 10, y: 10 }, L = { x: 0, y: 0 };
  const near = g.wallToPaper(W, L, 0.1), far = g.wallToPaper(W, L, 0.5);
  assert.ok(Math.hypot(near.x, near.y) < Math.hypot(far.x, far.y));
});

test('包围盒映射保持中心对齐（灯在原点、影子居中）', () => {
  const b = g.paperBounds({ x0: -10, y0: -5, x1: 10, y1: 5 }, { x: 0, y: 0 }, 0.25);
  assert.deepEqual([b.x0, b.y0, b.x1, b.y1], [-2.5, -1.25, 2.5, 1.25]);
});

test('validate：d>=h 非法，正常组合合法', () => {
  assert.ok(g.validate(100, 120).length > 0);
  assert.ok(g.validate(100, 100).length > 0);
  assert.ok(g.validate(100, 20).length === 0);
  assert.ok(g.validate(0, 20).length > 0);
});
