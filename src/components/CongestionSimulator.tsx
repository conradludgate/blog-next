"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type JobStage = "network" | "routing" | "queue" | "serviceDispatch" | "service";

interface Job {
	id: number;
	client: number;
	stage: JobStage;
	remainingMs: number;
	service?: number;
}

const QUEUE_LIMIT_PER_WORKER = 4;
const TICK_MS = 250;
const ROUTING_MS = 500;
const WORKER_TRAVEL_MS = 350;
const INITIAL_STATE: SimulationState = {
	clients: 1,
	workers: 4,
	serviceMs: 1000,
	networkMs: 900,
	workerPerformance: [1, 1, 1, 1],
		jobs: [],
	nextJobId: 1,
	arrivalCredit: 0,
	queue: 0,
	latencyMs: 1900,
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

function randomWorker(workerCount: number): number {
	return Math.floor(Math.random() * workerCount);
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

	let jobs = [...progressedJobs, ...newJobs];
	const waitingJobs = jobs.filter((job) => job.stage === "queue");
	const rejectedJobs = waitingJobs.filter((job) => {
		if (job.service === undefined) {
			return false;
		}

		return waitingJobs.filter((candidate) => candidate.service === job.service).findIndex((candidate) => candidate.id === job.id) >= QUEUE_LIMIT_PER_WORKER;
	});
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
			break;
		}

		jobs[nextJobIndex] = {
			...jobs[nextJobIndex],
			stage: "serviceDispatch",
			service: worker,
			remainingMs: WORKER_TRAVEL_MS,
		};
		occupiedWorkers.add(worker);
	}

	const queue = jobs.filter((job) => job.stage === "queue").length;
	const maxQueue = Math.max(
		0,
		...Array.from({ length: current.workers }, (_, worker) => jobs.filter((job) => job.stage === "queue" && job.service === worker).length),
	);
	return {
		...current,
		workerPerformance,
		jobs,
		nextJobId,
		arrivalCredit,
		queue,
		latencyMs: current.networkMs + current.serviceMs + maxQueue * current.serviceMs,
		dropped: current.dropped + rejectedJobs.length,
		seconds: current.seconds + TICK_MS / 1000,
	};
}

function getMetrics(state: SimulationState, mode: Mode) {
	const offered = offeredRequests(state, mode);
	const capacity = serviceCapacity(state);

	return { offered, capacity };
}

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
	const clientPoints = Array.from({ length: state.clients }, (_, index) => ({
		x: clientX,
		y: stackPosition(state.clients, index, nodeTop, nodeBottom),
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
		drawNode(ctx, client, "Client " + (index + 1), RATE_PER_CLIENT + "/s source", false, ink, bg, accent);
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

export default function CongestionSimulator() {
	const [mode, setMode] = useState<Mode>("rate");
	const [isRunning, setIsRunning] = useState(true);
	const [state, setState] = useState<SimulationState>(INITIAL_STATE);
	const metrics = useMemo(() => getMetrics(state, mode), [mode, state]);
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
				job.service !== undefined && job.service >= workers
					? { ...job, stage: "network" as const, service: randomWorker(workers), remainingMs: current.networkMs }
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

			<div className={styles.SceneFrame}>
				<div className={styles.SceneControls}>
					<div>
						<span className={styles.ColumnLabel}>Clients</span>
						<span className={styles.ColumnDetail}>{state.clients} active {state.clients === 1 ? "client" : "clients"}</span>
					</div>
					<div className={styles.SceneControlGroup}>
						<span className={styles.ColumnLabel}>Service</span>
						<span className={styles.ColumnDetail}>{state.workers} workers · {metrics.capacity}/s capacity</span>
					</div>
					<div className={styles.ControlSets}>
						<div className={styles.ControlSet}>
							<span className={styles.ControlLabel}>clients</span>
							<div className={styles.Stepper}>
								<button type="button" aria-label="Remove client" disabled={state.clients === 1} onClick={() => changeClients(-1)}>−</button>
								<button type="button" aria-label="Add client" disabled={state.clients === 8} onClick={() => changeClients(1)}>+</button>
							</div>
						</div>
						<div className={styles.ControlSet}>
							<span className={styles.ControlLabel}>workers</span>
							<div className={styles.Stepper}>
								<button type="button" aria-label="Remove worker" disabled={state.workers === 1} onClick={() => changeWorkers(-1)}>−</button>
								<button type="button" aria-label="Add worker" disabled={state.workers === 8} onClick={() => changeWorkers(1)}>+</button>
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
				<div><span>Offered rate</span><strong>{metrics.offered}/s</strong></div>
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
