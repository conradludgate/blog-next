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
}

export interface ClientState {
	controller: ControllerState;
	rateCredit: number;
	metrics: ClientMetrics;
}

export interface ClientMetrics {
	sentRate: number;
	latencyMs: number;
	rejectionRate: number;
	sentInWindow: number;
	sentWindowMs: number;
}

export interface Job {
	id: number;
	client: number;
	stage: JobStage;
	remainingMs: number;
	createdAt: number;
	service?: number;
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
	latencyMs: number;
	dropped: number;
	completed: number;
	sentRate: number;
	nowMs: number;
}

export const SHARED_QUEUE_LIMIT = 16;
export const MAX_CLIENTS = 8;
export const MAX_WORKERS = 8;
export const TICK_MS = 250;
export const ROUTING_MS = 500;
export const WORKER_TRAVEL_MS = 350;
export const BASELINE_LATENCY_MS = 2750;
export const RATE_PER_CLIENT = 0.5;
export const FIXED_CONCURRENCY_PER_CLIENT = 4;
export const MAX_CONTROLLER_LIMIT = 16;
export const METRIC_EWMA_ALPHA = 0.2;
export const METRIC_SAMPLE_WINDOW_MS = 2000;

// These values are deliberately tuned for the simulator's small, slow system:
// four workers, roughly 4 jobs/s of capacity, and a ~2.75s unloaded RTT.
export const VEGAS_SAMPLE_SIZE = 4;
export const VEGAS_ALPHA = 0.25;
export const VEGAS_BETA = 0.75;
export const GRADIENT2_SAMPLE_SIZE = 4;
export const GRADIENT2_SHORT_ALPHA = 0.35;
export const GRADIENT2_LONG_ALPHA = 0.08;
export const GRADIENT2_RISING_THRESHOLD = 1.03;
export const GRADIENT2_TARGET_QUEUE = 0.5;
export const GRADIENT2_MAX_QUEUE = 1.5;
export const GRADIENT2_PROBE_STEP = 0.5;
export const GRADIENT2_LIMIT_ALPHA = 0.35;
export const GRADIENT2_BACKOFF_FACTOR = 0.7;

function createController(kind: ControllerKind): ControllerState {
	return {
		kind,
		// Adaptive clients begin with one request so their first RTT samples can
		// establish an unloaded baseline before they probe for more capacity.
		limit: kind === "concurrency" ? FIXED_CONCURRENCY_PER_CLIENT : 1,
		minRtt: Number.POSITIVE_INFINITY,
		shortRtt: 0,
		longRtt: 0,
		sampleCount: 0,
		rttSum: 0,
	};
}

function createClient(kind: ControllerKind): ClientState {
	return {
		controller: createController(kind),
		rateCredit: 0,
		metrics: {
			sentRate: 0,
			latencyMs: BASELINE_LATENCY_MS,
			rejectionRate: 0,
			sentInWindow: 0,
			sentWindowMs: 0,
		},
	};
}

export function createInitialState(strategy: ControllerKind = "rate"): SimulationState {
	return {
		strategy,
		clients: [createClient(strategy)],
		workers: 4,
		serviceMs: 1000,
		networkMs: 900,
		workerPerformance: [1, 1, 1, 1],
		jobs: [],
		nextJobId: 1,
		queueDepth: 0,
		latencyMs: BASELINE_LATENCY_MS,
		dropped: 0,
		completed: 0,
		sentRate: 0,
		nowMs: 0,
	};
}

function randomWorker(workerCount: number): number {
	return Math.floor(Math.random() * workerCount);
}

function randomPerformance(): number {
	return 0.75 + Math.random() * 0.5;
}

