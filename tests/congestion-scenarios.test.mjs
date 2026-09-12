import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceSimulation, createInitialState, setClientCount, setClientStrategy, setWorkerCount } from "../src/components/congestion/simulation.ts";
import { runScenario } from "./helpers/simulation-scenario.mjs";

test("scenario runner skips 150 seconds of simulated time without wall-clock waits", () => {
	const { state, snapshots } = runScenario({
		seed: 17,
		strategy: "rate",
		durationMs: 150_000,
		checkpoints: [0, 30_000, 150_000],
	});

	assert.equal(state.nowMs, 150_000);
	assert.deepEqual([...snapshots.keys()], [0, 30_000, 150_000]);
	assert.ok(state.completed > 0);
});

test("fixed rate overloads after client scale-out and stays overloaded", () => {
	const { snapshots } = runScenario({
		seed: 17,
		strategy: "rate",
		clients: 1,
		durationMs: 150_000,
		events: [{ atMs: 30_000, apply: (state) => setClientCount(state, 3) }],
		checkpoints: [30_000, 60_000, 150_000],
	});
	const before = snapshots.get(30_000);
	const transient = snapshots.get(60_000);
	const steady = snapshots.get(150_000);

	assert.equal(before.clients, 3, "the scale-out event is visible at its checkpoint");
	assert.equal(before.dropped, 0, "the prior one-client run is healthy");
	assert.ok(transient.queued > 0, "the transient starts building per-worker queues");
	assert.ok(transient.dropped > 0, "the bounded queues begin rejecting work");
	assert.ok(steady.queued >= transient.queued - 2, "the fixed rate has no mechanism to drain the overload");
	assert.ok(steady.rejectionRate > 0.4, "the trailing window remains rejection-heavy");
});

test("fixed concurrency responds to slower work by lowering admission without sustained rejection", () => {
	const event = { atMs: 30_000, apply: (state) => ({ ...state, serviceMs: 3000 }) };
	const rate = runScenario({ seed: 23, strategy: "rate", clients: 1, durationMs: 150_000, events: [event], checkpoints: [30_000, 60_000, 150_000] });
	const concurrency = runScenario({ seed: 23, strategy: "concurrency", clients: 1, durationMs: 150_000, events: [event], checkpoints: [30_000, 60_000, 150_000] });
	const rateBefore = rate.snapshots.get(30_000);
	const concurrencyBefore = concurrency.snapshots.get(30_000);
	const rateSteady = rate.snapshots.get(150_000);
	const concurrencyTransient = concurrency.snapshots.get(60_000);
	const concurrencySteady = concurrency.snapshots.get(150_000);

	assert.equal(rateBefore.queued, 0, "the rate experiment is healthy before the slowdown");
	assert.equal(rateBefore.dropped, 0);
	assert.equal(concurrencyBefore.queued, 0, "the concurrency comparison begins from the same healthy topology");
	assert.equal(concurrencyBefore.dropped, 0);
	assert.ok(rateSteady.rejectionRate > 0.2, "rate admission continues at the old pace after the slowdown");
	assert.equal(concurrencySteady.dropped, 0, "permits bound outstanding work instead of filling every queue");
	assert.equal(concurrencySteady.rejectionRate, 0);
	assert.ok(concurrencyTransient.sentRate < 2, "longer-held permits reduce transient admission rate");
	assert.ok(concurrencySteady.completedRate < 1.5, "the slower worker capacity is reflected in steady-state throughput");
});

test("per-worker concurrency limits discover added worker capacity without global coordination", () => {
	const { snapshots } = runScenario({
		seed: 17,
		strategy: "concurrency",
		clients: 2,
		workers: 1,
		durationMs: 180_000,
		events: [{ atMs: 60_000, apply: (state) => setWorkerCount(state, 4) }],
		checkpoints: [60_000, 180_000],
	});
	const before = snapshots.get(60_000);
	const steady = snapshots.get(180_000);

	assert.equal(before.workers, 4, "new workers create cold endpoint state in each client");
	assert.ok(steady.completedRate > before.completedRate * 2.5, "each client can use capacity discovered at the new workers");
	assert.equal(steady.dropped, 0, "the extra endpoint windows do not require a shared global limit");
	assert.ok(steady.byWorker.filter((worker) => worker.completedRate > 0).length === 4, "work reaches every worker");
});

