"use client";

import { useMemo, useState } from "react";
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

export default function CongestionSimulator() {
	const [mode, setMode] = useState<Mode>("rate");
	const [state, setState] = useState<SimulationState>(INITIAL_STATE);

	const metrics = useMemo(() => {
		const offered = offeredRequests(state, mode);
		const capacity = Math.max(1, Math.floor((1000 / state.serviceMs) * state.workers));
		const queueShare = Math.min(100, Math.round((state.queue / Math.max(1, state.queue + capacity)) * 100));
		const busyWorkers = Math.min(
			state.workers,
			Math.max(0, Math.ceil((Math.min(offered, capacity) * state.serviceMs) / 1000)),
		);

		return { offered, capacity, queueShare, busyWorkers };
	}, [mode, state]);

	function advance() {
		setState((current) => {
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
		});
	}

	function changeMode(nextMode: Mode) {
		setMode(nextMode);
		setState(INITIAL_STATE);
	}

	function reset() {
		setState(INITIAL_STATE);
	}

	return (
		<section className={styles.Simulator} aria-labelledby="congestion-simulator-title">
			<div className={styles.Heading}>
				<div>
					<p className={styles.Eyebrow}>First experiment</p>
					<h2 id="congestion-simulator-title">A fixed limit meets a changing system</h2>
				</div>
				<span className={state.queue > 0 ? styles.Warning : styles.Healthy}>
					{state.queue > 0 ? "Queueing" : "Healthy"}
				</span>
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
					? `Each client sends ${RATE_PER_CLIENT} requests per second, regardless of how long requests take.`
					: `Each client keeps ${CONCURRENCY_PER_CLIENT} requests in flight and adapts its rate to observed latency.`}
			</p>

			<div className={styles.Actions}>
				<button type="button" className={styles.PrimaryAction} onClick={advance}>
					Run one second
				</button>
				<button type="button" onClick={() => setState((current) => ({ ...current, clients: Math.min(8, current.clients + 1) }))}>
					Add client
				</button>
				<button type="button" onClick={() => setState((current) => ({ ...current, workers: Math.min(8, current.workers + 1) }))}>
					Add server worker
				</button>
				<button type="button" onClick={() => setState((current) => ({ ...current, serviceMs: Math.min(1000, current.serviceMs + 250) }))}>
					Slow service
				</button>
				<button type="button" onClick={() => setState((current) => ({ ...current, networkMs: Math.min(500, current.networkMs + 40) }))}>
					Add network delay
				</button>
				<button type="button" className={styles.Reset} onClick={reset}>
					Reset
				</button>
			</div>

			<div className={styles.System} aria-label="Request path from clients to server workers">
				<div className={styles.Stage}>
					<span className={styles.StageLabel}>Clients</span>
					<strong>{state.clients} instance{state.clients === 1 ? "" : "s"}</strong>
					<div className={styles.Clients} aria-hidden="true">
						{Array.from({ length: Math.min(6, state.clients) }, (_, index) => <span key={index} className={styles.Client} />)}
						{state.clients > 6 && <span className={styles.More}>+{state.clients - 6}</span>}
					</div>
					<span className={styles.StageDetail}>{mode === "rate" ? `${RATE_PER_CLIENT}/s each` : `${CONCURRENCY_PER_CLIENT} in flight each`}</span>
				</div>
				<div className={styles.Arrow} aria-hidden="true">→</div>
				<div className={styles.Stage}>
					<span className={styles.StageLabel}>Network / load balancer</span>
					<strong>one shared path</strong>
					<div className={styles.NetworkLine} aria-hidden="true"><span /><span /><span /></div>
					<span className={styles.StageDetail}>{state.networkMs}ms path delay</span>
				</div>
				<div className={styles.Arrow} aria-hidden="true">→</div>
				<div className={`${styles.Stage} ${state.queue > 0 ? styles.QueueStage : ""}`}>
					<span className={styles.StageLabel}>FIFO queue</span>
					<strong>{state.queue} waiting</strong>
					<div className={styles.Track} aria-label={`${state.queue} requests waiting in the service queue`}>
						<div className={styles.QueueFill} style={{ width: `${state.queue === 0 ? 0 : Math.max(8, metrics.queueShare)}%` }} />
					</div>
					<span className={styles.StageDetail}>inside the service</span>
				</div>
				<div className={styles.Arrow} aria-hidden="true">→</div>
				<div className={styles.Stage}>
					<span className={styles.StageLabel}>Service</span>
					<strong>{state.workers} worker{state.workers === 1 ? "" : "s"}</strong>
					<div className={styles.Workers} aria-hidden="true">
						{Array.from({ length: state.workers }, (_, index) => <span key={index} className={index < metrics.busyWorkers ? styles.BusyWorker : ""} />)}
					</div>
					<span className={styles.StageDetail}>{state.serviceMs}ms service time</span>
				</div>
			</div>

			<div className={styles.Metrics}>
				<div><span>Offered rate</span><strong>{metrics.offered}/s</strong></div>
				<div><span>Service capacity</span><strong>{metrics.capacity}/s</strong></div>
				<div><span>Observed latency</span><strong>{state.latencyMs}ms</strong></div>
				<div><span>Queue</span><strong>{state.queue}</strong></div>
				<div><span>Completed</span><strong>{state.completed}</strong></div>
			</div>

			<p className={styles.Hint}>
				Try adding a client, then press <em>Run one second</em> a few times. Next, reset and try the same experiment with a concurrency limit.
			</p>
		</section>
	);
}
