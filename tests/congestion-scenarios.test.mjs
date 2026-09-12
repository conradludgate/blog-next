import assert from "node:assert/strict";
import { test } from "node:test";
import { setClientCount } from "../src/components/congestion/simulation.ts";
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
	const rate = runScenario({ seed: 17, strategy: "rate", clients: 2, durationMs: 150_000, events: [event], checkpoints: [60_000, 150_000] });
	const concurrency = runScenario({ seed: 17, strategy: "concurrency", clients: 2, durationMs: 150_000, events: [event], checkpoints: [60_000, 150_000] });
	const rateSteady = rate.snapshots.get(150_000);
	const concurrencyTransient = concurrency.snapshots.get(60_000);
	const concurrencySteady = concurrency.snapshots.get(150_000);

	assert.ok(rateSteady.rejectionRate > 0.5, "rate admission continues at the old pace after the slowdown");
	assert.equal(concurrencySteady.dropped, 0, "permits bound outstanding work instead of filling every queue");
	assert.equal(concurrencySteady.rejectionRate, 0);
	assert.ok(concurrencyTransient.sentRate < 2, "longer-held permits reduce transient admission rate");
	assert.ok(concurrencySteady.completedRate < 1.5, "the slower worker capacity is reflected in steady-state throughput");
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
	const options = { seed: 17, clients: 1, durationMs: 180_000, events: [expansion], checkpoints: [60_000, 180_000] };
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
		seed: 17,
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
