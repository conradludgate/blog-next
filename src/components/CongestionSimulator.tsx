"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/styles/CongestionSimulator.module.css";
import {
	advanceSimulation,
	createInitialState,
	FIXED_CONCURRENCY_PER_CLIENT,
	QUEUE_LIMIT_PER_WORKER,
	MAX_CLIENTS,
	MAX_WORKERS,
	RATE_PER_CLIENT,
	setClientCount,
	setStrategy as setSimulationStrategy,
	setWorkerCount,
	serviceCapacity,
	TICK_MS,
	WORKER_TRAVEL_MS,
	ROUTING_MS,
} from "./congestion/simulation";
import type { ControllerKind, JobStage, SimulationState } from "./congestion/simulation";

function stackPosition(count: number, index: number, top: number, bottom: number): number {
	if (count === 1) {
		return (top + bottom) / 2;
	}

	return top + ((bottom - top) * index) / (count - 1);
}

function quadraticPoint(start: Point, control: Point, end: Point, progress: number): Point {
	const inverse = 1 - progress;
	return {
		x: inverse * inverse * start.x + 2 * inverse * progress * control.x + progress * progress * end.x,
		y: inverse * inverse * start.y + 2 * inverse * progress * control.y + progress * progress * end.y,
	};
}

interface Point {
	x: number;
	y: number;
}

function drawPath(ctx: CanvasRenderingContext2D, start: Point, control: Point, end: Point, color: string) {
	ctx.beginPath();
	ctx.moveTo(start.x, start.y);
	ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
	ctx.strokeStyle = color;
	ctx.setLineDash([4, 5]);
	ctx.lineWidth = 1;
	ctx.stroke();
	ctx.setLineDash([]);
}

function drawArrow(ctx: CanvasRenderingContext2D, point: Point, angle: number, color: string) {
	ctx.save();
	ctx.translate(point.x, point.y);
	ctx.rotate(angle);
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(-7, -4);
	ctx.lineTo(-7, 4);
	ctx.closePath();
	ctx.fillStyle = color;
	ctx.fill();
	ctx.restore();
}

function drawNode(ctx: CanvasRenderingContext2D, point: Point, label: string, detail: string, busy: boolean, ink: string, bg: string, accent: string) {
	const width = 104;
	const height = 54;
	const left = point.x - width / 2;
	const top = point.y - height / 2;

	ctx.save();
	ctx.fillStyle = busy ? "rgba(180, 75, 49, 0.12)" : bg;
	ctx.strokeStyle = ink;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.roundRect(left, top, width, height, 8);
	ctx.shadowColor = accent;
	ctx.shadowBlur = 0;
	ctx.shadowOffsetX = 3;
	ctx.shadowOffsetY = 3;
	ctx.fill();
	ctx.stroke();
	ctx.restore();

	ctx.fillStyle = ink;
	ctx.font = "700 13px system-ui, sans-serif";
	ctx.fillText(label, left + 11, top + 21);
	ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
	ctx.font = "11px system-ui, sans-serif";
	ctx.fillText(detail, left + 11, top + 39);
}

function drawJob(ctx: CanvasRenderingContext2D, point: Point, id: number, accent: string, ink: string) {
	ctx.save();
	ctx.beginPath();
	ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
	ctx.fillStyle = accent;
	ctx.strokeStyle = ink;
	ctx.lineWidth = 2;
	ctx.fill();
	ctx.stroke();
	ctx.fillStyle = "white";
	ctx.font = "700 8px system-ui, sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(String(id % 100), point.x, point.y + 0.5);
	ctx.restore();
}

