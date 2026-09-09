"use client";

import { Application, Container, Graphics, Text } from "pixi.js";
import { useEffect, useRef, type CSSProperties } from "react";
import styles from "@/styles/CongestionSimulator.module.css";
import { ROUTING_MS, TICK_MS, WORKER_QUEUE_LIMIT, WORKER_TRAVEL_MS } from "./simulation";
import type { Job, SimulationState } from "./simulation";

interface Point { x: number; y: number }
interface JobView { container: Container; from: Point; to: Point; progress: number }
const COLOURS = ["#b44b31", "#2563eb", "#16806a", "#9333b8", "#a16207", "#be185d", "#087e9c", "#6663c6"];

function label(text: string, x: number, y: number, ink: string, size = 12): Text {
	const node = new Text({ text, style: { fontFamily: "system-ui, sans-serif", fontSize: size, fill: ink } });
	node.position.set(x, y);
	return node;
}
function interpolate(a: Point, b: Point, progress: number): Point {
	return { x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress };
}
function stack(count: number, index: number, height: number): number {
	return count === 1 ? height / 2 : 60 + index * (height - 110) / (count - 1);
}

class PixiScene {
	private readonly nodes = new Container();
	private readonly dots = new Container();
	private readonly jobs = new Map<number, JobView>();
	private state: SimulationState;
	private clients: Point[] = [];
	private workers: Point[] = [];
	private queues: Point[] = [];
	private mobile = false;

	constructor(private readonly app: Application, state: SimulationState) {
		this.state = state;
		app.stage.addChild(this.nodes, this.dots);
	}
	update(state: SimulationState) {
		this.state = state;
		const width = this.app.screen.width;
		const height = this.app.screen.height;
		this.mobile = window.matchMedia("(max-width: 760px)").matches;
		const clientRows = Math.ceil(state.clients.length / 2);
		this.clients = state.clients.map((_, i) => ({
			x: this.mobile ? width * (i % 2 === 0 ? 0.27 : 0.73) : 72,
			y: this.mobile ? 52 + Math.floor(i / 2) * 70 : stack(state.clients.length, i, height),
		}));
		this.workers = Array.from({ length: state.workers }, (_, i) => ({
			x: this.mobile ? width * (i % 2 === 0 ? 0.27 : 0.73) : width - 72,
			y: this.mobile ? clientRows * 70 + 130 + Math.floor(i / 2) * 124 : stack(state.workers, i, height),
		}));
		this.queues = this.workers.map((point) => ({ x: point.x - (this.mobile ? 0 : 158), y: point.y - (this.mobile ? 57 : 0) }));
		this.drawNodes();
		const live = new Set(state.jobs.map((job) => job.id));
		for (const [id, view] of this.jobs) {
			if (!live.has(id)) { view.container.destroy({ children: true }); this.jobs.delete(id); }
		}
		for (const job of state.jobs) {
			const target = this.jobPoint(job);
			let view = this.jobs.get(job.id);
			if (!view) {
				const container = new Container();
				container.addChild(new Graphics().circle(0, 0, 7).fill(COLOURS[job.client % COLOURS.length]).stroke({ color: "#ffffff", width: 1.5 }));
				container.position.copyFrom(this.departure(job.client));
				this.dots.addChild(container);
				view = { container, from: this.departure(job.client), to: target, progress: 0 };
				this.jobs.set(job.id, view);
			}
			view.from = { x: view.container.x, y: view.container.y };
			view.to = target;
			view.progress = 0;
		}
	}
	private departure(client: number): Point {
		const point = this.clients[client];
		return { x: point.x + (this.mobile ? 0 : 52), y: point.y + (this.mobile ? 25 : 0) };
	}
	private arrival(worker: number): Point {
		const point = this.queues[worker];
		return { x: point.x - (this.mobile ? 0 : 52), y: point.y - (this.mobile ? 18 : 0) };
	}
	private queueSlot(worker: number, slot: number): Point {
		return { x: this.queues[worker].x - 30 + slot * 20, y: this.queues[worker].y + 6 };
	}
	private jobPoint(job: Job): Point {
		const worker = this.workers[job.service];
		const start = this.departure(job.client);
		const end = this.arrival(job.service);
		// Both network stages follow the already selected client→worker route.
		if (job.stage === "network") return interpolate(start, end, 0.7 * Math.max(0, 1 - job.remainingMs / this.state.networkMs));
		if (job.stage === "routing") return interpolate(start, end, 0.7 + 0.3 * Math.max(0, 1 - job.remainingMs / ROUTING_MS));
		if (job.stage === "queue") {
			const waiting = this.state.jobs.filter((candidate) => candidate.stage === "queue" && candidate.service === job.service);
			return this.queueSlot(job.service, Math.max(0, waiting.findIndex((candidate) => candidate.id === job.id)));
		}
		if (job.stage === "serviceDispatch") return interpolate(this.queueSlot(job.service, 0), worker, Math.max(0, 1 - job.remainingMs / WORKER_TRAVEL_MS));
		return { x: worker.x + 35, y: worker.y + 12 };
	}
	private drawNodes() {
		this.nodes.removeChildren().forEach((node) => node.destroy({ children: true }));
		const computed = getComputedStyle(this.app.canvas);
		const ink = computed.color;
		const bg = computed.backgroundColor;
		this.nodes.addChild(label("CLIENTS · POWER OF TWO", 20, 10, ink, 11));
		this.nodes.addChild(label("WORKER QUEUES", this.mobile ? 20 : this.app.screen.width - 282,
			this.mobile ? Math.ceil(this.clients.length / 2) * 70 + 25 : 10, ink, 11));
		const routes = new Set<string>();
		for (const job of this.state.jobs) {
			const key = `${job.client}:${job.service}`;
			if (routes.has(key)) continue;
			routes.add(key);
			const start = this.departure(job.client), end = this.arrival(job.service);
			this.nodes.addChild(new Graphics().moveTo(start.x, start.y).lineTo(end.x, end.y).stroke({ color: COLOURS[job.client % COLOURS.length], alpha: 0.18, width: 1 }));
		}
		this.clients.forEach((point, i) => {
			const busy = this.state.jobs.filter((job) => job.client === i).length;
			this.nodes.addChild(new Graphics().roundRect(point.x - 52, point.y - 25, 104, 50, 7).fill(bg).stroke({ color: COLOURS[i % COLOURS.length], width: 2 }));
			this.nodes.addChild(label(`Client ${i + 1}`, point.x - 42, point.y - 20, ink, 13));
			this.nodes.addChild(label(`${busy} in flight`, point.x - 42, point.y, ink));
		});
		this.workers.forEach((point, i) => {
			const queue = this.queues[i];
			const waiting = this.state.jobs.filter((job) => job.service === i && job.stage === "queue").length;
			const busy = this.state.jobs.some((job) => job.service === i && (job.stage === "service" || job.stage === "serviceDispatch"));
			this.nodes.addChild(new Graphics().moveTo(queue.x, queue.y).lineTo(point.x, point.y).stroke({ color: ink, alpha: 0.35, width: 1 }));
			this.nodes.addChild(new Graphics().roundRect(queue.x - 52, queue.y - 18, 104, 36, 5).fill(bg).stroke({ color: ink, width: 1 }));
			this.nodes.addChild(label(`Queue ${waiting}/${WORKER_QUEUE_LIMIT}`, queue.x - 42, queue.y - 16, ink, 11));
			for (let slot = 0; slot < WORKER_QUEUE_LIMIT; slot++) {
				const position = this.queueSlot(i, slot);
				this.nodes.addChild(new Graphics().rect(position.x - 5, position.y - 5, 10, 10).fill({ color: ink, alpha: slot < waiting ? 0.35 : 0.08 }));
			}
			this.nodes.addChild(new Graphics().roundRect(point.x - 52, point.y - 25, 104, 50, 7).fill(bg).stroke({ color: ink, width: 2 }));
			this.nodes.addChild(label(`Worker ${i + 1}`, point.x - 42, point.y - 20, ink, 13));
			this.nodes.addChild(label(busy ? "busy" : "ready", point.x - 42, point.y, ink));
		});
	}
	tick(delta: number) {
		for (const view of this.jobs.values()) {
			view.progress = Math.min(1, view.progress + delta / TICK_MS);
			view.container.position.copyFrom(interpolate(view.from, view.to, view.progress));
		}
		this.app.render();
	}
	resize(width: number, height: number) { this.app.renderer.resize(width, height); this.update(this.state); }
	destroy() { this.app.ticker.stop(); this.app.destroy({ removeView: true }, { children: true }); }
}

