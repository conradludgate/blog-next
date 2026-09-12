import {
	advanceSimulation,
	createInitialState,
	setClientCount,
	setWorkerCount,
	DISPLAY_WINDOW_MS,
	summarizeBreakdown,
} from "../../src/components/congestion/simulation.ts";

function zeroMetrics() {
	return { sent: 0, completed: 0, rejected: 0, latencySumMs: 0 };
}

function addMetrics(total, next) {
	return {
		sent: total.sent + next.sent,
		completed: total.completed + next.completed,
		rejected: total.rejected + next.rejected,
		latencySumMs: total.latencySumMs + next.latencySumMs,
	};
}

function rates(metrics, durationMs) {
	const outcomes = metrics.completed + metrics.rejected;
	return {
		sentRate: metrics.sent * 1000 / durationMs,
		completedRate: metrics.completed * 1000 / durationMs,
		rejectionRate: outcomes > 0 ? metrics.rejected / outcomes : null,
		latencyMs: metrics.completed > 0 ? metrics.latencySumMs / metrics.completed : null,
	};
}

function capture(state) {
	const limits = state.clients.flatMap((client) => client.endpoints.map((endpoint) => endpoint.controller.limit));
	const durationMs = Math.min(state.nowMs, DISPLAY_WINDOW_MS);
	const endpointMetrics = state.clients.map((client, clientIndex) => client.endpoints.map((endpoint, worker) => {
		const rolling = state.metricHistory.reduce((total, bucket) => addMetrics(total,
			bucket.endpoints?.[clientIndex]?.[worker] ?? zeroMetrics()), zeroMetrics());
		const jobs = state.jobs.filter((job) => job.client === clientIndex && job.service === worker);
		return {
			client: clientIndex,
			worker,
			strategy: client.strategy,
			...rolling,
			...rates(rolling, durationMs),
			inFlight: jobs.length,
			queued: jobs.filter((job) => job.stage === "queue").length,
			limit: endpoint.controller.limit,
			minRttMs: endpoint.controller.minRtt,
			shortRttMs: endpoint.controller.shortRtt,
			longRttMs: endpoint.controller.longRtt,
			gradientTrendSamples: endpoint.controller.gradient2TrendSamples,
			backoffCooldown: endpoint.controller.gradient2BackoffCooldown,
			observedRttMs: endpoint.metrics.latencyMs,
		};
	}));
	const clients = endpointMetrics.map((endpoints, clientIndex) => {
		const rolling = endpoints.reduce(addMetrics, zeroMetrics());
		return { strategy: state.clients[clientIndex].strategy, ...rolling, ...rates(rolling, durationMs), inFlight: endpoints.reduce((sum, endpoint) => sum + endpoint.inFlight, 0), queued: endpoints.reduce((sum, endpoint) => sum + endpoint.queued, 0) };
	});
	const workers = state.workerPerformance.map((_, worker) => {
		const endpoints = endpointMetrics.map((client) => client[worker]);
		const rolling = endpoints.reduce(addMetrics, zeroMetrics());
		return { ...rolling, ...rates(rolling, durationMs), inFlight: endpoints.reduce((sum, endpoint) => sum + endpoint.inFlight, 0), queued: endpoints.reduce((sum, endpoint) => sum + endpoint.queued, 0) };
	});
	const breakdown = summarizeBreakdown(state);
	const clientsWithDisplayMetrics = clients.map((client, index) => ({ ...client, ...breakdown.byClient[index] }));
	const workersWithDisplayMetrics = workers.map((worker, index) => ({ ...worker, ...breakdown.byWorker[index] }));
	return {
		nowMs: state.nowMs,
		clients: state.clients.length,
		workers: state.workers,
		serviceMs: state.serviceMs,
		queued: state.queueDepth,
		completed: state.completed,
		dropped: state.dropped,
		cancelled: state.cancelled,
		sentRate: state.sentRate,
		completedRate: state.completedRate,
		rejectionRate: state.rejectionRate,
		latencyMs: state.latencyMs,
		lowestLimit: Math.min(...limits),
		highestLimit: Math.max(...limits),
		byEndpoint: endpointMetrics,
		byClient: clientsWithDisplayMetrics,
		byWorker: workersWithDisplayMetrics,
		clientThroughputFairness: breakdown.clientThroughputFairness,
		workerThroughputFairness: breakdown.workerThroughputFairness,
	};
}

/**
 * Advance simulated time synchronously. There are no timers here: a 150-second
 * scenario is 600 calls to advanceSimulation and normally takes milliseconds.
 * Events occur immediately before the tick beginning at their timestamp.
 */
export function runScenario({
	seed = 1,
	strategy = "rate",
	clients = 1,
	workers = 4,
	durationMs,
	events = [],
	checkpoints = [],
}) {
	if (durationMs % 250 !== 0) throw new Error("durationMs must be a whole simulation tick");
	for (const time of [...checkpoints, ...events.map((event) => event.atMs)]) {
		if (time % 250 !== 0) throw new Error("events and checkpoints must be whole simulation ticks");
	}

	const scheduled = [...events].sort((a, b) => a.atMs - b.atMs);
	const wanted = new Set(checkpoints);
	const snapshots = new Map();
	let state = setWorkerCount(setClientCount(createInitialState(strategy, seed), clients), workers);
	let nextEvent = 0;
	for (;;) {
		while (scheduled[nextEvent]?.atMs === state.nowMs) {
			state = scheduled[nextEvent++].apply(state);
		}
		if (wanted.has(state.nowMs)) snapshots.set(state.nowMs, capture(state));
		if (state.nowMs === durationMs) return { state, snapshots };
		state = advanceSimulation(state);
	}
}
