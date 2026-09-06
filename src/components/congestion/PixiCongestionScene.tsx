"use client";

import { Application, Container, Graphics, Text } from "pixi.js";
import { useEffect, useRef } from "react";
import styles from "@/styles/CongestionSimulator.module.css";
import { ROUTING_MS, SHARED_QUEUE_LIMIT, TICK_MS, WORKER_TRAVEL_MS } from "./simulation";
import type { Job, SimulationState } from "./simulation";

interface Point {
	x: number;
	y: number;
}

interface NodeView {
	container: Container;
	body: Graphics;
	detail: Text;
}

interface JobView {
	container: Container;
	from: Point;
	to: Point;
	progress: number;
	durationMs: number;
	removing: boolean;
}

interface SceneLayout {
	width: number;
	height: number;
	clientX: number;
	serviceX: number;
	queueX: number;
	lb: Point;
	clients: Point[];
	workers: Point[];
}

const ACCENT = "#b44b31";
const JOB_INK = "#ffffff";
const NODE_WIDTH = 104;
const NODE_HEIGHT = 54;

function stackPosition(count: number, index: number, top: number, bottom: number): number {
	return count === 1 ? (top + bottom) / 2 : top + ((bottom - top) * index) / (count - 1);
}

function quadraticPoint(start: Point, control: Point, end: Point, progress: number): Point {
	const inverse = 1 - progress;
	return {
		x: inverse * inverse * start.x + 2 * inverse * progress * control.x + progress * progress * end.x,
		y: inverse * inverse * start.y + 2 * inverse * progress * control.y + progress * progress * end.y,
	};
}

function makeText(text: string, fontSize: number, fill: string, weight: "400" | "700"): Text {
	return new Text({
		text,
		style: { fontFamily: "system-ui, sans-serif", fontSize, fontWeight: weight, fill },
	});
}

function formatLimit(limit: number): string {
	return Number.isFinite(limit) ? Number(limit.toPrecision(2)).toString() : "0";
}

class PixiScene {
	private readonly app: Application;
	private readonly staticLayer = new Container();
	private readonly jobLayer = new Container();
	private readonly jobViews = new Map<number, JobView>();
	private readonly clientViews: NodeView[] = [];
	private readonly workerViews: NodeView[] = [];
	private readonly queueSlots: Graphics[] = [];
	private queueLabel?: Text;
	private layout?: SceneLayout;
	private layoutKey = "";
	private state: SimulationState;

	constructor(app: Application, state: SimulationState) {
		this.app = app;
		this.state = state;
		this.app.stage.addChild(this.staticLayer, this.jobLayer);
	}

	resize(width: number, height: number) {
		this.app.renderer.resize(width, height);
		this.layoutKey = "";
		this.ensureLayout();
		this.updateState(this.state);
	}

	updateState(state: SimulationState) {
		this.state = state;
		this.ensureLayout();
		this.updateNodes();
		this.updateJobs();
	}

	tick(deltaMs: number) {
		for (const [id, view] of this.jobViews) {
			if (view.removing) {
				view.container.alpha = Math.max(0, view.container.alpha - deltaMs / 180);
				if (view.container.alpha === 0) {
					view.container.destroy({ children: true });
					this.jobViews.delete(id);
				}
				continue;
			}

			view.progress = Math.min(1, view.progress + deltaMs / view.durationMs);
			const point = quadraticPoint(view.from, this.controlPoint(view.from, view.to), view.to, view.progress);
			view.container.position.set(point.x, point.y);
		}
		this.app.render();
	}

	destroy() {
		this.app.ticker.stop();
		this.app.destroy({ removeView: true }, { children: true });
	}

	private controlPoint(start: Point, end: Point): Point {
		return { x: (start.x + end.x) / 2, y: start.y + (end.y - start.y) * 0.35 };
	}

	private ensureLayout() {
		const width = Math.max(320, this.app.screen.width);
		const height = Math.max(420, this.app.screen.height);
		const key = [width, height, this.state.clients.length, this.state.workers].join(":");
		if (key === this.layoutKey) {
			return;
		}

		this.layoutKey = key;
		this.layout = {
			width,
			height,
			clientX: 72,
			serviceX: width - 72,
			queueX: width * 0.66,
			lb: { x: width * 0.42, y: height / 2 },
			clients: Array.from({ length: this.state.clients.length }, (_, index) => ({
				x: 72,
				y: stackPosition(this.state.clients.length, index, 52, height - 52),
			})),
			workers: Array.from({ length: this.state.workers }, (_, index) => ({
				x: width - 72,
				y: stackPosition(this.state.workers, index, 52, height - 52),
			})),
		};

		this.buildLayout();
	}