function drawScene(ctx: CanvasRenderingContext2D, width: number, height: number, state: SimulationState, elapsedMs: number) {
	const styles = getComputedStyle(ctx.canvas);
	const ink = styles.color || "#1d1d1d";
	const bg = styles.backgroundColor || "transparent";
	const accent = "#b44b31";
	const clientX = 72;
	const serviceX = width - 72;
	const queueX = serviceX - 126;
	const lb = { x: width * 0.42, y: height / 2 };
	const nodeTop = 52;
	const nodeBottom = height - 52;
	const clientPoints = Array.from({ length: state.clients.length }, (_, index) => ({
		x: clientX,
		y: stackPosition(state.clients.length, index, nodeTop, nodeBottom),
	}));
	const servicePoints = Array.from({ length: state.workers }, (_, index) => ({
		x: serviceX,
		y: stackPosition(state.workers, index, nodeTop, nodeBottom),
	}));
	const queuePoint = (worker: number, index: number): Point => ({
		x: queueX - 18 + (index % 2) * 20,
		y: servicePoints[worker].y + 5 + Math.floor(index / 2) * 17,
	});
	const jobsForWorker = (worker: number, stage: JobStage) => state.jobs.filter((job) => job.stage === stage && job.service === worker);

	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = ink;
	ctx.font = "700 11px system-ui, sans-serif";
	ctx.fillText("CLIENTS", 20, 22);
	ctx.fillText("RANDOM ROUTING", lb.x - 44, 22);
	ctx.fillText("SERVICE WORKERS", width - 124, 22);

	clientPoints.forEach((client) => {
		const end = { x: lb.x - 30, y: lb.y };
		const control = { x: width * 0.28, y: client.y + (end.y - client.y) * 0.35 };
		drawPath(ctx, { x: client.x + 52, y: client.y }, control, end, "rgba(0, 0, 0, 0.24)");
		drawArrow(ctx, quadraticPoint({ x: client.x + 52, y: client.y }, control, end, 0.97), Math.atan2(end.y - control.y, end.x - control.x), "rgba(0, 0, 0, 0.35)");
	});

	servicePoints.forEach((service) => {
		const routingStart = { x: lb.x + 30, y: lb.y };
		const routingEnd = { x: queueX - 36, y: service.y };
		const routingControl = { x: width * 0.66, y: routingStart.y + (routingEnd.y - routingStart.y) * 0.35 };
		drawPath(ctx, routingStart, routingControl, routingEnd, "rgba(0, 0, 0, 0.24)");
		drawArrow(ctx, quadraticPoint(routingStart, routingControl, routingEnd, 0.97), Math.atan2(routingEnd.y - routingControl.y, routingEnd.x - routingControl.x), "rgba(0, 0, 0, 0.35)");

		const start = { x: queueX + 36, y: service.y };
		const end = { x: service.x - 52, y: service.y };
		drawPath(ctx, start, { x: (start.x + end.x) / 2, y: service.y }, end, "rgba(0, 0, 0, 0.24)");
		drawArrow(ctx, { x: end.x - 2, y: end.y }, 0, "rgba(0, 0, 0, 0.35)");
	});

	clientPoints.forEach((client, index) => {
		const detail = state.strategy === "rate"
			? RATE_PER_CLIENT + "/s source"
			: Math.floor(state.clients[index].controller.limit) + " in flight";
		drawNode(ctx, client, "Client " + (index + 1), detail, false, ink, bg, accent);
	});

	servicePoints.forEach((service, index) => {
		const queuedJobs = jobsForWorker(index, "queue");
		const busy = state.jobs.some((job) => (job.stage === "service" || job.stage === "serviceDispatch") && job.service === index);

		ctx.save();
		ctx.fillStyle = queuedJobs.length > 0 ? "rgba(180, 75, 49, 0.12)" : bg;
		ctx.strokeStyle = ink;
		ctx.lineWidth = 1.5;
		ctx.setLineDash([4, 3]);
		ctx.beginPath();
		ctx.roundRect(queueX - 36, service.y - 29, 72, 58, 6);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
		ctx.setLineDash([]);
		ctx.fillStyle = ink;
		ctx.font = "700 9px system-ui, sans-serif";
		ctx.fillText("q" + (index + 1) + " " + queuedJobs.length + "/" + QUEUE_LIMIT_PER_WORKER, queueX - 29, service.y - 13);

		for (let slot = 0; slot < QUEUE_LIMIT_PER_WORKER; slot += 1) {
			const point = queuePoint(index, slot);
			ctx.fillStyle = slot < queuedJobs.length ? accent : "rgba(0, 0, 0, 0.08)";
			ctx.fillRect(point.x - 6, point.y - 6, 12, 12);
		}

		const serviceJob = state.jobs.find((job) => job.stage === "service" && job.service === index);
		const dispatching = state.jobs.some((job) => job.stage === "serviceDispatch" && job.service === index);
		drawNode(ctx, service, "Worker " + (index + 1), busy ? "processing work" : "ready", busy, ink, bg, accent);
		if (serviceJob) {
			drawJob(ctx, { x: service.x + 34, y: service.y + 10 }, serviceJob.id, accent, ink);
		} else if (dispatching) {
			const dispatchJob = state.jobs.find((job) => job.stage === "serviceDispatch" && job.service === index);
			if (dispatchJob) {
				drawJob(ctx, { x: service.x + 34, y: service.y + 10 }, dispatchJob.id, accent, ink);
			}
		}
	});

	ctx.save();
	ctx.fillStyle = bg;
	ctx.strokeStyle = ink;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.roundRect(lb.x - 30, lb.y - 25, 60, 50, 8);
	ctx.fill();
	ctx.stroke();
	ctx.restore();
	ctx.fillStyle = ink;
	ctx.font = "700 14px system-ui, sans-serif";
	ctx.textAlign = "center";
	ctx.fillText("LB", lb.x, lb.y + 5);
	ctx.textAlign = "start";

	state.jobs.forEach((job) => {
		if (job.stage === "network") {
			const start = { x: clientX + 52, y: clientPoints[job.client]?.y ?? height / 2 };
			const end = { x: lb.x - 30, y: lb.y };
			const control = { x: width * 0.28, y: start.y + (end.y - start.y) * 0.35 };
			const progress = Math.min(1, Math.max(0, 1 - Math.max(0, job.remainingMs - elapsedMs) / state.networkMs));
			drawJob(ctx, quadraticPoint(start, control, end, progress), job.id, accent, ink);
		}

		if (job.stage === "routing" && job.service !== undefined && servicePoints[job.service]) {
			const start = { x: lb.x + 30, y: lb.y };
			const end = { x: queueX - 36, y: servicePoints[job.service].y };
			const control = { x: width * 0.66, y: start.y + (end.y - start.y) * 0.35 };
			const progress = Math.min(1, Math.max(0, 1 - Math.max(0, job.remainingMs - elapsedMs) / ROUTING_MS));
			drawJob(ctx, quadraticPoint(start, control, end, progress), job.id, accent, ink);
		}

		if (job.stage === "queue" && job.service !== undefined) {
			const queuedJobs = jobsForWorker(job.service, "queue");
			const index = queuedJobs.findIndex((candidate) => candidate.id === job.id);
			if (index >= 0) {
				drawJob(ctx, queuePoint(job.service, index), job.id, accent, ink);
			}
		}

		if (job.stage === "serviceDispatch" && job.service !== undefined && servicePoints[job.service]) {
			const start = { x: queueX + 36, y: servicePoints[job.service].y };
			const end = { x: serviceX - 52, y: servicePoints[job.service].y };
			const progress = Math.min(1, Math.max(0, 1 - Math.max(0, job.remainingMs - elapsedMs) / WORKER_TRAVEL_MS));
			drawJob(ctx, { x: start.x + (end.x - start.x) * progress, y: start.y }, job.id, accent, ink);
		}
	});
}