test("worker removal cancels only affected work and restored capacity recovers throughput", () => {
	const { snapshots } = runScenario({
		seed: 17,
		strategy: "concurrency",
		clients: 3,
		workers: 4,
		durationMs: 210_000,
		events: [
			{ atMs: 60_000, apply: (state) => setWorkerCount(state, 1) },
			{ atMs: 120_000, apply: (state) => setWorkerCount(state, 4) },
		],
		checkpoints: [60_000, 90_000, 210_000],
	});
	const constrained = snapshots.get(90_000);
	const recovered = snapshots.get(210_000);

	assert.ok(constrained.cancelled > 0, "jobs bound for removed workers are cancelled locally");
	assert.equal(constrained.dropped, 0, "local cancellation is not reported as a server rejection");
	assert.ok(recovered.completedRate > constrained.completedRate * 3, "newly restored endpoints recover aggregate throughput");
	assert.equal(recovered.dropped, 0);
});

test("checkpoints expose client, worker, and client-worker rolling statistics for fairness checks", () => {
	const { snapshots } = runScenario({
		seed: 17,
		strategy: "concurrency",
		clients: 3,
		durationMs: 60_000,
		checkpoints: [60_000],
	});
	const checkpoint = snapshots.get(60_000);

	assert.equal(checkpoint.byEndpoint.length, 3);
	assert.ok(checkpoint.byEndpoint.every((endpoints) => endpoints.length === 4));
	assert.equal(checkpoint.byClient.length, 3);
	assert.equal(checkpoint.byWorker.length, 4);
	assert.ok(checkpoint.byClient.every((client) => client.completedRate > 0));
	assert.ok(checkpoint.byWorker.every((worker) => worker.completedRate > 0));
	assert.ok(checkpoint.clientThroughputFairness > 0 && checkpoint.clientThroughputFairness <= 1);
	assert.ok(checkpoint.workerThroughputFairness > 0 && checkpoint.workerThroughputFairness <= 1);
	assert.ok(Math.abs(checkpoint.byClient.reduce((sum, client) => sum + client.completedRate, 0) - checkpoint.completedRate) < 1e-9);
});

test("Vegas pays less loss and latency than AIMD after a client scale-out", () => {
	const expansion = { atMs: 30_000, apply: (state) => setClientCount(state, 4) };
	const options = { seed: 1, clients: 1, durationMs: 180_000, events: [expansion], checkpoints: [60_000, 180_000] };
	const aimd = runScenario({ ...options, strategy: "aimd" }).snapshots;
	const vegas = runScenario({ ...options, strategy: "vegas" }).snapshots;
	const aimdSteady = aimd.get(180_000);
	const vegasTransient = vegas.get(60_000);
	const vegasSteady = vegas.get(180_000);

	assert.ok(vegasTransient.highestLimit < 3, "delay samples make Vegas retreat after the expansion");
	assert.ok(vegasSteady.dropped < aimdSteady.dropped / 2, "Vegas reaches its steady state with substantially fewer rejected requests");
	assert.ok(vegasSteady.latencyMs < aimdSteady.latencyMs * 0.8, "the smaller queue produces lower steady-state latency");
	assert.ok(vegasSteady.completedRate >= aimdSteady.completedRate - 0.1, "the latency improvement does not sacrifice useful throughput");
});

test("late-arriving Gradient2 clients can retain an uneven throughput share", () => {
	const { snapshots } = runScenario({
		seed: 12,
		strategy: "gradient2",
		clients: 2,
		durationMs: 180_000,
		events: [{ atMs: 60_000, apply: (state) => setClientCount(state, 4) }],
		checkpoints: [60_000, 180_000],
	});
	const steady = snapshots.get(180_000);
	const throughputs = steady.byClient.map((client) => client.completedRate);

	assert.ok(steady.clientThroughputFairness < 0.85, "independent local controllers do not automatically converge on an equal share");
	assert.ok(Math.max(...throughputs) > Math.min(...throughputs) * 2, "the difference is visible in client throughput, not only controller internals");
});

test("a fixed-rate client takes capacity from a competing Vegas client regardless of arrival order", () => {
	function runMixed(firstStrategy, secondStrategy) {
		return runScenario({
			seed: 2,
			strategy: firstStrategy,
			clients: 1,
			workers: 1,
			durationMs: 180_000,
			events: [{ atMs: 60_000, apply: (state) => setClientStrategy(setClientCount(state, 2), 1, secondStrategy) }],
			checkpoints: [180_000],
		}).snapshots.get(180_000);
	}

	const rateFirst = runMixed("rate", "vegas");
	const vegasFirst = runMixed("vegas", "rate");

	assert.deepEqual(rateFirst.byClient.map((client) => client.strategy), ["rate", "vegas"]);
	assert.ok(rateFirst.byClient[0].completedRate > rateFirst.byClient[1].completedRate * 3, "an established fixed-rate sender holds its queue position");
	assert.ok(vegasFirst.byClient[1].completedRate > vegasFirst.byClient[0].completedRate * 3, "the later fixed-rate sender takes the released capacity too");
	assert.ok(rateFirst.clientThroughputFairness < 0.75 && vegasFirst.clientThroughputFairness < 0.75);
});

