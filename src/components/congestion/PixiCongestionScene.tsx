"use client";

import { Application, Container, Graphics, Text } from "pixi.js";
import { useEffect, useRef, type CSSProperties } from "react";
import styles from "@/styles/CongestionSimulator.module.css";
import { ROUTING_MS, TICK_MS, WORKER_QUEUE_LIMIT, WORKER_TRAVEL_MS } from "./simulation";
import type { Job, SimulationState } from "./simulation";

interface Point { x: number; y: number }
interface JobView { container: Container; from: Point; to: Point; progress: number }
const COLOURS = ["#c5684b", "#5486d9", "#3fa28d", "#a676c6", "#bb943f", "#cc6998", "#489cb5", "#8280ce"];

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
	private reduceMotion = false;
	private playbackSpeed = 1;

	constructor(private readonly app: Application, state: SimulationState) {
		this.state = state;
		app.stage.addChild(this.nodes, this.dots);
	}
	update(state: SimulationState) {
		this.state = state;
		const width = this.app.screen.width;
		const height = this.app.screen.height;
		this.mobile = window.matchMedia("(max-width: 760px)").matches;
		this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
		if (!this.app.ticker.started) this.setRunning(false);
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
		const success = computed.getPropertyValue("--sim-success").trim();
		const muted = ink;
		const grid = new Graphics();
		for (let x = 16; x < this.app.screen.width; x += 24) {
			for (let y = 16; y < this.app.screen.height; y += 24) grid.circle(x, y, 0.7);
		}
		grid.fill({ color: ink, alpha: 0.09 });
		this.nodes.addChild(grid);
		this.nodes.addChild(label("CLIENTS", 20, 16, muted, 10));
		this.nodes.addChild(label("FIFO QUEUES  /  WORKERS", this.mobile ? 20 : this.app.screen.width - 282,
			this.mobile ? Math.ceil(this.clients.length / 2) * 70 + 25 : 16, muted, 10));
		if (!this.mobile) {
			const networkLabel = label("NETWORK / LOAD BALANCER", (this.app.screen.width - 158) / 2, 16, muted, 10);
			networkLabel.anchor.x = 0.5;
			this.nodes.addChild(networkLabel);
		}
		const guides = new Graphics();
		this.clients.forEach((_, client) => this.workers.forEach((_, worker) => {
			const start = this.departure(client), end = this.arrival(worker);
			guides.moveTo(start.x, start.y).lineTo(end.x, end.y);
		}));
		guides.stroke({ color: ink, alpha: 0.06, width: 1 });
		this.nodes.addChild(guides);
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
			this.nodes.addChild(new Graphics().roundRect(point.x - 52, point.y - 22, 104, 50, 9).fill({ color: ink, alpha: 0.06 }));
			this.nodes.addChild(new Graphics().roundRect(point.x - 52, point.y - 25, 104, 50, 9).fill(bg).stroke({ color: COLOURS[i % COLOURS.length], alpha: 0.65, width: 1.2 }));
			this.nodes.addChild(new Graphics().circle(point.x + 39, point.y - 12, 3).fill(COLOURS[i % COLOURS.length]));
			this.nodes.addChild(label(`Client ${i + 1}`, point.x - 42, point.y - 17, ink, 12));
			this.nodes.addChild(label(`${busy} in flight`, point.x - 42, point.y + 2, muted, 11));
		});
		this.workers.forEach((point, i) => {
			const queue = this.queues[i];
			const waiting = this.state.jobs.filter((job) => job.service === i && job.stage === "queue").length;
			const busy = this.state.jobs.some((job) => job.service === i && (job.stage === "service" || job.stage === "serviceDispatch"));
			this.nodes.addChild(new Graphics().moveTo(queue.x, queue.y).lineTo(point.x, point.y).stroke({ color: ink, alpha: 0.35, width: 1 }));
			this.nodes.addChild(new Graphics().roundRect(queue.x - 52, queue.y - 18, 104, 36, 5).fill(bg).stroke({ color: ink, alpha: 0.25, width: 1 }));
			this.nodes.addChild(label(`Queue ${waiting}/${WORKER_QUEUE_LIMIT}`, queue.x - 42, queue.y - 16, ink, 11));
			for (let slot = 0; slot < WORKER_QUEUE_LIMIT; slot++) {
				const position = this.queueSlot(i, slot);
				this.nodes.addChild(new Graphics().rect(position.x - 5, position.y - 5, 10, 10).fill({ color: ink, alpha: slot < waiting ? 0.35 : 0.08 }));
			}
			this.nodes.addChild(new Graphics().roundRect(point.x - 52, point.y - 22, 104, 50, 9).fill({ color: ink, alpha: 0.06 }));
			this.nodes.addChild(new Graphics().roundRect(point.x - 52, point.y - 25, 104, 50, 9).fill(bg).stroke({ color: busy ? success : ink, alpha: busy ? 0.7 : 0.25, width: 1.2 }));
			const activeJob = this.state.jobs.find((job) => job.service === i && job.stage === "service");
			const progress = activeJob ? Math.max(0, Math.min(1, 1 - activeJob.remainingMs / this.state.serviceMs)) : 0;
			this.nodes.addChild(new Graphics().roundRect(point.x - 42, point.y + 19, 84, 2, 1).fill({ color: ink, alpha: 0.08 }));
			if (progress > 0) this.nodes.addChild(new Graphics().roundRect(point.x - 42, point.y + 19, 84 * progress, 2, 1).fill(success));
			this.nodes.addChild(label(`Worker ${i + 1}`, point.x - 42, point.y - 17, ink, 12));
			this.nodes.addChild(label(busy ? "busy" : "ready", point.x - 42, point.y + 2, muted, 11));
		});
	}
	tick(delta: number) {
		for (const view of this.jobs.values()) {
			view.progress = this.reduceMotion ? 1 : Math.min(1, view.progress + delta * this.playbackSpeed / TICK_MS);
			view.container.position.copyFrom(interpolate(view.from, view.to, view.progress));
		}
		this.app.render();
	}
	setRunning(running: boolean) {
		if (running) {
			this.app.start();
			return;
		}
		this.app.ticker.stop();
		for (const view of this.jobs.values()) {
			view.progress = 1;
			view.container.position.copyFrom(view.to);
		}
		this.app.render();
	}
	setPlaybackSpeed(speed: number) { this.playbackSpeed = speed; }
	resize(width: number, height: number) { this.app.renderer.resize(width, height); this.update(this.state); }
	destroy() { this.app.ticker.stop(); this.app.destroy({ removeView: true }, { children: true }); }
}

