"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/styles/CongestionSimulator.module.css";
import { CONGESTION_CHALLENGES, createChallenge } from "./congestion/challenges";
import { createConditionProgress, updateConditionProgress } from "./congestion/conditions";
import PixiCongestionScene from "./congestion/PixiCongestionScene";
import {
	advanceSimulation,
	MAX_CLIENTS,
	MAX_WORKERS,
	RATE_PER_ENDPOINT,
	setClientCount,
	setStrategy as setSimulationStrategy,
	setWorkerCount,
	serviceCapacity,
	summarizeBreakdown,
	TICK_MS,
	WORKER_QUEUE_LIMIT,
} from "./congestion/simulation";
import type { CongestionChallengeId } from "./congestion/challenges";
import type { ControllerKind, SimulationState } from "./congestion/simulation";

const CONTROLLER_LABELS: Record<ControllerKind, string> = {
	rate: "Rate",
	concurrency: "Concurrency",
	aimd: "AIMD",
	vegas: "Vegas",
	gradient2: "Gradient2",
};

function formatMetricValue(value: number): string {
	if (!Number.isFinite(value) || value === 0) return "0";
	if (Math.abs(value) < 0.1) return value.toFixed(2);

	const exponent = Math.floor(Math.log10(Math.abs(value)));
	const step = 10 ** (exponent - 1);
	const truncated = Math.trunc(value / step) * step;
	if (step >= 1) return String(truncated);

	const decimalPlaces = Math.ceil(-Math.log10(step));
	return truncated.toFixed(decimalPlaces).replace(/0+$/, "").replace(/\.$/, "");
}

function formatLatency(milliseconds: number): string {
	return milliseconds >= 1000
		? formatMetricValue(milliseconds / 1000) + "s"
		: formatMetricValue(milliseconds) + "ms";
}

