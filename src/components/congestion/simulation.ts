export type ControllerKind = "rate" | "concurrency" | "aimd" | "vegas" | "gradient2";

export type JobStage = "network" | "routing" | "queue" | "serviceDispatch" | "service";

export interface ControllerState {
	kind: ControllerKind;
	limit: number;
	minRtt: number;
	shortRtt: number;
	longRtt: number;
	sampleCount: number;
	rttSum: number;
	warmupSamples: number;
	gradient2ElapsedMs: number;
	gradient2TrendSamples: number;
	gradient2BackoffCooldown: number;
}

export interface EndpointState {
	observed: boolean;
	controller: ControllerState;
	tatMs: number;
	metrics: ClientMetrics;
}

export interface ClientState {
	endpoints: EndpointState[];
	// Keep the same two candidates while admission is blocked: no unlimited resampling.
	pendingChoices?: number[];
}

export interface ClientMetrics {
	latencyMs: number;
}

export interface MetricBucket {
	atMs: number;
	sent: number;
	completed: number;
	rejected: number;
	latencySumMs: number;
}

export interface Job {
	id: number;
	client: number;
	stage: JobStage;
	remainingMs: number;
	createdAt: number;
	service: number;
	queueSlot?: number;
}

export interface SimulationState {
	strategy: ControllerKind;
	clients: ClientState[];
	workers: number;
	serviceMs: number;
	networkMs: number;
	workerPerformance: number[];
	jobs: Job[];
	nextJobId: number;
	queueDepth: number;
	latencyMs: number | null;
	completedRate: number;
	rejectionRate: number | null;
	metricHistory: MetricBucket[];
	cancelled: number;
	dropped: number;
	completed: number;
	sentRate: number;
	nowMs: number;
}

export const WORKER_QUEUE_LIMIT = 4;
export const MAX_CLIENTS = 8;
export const MAX_WORKERS = 8;
export const TICK_MS = 250;
export const ROUTING_MS = 500;
export const WORKER_TRAVEL_MS = 350;
export const BASELINE_LATENCY_MS = 3000;
export const RATE_PER_ENDPOINT = 0.5;
export const FIXED_CONCURRENCY_PER_ENDPOINT = 1;
export const MAX_CONTROLLER_LIMIT = 16;
export const METRIC_EWMA_ALPHA = 0.2;
export const DISPLAY_WINDOW_MS = 10000;

// These values are deliberately tuned for the simulator's small, slow system:
// four workers, roughly 2.67 jobs/s including dispatch, and a ~3s unloaded RTT.
export const VEGAS_SAMPLE_SIZE = 4;
export const VEGAS_ALPHA = 0.25;
export const VEGAS_BETA = 0.75;
export const GRADIENT2_SAMPLE_SIZE = 1;
export const GRADIENT2_SHORT_ALPHA = 0.35;
export const GRADIENT2_LONG_ALPHA = 0.08;
export const GRADIENT2_RISING_THRESHOLD = 1.05;
export const GRADIENT2_STABLE_THRESHOLD = 1.02;
export const GRADIENT2_TREND_SAMPLES = 3;
export const GRADIENT2_PROBE_STEP = 1;
export const GRADIENT2_LIMIT_ALPHA = 0.35;
export const GRADIENT2_BACKOFF_FACTOR = 0.8;
export const GRADIENT2_BACKOFF_COOLDOWN = 8;
export const GRADIENT2_MAX_LIMIT = 12;
export const GRADIENT2_CONTROL_INTERVAL_MS = 1000;
export const GRADIENT2_TARGET_QUEUE = 0.75;
export const GCRA_MAX_RATE = 4;

function createController(kind: ControllerKind): ControllerState {
	return {
		kind,
		// Adaptive clients begin with one request so their first RTT samples can
		// establish an unloaded baseline before they probe for more capacity.
		limit: kind === "concurrency" ? FIXED_CONCURRENCY_PER_ENDPOINT : 1,
		minRtt: Number.POSITIVE_INFINITY,
		shortRtt: 0,
		longRtt: 0,
		sampleCount: 0,
		rttSum: 0,
		warmupSamples: 0,
		gradient2ElapsedMs: 0,
		gradient2TrendSamples: 0,
		gradient2BackoffCooldown: 0,
	};
}

function createEndpoint(kind: ControllerKind): EndpointState {
	return {
		observed: false,
		controller: createController(kind),
		tatMs: 0,
		metrics: {
			latencyMs: BASELINE_LATENCY_MS,
		},
	};
}

