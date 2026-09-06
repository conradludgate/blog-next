"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/styles/CongestionSimulator.module.css";
import PixiCongestionScene from "./congestion/PixiCongestionScene";
import {
	advanceSimulation,
	createInitialState,
	FIXED_CONCURRENCY_PER_CLIENT,
	MAX_CLIENTS,
	MAX_WORKERS,
	RATE_PER_CLIENT,
	setClientCount,
	setStrategy as setSimulationStrategy,
	setWorkerCount,
	serviceCapacity,
	TICK_MS,
} from "./congestion/simulation";
import type { ControllerKind, SimulationState } from "./congestion/simulation";

const CONTROLLER_OPTIONS: Array<{ kind: ControllerKind; label: string }> = [
	{ kind: "rate", label: "Rate" },
	{ kind: "concurrency", label: "Concurrency" },
	{ kind: "aimd", label: "AIMD" },
	{ kind: "vegas", label: "Vegas" },
	{ kind: "gradient2", label: "Gradient2" },
];

function formatMetricValue(value: number): string {
	if (!Number.isFinite(value) || value === 0) {
		return "0";
	}
	if (Math.abs(value) < 0.1) {
		return value.toFixed(2);
	}

	const exponent = Math.floor(Math.log10(Math.abs(value)));
	const step = 10 ** (exponent - 1);
	const truncated = Math.trunc(value / step) * step;
	if (step >= 1) {
		return String(truncated);
	}

	const decimalPlaces = Math.ceil(-Math.log10(step));
	return truncated.toFixed(decimalPlaces).replace(/0+$/, "").replace(/\.$/, "");
}

function formatLatency(milliseconds: number): string {
	return milliseconds >= 1000
		? formatMetricValue(milliseconds / 1000) + "s"
		: formatMetricValue(milliseconds) + "ms";
}