test("a client joining behind a queue first learns a congested minimum RTT, then needs a clean sample", () => {
	const { snapshots } = runScenario({
		seed: 7,
		strategy: "vegas",
		clients: 2,
		workers: 1,
		durationMs: 120_000,
		events: [{ atMs: 60_000, apply: (state) => setClientCount(state, 3) }],
		checkpoints: [60_000, 70_000, 120_000],
	});
	const joinedDuringCongestion = snapshots.get(70_000).byEndpoint[2][0];
	const afterDrain = snapshots.get(120_000).byEndpoint[2][0];

	assert.ok(joinedDuringCongestion.minRttMs > 3000, "the late client mistakes queued time for its initial baseline");
	assert.equal(afterDrain.minRttMs, 3000, "a later unloaded sample repairs that baseline");
});

test("Gradient2 detects a rising short RTT relative to its long RTT after capacity is removed", () => {
	const { snapshots } = runScenario({
		seed: 17,
		strategy: "gradient2",
		clients: 2,
		workers: 4,
		durationMs: 90_000,
		events: [{ atMs: 60_000, apply: (state) => setWorkerCount(state, 1) }],
		checkpoints: [60_000, 90_000],
	});
	const endpoint = snapshots.get(90_000).byEndpoint[0][0];

	assert.ok(endpoint.shortRttMs > endpoint.longRttMs, "the short EWMA sees the worsening delay before the long EWMA catches up");
	assert.ok(endpoint.limit < 2, "the affected endpoint has reduced its local target");
});

test("a fractional controller target becomes spaced GCRA admissions instead of an integer burst", () => {
	let state = setWorkerCount(createInitialState("gradient2"), 1);
	state.clients[0].endpoints[0].controller.limit = 1.3;

	state = advanceSimulation(state);
	assert.equal(state.nextJobId, 2, "the first request is admitted immediately");
	assert.ok(Math.abs(state.clients[0].endpoints[0].tatMs - 2557.69) < 1, "1.3 requests over a 3 s RTT yields a paced 2.31 s interval");
	for (let tick = 0; tick < 9; tick++) state = advanceSimulation(state);
	assert.equal(state.nowMs, 2500);
	assert.equal(state.nextJobId, 2, "the fractional target does not round up and burst a second request early");
	state = advanceSimulation(state);
	assert.equal(state.nowMs, 2750);
	assert.equal(state.nextJobId, 3, "the next request is admitted once the theoretical-arrival clock permits it");
});

test("the final scale-and-slowdown scenario recovers under Vegas while fixed rate stays overloaded", () => {
	const events = [
		{ atMs: 30_000, apply: (state) => setClientCount(state, 3) },
		{ atMs: 60_000, apply: (state) => ({ ...state, serviceMs: 3000 }) },
		{ atMs: 120_000, apply: (state) => ({ ...state, serviceMs: 1000 }) },
	];
	const options = { seed: 17, clients: 1, workers: 4, durationMs: 240_000, events, checkpoints: [90_000, 240_000] };
	const rate = runScenario({ ...options, strategy: "rate" }).snapshots;
	const vegas = runScenario({ ...options, strategy: "vegas" }).snapshots;
	const rateSteady = rate.get(240_000);
	const vegasSteady = vegas.get(240_000);

	assert.ok(rateSteady.rejectionRate > 0.5, "the old fixed rate remains above the recovered workers' safe load");
	assert.ok(rateSteady.latencyMs > 8000, "the fixed-rate queues persist after the service-time recovery");
	assert.equal(vegasSteady.rejectionRate, 0, "Vegas eventually drains its queue rather than retaining loss as a steady state");
	assert.ok(vegasSteady.latencyMs < rateSteady.latencyMs * 0.7, "adaptive pacing recovers a much shorter request path");
	assert.ok(vegasSteady.dropped < rateSteady.dropped / 10, "the recovery prevents most of the fixed-rate loss");
});
