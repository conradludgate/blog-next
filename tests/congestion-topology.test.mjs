import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceSimulation, chooseEndpoint, createInitialState, sampleTwo, setClientCount, setWorkerCount, WORKER_QUEUE_LIMIT } from '../src/components/congestion/simulation.ts';

function job(id, service, stage = 'queue') {
  return { id, client: 0, service, stage, remainingMs: stage === 'service' ? 10000 : 0, createdAt: 0 };
}

test('each worker has a bounded FIFO; idle neighbours cannot steal queued work', (t) => {
  t.mock.method(Math, 'random', () => 0.5);
  let state = setWorkerCount(createInitialState('rate'), 2);
  state.jobs = [job(100, 0, 'service'), ...Array.from({ length: 6 }, (_, i) => job(101 + i, 0))];
  state.nextJobId = 200;
  state = advanceSimulation(state);
  assert.equal(state.dropped, 2);
  assert.deepEqual(state.jobs.filter(j => j.stage === 'queue').map(j => j.id), [101, 102, 103, 104]);
  assert.equal(state.jobs.filter(j => j.service === 1 && ['service', 'serviceDispatch'].includes(j.stage)).length, 0);
  state.jobs = state.jobs.filter(j => j.id !== 100);
  state = advanceSimulation(state);
  assert.equal(state.jobs.find(j => j.id === 101).stage, 'serviceDispatch');
  assert.equal(state.jobs.find(j => j.id === 101).service, 0);
});

test('Power of Two compares local scores and falls back only within the sampled pair', () => {
  const endpoints = createInitialState().clients[0].endpoints;
  endpoints[0].metrics.latencyMs = 1000;
  endpoints[1].metrics.latencyMs = 2000;
  assert.equal(chooseEndpoint(endpoints, [3, 0, 0, 0], [0, 1], 'rate', 0), 1);
  endpoints[1].tatMs = 1000;
  assert.equal(chooseEndpoint(endpoints, [3, 0, 0, 0], [0, 1], 'rate', 0), 0);
  endpoints[0].tatMs = 1000;
  assert.equal(chooseEndpoint(endpoints, [3, 0, 0, 0], [0, 1], 'rate', 0), undefined);
  assert.equal(chooseEndpoint(endpoints, [1, 0, 0, 0], [0, 1], 'concurrency', 0), 1);
});

test('sampled endpoints are distinct, including the singleton case', () => {
  assert.deepEqual(sampleTwo(1), [0]);
  for (let i = 0; i < 100; i++) {
    const pair = sampleTwo(8);
    assert.notEqual(pair[0], pair[1]);
    assert.ok(pair.every(worker => worker >= 0 && worker < 8));
  }
});

test('blocked demand retains its candidates instead of resampling idle alternatives', (t) => {
  t.mock.method(Math, 'random', () => 0.5);
  let state = createInitialState();
  state.clients[0].pendingChoices = [0, 1];
  state.clients[0].endpoints[0].tatMs = 10000;
  state.clients[0].endpoints[1].tatMs = 10000;
  state = advanceSimulation(state);
  assert.equal(state.jobs.length, 0);
  assert.deepEqual(state.clients[0].pendingChoices, [0, 1]);
});

test('success and rejection update only the originating client–worker controller', (t) => {
  t.mock.method(Math, 'random', () => 0.5);
  let state = setClientCount(createInitialState('vegas'), 2);
  state.clients[0].endpoints[0].controller.limit = 8;
  state.jobs = Array.from({ length: 5 }, (_, i) => job(100 + i, 0));
  const unrelated = structuredClone(state.clients[1].endpoints[0].controller);
  state = advanceSimulation(state);
  assert.equal(state.clients[0].endpoints[0].controller.limit, 4);
  assert.equal(state.clients[0].endpoints[1].controller.limit, 1);
  assert.equal(state.clients[1].endpoints[0].controller.limit, unrelated.limit);
  state.jobs = [{ ...job(200, 1, 'service'), remainingMs: 1, createdAt: state.nowMs - 2750 }];
  state = advanceSimulation(state);
  assert.equal(state.clients[0].endpoints[1].controller.minRtt, 3000);
  assert.equal(state.clients[0].endpoints[0].controller.minRtt, Infinity);
  assert.equal(state.clients[1].endpoints[1].controller.minRtt, Infinity);
});

test('scaling preserves existing endpoint history and cancels removed destinations', () => {
  let state = createInitialState('gradient2');
  const endpoint = state.clients[0].endpoints[0];
  endpoint.controller.minRtt = 3200;
  state = setClientCount(state, 2);
  assert.equal(state.clients[0].endpoints[0], endpoint);
  assert.notEqual(state.clients[1].endpoints[0], endpoint);
  state = setWorkerCount(state, 5);
  assert.equal(state.clients[0].endpoints[0], endpoint);
  assert.equal(state.clients[0].endpoints[4].controller.minRtt, Infinity);
  state.jobs = [job(1, 4, 'network'), job(2, 0, 'queue')];
  state = setWorkerCount(state, 4);
  assert.deepEqual(state.jobs.map(j => j.id), [2]);
  assert.equal(state.cancelled, 1);
  assert.equal(state.dropped, 0);
  assert.equal(state.clients[0].endpoints[0], endpoint);
});

test('all strategies keep valid destinations and bounded queues through fleet changes', (t) => {
  let seed = 17;
  t.mock.method(Math, 'random', () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32));
  for (const strategy of ['rate', 'concurrency', 'aimd', 'vegas', 'gradient2']) {
    let state = setClientCount(createInitialState(strategy), 3);
    for (let tick = 0; tick < 500; tick++) {
      if (tick === 150) state = setWorkerCount(state, 2);
      if (tick === 250) state = setWorkerCount(state, 6);
      state = advanceSimulation(state);
      assert.ok(state.jobs.every(j => j.service >= 0 && j.service < state.workers));
      for (let worker = 0; worker < state.workers; worker++) {
        assert.ok(state.jobs.filter(j => j.service === worker && j.stage === 'queue').length <= WORKER_QUEUE_LIMIT);
      }
      if (strategy === 'concurrency') for (let client = 0; client < 3; client++) {
        for (let worker = 0; worker < state.workers; worker++) assert.ok(state.jobs.filter(j => j.client === client && j.service === worker).length <= 1);
      }
    }
    assert.ok(state.completed > 0);
  }
});