export default function CongestionSimulator({ challenge: challengeId }: { challenge: CongestionChallengeId }) {
	const challenge = CONGESTION_CHALLENGES[challengeId];
	const [isRunning, setIsRunning] = useState(false);
	const [playbackSpeed, setPlaybackSpeed] = useState<1 | 0.5>(1);
	const [state, setState] = useState<SimulationState>(() => createChallenge(challengeId));
	const [conditionProgress, setConditionProgress] = useState(() => createConditionProgress(challenge.conditions));
	const stateRef = useRef(state);
	const baselineRef = useRef<SimulationState>(createChallenge(challengeId));
	const metrics = useMemo(() => ({
		rejectionRate: state.rejectionRate,
		capacity: serviceCapacity(state),
	}), [state]);
	const breakdown = useMemo(() => summarizeBreakdown(state), [state]);
	const conditionsComplete = challenge.conditions.every((condition) =>
		(conditionProgress[condition.id]?.completedAtMs ?? null) !== null);
	const isRejecting = (metrics.rejectionRate ?? 0) > 0.005;
	const status = state.nowMs === 0 ? "Ready" : isRunning ? "Running" : "Paused";

	function commitState(next: SimulationState) {
		stateRef.current = next;
		setState(next);
		setConditionProgress((current) => updateConditionProgress(challenge.conditions, current, next, baselineRef.current));
	}

	useEffect(() => {
		if (!isRunning) return;
		const timer = window.setInterval(() => {
			const next = advanceSimulation(stateRef.current);
			stateRef.current = next;
			setState(next);
			setConditionProgress((current) => updateConditionProgress(challenge.conditions, current, next, baselineRef.current));
		}, TICK_MS / playbackSpeed);
		return () => window.clearInterval(timer);
	}, [isRunning, playbackSpeed, challenge]);

	useEffect(() => {
		const pauseWhenHidden = () => {
			if (document.hidden) setIsRunning(false);
		};
		document.addEventListener("visibilitychange", pauseWhenHidden);
		return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
	}, []);

	function reset() {
		const next = createChallenge(challengeId);
		stateRef.current = next;
		baselineRef.current = createChallenge(challengeId);
		setState(next);
		setConditionProgress(createConditionProgress(challenge.conditions));
		setIsRunning(false);
		setPlaybackSpeed(1);
	}

	const controllerOptions = challenge.controls.controllerOptions;

	return (
		<section className={styles.Simulator} aria-label={`${challenge.title} simulator`}>
			<div className={styles.SceneFrame}>
				<div className={styles.Task}>
					<span>{conditionsComplete ? "Complete" : "Goal"}</span>
					<strong>{challenge.task}</strong>
				</div>

				<ul className={styles.Conditions} aria-label="Experiment checks" aria-live="polite">
					{challenge.conditions.map((condition) => {
						const completed = (conditionProgress[condition.id]?.completedAtMs ?? null) !== null;
						return <li
							className={completed ? styles.ConditionComplete : ""}
							key={condition.id}
							title={condition.description}
							aria-label={`${condition.label}: ${condition.description}`}
						>
							<span aria-hidden="true">{completed ? "✓" : "○"}</span>
							<strong>{condition.label}</strong>
						</li>;
					})}
				</ul>

				<div className={styles.Toolbar}>
					<div className={styles.PlaybackRow}>
						<div className={styles.Playback} role="group" aria-label="Simulation playback">
							<button type="button" className={styles.Play} aria-pressed={isRunning} onClick={() => setIsRunning((running) => !running)}>
								<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">{isRunning ? <path d="M3 2h3v12H3zm7 0h3v12h-3z" /> : <path d="M4 2l10 6-10 6z" />}</svg>
								{isRunning ? "Pause" : "Run"}
							</button>
							<button type="button" aria-label="Slow playback to half speed" className={playbackSpeed === 0.5 ? styles.Selected : ""} aria-pressed={playbackSpeed === 0.5} onClick={() => setPlaybackSpeed((speed) => speed === 1 ? 0.5 : 1)}>
								½ speed
							</button>
							<button type="button" onClick={reset}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 7a6 6 0 1 1 1.5 5M2 2v5h5" /></svg>Reset</button>
						</div>
						<div className={styles.RunState}>
							<span className={styles.Clock}>{formatMetricValue(state.nowMs / 1000)}s</span>
							<span className={isRunning ? styles.Running : styles.PlaybackStatus}>{status}</span>
						</div>
					</div>

					<div className={styles.ControlSets}>
						<div className={styles.ControlSet}>
							<span>Controller</span>
							{controllerOptions
								? <select aria-label="Controller" value={state.strategy} onChange={(event) => commitState(setSimulationStrategy(stateRef.current, event.target.value as ControllerKind))}>
									{controllerOptions.map((kind) => <option value={kind} key={kind}>{CONTROLLER_LABELS[kind]}</option>)}
								</select>
								: <strong>{CONTROLLER_LABELS[state.strategy]}</strong>}
						</div>
						<div className={styles.ControlSet}>
							<span>Clients</span><strong>{state.clients.length}</strong>
							{challenge.controls.clients && <div className={styles.Stepper}>
								<button type="button" aria-label="Remove client" disabled={state.clients.length === 1} onClick={() => commitState(setClientCount(stateRef.current, stateRef.current.clients.length - 1))}>−</button>
								<button type="button" aria-label="Add client" disabled={state.clients.length === MAX_CLIENTS} onClick={() => commitState(setClientCount(stateRef.current, stateRef.current.clients.length + 1))}>+</button>
							</div>}
						</div>
						<div className={styles.ControlSet}>
							<span>Workers</span><strong>{state.workers}</strong>
							{challenge.controls.workers && <div className={styles.Stepper}>
								<button type="button" aria-label="Remove worker" disabled={state.workers === 1} onClick={() => commitState(setWorkerCount(stateRef.current, stateRef.current.workers - 1))}>−</button>
								<button type="button" aria-label="Add worker" disabled={state.workers === MAX_WORKERS} onClick={() => commitState(setWorkerCount(stateRef.current, stateRef.current.workers + 1))}>+</button>
							</div>}
						</div>
						<div className={styles.ControlSet}>
							<span>Service time</span>
							{challenge.controls.processingTime
								? <div className={styles.Choice} role="group" aria-label="Processing time">
									<button type="button" className={state.serviceMs === 1000 ? styles.Selected : ""} aria-pressed={state.serviceMs === 1000} onClick={() => commitState({ ...stateRef.current, serviceMs: 1000 })}>1s</button>
									<button type="button" className={state.serviceMs === 3000 ? styles.Selected : ""} aria-pressed={state.serviceMs === 3000} onClick={() => commitState({ ...stateRef.current, serviceMs: 3000 })}>3s</button>
								</div>
								: <strong>{state.serviceMs / 1000}s</strong>}
						</div>
					</div>

				</div>

				<PixiCongestionScene state={state} running={isRunning} playbackSpeed={playbackSpeed} />
				<p className={styles.ScreenReaderSummary}>There are {state.clients.length} clients, {state.workers} workers, and {state.queueDepth} jobs waiting. {state.dropped} jobs have been rejected.</p>
				<div className={styles.QueueMeter}>
					<span>Queue</span>
					<div className={styles.QueueTrack} aria-hidden="true"><i style={{ width: `${state.queueDepth / (state.workers * WORKER_QUEUE_LIMIT) * 100}%` }} /></div>
					<strong>{state.queueDepth}/{state.workers * WORKER_QUEUE_LIMIT}</strong>
				</div>
			</div>

			<div className={styles.Metrics} aria-label="RED and USE metrics">
				<div><span>Completed / offered</span><strong>{formatMetricValue(state.completedRate)} / {formatMetricValue(state.sentRate)}/s</strong></div>
				<div className={isRejecting ? styles.MetricWarning : ""}><span>Rejected</span><strong>{metrics.rejectionRate === null ? "—" : `${formatMetricValue(metrics.rejectionRate * 100)}%`}</strong></div>
				<div className={(state.p99LatencyMs ?? 0) > 4000 ? styles.MetricWarning : ""}><span>p50 / p99</span><strong>{state.p50LatencyMs === null ? "—" : `${formatLatency(state.p50LatencyMs)} / ${formatLatency(state.p99LatencyMs ?? state.p50LatencyMs)}`}</strong></div>
				<div><span>Workers busy</span><strong>{formatMetricValue(state.utilisation * 100)}%</strong></div>
				<div className={state.queueDepth > 0 ? styles.MetricWarning : ""}><span>Queued</span><strong>{state.queueDepth}</strong></div>
			</div>

			<details className={styles.EndpointDetails}>
				<summary>Endpoint details</summary>
				<div className={styles.EndpointTable}>
					<p>Capacity <strong>{formatMetricValue(metrics.capacity)}/s</strong> · Client fairness <strong>{breakdown.clientThroughputFairness === null ? "—" : formatMetricValue(breakdown.clientThroughputFairness)}</strong> · Worker fairness <strong>{breakdown.workerThroughputFairness === null ? "—" : formatMetricValue(breakdown.workerThroughputFairness)}</strong></p>
					<table>
						<thead><tr><th>Client</th><th>Completed</th><th>Rejected</th><th>p99</th></tr></thead>
						<tbody>{breakdown.byClient.map((client, index) => <tr key={index}><th scope="row">{index + 1}</th><td>{formatMetricValue(client.completedRate)}/s</td><td>{client.rejectionRate === null ? "—" : `${formatMetricValue(client.rejectionRate * 100)}%`}</td><td>{client.p99LatencyMs === null ? "—" : formatLatency(client.p99LatencyMs)}</td></tr>)}</tbody>
					</table>
					<table>
						<thead><tr><th>Worker</th><th>Completed</th><th>Busy</th><th>p99</th></tr></thead>
						<tbody>{breakdown.byWorker.map((worker, index) => <tr key={index}><th scope="row">{index + 1}</th><td>{formatMetricValue(worker.completedRate)}/s</td><td>{formatMetricValue(worker.utilisation * 100)}%</td><td>{worker.p99LatencyMs === null ? "—" : formatLatency(worker.p99LatencyMs)}</td></tr>)}</tbody>
					</table>
					<table>
						<thead><tr><th>Client → worker</th><th>In flight</th><th>Limit</th><th>RTT</th></tr></thead>
						<tbody>{state.clients.flatMap((client, clientIndex) => client.endpoints.map((endpoint, worker) => (
							<tr key={`${clientIndex}:${worker}`}>
								<th scope="row">{clientIndex + 1} → {worker + 1}</th>
								<td>{state.jobs.filter((job) => job.client === clientIndex && job.service === worker).length}</td>
								<td>{client.strategy === "rate" ? `${RATE_PER_ENDPOINT}/s` : formatMetricValue(endpoint.controller.limit)}</td>
								<td>{endpoint.observed ? formatLatency(endpoint.metrics.latencyMs) : "Cold"}</td>
							</tr>
						)))}</tbody>
					</table>
				</div>
			</details>
		</section>
	);
}
