"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/styles/CongestionSimulator.module.css";

type Mode = "rate" | "concurrency";

interface SimulationState {
	clients: number;
	workers: number;
	serviceMs: number;
	networkMs: number;
	workerPerformance: number[];
	jobs: Job[];
	nextJobId: number;
	arrivalCredit: number;
	queue: number;
	latencyMs: number;
	dropped: number;
	seconds: number;
}

type JobStage = "network" | "queue" | "service";

interface Job {
	id: number;
	client: number;
	stage: JobStage;
	remainingMs: number;
	service?: number;
}

const QUEUE_LIMIT = 12;
const TICK_MS = 250;
const INITIAL_STATE: SimulationState = {
	clients: 1,
	workers: 4,
	serviceMs: 250,
	networkMs: 900,
	workerPerformance: [1, 1, 1, 1],
	jobs: [],
	nextJobId: 1,
	arrivalCredit: 0,
	queue: 0,
	latencyMs: 1150,
	dropped: 0,
	seconds: 0,
};

const RATE_PER_CLIENT = 0.5;
const CONCURRENCY_PER_CLIENT = 4;
const MAX_OFFERED_RATE = 4;

function offeredRequests(state: SimulationState, mode: Mode): number {
	const offered = mode === "rate"
		? state.clients * RATE_PER_CLIENT
		: (state.clients * CONCURRENCY_PER_CLIENT * 1000) /
			Math.max(state.latencyMs, state.serviceMs);

	return Math.min(MAX_OFFERED_RATE, Math.max(RATE_PER_CLIENT, offered));
}

function serviceCapacity(state: SimulationState, performance = state.workerPerformance): number {
	const capacity = performance.reduce(
		(total, factor) => total + 1000 / (state.serviceMs * factor),
		0,
	);

	return Math.max(1, Math.floor(capacity));
}

function randomPerformance(): number {
	return 0.75 + Math.random() * 0.5;
}

function fluctuatePerformance(performance: number): number {
	return Math.max(0.7, Math.min(1.35, performance * (0.9 + Math.random() * 0.2)));
}

function advanceSimulation(current: SimulationState, mode: Mode): SimulationState {
	const workerPerformance = current.workerPerformance.map(fluctuatePerformance);
	let arrivalCredit = current.arrivalCredit + offeredRequests(current, mode) * (TICK_MS / 1000);
	let nextJobId = current.nextJobId;
	const newJobs: Job[] = [];

	while (arrivalCredit >= 1) {
		newJobs.push({
			id: nextJobId,
			client: (nextJobId - 1) % current.clients,
			stage: "network",
			remainingMs: current.networkMs,
		});
		nextJobId += 1;
		arrivalCredit -= 1;
	}

	const progressedJobs = current.jobs
		.map((job): Job | null => {
			const remainingMs = job.remainingMs - TICK_MS;

			if (job.stage === "service" && remainingMs <= 0) {
				return null;
			}

			if (job.stage === "network" && remainingMs <= 0) {
				return { ...job, stage: "queue", remainingMs: 0 };
			}

			return { ...job, remainingMs };
		})
		.filter((job): job is Job => job !== null);

	let jobs = [...progressedJobs, ...newJobs];
	const waitingJobs = jobs.filter((job) => job.stage === "queue");
	const rejectedJobs = waitingJobs.slice(QUEUE_LIMIT);
	const rejectedIds = new Set(rejectedJobs.map((job) => job.id));
	jobs = jobs.filter((job) => !rejectedIds.has(job.id));

	const occupiedWorkers = new Set(
		jobs
			.filter((job) => job.stage === "service" && job.service !== undefined)
			.map((job) => job.service),
	);

	for (let worker = 0; worker < current.workers; worker += 1) {
		if (occupiedWorkers.has(worker)) {
			continue;
		}

		const nextJobIndex = jobs.findIndex((job) => job.stage === "queue");
		if (nextJobIndex === -1) {
			break;
		}

		jobs[nextJobIndex] = {
			...jobs[nextJobIndex],
			stage: "service",
			service: worker,
			remainingMs: Math.max(100, Math.round(current.serviceMs * workerPerformance[worker])),
		};
		occupiedWorkers.add(worker);
	}

	const queue = jobs.filter((job) => job.stage === "queue").length;
	return {
		...current,
		workerPerformance,
		jobs,
		nextJobId,
		arrivalCredit,
		queue,
		latencyMs: current.networkMs + current.serviceMs + Math.round((queue / current.workers) * current.serviceMs),
		dropped: current.dropped + rejectedJobs.length,
		seconds: current.seconds + TICK_MS / 1000,
	};
}