export default function PixiCongestionScene({ state, running, playbackSpeed }: { state: SimulationState; running: boolean; playbackSpeed: number }) {
	const hostRef = useRef<HTMLDivElement>(null);
	const stateRef = useRef(state);
	const runningRef = useRef(running);
	const playbackSpeedRef = useRef(playbackSpeed);
	const sceneRef = useRef<PixiScene | undefined>(undefined);
	useEffect(() => { stateRef.current = state; }, [state]);
	useEffect(() => { runningRef.current = running; sceneRef.current?.setRunning(running); }, [running]);
	useEffect(() => { playbackSpeedRef.current = playbackSpeed; sceneRef.current?.setPlaybackSpeed(playbackSpeed); }, [playbackSpeed]);
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		let cancelled = false;
		let observer: ResizeObserver | undefined;
		let themeObserver: MutationObserver | undefined;
		const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const redraw = () => sceneRef.current?.update(stateRef.current);
		const start = async () => {
			const app = new Application();
			await app.init({ width: host.clientWidth, height: host.clientHeight, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1, autoStart: false });
			if (cancelled) { app.destroy(); return; }
			app.canvas.className = styles.SceneCanvas;
			app.canvas.setAttribute("aria-hidden", "true");
			host.appendChild(app.canvas);
			const scene = new PixiScene(app, stateRef.current);
			sceneRef.current = scene;
			scene.setPlaybackSpeed(playbackSpeedRef.current);
			scene.update(stateRef.current);
			app.ticker.add((ticker) => scene.tick(ticker.deltaMS));
			scene.setRunning(runningRef.current);
			observer = new ResizeObserver(() => scene.resize(host.clientWidth, host.clientHeight));
			observer.observe(host);
			themeObserver = new MutationObserver(redraw);
			themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
			themeQuery.addEventListener("change", redraw);
		};
		void start();
		return () => { cancelled = true; observer?.disconnect(); themeObserver?.disconnect(); themeQuery.removeEventListener("change", redraw); sceneRef.current?.destroy(); sceneRef.current = undefined; };
	}, []);
	useEffect(() => { sceneRef.current?.update(state); }, [state]);
	return <div ref={hostRef} className={styles.SceneCanvas} style={{
		"--desktop-scene-height": `${Math.max(420, 110 + (Math.max(state.clients.length, state.workers) - 1) * 64)}px`,
		"--mobile-scene-height": `${Math.ceil(state.clients.length / 2) * 70 + Math.ceil(state.workers / 2) * 124 + 60}px`,
	} as CSSProperties} role="img" aria-label="Clients choose between two workers using local latency and in-flight measurements. Every worker has its own bounded queue." />;
}
