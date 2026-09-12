"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/styles/CongestionSimulator.module.css";
import { LESSONS, createLesson, applyLessonAction } from "./congestion/lessons";
import { createConditionProgress, updateConditionProgress } from "./congestion/conditions";
import PixiCongestionScene from "./congestion/PixiCongestionScene";
import {
	advanceSimulation,
	FIXED_CONCURRENCY_PER_ENDPOINT,
	MAX_CLIENTS,
	MAX_WORKERS,
	RATE_PER_ENDPOINT,
	setClientCount,
	setStrategy as setSimulationStrategy,
	setWorkerCount,
	serviceCapacity,
	TICK_MS,
	WORKER_QUEUE_LIMIT,
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
	const [state, setState] = useState<SimulationState>(() => createLesson(0));
	const [lessonIndex, setLessonIndex] = useState(0);
	const [guided, setGuided] = useState(true);
	const [acted, setActed] = useState(false);
	const [conditionProgress, setConditionProgress] = useState(() => createConditionProgress(LESSONS[0].conditions));
	const lesson = LESSONS[lessonIndex];
	const stateRef = useRef(state);
	const lessonRef = useRef(lesson);
	const guidedRef = useRef(guided);
	const actedRef = useRef(acted);
	const conditionBaselineRef = useRef<SimulationState>(createLesson(0));
	const metrics = useMemo(() => ({
		rejectionRate: state.rejectionRate,
		capacity: serviceCapacity(state),
	}), [state]);
	const isRejecting = (metrics.rejectionRate ?? 0) > 0.005;
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
			const next = advanceSimulation(stateRef.current);
			stateRef.current = next;
			setState(next);
			if (guidedRef.current) {
				setConditionProgress((current) => updateConditionProgress(
					lessonRef.current.conditions,
					current,
					next,
					conditionBaselineRef.current,
					actedRef.current,
				));
			}
		}, TICK_MS);

		return () => window.clearInterval(timer);
	}, [isRunning]);

	function changeStrategy(strategy: ControllerKind) {
		const next = setSimulationStrategy(stateRef.current, strategy);
		stateRef.current = next;
		setState(next);
	}

	function changeClients(delta: number) {
		const next = setClientCount(stateRef.current, stateRef.current.clients.length + delta);
		stateRef.current = next;
		setState(next);
	}

	function changeWorkers(delta: number) {
		const next = setWorkerCount(stateRef.current, stateRef.current.workers + delta);
		stateRef.current = next;
		setState(next);
	}

	function loadLesson(index: number) {
		const next = createLesson(index);
		setLessonIndex(index);
		lessonRef.current = LESSONS[index];
		setState(next);
		stateRef.current = next;
		conditionBaselineRef.current = next;
		setConditionProgress(createConditionProgress(LESSONS[index].conditions));
		setActed(false);
		actedRef.current = false;
		setGuided(true);
		guidedRef.current = true;
		setIsRunning(true);
	}

	function runLessonAction() {
		const baseline = stateRef.current;
		const next = applyLessonAction(baseline, lessonIndex);
		conditionBaselineRef.current = baseline;
		stateRef.current = next;
		setState(next);
		setActed(true);
		actedRef.current = true;
		setConditionProgress((current) => updateConditionProgress(lesson.conditions, current, next, baseline, true));
		setIsRunning(true);
	}

	function exploreFreely() {
		setGuided(false);
		guidedRef.current = false;
	}

	function reset() {
		if (guided) { loadLesson(lessonIndex); return; }
		const next = setSimulationStrategy(stateRef.current, stateRef.current.strategy);
		stateRef.current = next;
		setState(next);
	}

	return (
		<section className={styles.Simulator} aria-labelledby="congestion-simulator-title">
			<div className={styles.Header}>
				<div>
					<p className={styles.Eyebrow}>{guided ? `Experiment ${lessonIndex + 1} of ${LESSONS.length}` : "Free exploration"}</p>
					<h2 id="congestion-simulator-title">{guided ? lesson.title : "A fixed limit meets a changing system"}</h2>
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

			{guided ? <div className={styles.Lesson}>
				<p>{lesson.introduction}</p>
				<div className={styles.LessonActions}>
					<button type="button" disabled={acted} onClick={runLessonAction}>{acted ? "Change applied" : lesson.action}</button>
					<button type="button" onClick={() => loadLesson(lessonIndex)}>Replay experiment</button>
					<button type="button" onClick={exploreFreely}>Explore freely</button>
				</div>
				<p className={styles.Observation} aria-live="polite">{acted ? lesson.observation : "Make a prediction, then apply the change. The clock keeps running."}</p>
				{acted && <ul className={styles.Conditions} aria-label="Experiment checks">
					{lesson.conditions.map((condition) => {
						const completed = (conditionProgress[condition.id]?.completedAtMs ?? null) !== null;
						return <li className={completed ? styles.ConditionComplete : ""} key={condition.id}>
							<span aria-hidden="true">{completed ? "✓" : "○"}</span>
							<div><strong>{condition.label}</strong><small>{condition.description}</small></div>
						</li>;
					})}
				</ul>}
				<nav className={styles.LessonActions} aria-label="Experiments">
					<button type="button" disabled={lessonIndex === 0} onClick={() => loadLesson(lessonIndex - 1)}>Previous</button>
					<button type="button" disabled={!acted} onClick={() => lessonIndex + 1 < LESSONS.length ? loadLesson(lessonIndex + 1) : exploreFreely()}>{lessonIndex + 1 < LESSONS.length ? "Next experiment" : "Explore all controllers"}</button>
				</nav>
				<small>Each experiment starts a fresh run. Applying its change preserves requests and existing controller histories.</small>
			</div> : <div className={styles.Challenge}>
				<p>Change clients, workers, or processing time and follow the response.</p>
				<button className={styles.Reset} type="button" onClick={() => loadLesson(0)}>Restart guided tour</button>
			</div>}

			{!guided && <div className={styles.ControllerRow}>
				<span className={styles.ControllerLabel}>Clients send using</span>
				<select className={styles.MobileController} aria-label="Choose how clients send work" value={state.strategy} onChange={(event) => changeStrategy(event.target.value as ControllerKind)}>
					{CONTROLLER_OPTIONS.map((option) => <option value={option.kind} key={option.kind}>{option.label}</option>)}
				</select>
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
			</div>}

			<p className={styles.Description} aria-live="polite">
				{state.strategy === "rate" && `${RATE_PER_ENDPOINT} requests per second per client–worker pair. Every client uses Power of Two to choose a destination.`}
				{state.strategy === "concurrency" && `${FIXED_CONCURRENCY_PER_ENDPOINT} request in flight per client–worker pair. Each worker has its own admission limit.`}
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
								<button type="button" aria-label="Remove client" disabled={guided || state.clients.length === 1} onClick={() => changeClients(-1)}>−</button>
								<button type="button" aria-label="Add client" disabled={guided || state.clients.length === MAX_CLIENTS} onClick={() => changeClients(1)}>+</button>
							</div>
						</div>
						<div className={styles.ControlSet}>
							<span className={styles.ControlLabel}>Workers <strong>{state.workers}</strong></span>
							<div className={styles.Stepper}>
								<button type="button" aria-label="Remove worker" disabled={guided || state.workers === 1} onClick={() => changeWorkers(-1)}>−</button>
								<button type="button" aria-label="Add worker" disabled={guided || state.workers === MAX_WORKERS} onClick={() => changeWorkers(1)}>+</button>
							</div>
						</div>
					</div>
					{!guided && <label className={styles.ControlLabel}>Processing time
						<select className={styles.ProcessingTime} value={state.serviceMs} onChange={(event) => {
							const next = { ...stateRef.current, serviceMs: Number(event.target.value) };
							stateRef.current = next;
							setState(next);
						}}>
							<option value={1000}>Normal</option><option value={3000}>3× slower</option>
						</select>
					</label>}
					<div className={styles.CapacitySummary}>
						<span>{state.serviceMs === 3000 ? "Slower workers · capacity" : "Estimated capacity"}</span>
						<strong>{formatMetricValue(metrics.capacity)} jobs/s</strong>
					</div>
				</div>
				<PixiCongestionScene state={state} />
				<p className={styles.ScreenReaderSummary}>There are {state.clients.length} clients, {state.workers} workers, and {state.queueDepth} jobs waiting. {state.dropped} jobs have been rejected.</p>
				<div className={styles.QueueMeter}>
					<span>Total queued</span>
					<div className={styles.QueueTrack} aria-hidden="true"><i style={{ width: `${state.queueDepth / (state.workers * WORKER_QUEUE_LIMIT) * 100}%` }} /></div>
					<strong>{state.queueDepth} / {state.workers * WORKER_QUEUE_LIMIT}</strong>
				</div>
			</div>

			<div className={styles.Metrics}>
				<div><span><b>Rate</b> Completed / offered</span><strong>{formatMetricValue(state.completedRate)} / {formatMetricValue(state.sentRate)}/s</strong></div>
				<div className={isRejecting ? styles.MetricWarning : ""}><span><b>Errors</b> Rejected</span><strong>{metrics.rejectionRate === null ? "—" : `${formatMetricValue(metrics.rejectionRate * 100)}%`}</strong></div>
				<div className={(state.latencyMs ?? 0) > 4000 ? styles.MetricWarning : ""}><span><b>Duration</b> Mean successful RTT</span><strong>{state.latencyMs === null ? "—" : formatLatency(state.latencyMs)}</strong></div>
				<div className={state.queueDepth > 0 ? styles.MetricWarning : ""}><span><b>Saturation</b> Waiting</span><strong>{state.queueDepth}</strong></div>
			</div>

			<details className={styles.EndpointDetails}>
				<summary>Inspect client–worker controllers</summary>
				<p>Each client keeps its own latency estimate and limit for each worker. The source waits when both sampled workers have no admission budget.</p>
				<div className={styles.EndpointTable}>
					<table>
						<thead><tr><th>Client → worker</th><th>In flight</th><th>Limit</th><th>RTT</th></tr></thead>
						<tbody>{state.clients.flatMap((client, clientIndex) => client.endpoints.map((endpoint, worker) => (
							<tr key={`${clientIndex}:${worker}`}>
								<th scope="row">{clientIndex + 1} → {worker + 1}</th>
								<td>{state.jobs.filter((job) => job.client === clientIndex && job.service === worker).length}</td>
								<td>{state.strategy === "rate" ? `${RATE_PER_ENDPOINT}/s` : formatMetricValue(endpoint.controller.limit)}</td>
								<td>{endpoint.observed ? formatLatency(endpoint.metrics.latencyMs) : "Cold"}</td>
							</tr>
						)))}</tbody>
					</table>
				</div>
			</details>
			<div className={styles.Footer}>
				<p>Each dot is one request. Rates and outcomes cover the last 10 seconds (since reset during startup). Rejection is the share of finished attempts rejected by the queue; latency measures successful requests. A dash means no samples.</p>
				<button type="button" className={styles.Reset} onClick={reset}>Start over</button>
			</div>
		</section>
	);
}