function fluctuatePerformance(performance: number): number {
	return Math.max(0.7, Math.min(1.35, performance * (0.9 + Math.random() * 0.2)));
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

export function serviceCapacity(state: SimulationState, performance = state.workerPerformance): number {
	const capacity = performance.reduce(
		(total, factor) => total + 1000 / (state.serviceMs * factor),
		0,
	);

	return Math.max(1, Math.floor(capacity));
}

function updateController(controller: ControllerState, rttMs: number, dropped: boolean): ControllerState {
	if (controller.kind === "rate" || controller.kind === "concurrency") {
		return controller;
	}

	const next = {
		...controller,
		minRtt: Math.min(controller.minRtt, rttMs),
		sampleCount: controller.sampleCount + 1,
		rttSum: controller.rttSum + rttMs,
	};

	if (dropped) {
		return {
			...next,
			limit: clamp(next.limit * (controller.kind === "gradient2" ? 0.7 : 0.5), 1, MAX_CONTROLLER_LIMIT),
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

	const shortRtt = next.shortRtt === 0 ? rttMs : ewma(next.shortRtt, rttMs, GRADIENT2_SHORT_ALPHA);
	const longRtt = next.longRtt === 0 ? rttMs : ewma(next.longRtt, rttMs, GRADIENT2_LONG_ALPHA);
	if (next.sampleCount < GRADIENT2_SAMPLE_SIZE) {
		return { ...next, shortRtt, longRtt };
	}

	const divergence = shortRtt / Math.max(longRtt, 1);
	const queueEstimate = next.limit * (1 - next.minRtt / Math.max(shortRtt, 1));
	const backingOff = divergence >= GRADIENT2_RISING_THRESHOLD || queueEstimate > GRADIENT2_MAX_QUEUE;
	const holding = queueEstimate >= GRADIENT2_TARGET_QUEUE;
	const targetLimit = backingOff
		? next.limit * GRADIENT2_BACKOFF_FACTOR
		: holding
			? next.limit
			: next.limit + GRADIENT2_PROBE_STEP;

	return {
		...next,
		limit: clamp(ewma(next.limit, targetLimit, GRADIENT2_LIMIT_ALPHA), 1, MAX_CONTROLLER_LIMIT),
		shortRtt,
		longRtt,
		sampleCount: 0,
		rttSum: 0,
	};
}

function clientLimit(client: ClientState, strategy: ControllerKind): number {
	if (strategy === "concurrency") {
		return FIXED_CONCURRENCY_PER_CLIENT;
	}

	return Math.max(1, Math.floor(client.controller.limit));
}

function ewma(previous: number, sample: number, alpha = METRIC_EWMA_ALPHA): number {
	return previous + alpha * (sample - previous);
}

function updateClients(
	clients: ClientState[],
	samples: Array<{ client: number; rttMs: number; dropped: boolean }>,
	sentByClient: number[],
): ClientState[] {
	return clients.map((client, index) => {
		const clientSamples = samples.filter((sample) => sample.client === index);
		const successfulSamples = clientSamples.filter((sample) => !sample.dropped);
		const droppedCount = clientSamples.length - successfulSamples.length;
		const averageRtt = successfulSamples.length > 0
			? successfulSamples.reduce((total, sample) => total + sample.rttMs, 0) / successfulSamples.length
			: client.metrics.latencyMs;
		const requestCount = clientSamples.length;
		const rejectionRate = requestCount > 0 ? droppedCount / requestCount : 0;
		const sentInWindow = client.metrics.sentInWindow + sentByClient[index];
		const sentWindowMs = client.metrics.sentWindowMs + TICK_MS;
		const hasRateSample = sentWindowMs >= METRIC_SAMPLE_WINDOW_MS;
		const controller = clientSamples.reduce(
			(current, sample) => updateController(current, sample.rttMs, sample.dropped),
			client.controller,
		);

		return {
			...client,
			controller,
			metrics: {
				sentRate: hasRateSample
					? ewma(client.metrics.sentRate, sentInWindow * (1000 / sentWindowMs))
					: client.metrics.sentRate,
				latencyMs: successfulSamples.length > 0 ? ewma(client.metrics.latencyMs, averageRtt) : client.metrics.latencyMs,
				rejectionRate: ewma(client.metrics.rejectionRate, rejectionRate),
				sentInWindow: hasRateSample ? 0 : sentInWindow,
				sentWindowMs: hasRateSample ? 0 : sentWindowMs,
			},
		};
	});
}

export function setStrategy(current: SimulationState, strategy: ControllerKind): SimulationState {
	const next = createInitialState(strategy);
	return {
		...next,
		workers: current.workers,
		workerPerformance: current.workerPerformance.slice(0, current.workers),
		clients: current.clients.map(() => createClient(strategy)),
	};
}

export function setClientCount(current: SimulationState, count: number): SimulationState {
	const clients = clamp(count, 1, MAX_CLIENTS);
	if (clients === current.clients.length) {
		return current;
	}

	const resizedClients = current.clients.length < clients
		? [...current.clients, ...Array.from({ length: clients - current.clients.length }, () => createClient(current.strategy))]
		: current.clients.slice(0, clients);
	const removedJobs = current.jobs.filter((job) => job.client >= clients);
	const jobs = current.jobs.filter((job) => job.client < clients);

	return { ...current, clients: resizedClients, jobs, dropped: current.dropped + removedJobs.length };
}

export function setWorkerCount(current: SimulationState, count: number): SimulationState {
	const workers = clamp(count, 1, MAX_WORKERS);
	if (workers === current.workers) {
		return current;
	}

	const workerPerformance = workers > current.workers
		? [...current.workerPerformance, ...Array.from({ length: workers - current.workers }, randomPerformance)]
		: current.workerPerformance.slice(0, workers);
	const jobs = current.jobs.map((job) => (
		job.service !== undefined && job.service >= workers
			? { ...job, stage: "network" as const, service: undefined, queueSlot: undefined, remainingMs: current.networkMs }
			: job
	));

	return { ...current, workers, workerPerformance, jobs, queueDepth: jobs.filter((job) => job.stage === "queue").length };
}

export function advanceSimulation(current: SimulationState): SimulationState {
	const nowMs = current.nowMs + TICK_MS;
	const workerPerformance = current.workerPerformance.map(fluctuatePerformance);
	const completedSamples: Array<{ client: number; rttMs: number; dropped: boolean }> = [];
	const progressedJobs = current.jobs
		.map((job): Job | null => {
			const remainingMs = job.remainingMs - TICK_MS;

			if (job.stage === "service" && remainingMs <= 0) {
				completedSamples.push({ client: job.client, rttMs: nowMs - job.createdAt, dropped: false });
				return null;
			}

			if (job.stage === "network" && remainingMs <= 0) {
				return { ...job, stage: "routing", service: undefined, remainingMs: ROUTING_MS };
			}

			if (job.stage === "routing" && remainingMs <= 0) {
				return { ...job, stage: "queue", remainingMs: 0 };
			}

			if (job.stage === "serviceDispatch" && remainingMs <= 0) {
				return { ...job, stage: "service", remainingMs: Math.max(100, Math.round(current.serviceMs * workerPerformance[job.service ?? 0])) };
			}

			return { ...job, remainingMs };
		})
		.filter((job): job is Job => job !== null);

	let jobs = [...progressedJobs];
	const waitingJobs = jobs.filter((job) => job.stage === "queue");
	const rejectedJobs = waitingJobs.slice(SHARED_QUEUE_LIMIT);
	for (const job of rejectedJobs) {
		completedSamples.push({ client: job.client, rttMs: nowMs - job.createdAt, dropped: true });
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
	let dispatchedJobs = 0;
	while (availableWorkers.length > 0) {
		const nextJobIndex = jobs.findIndex((job) => job.stage === "queue");
		if (nextJobIndex === -1) {
			break;
		}

		const workerPosition = randomWorker(availableWorkers.length);
		const [worker] = availableWorkers.splice(workerPosition, 1);
		jobs[nextJobIndex] = {
			...jobs[nextJobIndex],
			stage: "serviceDispatch",
			service: worker,
			queueSlot: dispatchedJobs,
			remainingMs: WORKER_TRAVEL_MS,
		};
		dispatchedJobs += 1;
	}

	const sentByClient = current.clients.map(() => 0);
	let nextJobId = current.nextJobId;
	const rateCredits = current.clients.map((client) => client.rateCredit + (current.strategy === "rate" ? RATE_PER_CLIENT * (TICK_MS / 1000) : 0));
	const inFlights = current.clients.map((_, clientIndex) => jobs.filter((job) => job.client === clientIndex).length);
	let admitted = true;
	while (admitted) {
		admitted = false;
		// Interleave admissions so the shared FIFO reflects fair arrival order rather
		// than whichever client happens to be first in the array.
		current.clients.forEach((client, clientIndex) => {
			const limit = clientLimit(client, current.strategy);
			const shouldSend = current.strategy === "rate" ? rateCredits[clientIndex] >= 1 : inFlights[clientIndex] < limit;
			if (!shouldSend) return;

			jobs.push({ id: nextJobId, client: clientIndex, stage: "network", remainingMs: current.networkMs, createdAt: nowMs });
			nextJobId += 1;
			sentByClient[clientIndex] += 1;
			inFlights[clientIndex] += 1;
			if (current.strategy === "rate") {
				rateCredits[clientIndex] -= 1;
			}
			admitted = true;
		});
	}
	const clientsWithJobs = current.clients.map((client, clientIndex) => ({ ...client, rateCredit: rateCredits[clientIndex] }));
	const clients = updateClients(clientsWithJobs, completedSamples, sentByClient);

	const queueDepth = jobs.filter((job) => job.stage === "queue").length;
	const sentRate = clients.reduce((total, client) => total + client.metrics.sentRate, 0);
	const latencyMs = clients.reduce((total, client) => total + client.metrics.latencyMs, 0) / clients.length;

	return {
		...current,
		clients,
		workerPerformance,
		jobs,
		nextJobId,
		queueDepth,
		latencyMs,
		dropped: current.dropped + rejectedJobs.length,
		completed: current.completed + completedSamples.filter((sample) => !sample.dropped).length,
		sentRate,
		nowMs,
	};
}