	private buildLayout() {
		const layout = this.layout;
		if (!layout) return;

		this.staticLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
		this.clientViews.length = 0;
		this.workerViews.length = 0;
		this.queueSlots.length = 0;

		const computed = getComputedStyle(this.app.canvas);
		const ink = computed.color || "#1d1d1d";
		const bg = computed.backgroundColor || "transparent";
		const muted = ink;

		this.addPath({ x: layout.clientX + 52, y: layout.clients[0]?.y ?? layout.lb.y }, layout.lb, layout.width * 0.28, ink);
		this.addPath({ x: layout.lb.x + 30, y: layout.lb.y }, { x: layout.queueX - 52, y: layout.lb.y }, (layout.lb.x + layout.queueX) / 2, ink);
		layout.workers.forEach((worker) => this.addPath({ x: layout.queueX + 52, y: layout.lb.y }, { x: worker.x - 52, y: worker.y }, (layout.queueX + worker.x) / 2, ink));

		const clientsLabel = makeText("CLIENTS", 11, ink, "700");
		clientsLabel.position.set(20, 12);
		this.staticLayer.addChild(clientsLabel);
		const lbLabel = makeText("LOAD BALANCER", 11, ink, "700");
		lbLabel.position.set(layout.lb.x - 40, 12);
		this.staticLayer.addChild(lbLabel);
		const workersLabel = makeText("SERVICE WORKERS", 11, ink, "700");
		workersLabel.position.set(layout.width - 124, 12);
		this.staticLayer.addChild(workersLabel);

		layout.clients.forEach((point) => this.clientViews.push(this.addNode(point, "Client", bg, ink, muted)));
		layout.workers.forEach((point) => this.workerViews.push(this.addNode(point, "Worker", bg, ink, muted)));

		const queue = new Graphics().roundRect(layout.queueX - 52, layout.lb.y - 52, 104, 104, 8).fill(bg).stroke({ color: ink, width: 2 });
		this.staticLayer.addChild(queue);
		this.queueLabel = makeText("QUEUE", 9, ink, "700");
		this.queueLabel.position.set(layout.queueX - 43, layout.lb.y - 42);
		this.staticLayer.addChild(this.queueLabel);
		for (let index = 0; index < SHARED_QUEUE_LIMIT; index += 1) {
			const point = this.queuePoint(index);
			const slot = new Graphics().rect(point.x - 6, point.y - 6, 12, 12).fill({ color: ink, alpha: 0.08 });
			this.queueSlots.push(slot);
			this.staticLayer.addChild(slot);
		}

		const lb = new Graphics().roundRect(layout.lb.x - 30, layout.lb.y - 25, 60, 50, 8).fill(bg).stroke({ color: ink, width: 2 });
		this.staticLayer.addChild(lb);
		const lbText = makeText("LB", 14, ink, "700");
		lbText.anchor.set(0.5);
		lbText.position.set(layout.lb.x, layout.lb.y);
		this.staticLayer.addChild(lbText);
	}

	private addPath(start: Point, end: Point, controlX: number, ink: string) {
		const path = new Graphics().moveTo(start.x, start.y).quadraticCurveTo(controlX, start.y + (end.y - start.y) * 0.35, end.x, end.y).stroke({ color: ink, alpha: 0.24, width: 1 });
		this.staticLayer.addChild(path);
	}

	private addNode(point: Point, label: string, bg: string, ink: string, muted: string): NodeView {
		const container = new Container();
		container.position.set(point.x, point.y);
		const body = new Graphics();
		const title = makeText(label, 13, ink, "700");
		title.position.set(-41, -22);
		const detail = makeText("ready", 11, muted, "400");
		detail.position.set(-41, -4);
		detail.alpha = 0.58;
		container.addChild(body, title, detail);
		this.staticLayer.addChild(container);
		return { container, body, detail };
	}

	private updateNodes() {
		const layout = this.layout;
		if (!layout) return;

		const computed = getComputedStyle(this.app.canvas);
		const ink = computed.color || "#1d1d1d";
		const bg = computed.backgroundColor || "transparent";
		this.clientViews.forEach((view, index) => {
			view.detail.text = this.state.strategy === "rate" ? "0.5/s source" : `${formatLimit(this.state.clients[index].controller.limit)} in flight`;
			view.body.clear().roundRect(-NODE_WIDTH / 2, -NODE_HEIGHT / 2, NODE_WIDTH, NODE_HEIGHT, 8).fill(bg).stroke({ color: ink, width: 2 });
		});
		this.workerViews.forEach((view, index) => {
			const busy = this.state.jobs.some((job) => (job.stage === "service" || job.stage === "serviceDispatch") && job.service === index);
			view.detail.text = busy ? "processing work" : "ready";
			view.body.clear().roundRect(-NODE_WIDTH / 2, -NODE_HEIGHT / 2, NODE_WIDTH, NODE_HEIGHT, 8).fill(busy ? "rgba(180, 75, 49, 0.12)" : bg).stroke({ color: ink, width: 2 });
		});
		this.queueLabel!.text = `QUEUE ${this.state.jobs.filter((job) => job.stage === "queue").length}/${SHARED_QUEUE_LIMIT}`;
		const queueDepth = this.state.jobs.filter((job) => job.stage === "queue").length;
		this.queueSlots.forEach((slot, index) => slot.clear().rect(this.queuePoint(index).x - 6, this.queuePoint(index).y - 6, 12, 12).fill(index < queueDepth ? ACCENT : { color: ink, alpha: 0.08 }));
	}