export default function PixiCongestionScene({ state }: { state: SimulationState }) {
	const hostRef = useRef<HTMLDivElement>(null);
	const stateRef = useRef(state);
	const sceneRef = useRef<PixiScene | undefined>(undefined);
	useEffect(() => { stateRef.current = state; }, [state]);
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		let cancelled = false;
		let observer: ResizeObserver | undefined;
		const start = async () => {
			const app = new Application();
			await app.init({ width: host.clientWidth, height: host.clientHeight, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1, autoStart: false });
			if (cancelled) { app.destroy(); return; }
			app.canvas.className = styles.SceneCanvas;
			app.canvas.setAttribute("aria-hidden", "true");
			host.appendChild(app.canvas);
			const scene = new PixiScene(app, stateRef.current);
			sceneRef.current = scene;
			scene.update(stateRef.current);
			app.ticker.add((ticker) => scene.tick(ticker.deltaMS));
			app.start();
			observer = new ResizeObserver(() => scene.resize(host.clientWidth, host.clientHeight));
			observer.observe(host);
		};
		void start();
		return () => { cancelled = true; observer?.disconnect(); sceneRef.current?.destroy(); sceneRef.current = undefined; };
	}, []);
	useEffect(() => { sceneRef.current?.update(state); }, [state]);
	return <div ref={hostRef} className={styles.SceneCanvas} style={{
		"--desktop-scene-height": `${Math.max(420, 110 + (Math.max(state.clients.length, state.workers) - 1) * 64)}px`,
		"--mobile-scene-height": `${Math.ceil(state.clients.length / 2) * 70 + Math.ceil(state.workers / 2) * 124 + 60}px`,
	} as CSSProperties} role="img" aria-label="Clients choose between two workers using local latency and in-flight measurements. Every worker has its own bounded queue." />;
}