export default function CongestionSimulator() {
	const [isRunning, setIsRunning] = useState(true);
	const [state, setState] = useState<SimulationState>(() => createInitialState());
	const metrics = useMemo(() => ({
		rejectionRate: state.clients.reduce((total, client) => total + client.metrics.rejectionRate, 0) / state.clients.length,
		capacity: serviceCapacity(state),
	}), [state]);
	const isRejecting = metrics.rejectionRate > 0.005;
	const status = isRejecting
		? "Rejecting work"
		: state.queueDepth > 0
			? `${state.queueDepth} waiting`
			: "Queue empty";

	useEffect(() => {
		if (!isRunning) {
			return;
		}

		const timer = window.setInterval(() => {
			setState((current) => advanceSimulation(current));
		}, TICK_MS);

		return () => window.clearInterval(timer);
	}, [isRunning]);

	function changeStrategy(strategy: ControllerKind) {
		setState((current) => setSimulationStrategy(current, strategy));
	}

	function changeClients(delta: number) {
		setState((current) => setClientCount(current, current.clients.length + delta));
	}

	function changeWorkers(delta: number) {
		setState((current) => setWorkerCount(current, current.workers + delta));
	}

	function reset() {
		setState((current) => setSimulationStrategy(current, current.strategy));
	}

	return (
		<section className={styles.Simulator} aria-labelledby="congestion-simulator-title">
			<div className={styles.Header}>
				<div>
					<p className={styles.Eyebrow}>Interactive experiment</p>
					<h2 id="congestion-simulator-title">A fixed limit meets a changing system</h2>
				</div>
				<div className={styles.HeaderControls}>
					<span className={styles.Clock}>t = {formatMetricValue(state.nowMs / 1000)}s</span>
					<button
						type="button"
						className={styles.Play}
						aria-pressed={isRunning}
						onClick={() => setIsRunning((running) => !running)}
					>
						{isRunning ? "Pause" : "Play"}
					</button>
					<span className={state.queueDepth > 0 || isRejecting ? styles.Warning : styles.Healthy}>
						{status}
					</span>
				</div>
			</div>

			<div className={styles.Challenge}>
				<div>
					<span className={styles.ChallengeLabel}>Try it</span>
					<p>Add clients until work starts waiting. Then add a worker and watch the queue drain.</p>
				</div>
				<div className={styles.ChallengeActions}>
					<button type="button" disabled={state.clients.length === MAX_CLIENTS} onClick={() => changeClients(1)}>
						Add a client <span aria-hidden="true">→</span>
					</button>
					<button type="button" disabled={state.workers === MAX_WORKERS} onClick={() => changeWorkers(1)}>
						Add a worker <span aria-hidden="true">→</span>
					</button>
				</div>
			</div>

			<div className={styles.ControllerRow}>
				<span className={styles.ControllerLabel}>Clients send using</span>
				<div className={styles.ModeSwitcher} role="group" aria-label="Choose how clients send work">
					{CONTROLLER_OPTIONS.map((option) => (
						<button
							type="button"
							className={state.strategy === option.kind ? styles.Selected : ""}
							aria-pressed={state.strategy === option.kind}
							onClick={() => changeStrategy(option.kind)}
							key={option.kind}
						>
							{option.label}
						</button>
					))}
				</div>
			</div>

			<p className={styles.Description} aria-live="polite">
				{state.strategy === "rate" && `${RATE_PER_CLIENT} requests per second from every client, even when the service slows down.`}
				{state.strategy === "concurrency" && `${FIXED_CONCURRENCY_PER_CLIENT} requests in flight per client. Slower responses naturally slow new work.`}
				{state.strategy === "aimd" && "Increase after success; halve the window only after the queue rejects work."}
				{state.strategy === "vegas" && "Estimate queueing delay and back off before the queue reaches its limit."}
				{state.strategy === "gradient2" && "Compare short- and long-term latency, following changes in service capacity."}
			</p>

			<div className={styles.SceneFrame}>
				<div className={styles.SceneControls}>
					<div className={styles.ControlSets}>
						<div className={styles.ControlSet}>
							<span className={styles.ControlLabel}>Clients <strong>{state.clients.length}</strong></span>
							<div className={styles.Stepper}>
								<button type="button" aria-label="Remove client" disabled={state.clients.length === 1} onClick={() => changeClients(-1)}>−</button>
								<button type="button" aria-label="Add client" disabled={state.clients.length === MAX_CLIENTS} onClick={() => changeClients(1)}>+</button>
							</div>
						</div>
						<div className={styles.ControlSet}>
							<span className={styles.ControlLabel}>Workers <strong>{state.workers}</strong></span>
							<div className={styles.Stepper}>
								<button type="button" aria-label="Remove worker" disabled={state.workers === 1} onClick={() => changeWorkers(-1)}>−</button>
								<button type="button" aria-label="Add worker" disabled={state.workers === MAX_WORKERS} onClick={() => changeWorkers(1)}>+</button>
							</div>
						</div>
					</div>
					<div className={styles.CapacitySummary}>
						<span>Estimated capacity</span>
						<strong>{metrics.capacity} jobs/s</strong>
					</div>
				</div>
				<PixiCongestionScene state={state} />
				<p className={styles.ScreenReaderSummary}>There are {state.clients.length} clients, {state.workers} workers, and {state.queueDepth} jobs waiting. {state.dropped} jobs have been rejected.</p>
				<div className={styles.QueueMeter}>
					<span>Shared FIFO queue</span>
					<div className={styles.QueueTrack} aria-hidden="true"><i style={{ width: `${state.queueDepth / 16 * 100}%` }} /></div>
					<strong>{state.queueDepth} / 16</strong>
				</div>
			</div>

			<div className={styles.Metrics}>
				<div><span><b>Rate</b> Offered load</span><strong>{formatMetricValue(state.sentRate)}/s</strong></div>
				<div className={isRejecting ? styles.MetricWarning : ""}><span><b>Errors</b> Rejected</span><strong>{formatMetricValue(metrics.rejectionRate * 100)}%</strong></div>
				<div className={state.latencyMs > 4000 ? styles.MetricWarning : ""}><span><b>Duration</b> Round trip</span><strong>{formatLatency(state.latencyMs)}</strong></div>
				<div className={state.queueDepth > 0 ? styles.MetricWarning : ""}><span><b>Saturation</b> Waiting</span><strong>{state.queueDepth}</strong></div>
			</div>

			<div className={styles.Footer}>
				<p>Each dot is one request. The queue is bounded, so excess work is rejected instead of waiting forever.</p>
				<button type="button" className={styles.Reset} onClick={reset}>Start over</button>
			</div>
		</section>
	);
}