function getMetrics(state: SimulationState, mode: Mode) {
	const offered = offeredRequests(state, mode);
	const capacity = serviceCapacity(state);
	let busyWorkers = 0;
	let remaining = Math.min(offered, capacity);

	for (const performance of state.workerPerformance) {
		if (remaining <= 0) {
			break;
		}
		remaining -= 1000 / (state.serviceMs * performance);
		busyWorkers += 1;
	}

	return { offered, capacity, busyWorkers };
}

function performanceOpacity(performance: number): number {
	return Math.max(0.45, Math.min(1, 1.35 - performance));
}

export default function CongestionSimulator() {
	const [mode, setMode] = useState<Mode>("rate");
	const [isRunning, setIsRunning] = useState(true);
	const [state, setState] = useState<SimulationState>(INITIAL_STATE);
	const metrics = useMemo(() => getMetrics(state, mode), [mode, state]);

	useEffect(() => {
		if (!isRunning) {
			return;
		}

		const timer = window.setInterval(() => {
			setState((current) => advanceSimulation(current, mode));
		}, TICK_MS);

		return () => window.clearInterval(timer);
	}, [isRunning, mode]);

	function changeMode(nextMode: Mode) {
		setMode(nextMode);
		setState(INITIAL_STATE);
	}

	function changeClients(delta: number) {
		setState((current) => {
			const clients = Math.max(1, Math.min(8, current.clients + delta));
			const jobs = current.jobs.map((job) => ({
				...job,
				client: Math.min(job.client, clients - 1),
			}));

			return { ...current, clients, jobs };
		});
	}

	function changeWorkers(delta: number) {
		setState((current) => {
			const workers = Math.max(1, Math.min(8, current.workers + delta));
			const workerPerformance = delta > 0
				? [...current.workerPerformance, randomPerformance()]
				: current.workerPerformance.slice(0, workers);

			const jobs = current.jobs.map((job) => (
				job.stage === "service" && job.service !== undefined && job.service >= workers
					? { ...job, stage: "queue" as const, service: undefined, remainingMs: 0 }
					: job
			));

			return { ...current, workers, workerPerformance, jobs, queue: jobs.filter((job) => job.stage === "queue").length };
		});
	}

	function reset() {
		setState(INITIAL_STATE);
	}

	return (
		<section className={styles.Simulator} aria-labelledby="congestion-simulator-title">
			<div className={styles.Header}>
				<div>
					<p className={styles.Eyebrow}>First experiment</p>
					<h2 id="congestion-simulator-title">A fixed limit meets a changing system</h2>
				</div>
				<div className={styles.HeaderControls}>
				<span className={styles.Clock}>t = {state.seconds.toFixed(1)}s</span>
					<button
						type="button"
						className={styles.Play}
						aria-pressed={isRunning}
						onClick={() => setIsRunning((running) => !running)}
					>
						{isRunning ? "Pause" : "Play"}
					</button>
					<span className={state.queue > 0 ? styles.Warning : styles.Healthy}>
						{state.queue > 0 ? "Queueing" : "Healthy"}
					</span>
				</div>
			</div>

			<div className={styles.ModeSwitcher} role="group" aria-label="Choose a limiter">
				<button
					type="button"
					className={mode === "rate" ? styles.Selected : ""}
					aria-pressed={mode === "rate"}
					onClick={() => changeMode("rate")}
				>
					Rate limit
				</button>
				<button
					type="button"
					className={mode === "concurrency" ? styles.Selected : ""}
					aria-pressed={mode === "concurrency"}
					onClick={() => changeMode("concurrency")}
				>
					Concurrency limit
				</button>
			</div>

			<p className={styles.Description}>
				{mode === "rate"
					? `${RATE_PER_CLIENT} requests per second per client, regardless of latency.`
					: `${CONCURRENCY_PER_CLIENT} requests in flight per client, using latency as feedback.`}
			</p>

			<div className={styles.System} role="img" aria-label="Individual clients send jobs through the network and FIFO queue to individual service workers">
				<div className={styles.ClientColumn}>
					<div className={styles.ColumnHeader}>
						<div>
							<span className={styles.ColumnLabel}>Clients</span>
							<span className={styles.ColumnDetail}>{mode === "rate" ? `${RATE_PER_CLIENT}/s each` : `${CONCURRENCY_PER_CLIENT} in flight each`}</span>
						</div>
						<div className={styles.Stepper}>
							<button type="button" aria-label="Remove client" disabled={state.clients === 1} onClick={() => changeClients(-1)}>−</button>
							<button type="button" aria-label="Add client" disabled={state.clients === 8} onClick={() => changeClients(1)}>+</button>
						</div>
					</div>
					{Array.from({ length: state.clients }, (_, index) => {
						const clientJobs = state.jobs.filter((job) => job.client === index);

						return (
							<div className={styles.Endpoint} key={index}>
								<div className={styles.EndpointHeader}>
									<strong>Client {index + 1}</strong>
									<span>{clientJobs.length} {clientJobs.length === 1 ? "job" : "jobs"}</span>
								</div>
								<span className={styles.EndpointDetail}>emitting work</span>
								<span className={styles.ClientMark} aria-hidden="true" />
							</div>
						);
					})}
				</div>

				<div className={styles.NetworkColumn}>
					<div className={styles.ColumnHeader}>
						<div>
							<span className={styles.ColumnLabel}>Network / LB</span>
							<span className={styles.ColumnDetail}>jobs travel here</span>
						</div>
					</div>
					<div className={styles.NetworkStage} style={{ minHeight: `${Math.max(4, state.clients * 2.55)}rem` }} aria-hidden="true">
						{Array.from({ length: state.clients }, (_, index) => (
							<div className={styles.NetworkRail} style={{ top: `${0.9 + index * 2.55}rem` }} key={index}>
								<span>C{index + 1}</span>
							</div>
						))}
						{state.jobs.filter((job) => job.stage === "network").map((job) => (
							<span
								className={styles.Job}
								key={job.id}
								style={{ top: `${0.74 + job.client * 2.55}rem`, animationDuration: `${state.networkMs}ms` }}
							/>
						))}
					</div>

					<div className={`${styles.Queue} ${state.queue > 0 ? styles.QueueActive : ""}`}>
						<div className={styles.QueueHeader}>
							<span className={styles.ColumnLabel}>FIFO queue</span>
							<span className={styles.QueueCount}>{state.queue} / {QUEUE_LIMIT}</span>
						</div>
						<span className={styles.EndpointDetail}>{state.dropped} rejected</span>
						<div className={styles.QueueSlots} aria-hidden="true">
							{Array.from({ length: QUEUE_LIMIT }, (_, index) => (
								<span key={index} className={index < state.queue ? styles.Queued : ""} />
							))}
						</div>
					</div>
				</div>

				<div className={styles.ServiceColumn}>
					<div className={styles.ColumnHeader}>
						<div>
							<span className={styles.ColumnLabel}>Service</span>
							<span className={styles.ColumnDetail}>{metrics.capacity}/s capacity</span>
						</div>
						<div className={styles.Stepper}>
							<button type="button" aria-label="Remove worker" disabled={state.workers === 1} onClick={() => changeWorkers(-1)}>−</button>
							<button type="button" aria-label="Add worker" disabled={state.workers === 8} onClick={() => changeWorkers(1)}>+</button>
						</div>
					</div>
					{state.workerPerformance.map((performance, index) => {
						const job = state.jobs.find((candidate) => candidate.stage === "service" && candidate.service === index);

						return (
							<div className={styles.Endpoint} key={index}>
								<div className={styles.EndpointHeader}>
									<strong>Worker {index + 1}</strong>
									<span>{job ? "busy" : "idle"}</span>
								</div>
								<span className={styles.EndpointDetail}>{job ? `processing job ${job.id}` : "ready for work"}</span>
								<span className={`${styles.WorkerMark} ${job ? styles.BusyWorker : ""}`} style={{ opacity: performanceOpacity(performance) }} aria-hidden="true" />
							</div>
						);
					})}
				</div>
			</div>

			<div className={styles.Metrics} aria-live="polite">
				<div><span>Offered rate</span><strong>{metrics.offered}/s</strong></div>
				<div><span>Observed latency</span><strong>{state.latencyMs}ms</strong></div>
				<div><span>Rejected</span><strong>{state.dropped}</strong></div>
			</div>

			<div className={styles.Footer}>
				<p>The clock runs by itself. Add or remove clients and workers to create pressure, then watch the finite queue respond.</p>
				<button type="button" className={styles.Reset} onClick={reset}>Reset</button>
			</div>
		</section>
	);
}
