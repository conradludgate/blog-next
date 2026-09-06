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
	queue: number;
	latencyMs: number;
	dropped: number;
	seconds: number;
}

const QUEUE_LIMIT = 12;
const INITIAL_STATE: SimulationState = {
	clients: 1,
	workers: 4,
	serviceMs: 250,
	networkMs: 80,
	workerPerformance: [1, 1, 1, 1],
	queue: 0,
	latencyMs: 330,
	dropped: 0,
	seconds: 0,
};

const RATE_PER_CLIENT = 8;
const CONCURRENCY_PER_CLIENT = 4;

function offeredRequests(state: SimulationState, mode: Mode): number {
	if (mode === "rate") {
		return state.clients * RATE_PER_CLIENT;
	}

	return Math.max(
		1,
		Math.round(
			(state.clients * CONCURRENCY_PER_CLIENT * 1000) /
				Math.max(state.latencyMs, state.serviceMs),
		),
	);
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
	const next = { ...current, workerPerformance };
	const offered = offeredRequests(next, mode);
	const capacity = serviceCapacity(next);
	const waiting = current.queue + offered;
	const completed = Math.min(waiting, capacity);
	const remaining = waiting - completed;
	const queue = Math.min(QUEUE_LIMIT, remaining);

	return {
		...next,
		queue,
		latencyMs: current.networkMs + current.serviceMs + Math.round((queue / current.workers) * current.serviceMs),
		dropped: current.dropped + remaining - queue,
		seconds: current.seconds + 1,
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
		}, 700);

		return () => window.clearInterval(timer);
	}, [isRunning, mode]);

	function changeMode(nextMode: Mode) {
		setMode(nextMode);
		setState(INITIAL_STATE);
	}

	function changeClients(delta: number) {
		setState((current) => ({
			...current,
			clients: Math.max(1, Math.min(8, current.clients + delta)),
		}));
	}

	function changeWorkers(delta: number) {
		setState((current) => {
			const workers = Math.max(1, Math.min(8, current.workers + delta));
			const workerPerformance = delta > 0
				? [...current.workerPerformance, randomPerformance()]
				: current.workerPerformance.slice(0, workers);

			return { ...current, workers, workerPerformance };
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
					<span className={styles.Clock}>t = {state.seconds}s</span>
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

			<div className={styles.System} role="img" aria-label="Request path from clients through the network and FIFO queue to service workers">
				<div className={styles.Node}>
					<div className={styles.NodeHeader}>
						<span className={styles.NodeLabel}>Clients</span>
						<div className={styles.Stepper}>
							<button type="button" aria-label="Remove client" disabled={state.clients === 1} onClick={() => changeClients(-1)}>−</button>
							<button type="button" aria-label="Add client" disabled={state.clients === 8} onClick={() => changeClients(1)}>+</button>
						</div>
					</div>
					<strong className={styles.NodeValue}>{state.clients}</strong>
					<span className={styles.NodeDetail}>{state.clients === 1 ? "instance" : "instances"} · {mode === "rate" ? `${RATE_PER_CLIENT}/s each` : `${CONCURRENCY_PER_CLIENT} in flight each`}</span>
					<div className={styles.Clients} aria-hidden="true">
						{Array.from({ length: Math.min(6, state.clients) }, (_, index) => <span key={index} />)}
						{state.clients > 6 && <b>+{state.clients - 6}</b>}
					</div>
				</div>

				<div className={styles.Link} aria-hidden="true">
					<span>Network / LB</span>
					<div className={styles.LinkLine}><i /><i /><i /></div>
				</div>

				<div className={`${styles.Queue} ${state.queue > 0 ? styles.QueueActive : ""}`}>
					<span className={styles.NodeLabel}>FIFO queue</span>
					<strong className={styles.NodeValue}>{state.queue}<small> / {QUEUE_LIMIT}</small></strong>
					<span className={styles.NodeDetail}>{state.dropped} rejected</span>
					<div className={styles.QueueSlots} aria-hidden="true">
						{Array.from({ length: QUEUE_LIMIT }, (_, index) => (
							<span key={index} className={index < state.queue ? styles.Queued : ""} />
						))}
					</div>
				</div>

				<div className={styles.Link} aria-hidden="true">
					<div className={styles.LinkLine}><i /><i /><i /></div>
				</div>

				<div className={styles.Node}>
					<div className={styles.NodeHeader}>
						<span className={styles.NodeLabel}>Service</span>
						<div className={styles.Stepper}>
							<button type="button" aria-label="Remove worker" disabled={state.workers === 1} onClick={() => changeWorkers(-1)}>−</button>
							<button type="button" aria-label="Add worker" disabled={state.workers === 8} onClick={() => changeWorkers(1)}>+</button>
						</div>
					</div>
					<strong className={styles.NodeValue}>{state.workers}</strong>
					<span className={styles.NodeDetail}>{state.workers === 1 ? "worker" : "workers"} · {metrics.capacity}/s capacity</span>
					<div className={styles.Workers} aria-hidden="true">
						{state.workerPerformance.map((performance, index) => <span key={index} className={index < metrics.busyWorkers ? styles.BusyWorker : ""} style={{ opacity: performanceOpacity(performance) }} />)}
					</div>
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