function createClient(kind: ControllerKind, workers: number): ClientState {
	return { endpoints: Array.from({ length: workers }, () => createEndpoint(kind)) };
}

export function createInitialState(strategy: ControllerKind = "rate"): SimulationState {
	return {
		strategy,
		clients: [createClient(strategy, 4)],
		workers: 4,
		serviceMs: 1000,
		networkMs: 900,
		workerPerformance: [1, 1, 1, 1],
		jobs: [],
		nextJobId: 1,
		queueDepth: 0,
		latencyMs: null,
		completedRate: 0,
		rejectionRate: null,
		metricHistory: [],
		cancelled: 0,
		dropped: 0,
		completed: 0,
		sentRate: 0,
		nowMs: 0,
	};
}

export function sampleTwo(workerCount: number): number[] {
	const first = Math.floor(Math.random() * workerCount);
	if (workerCount === 1) return [first];
	const other = Math.floor(Math.random() * (workerCount - 1));
	return [first, other >= first ? other + 1 : other];
}

export function chooseEndpoint(endpoints: EndpointState[], inFlights: number[], choices: number[], strategy: ControllerKind, nowMs: number): number | undefined {
	const ranked = [...choices].sort((a, b) =>
		(inFlights[a] + 1) * endpoints[a].metrics.latencyMs - (inFlights[b] + 1) * endpoints[b].metrics.latencyMs);
	return ranked.find((worker) => strategy === "concurrency"
		? inFlights[worker] < clientLimit(endpoints[worker], strategy)
		: nowMs >= endpoints[worker].tatMs);
}

function randomPerformance(): number {
	return 0.75 + Math.random() * 0.5;
}

