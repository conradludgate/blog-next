"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/styles/CongestionSimulator.module.css";

type Mode = "rate" | "concurrency";

interface SimulationState {
	clients: number;
	workers: number;
	serviceMs: number;
	networkMs: number;
	queue: number;
	latencyMs: number;
	completed: number;
	seconds: number;
}

const INITIAL_STATE: SimulationState = {
	clients: 1,
	workers: 4,
	serviceMs: 250,
	networkMs: 80,
	queue: 0,
	latencyMs: 330,
	completed: 0,
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

function advanceSimulation(current: SimulationState, mode: Mode): SimulationState {
	const offered = offeredRequests(current, mode);
	const capacity = Math.max(1, Math.floor((1000 / current.serviceMs) * current.workers));
	const waiting = current.queue + offered;
	const completed = Math.min(waiting, capacity);
	const queue = waiting - completed;

	return {
		...current,
		queue,
		latencyMs: current.networkMs + current.serviceMs + Math.round((queue / current.workers) * current.serviceMs),
		completed: current.completed + completed,
		seconds: current.seconds + 1,
	};
}

function getMetrics(state: SimulationState, mode: Mode) {
	const offered = offeredRequests(state, mode);
	const capacity = Math.max(1, Math.floor((1000 / state.serviceMs) * state.workers));
	const queueShare = Math.min(100, Math.round((state.queue / Math.max(1, state.queue + capacity)) * 100));
	const busyWorkers = Math.min(
		state.workers,
		Math.max(0, Math.ceil((Math.min(offered, capacity) * state.serviceMs) / 1000)),
	);

	return { offered, capacity, queueShare, busyWorkers };
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

			<div className={styles.Actions} role="group" aria-label="Change the system">
				<span className={styles.ActionLabel}>Change the system</span>
				<button type="button" onClick={() => setState((current) => ({ ...current, clients: Math.min(8, current.clients + 1) }))}>
					Add client
				</button>
				<button type="button" onClick={() => setState((current) => ({ ...current, workers: Math.min(8, current.workers + 1) }))}>
					Add worker
				</button>
				<button type="button" onClick={() => setState((current) => ({ ...current, serviceMs: Math.min(1000, current.serviceMs + 250) }))}>
					Slow service
				</button>
				<button type="button" onClick={() => setState((current) => ({ ...current, networkMs: Math.min(500, current.networkMs + 40) }))}>
					Add delay
				</button>
				<button type="button" className={styles.Reset} onClick={reset}>
					Reset
				</button>
			</div>

			<div className={styles.System} role="img" aria-label="Request path from clients through the network and FIFO queue to service workers">
				<div className={styles.Node}>
					<span className={styles.NodeLabel}>Clients</span>
					<strong className={styles.NodeValue}>{state.clients}</strong>
					<span className={styles.NodeDetail}>{state.clients === 1 ? "instance" : "instances"} · {mode === "rate" ? `${RATE_PER_CLIENT}/s each` : `${CONCURRENCY_PER_CLIENT} in flight each`}</span>
					<div className={styles.Clients} aria-hidden="true">
						{Array.from({ length: Math.min(6, state.clients) }, (_, index) => <span key={index} />)}
						{state.clients > 6 && <b>+{state.clients - 6}</b>}
					</div>
				</div>

				<div className={styles.Link}>
					<span>Network / LB</span>
					<div className={styles.LinkLine} aria-hidden="true"><i /><i /><i /></div>
					<small>{state.networkMs}ms delay</small>
				</div>

				<div className={`${styles.Queue} ${state.queue > 0 ? styles.QueueActive : ""}`}>
					<span className={styles.NodeLabel}>FIFO queue</span>
					<strong className={styles.NodeValue}>{state.queue}</strong>
					<span className={styles.NodeDetail}>waiting</span>
					<div className={styles.Track} aria-hidden="true">
						<div className={styles.QueueFill} style={{ width: `${state.queue === 0 ? 0 : Math.max(10, metrics.queueShare)}%` }} />
					</div>
				</div>

				<div className={styles.Link}>
					<span>Service path</span>
					<div className={styles.LinkLine} aria-hidden="true"><i /><i /><i /></div>
					<small>{state.serviceMs}ms each</small>
				</div>

				<div className={styles.Node}>
					<span className={styles.NodeLabel}>Service</span>
					<strong className={styles.NodeValue}>{state.workers}</strong>
					<span className={styles.NodeDetail}>{state.workers === 1 ? "worker" : "workers"} · {metrics.capacity}/s capacity</span>
					<div className={styles.Workers} aria-hidden="true">
						{Array.from({ length: state.workers }, (_, index) => <span key={index} className={index < metrics.busyWorkers ? styles.BusyWorker : ""} />)}
					</div>
				</div>
			</div>

			<div className={styles.Metrics} aria-live="polite">
				<div><span>Offered rate</span><strong>{metrics.offered}/s</strong></div>
				<div><span>Observed latency</span><strong>{state.latencyMs}ms</strong></div>
				<div><span>Queued work</span><strong>{state.queue}</strong></div>
			</div>

			<p className={styles.Hint}>
				The clock runs by itself. Add a client or slow the service to create pressure, then watch the path and metrics respond.
			</p>
		</section>
	);
}