	private queuePoint(index: number): Point {
		const layout = this.layout!;
		return { x: layout.queueX - 31 + (index % 4) * 20, y: layout.lb.y - 18 + Math.floor(index / 4) * 19 };
	}

	private jobPosition(job: Job): Point {
		const layout = this.layout!;
		const queuedJobs = this.state.jobs.filter((candidate) => candidate.stage === "queue");
		if (job.stage === "queue") return this.queuePoint(Math.max(0, queuedJobs.findIndex((candidate) => candidate.id === job.id)));
		if (job.stage === "network") return this.pathPosition({ x: layout.clientX + 52, y: layout.clients[job.client]?.y ?? layout.lb.y }, { x: layout.lb.x - 30, y: layout.lb.y }, job.remainingMs, this.state.networkMs);
		if (job.stage === "routing") return this.pathPosition({ x: layout.lb.x + 30, y: layout.lb.y }, { x: layout.queueX - 52, y: layout.lb.y }, job.remainingMs, ROUTING_MS);
		if (job.service === undefined || !layout.workers[job.service]) return this.queuePoint(0);
		const worker = layout.workers[job.service];
		if (job.stage === "serviceDispatch") return this.pathPosition(this.queuePoint(job.queueSlot ?? 0), { x: worker.x - 52, y: worker.y }, job.remainingMs, WORKER_TRAVEL_MS);
		return { x: worker.x + 34, y: worker.y + 10 };
	}

	private pathPosition(start: Point, end: Point, remainingMs: number, durationMs: number): Point {
		const progress = Math.min(1, Math.max(0, 1 - remainingMs / durationMs));
		return quadraticPoint(start, this.controlPoint(start, end), end, progress);
	}

	private createJobView(job: Job, target: Point): JobView {
		const container = new Container();
		const circle = new Graphics().circle(0, 0, 8).fill(ACCENT).stroke({ color: JOB_INK, width: 2 });
		const label = makeText(String(job.id % 100), 8, JOB_INK, "700");
		label.anchor.set(0.5);
		container.addChild(circle, label);
		this.jobLayer.addChild(container);
		const start = job.stage === "network"
			? { x: this.layout!.clientX + NODE_WIDTH / 2, y: this.layout!.clients[job.client]?.y ?? this.layout!.lb.y }
			: target;
		container.position.set(start.x, start.y);
		return { container, from: start, to: target, progress: 0, durationMs: TICK_MS, removing: false };
	}

	private updateJobs() {
		const currentIds = new Set(this.state.jobs.map((job) => job.id));
		for (const [id, view] of this.jobViews) {
			if (!currentIds.has(id) && !view.removing) {
				view.removing = true;
				view.from = view.container.position;
				view.to = view.container.position;
				view.progress = 1;
			}
		}

		for (const job of this.state.jobs) {
			const target = this.jobPosition(job);
			const existing = this.jobViews.get(job.id);
			if (!existing) {
				this.jobViews.set(job.id, this.createJobView(job, target));
				continue;
			}
			existing.from = { x: existing.container.x, y: existing.container.y };
			existing.to = target;
			existing.progress = 0;
			existing.durationMs = TICK_MS;
			existing.removing = false;
			existing.container.alpha = 1;
		}
	}
}

export default function PixiCongestionScene({ state }: { state: SimulationState }) {
	const hostRef = useRef<HTMLDivElement>(null);
	const stateRef = useRef(state);
	const sceneRef = useRef<PixiScene | undefined>(undefined);
	stateRef.current = state;

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		let cancelled = false;
		let app: Application | undefined;
		let resizeObserver: ResizeObserver | undefined;

		const start = async () => {
			const nextApp = new Application();
			await nextApp.init({
				width: Math.max(320, host.clientWidth),
				height: Math.max(420, host.clientHeight),
				backgroundAlpha: 0,
				antialias: true,
				autoDensity: true,
				resolution: window.devicePixelRatio || 1,
				autoStart: false,
			});
			if (cancelled) {
				nextApp.destroy();
				return;
			}

			app = nextApp;
			nextApp.canvas.className = styles.SceneCanvas;
			nextApp.canvas.setAttribute("aria-hidden", "true");
			host.appendChild(nextApp.canvas);
			const scene = new PixiScene(nextApp, stateRef.current);
			sceneRef.current = scene;
			scene.updateState(stateRef.current);
			nextApp.ticker.add((ticker) => scene.tick(ticker.deltaMS));
			nextApp.start();
			resizeObserver = new ResizeObserver(() => scene.resize(Math.max(320, host.clientWidth), Math.max(420, host.clientHeight)));
			resizeObserver.observe(host);
		};

		void start();
		return () => {
			cancelled = true;
			resizeObserver?.disconnect();
			sceneRef.current?.destroy();
			sceneRef.current = undefined;
			app = undefined;
		};
	}, []);

	useEffect(() => {
		sceneRef.current?.updateState(state);
	}, [state]);

	return <div ref={hostRef} className={styles.SceneCanvas} role="img" aria-label="Animated diagram of individual clients sending jobs through a load balancer and shared FIFO queue to individual service workers" />;
}