function fluctuatePerformance(performance: number): number {
	const meanReversion = (1 - performance) * 0.08;
	const jitter = (Math.random() - 0.5) * 0.08;
	return clamp(performance + meanReversion + jitter, 0.75, 1.25);
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function serviceDurationMs(serviceMs: number, factor: number): number {
	return Math.max(100, Math.round(serviceMs * factor));
}

function tickDuration(milliseconds: number): number {
	return Math.ceil(milliseconds / TICK_MS) * TICK_MS;
}

export function serviceCapacity(state: SimulationState, performance = state.workerPerformance): number {
	// Dispatch reserves a worker. Both dispatch and processing advance in whole
	// ticks; inbound network/routing can overlap work and do not reserve it.
	return performance.reduce((total, factor) => total + 1000 / (
		tickDuration(WORKER_TRAVEL_MS) + tickDuration(serviceDurationMs(state.serviceMs, factor))
	), 0);
}

export function summarizeMetrics(history: MetricBucket[], nowMs: number) {
	const durationMs = Math.min(nowMs, DISPLAY_WINDOW_MS);
	const totals = history.reduce((sum, bucket) => ({
		sent: sum.sent + bucket.sent,
		completed: sum.completed + bucket.completed,
		rejected: sum.rejected + bucket.rejected,
		latencySumMs: sum.latencySumMs + bucket.latencySumMs,
	}), { sent: 0, completed: 0, rejected: 0, latencySumMs: 0 });
	const outcomes = totals.completed + totals.rejected;
	return {
		sentRate: durationMs > 0 ? totals.sent * 1000 / durationMs : 0,
		completedRate: durationMs > 0 ? totals.completed * 1000 / durationMs : 0,
		rejectionRate: outcomes > 0 ? totals.rejected / outcomes : null,
		latencyMs: totals.completed > 0 ? totals.latencySumMs / totals.completed : null,
	};
}

function updateController(controller: ControllerState, rttMs: number | undefined, dropped: boolean): ControllerState {
	if (controller.kind === "rate" || controller.kind === "concurrency") {
		return controller;
	}

	const hasRttSample = !dropped && rttMs !== undefined && Number.isFinite(rttMs);
	const next = {
		...controller,
		minRtt: hasRttSample ? Math.min(controller.minRtt, rttMs) : controller.minRtt,
		sampleCount: controller.sampleCount + (hasRttSample ? 1 : 0),
		rttSum: controller.rttSum + (hasRttSample ? rttMs : 0),
		warmupSamples: controller.warmupSamples + (hasRttSample && !dropped ? 1 : 0),
	};

	if (dropped) {
		return {
			...next,
			limit: clamp(next.limit * (controller.kind === "gradient2" ? 0.7 : 0.5), 1, MAX_CONTROLLER_LIMIT),
			gradient2TrendSamples: 0,
			gradient2BackoffCooldown: controller.kind === "gradient2" ? GRADIENT2_BACKOFF_COOLDOWN : 0,
			gradient2ElapsedMs: controller.kind === "gradient2" ? 0 : controller.gradient2ElapsedMs,
		};
	}

	if (controller.kind === "aimd") {
		return { ...next, limit: clamp(controller.limit + 1 / Math.max(1, controller.limit), 1, MAX_CONTROLLER_LIMIT) };
	}

	if (controller.kind === "vegas") {
		if (next.sampleCount < VEGAS_SAMPLE_SIZE) {
			return next;
		}

		const averageRtt = next.rttSum / next.sampleCount;
		const queueEstimate = next.limit * (1 - next.minRtt / averageRtt);
		const limit = queueEstimate < VEGAS_ALPHA
			? next.limit + 1
			: queueEstimate > VEGAS_BETA
				? next.limit - 1
				: next.limit;

		return { ...next, limit: clamp(limit, 1, MAX_CONTROLLER_LIMIT), sampleCount: 0, rttSum: 0 };
	}

	const shortRtt = hasRttSample
		? next.shortRtt === 0 ? rttMs : ewma(next.shortRtt, rttMs, GRADIENT2_SHORT_ALPHA)
		: next.shortRtt;
	const longRtt = hasRttSample
		? next.longRtt === 0 ? rttMs : ewma(next.longRtt, rttMs, GRADIENT2_LONG_ALPHA)
		: next.longRtt;
	if (shortRtt === 0 || (hasRttSample && next.sampleCount < GRADIENT2_SAMPLE_SIZE)) {
		return { ...next, shortRtt, longRtt };
	}
	if (next.gradient2ElapsedMs < GRADIENT2_CONTROL_INTERVAL_MS) {
		return { ...next, shortRtt, longRtt };
	}

	const cooldown = Math.max(0, next.gradient2BackoffCooldown - 1);
	const divergence = shortRtt / Math.max(longRtt, 1);
	// A backoff starts a new observation period. Do not keep accumulating the
	// old trend while cooling down. Queue pressure is evaluated separately so a
	// high-limit client continues to correct even after its RTT trend flattens.
	const trendSamples = cooldown > 0
		? 0
		: divergence >= GRADIENT2_RISING_THRESHOLD
			? next.gradient2TrendSamples + 1
			: divergence <= GRADIENT2_STABLE_THRESHOLD
				? Math.max(0, next.gradient2TrendSamples - 1)
				: next.gradient2TrendSamples;
	const queueEstimate = next.limit * (1 - next.minRtt / Math.max(shortRtt, 1));
	const backingOff = cooldown === 0 && (
		trendSamples >= GRADIENT2_TREND_SAMPLES
		|| queueEstimate > GRADIENT2_TARGET_QUEUE
	);
	// After a backoff, stable trend is enough to resume a slow additive probe.
	// Requiring the absolute RTT to return to baseline here permanently starves
	// a cold client when another client keeps the shared queue warm.
	const probing = cooldown === 0 && divergence <= GRADIENT2_STABLE_THRESHOLD && !backingOff;
	// A rising RTT is not just a boolean congestion signal. The ratio to the
	// client's own minimum RTT tells us how far its target overshot the current
	// operating point. Applying that ratio to the local limit makes a large,
	// aggressive client give up proportionally more work than a small client.
	const delayBackoffFactor = Math.min(
		GRADIENT2_BACKOFF_FACTOR,
		next.minRtt / Math.max(shortRtt, 1),
	);
	const targetLimit = backingOff
		? next.limit * delayBackoffFactor
		: probing
			? next.limit + GRADIENT2_PROBE_STEP
			: next.limit;

	return {
		...next,
		limit: clamp(ewma(next.limit, targetLimit, GRADIENT2_LIMIT_ALPHA), 1, GRADIENT2_MAX_LIMIT),
		shortRtt,
		longRtt,
		gradient2TrendSamples: backingOff ? 0 : trendSamples,
		gradient2BackoffCooldown: backingOff ? GRADIENT2_BACKOFF_COOLDOWN : cooldown,
		gradient2ElapsedMs: 0,
		sampleCount: 0,
		rttSum: 0,
	};
}

function clientLimit(client: EndpointState, strategy: ControllerKind): number {
	if (strategy === "concurrency") {
		return FIXED_CONCURRENCY_PER_ENDPOINT;
	}

	return Math.max(1, Math.floor(client.controller.limit));
}

function ewma(previous: number, sample: number, alpha = METRIC_EWMA_ALPHA): number {
	return previous + alpha * (sample - previous);
}

function clientRate(client: EndpointState, strategy: ControllerKind): number {
	if (strategy === "rate") {
		return RATE_PER_ENDPOINT;
	}
	if (strategy === "concurrency") {
		return 0;
	}

	const lawRate = client.controller.limit * (1000 / Math.max(client.metrics.latencyMs, 1));
	return clamp(lawRate, 0.1, GCRA_MAX_RATE);
}

function updateEndpoints(
	clients: EndpointState[],
	samples: Array<{ service: number; rttMs: number; dropped: boolean }>,
): EndpointState[] {
	return clients.map((client, index) => {
		const clientSamples = samples.filter((sample) => sample.service === index);
		const successfulSamples = clientSamples.filter((sample) => !sample.dropped);
		const averageRtt = successfulSamples.length > 0
			? successfulSamples.reduce((total, sample) => total + sample.rttMs, 0) / successfulSamples.length
			: client.metrics.latencyMs;
		let controller = {
			...client.controller,
			gradient2ElapsedMs: client.controller.gradient2ElapsedMs + TICK_MS,
		};
		controller = clientSamples.reduce(
			(current, sample) => updateController(current, sample.rttMs, sample.dropped),
			controller,
		);
		// Gradient2 changes its target on a wall-clock cadence, not once per
		// completion. This gives a high-RPS client and a low-RPS client the same
		// number of probe opportunities while each still supplies its own RTT.
		if (controller.kind === "gradient2") {
			controller = updateController(controller, undefined, false);
		}

		return {
			...client,
			observed: client.observed || successfulSamples.length > 0,
			controller,
			metrics: {
				latencyMs: successfulSamples.length > 0 ? ewma(client.metrics.latencyMs, averageRtt) : client.metrics.latencyMs,
			},
		};
	});
}

export function setStrategy(current: SimulationState, strategy: ControllerKind): SimulationState {
	const next = createInitialState(strategy);
	return {
		...next,
		workers: current.workers,
		serviceMs: current.serviceMs,
		networkMs: current.networkMs,
		workerPerformance: current.workerPerformance.slice(0, current.workers),
		clients: current.clients.map(() => createClient(strategy, current.workers)),
	};
}

export function setClientCount(current: SimulationState, count: number): SimulationState {
	const clients = clamp(count, 1, MAX_CLIENTS);
	if (clients === current.clients.length) {
		return current;
	}

	const resizedClients = current.clients.length < clients
		? [...current.clients, ...Array.from({ length: clients - current.clients.length }, () => createClient(current.strategy, current.workers))]
		: current.clients.slice(0, clients);
	const removedJobs = current.jobs.filter((job) => job.client >= clients);
	const jobs = current.jobs.filter((job) => job.client < clients);

	return { ...current, clients: resizedClients, jobs, cancelled: current.cancelled + removedJobs.length, queueDepth: jobs.filter((job) => job.stage === "queue").length };
}

export function setWorkerCount(current: SimulationState, count: number): SimulationState {
	const workers = clamp(count, 1, MAX_WORKERS);
	if (workers === current.workers) {
		return current;
	}

	const workerPerformance = workers > current.workers
		? [...current.workerPerformance, ...Array.from({ length: workers - current.workers }, randomPerformance)]
		: current.workerPerformance.slice(0, workers);
	// Removed endpoints fail locally; already assigned jobs never jump queues.
	const jobs = current.jobs.filter((job) => job.service < workers);
	const clients = current.clients.map((client) => ({
		...client,
		endpoints: workers > current.workers
			? [...client.endpoints, ...Array.from({ length: workers - current.workers }, () => createEndpoint(current.strategy))]
			: client.endpoints.slice(0, workers),
		pendingChoices: client.pendingChoices?.filter((worker) => worker < workers),
	}));
	return { ...current, clients, workers, workerPerformance, jobs,
		cancelled: current.cancelled + current.jobs.length - jobs.length,
		queueDepth: jobs.filter((job) => job.stage === "queue").length };

}

export function advanceSimulation(current: SimulationState): SimulationState {
	const nowMs = current.nowMs + TICK_MS;
	const workerPerformance = current.workerPerformance.map(fluctuatePerformance);
	const completedSamples: Array<{ client: number; service: number; rttMs: number; dropped: boolean }> = [];
	const progressedJobs = current.jobs
		.map((job): Job | null => {
			const remainingMs = job.remainingMs - TICK_MS;

			if (job.stage === "service" && remainingMs <= 0) {
				completedSamples.push({ client: job.client, service: job.service, rttMs: nowMs - job.createdAt, dropped: false });
				return null;
			}

			if (job.stage === "network" && remainingMs <= 0) {
				return { ...job, stage: "routing", remainingMs: ROUTING_MS };
			}

			if (job.stage === "routing" && remainingMs <= 0) {
				return { ...job, stage: "queue", remainingMs: 0 };
			}

			if (job.stage === "serviceDispatch" && remainingMs <= 0) {
				return { ...job, stage: "service", remainingMs: serviceDurationMs(current.serviceMs, workerPerformance[job.service ?? 0]) };
			}

			return { ...job, remainingMs };
		})
		.filter((job): job is Job => job !== null);

	let jobs = [...progressedJobs];
	const waitingJobs = jobs.filter((job) => job.stage === "queue");
	const rejectedJobs = Array.from({ length: current.workers }, (_, worker) =>
		waitingJobs.filter((job) => job.service === worker).slice(WORKER_QUEUE_LIMIT)
	).flat();
	for (const job of rejectedJobs) {
		completedSamples.push({ client: job.client, service: job.service, rttMs: nowMs - job.createdAt, dropped: true });
	}
	const rejectedIds = new Set(rejectedJobs.map((job) => job.id));
	jobs = jobs.filter((job) => !rejectedIds.has(job.id));

	const occupiedWorkers = new Set(
		jobs
			.filter((job) => (job.stage === "service" || job.stage === "serviceDispatch") && job.service !== undefined)
			.map((job) => job.service),
	);
	const availableWorkers = Array.from({ length: current.workers }, (_, worker) => worker)
		.filter((worker) => !occupiedWorkers.has(worker));
	for (const worker of availableWorkers) {
		const nextJobIndex = jobs.findIndex((job) => job.stage === "queue" && job.service === worker);
		if (nextJobIndex === -1) continue;
		jobs[nextJobIndex] = {
			...jobs[nextJobIndex], stage: "serviceDispatch", queueSlot: 0,
			remainingMs: WORKER_TRAVEL_MS,
		};
	}

	const sentByClient = current.clients.map(() => Array(current.workers).fill(0) as number[]);
	let nextJobId = current.nextJobId;
	const clients = current.clients.map((client, clientIndex) => {
		const endpoints = updateEndpoints(client.endpoints,
			completedSamples.filter((sample) => sample.client === clientIndex));
		return { ...client, endpoints };
	});
	// A saturated upstream source waits with one pair of candidates. Each newly
	// admitted request may sample again, but a blocked request keeps its pair.
	// Rotate the first client to avoid a permanent array-order tie advantage.
	for (let offset = 0; offset < clients.length; offset++) {
		const clientIndex = (offset + Math.floor(nowMs / TICK_MS)) % clients.length;
		const client = clients[clientIndex];
		const inFlights = client.endpoints.map((_, worker) => jobs.filter((job) => job.client === clientIndex && job.service === worker).length);
		for (let attempt = 0; attempt < current.workers * MAX_CONTROLLER_LIMIT; attempt++) {
			const choices = client.pendingChoices?.length ? client.pendingChoices : sampleTwo(current.workers);
			const worker = chooseEndpoint(client.endpoints, inFlights, choices, current.strategy, nowMs);
			if (worker === undefined) {
				client.pendingChoices = choices;
				break;
			}
			client.pendingChoices = undefined;
			jobs.push({ id: nextJobId++, client: clientIndex, service: worker, stage: "network", remainingMs: current.networkMs, createdAt: nowMs });
			sentByClient[clientIndex][worker]++;
			inFlights[worker]++;
			const endpoint = client.endpoints[worker];
			if (current.strategy !== "concurrency") {
				endpoint.tatMs = nowMs + 1000 / clientRate(endpoint, current.strategy);
			}
		}
	}

	const queueDepth = jobs.filter((job) => job.stage === "queue").length;
	const successfulSamples = completedSamples.filter((sample) => !sample.dropped);
	const metricHistory = [...current.metricHistory.filter((bucket) => bucket.atMs > nowMs - DISPLAY_WINDOW_MS), {
		atMs: nowMs,
		sent: sentByClient.flat().reduce((total, count) => total + count, 0),
		completed: successfulSamples.length,
		rejected: rejectedJobs.length,
		latencySumMs: successfulSamples.reduce((total, sample) => total + sample.rttMs, 0),
	}];

	return {
		...current,
		clients,
		workerPerformance,
		jobs,
		nextJobId,
		queueDepth,
		metricHistory,
		...summarizeMetrics(metricHistory, nowMs),
		dropped: current.dropped + rejectedJobs.length,
		completed: current.completed + completedSamples.filter((sample) => !sample.dropped).length,
		nowMs,
	};
}