const CONTROLLER_OPTIONS: Array<{ kind: ControllerKind; label: string }> = [
	{ kind: "rate", label: "Rate" },
	{ kind: "concurrency", label: "Concurrency" },
	{ kind: "aimd", label: "AIMD" },
	{ kind: "vegas", label: "Vegas" },
	{ kind: "gradient2", label: "Gradient2" },
];

export default function CongestionSimulator() {
	const [isRunning, setIsRunning] = useState(true);
	const [state, setState] = useState<SimulationState>(() => createInitialState());
	const metrics = useMemo(() => ({
		averageLimit: state.clients.reduce((total, client) => total + client.controller.limit, 0) / state.clients.length,
		capacity: serviceCapacity(state),
	}), [state]);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const sceneStateRef = useRef(state);
	const sceneUpdatedAtRef = useRef(0);

	useEffect(() => {
		sceneStateRef.current = state;
		sceneUpdatedAtRef.current = performance.now();
	}, [state]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const context = canvas.getContext("2d");
		if (!context) {
			return;
		}

		let frame = 0;
		const render = (now: number) => {
			const rect = canvas.getBoundingClientRect();
			const width = Math.max(320, rect.width);
			const height = Math.max(420, rect.height);
			const pixelRatio = window.devicePixelRatio || 1;
			const pixelWidth = Math.round(width * pixelRatio);
			const pixelHeight = Math.round(height * pixelRatio);

			if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
				canvas.width = pixelWidth;
				canvas.height = pixelHeight;
			}

			context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
			drawScene(
				context,
				width,
				height,
				sceneStateRef.current,
				Math.min(TICK_MS, Math.max(0, now - sceneUpdatedAtRef.current)),
			);
			frame = requestAnimationFrame(render);
		};

		frame = requestAnimationFrame(render);
		return () => cancelAnimationFrame(frame);
	}, []);

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
					<p className={styles.Eyebrow}>First experiment</p>
					<h2 id="congestion-simulator-title">A fixed limit meets a changing system</h2>
			</div>
			<div className={styles.HeaderControls}>
					<span className={styles.Clock}>t = {(state.nowMs / 1000).toFixed(1)}s</span>
					<button
						type="button"
						className={styles.Play}
						aria-pressed={isRunning}
						onClick={() => setIsRunning((running) => !running)}
					>
						{isRunning ? "Pause" : "Play"}
					</button>
					<span className={state.queueDepth > 0 ? styles.Warning : styles.Healthy}>
						{state.queueDepth > 0 ? "Queueing" : "Healthy"}
					</span>
				</div>
			</div>

			<div className={styles.ModeSwitcher} role="group" aria-label="Choose a controller">
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

			<p className={styles.Description}>
				{state.strategy === "rate" && `${RATE_PER_CLIENT} requests per second per client, regardless of latency.`}
				{state.strategy === "concurrency" && `${FIXED_CONCURRENCY_PER_CLIENT} requests in flight per client, using a fixed window.`}
				{state.strategy === "aimd" && "Additively increase the window after success; halve it when work is rejected."}
				{state.strategy === "vegas" && "Use the extra round-trip delay to keep a small queue at the service."}
				{state.strategy === "gradient2" && "Compare short- and long-term latency to follow the service’s changing capacity."}
			</p>

			<div className={styles.SceneFrame}>
				<div className={styles.SceneControls}>
					<div>
						<span className={styles.ColumnLabel}>Clients</span>
						<span className={styles.ColumnDetail}>{state.clients.length} active {state.clients.length === 1 ? "client" : "clients"}</span>
					</div>
					<div className={styles.SceneControlGroup}>
						<span className={styles.ColumnLabel}>Service</span>
						<span className={styles.ColumnDetail}>{state.workers} workers · {metrics.capacity}/s capacity</span>
					</div>
					<div className={styles.ControlSets}>
						<div className={styles.ControlSet}>
							<span className={styles.ControlLabel}>clients</span>
							<div className={styles.Stepper}>
								<button type="button" aria-label="Remove client" disabled={state.clients.length === 1} onClick={() => changeClients(-1)}>−</button>
								<button type="button" aria-label="Add client" disabled={state.clients.length === MAX_CLIENTS} onClick={() => changeClients(1)}>+</button>
							</div>
						</div>
						<div className={styles.ControlSet}>
							<span className={styles.ControlLabel}>workers</span>
							<div className={styles.Stepper}>
								<button type="button" aria-label="Remove worker" disabled={state.workers === 1} onClick={() => changeWorkers(-1)}>−</button>
								<button type="button" aria-label="Add worker" disabled={state.workers === MAX_WORKERS} onClick={() => changeWorkers(1)}>+</button>
							</div>
						</div>
					</div>
				</div>
				<canvas
					ref={canvasRef}
					className={styles.SceneCanvas}
					role="img"
					aria-label="Animated diagram of individual clients sending jobs through a load balancer and FIFO queue to individual service workers"
				>
					The simulator diagram shows jobs travelling from clients through random load-balancer routes into per-worker queues and services.
				</canvas>
				<p className={styles.SceneNote}>The load balancer picks a worker at random. Jobs wait in that worker&apos;s FIFO queue before travelling into the service.</p>
			</div>

			<div className={styles.Metrics} aria-live="polite">
				<div><span>Sent rate</span><strong>{state.sentRate.toFixed(1)}/s</strong></div>
				<div><span>Client limit</span><strong>{state.strategy === "rate" ? `${RATE_PER_CLIENT}/s` : metrics.averageLimit.toFixed(1)}</strong></div>
				<div><span>Observed latency</span><strong>{state.latencyMs}ms</strong></div>
				<div><span>Rejected</span><strong>{state.dropped}</strong></div>
			</div>

			<div className={styles.Footer}>
				<p>The clock runs by itself. Add or remove clients and workers to create pressure, then watch the independent queues respond.</p>
				<button type="button" className={styles.Reset} onClick={reset}>Reset</button>
			</div>
		</section>
	);
}
