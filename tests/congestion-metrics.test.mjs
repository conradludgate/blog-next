import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceSimulation, createInitialState, serviceCapacity, setClientCount, setWorkerCount, summarizeMetrics, TICK_MS } from '../src/components/congestion/simulation.ts';

test('saturated completion rate matches capacity including dispatch and tick rounding', (t) => {
  t.mock.method(Math, 'random', () => 0.5);
  let state = setClientCount(setWorkerCount(createInitialState('concurrency'), 1), 8);
  const capacity = serviceCapacity(state);
  assert.equal(capacity, 1 / 1.5);
  for (let i = 0; i < 400; i++) state = advanceSimulation(state);
  const before = state.completed;
  for (let i = 0; i < 1200; i++) state = advanceSimulation(state);
  assert.ok(Math.abs((state.completed - before) / 300 - capacity) < 0.02);
  assert.equal(serviceCapacity({ ...state, serviceMs: 10000, workerPerformance: [1], workers: 1 }), 1000 / 10500);
});

test('rejections trigger backoff without becoming successful RTT samples', (t) => {
  t.mock.method(Math, 'random', () => 0.5);
  for (const strategy of ['vegas', 'gradient2']) {
    let state = createInitialState(strategy);
    state.clients[0].endpoints[0].controller = { ...state.clients[0].endpoints[0].controller, limit: 8, minRtt: 3000, shortRtt: 3000, longRtt: 3000 };
    state.jobs = Array.from({ length: 5 }, (_, id) => ({ id, client: 0, service: 0, stage: 'queue', remainingMs: 0, createdAt: 0 }));
    state = advanceSimulation(state);
    const controller = state.clients[0].endpoints[0].controller;
    assert.equal(state.dropped, 1);
    assert.equal(controller.minRtt, 3000);
    assert.equal(controller.sampleCount, 0);
    assert.equal(controller.rttSum, 0);
    assert.equal(controller.warmupSamples, 0);
    assert.ok(controller.limit < 8);
    assert.equal(state.rejectionRate, 1);
    assert.equal(state.latencyMs, null);
    state.jobs = [];
    state = advanceSimulation(state);
    assert.equal(state.rejectionRate, 1, 'a quiet tick must not dilute the rejection ratio');
  }
});

test('display metrics weight requests rather than clients or ticks', () => {
  const metrics = summarizeMetrics([
    { atMs: 250, sent: 10, completed: 9, rejected: 0, latencySumMs: 9000 },
    { atMs: 500, sent: 0, completed: 0, rejected: 1, latencySumMs: 0 },
    { atMs: 750, sent: 0, completed: 1, rejected: 0, latencySumMs: 3000 },
  ], 10000);
  assert.equal(metrics.rejectionRate, 1 / 11);
  assert.equal(metrics.latencyMs, 1200);
  assert.equal(metrics.completedRate, 1);
  assert.equal(metrics.sentRate, 1);
});

test('old outcomes expire and empty windows do not invent measurements', () => {
  let state = createInitialState();
  state.nowMs = 10000;
  state.metricHistory = [{ atMs: TICK_MS, sent: 1, completed: 1, rejected: 0, latencySumMs: 3000 }];
  state = advanceSimulation(state);
  assert.equal(state.completedRate, 0);
  assert.equal(state.latencyMs, null);
  assert.equal(state.rejectionRate, null);
  assert.ok(state.metricHistory.every(bucket => bucket.atMs > state.nowMs - 10000));
});

test('removing clients cancels work without fabricating server rejections or losing recent throughput', () => {
  const state = setClientCount(createInitialState(), 2);
  state.jobs = [{ id: 1, client: 1, service: 0, stage: 'queue', remainingMs: 0, createdAt: 0 }];
  state.queueDepth = 1;
  state.metricHistory = [{ atMs: 250, sent: 1, completed: 1, rejected: 0, latencySumMs: 3000 }];
  const next = setClientCount(state, 1);
  assert.equal(next.dropped, 0);
  assert.equal(next.cancelled, 1);
  assert.equal(next.queueDepth, 0);
  assert.deepEqual(next.metricHistory, state.metricHistory);
});
