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
}

export interface Job {
	id: number;
	client: number;
	stage: JobStage;
	remainingMs: number;
	createdAt: number;
	service?: number;
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
	sentInWindow: number;
	windowMs: number;
	nowMs: number;
}

export const QUEUE_LIMIT_PER_WORKER = 4;
export const MAX_CLIENTS = 8;
export const MAX_WORKERS = 8;
export const TICK_MS = 250;
export const ROUTING_MS = 500;
export const WORKER_TRAVEL_MS = 350;
export const RATE_PER_CLIENT = 0.5;
export const FIXED_CONCURRENCY_PER_CLIENT = 4;
export const MAX_CONTROLLER_LIMIT = 16;

function createController(kind: ControllerKind): ControllerState {
	return {
		kind,
		limit: kind === "concurrency" ? FIXED_CONCURRENCY_PER_CLIENT : kind === "rate" ? 1 : 2,
		minRtt: Number.POSITIVE_INFINITY,
		shortRtt: 0,
		longRtt: 0,
		sampleCount: 0,
		rttSum: 0,
	};
}

function createClient(kind: ControllerKind): ClientState {
	return { controller: createController(kind), rateCredit: 0 };
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
		latencyMs: 1900,
		dropped: 0,
		completed: 0,
		sentRate: 0,
		sentInWindow: 0,
		windowMs: 0,
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

	if (next.sampleCount < 4) {
		return next;
	}

	if (controller.kind === "vegas") {
		const averageRtt = next.rttSum / next.sampleCount;
		const queueEstimate = next.limit * (1 - next.minRtt / averageRtt);
		const limit = queueEstimate < 2 ? next.limit + 1 : queueEstimate > 4 ? next.limit - 1 : next.limit;

		return { ...next, limit: clamp(limit, 1, MAX_CONTROLLER_LIMIT), sampleCount: 0, rttSum: 0 };
	}

	const shortRtt = next.shortRtt === 0 ? rttMs : next.shortRtt * 0.7 + rttMs * 0.3;
	const longRtt = next.longRtt === 0 ? rttMs : next.longRtt * 0.95 + rttMs * 0.05;
	const gradient = clamp(longRtt / Math.max(shortRtt, 1), 0.5, 1);
	const targetLimit = gradient * next.limit + 1;

	return {
		...next,
		limit: clamp(next.limit * 0.8 + targetLimit * 0.2, 1, MAX_CONTROLLER_LIMIT),
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

function updateClientControllers(clients: ClientState[], completed: Array<{ client: number; rttMs: number; dropped: boolean }>): ClientState[] {
	return clients.map((client, index) => {
		const samples = completed.filter((sample) => sample.client === index);
		return samples.reduce(
			(current, sample) => ({ ...current, controller: updateController(current.controller, sample.rttMs, sample.dropped) }),
			client,
		);
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

	const nextClients = current.clients.length < clients
		? [...current.clients, ...Array.from({ length: clients - current.clients.length }, () => createClient(current.strategy))]
		: current.clients.slice(0, clients);
	const jobs = current.jobs.map((job) => ({ ...job, client: Math.min(job.client, clients - 1) }));

	return { ...current, clients: nextClients, jobs };
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
			? { ...job, stage: "network" as const, service: undefined, remainingMs: current.networkMs }
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
				return { ...job, stage: "routing", service: randomWorker(current.workers), remainingMs: ROUTING_MS };
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
	const rejectedJobs = waitingJobs.filter((job) => {
		if (job.service === undefined) {
			return true;
		}

		return waitingJobs.filter((candidate) => candidate.service === job.service).findIndex((candidate) => candidate.id === job.id) >= QUEUE_LIMIT_PER_WORKER;
	});
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
	for (let worker = 0; worker < current.workers; worker += 1) {
		if (occupiedWorkers.has(worker)) {
			continue;
		}

		const nextJobIndex = jobs.findIndex((job) => job.stage === "queue" && job.service === worker);
		if (nextJobIndex === -1) {
			continue;
		}

		jobs[nextJobIndex] = { ...jobs[nextJobIndex], stage: "serviceDispatch", remainingMs: WORKER_TRAVEL_MS };
		occupiedWorkers.add(worker);
	}

	const clients = updateClientControllers(current.clients, completedSamples);
	let sent = 0;
	let nextJobId = current.nextJobId;
	const clientsWithJobs = clients.map((client, clientIndex) => {
		let rateCredit = client.rateCredit;
		let inFlight = jobs.filter((job) => job.client === clientIndex).length;
		if (current.strategy === "rate") {
			rateCredit += RATE_PER_CLIENT * (TICK_MS / 1000);
		}

		const limit = clientLimit(client, current.strategy);
		const shouldSend = () => current.strategy === "rate" ? rateCredit >= 1 : inFlight < limit;
		while (shouldSend()) {
			jobs.push({ id: nextJobId, client: clientIndex, stage: "network", remainingMs: current.networkMs, createdAt: nowMs });
			nextJobId += 1;
			sent += 1;
			inFlight += 1;
			if (current.strategy === "rate") {
				rateCredit -= 1;
			}
		}

		return { ...client, rateCredit };
	});

	const queueDepth = jobs.filter((job) => job.stage === "queue").length;
	const maxQueue = Math.max(
		0,
		...Array.from({ length: current.workers }, (_, worker) => jobs.filter((job) => job.stage === "queue" && job.service === worker).length),
	);
	const windowMs = current.windowMs + TICK_MS;
	const sentInWindow = current.sentInWindow + sent;
	const sentRate = windowMs >= 1000 ? Math.round((sentInWindow * 1000 * 10) / windowMs) / 10 : current.sentRate;

	return {
		...current,
		clients: clientsWithJobs,
		workerPerformance,
		jobs,
		nextJobId,
		queueDepth,
		latencyMs: current.networkMs + current.serviceMs + maxQueue * current.serviceMs,
		dropped: current.dropped + rejectedJobs.length,
		completed: current.completed + completedSamples.filter((sample) => !sample.dropped).length,
		sentRate,
		sentInWindow: windowMs >= 1000 ? 0 : sentInWindow,
		windowMs: windowMs >= 1000 ? 0 : windowMs,
		nowMs,
	};
}
