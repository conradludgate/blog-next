import { createInitialState, setClientCount, setWorkerCount } from "./simulation.ts";
import type { ControllerKind, SimulationState } from "./simulation";
import type { LessonCondition } from "./conditions";

export type CongestionChallengeId =
	| "request-path"
	| "concurrency-worker-scale"
	| "aimd-client-scale"
	| "vegas-slowdown"
	| "gradient2-slowdown"
	| "gradient2-worker-removal"
	| "fixed-rate-client-scale"
	| "fixed-rate-slowdown"
	| "concurrency-slowdown"
	| "vegas-client-scale";

export interface CongestionChallenge {
	id: CongestionChallengeId;
	title: string;
	strategy: ControllerKind;
	clients: number;
	workers: number;
	randomSeed: number;
	task: string;
	controls: {
		clients?: boolean;
		workers?: boolean;
		processingTime?: boolean;
		controllerOptions?: ControllerKind[];
	};
	conditions: LessonCondition[];
}

export const CONGESTION_CHALLENGES: Record<CongestionChallengeId, CongestionChallenge> = {
	"request-path": {
		id: "request-path",
		title: "Follow one connection",
		strategy: "concurrency",
		clients: 1,
		workers: 1,
		randomSeed: 23,
		task: "Slow service and follow a connection through the worker.",
		controls: { processingTime: true },
		conditions: [
			{ id: "slow", label: "Slow service", description: "Select 3s service time.", when: (state) => state.serviceMs === 3000 },
			{ id: "finish", label: "Watch a completion", description: "Observe a successful attempt with the slower service time.", when: (state) => state.serviceMs === 3000 && (state.p50LatencyMs ?? 0) >= 4000 },
		],
	},
	"concurrency-worker-scale": {
		id: "concurrency-worker-scale",
		title: "Give the client more capacity",
		strategy: "concurrency",
		clients: 1,
		workers: 1,
		randomSeed: 23,
		task: "Add workers and watch completed throughput rise.",
		controls: { workers: true },
		conditions: [
			{ id: "scale", label: "Add capacity", description: "Increase from one worker to four.", when: (state) => state.workers >= 4 },
			{ id: "use", label: "Use the new workers", description: "Sustain more than 0.6 completions per second for five seconds.", sustainMs: 5000, when: (state) => state.workers >= 4 && state.completedRate > 0.6 },
		],
	},
	"aimd-client-scale": {
		id: "aimd-client-scale",
		title: "Wait for the loss signal",
		strategy: "aimd",
		clients: 2,
		workers: 4,
		randomSeed: 17,
		task: "Add two clients and watch AIMD encounter rejection.",
		controls: { clients: true },
		conditions: [
			{ id: "scale", label: "Add two clients", description: "Increase from two clients to four.", when: (state) => state.clients.length >= 4 },
			{ id: "loss", label: "Observe rejection", description: "Watch rejection appear after adding clients.", when: (state) => state.clients.length >= 4 && (state.rejectionRate ?? 0) > 0 },
		],
	},
	"vegas-slowdown": {
		id: "vegas-slowdown",
		title: "Let delay respond to slower work",
		strategy: "vegas",
		clients: 2,
		workers: 4,
		randomSeed: 23,
		task: "Slow service and watch Vegas revise its local estimates.",
		controls: { processingTime: true },
		conditions: [
			{ id: "slow", label: "Slow service", description: "Select 3s service time.", when: (state) => state.serviceMs === 3000 },
			{ id: "feedback", label: "Observe delay feedback", description: "Let an endpoint measure the slowdown and adjust its target.", when: (state) => state.serviceMs === 3000 && state.clients.some((client) => client.endpoints.some((endpoint) => endpoint.metrics.latencyMs > 4000 && endpoint.controller.limit !== 1)) },
		],
	},
	"gradient2-slowdown": {
		id: "gradient2-slowdown",
		title: "Follow a rising latency trend",
		strategy: "gradient2",
		clients: 2,
		workers: 4,
		randomSeed: 23,
		task: "Slow service and compare recent RTT with its longer-term trend.",
		controls: { processingTime: true },
		conditions: [
			{ id: "slow", label: "Slow service", description: "Select 3s service time.", when: (state) => state.serviceMs === 3000 },
			{ id: "trend", label: "See the trend diverge", description: "Observe short-term RTT above long-term RTT after the slowdown.", when: (state) => state.serviceMs === 3000 && state.clients.some((client) => client.endpoints.some((endpoint) => endpoint.controller.longRtt > 0 && endpoint.controller.shortRtt > endpoint.controller.longRtt * 1.05)) },
			{ id: "backoff", label: "Observe a backoff", description: "Wait for an endpoint to enter its backoff cooldown.", when: (state) => state.serviceMs === 3000 && state.clients.some((client) => client.endpoints.some((endpoint) => endpoint.controller.gradient2BackoffCooldown > 0)) },
		],
	},
	"gradient2-worker-removal": {
		id: "gradient2-worker-removal",
		title: "Keep working after scale-down",
		strategy: "gradient2",
		clients: 2,
		workers: 4,
		randomSeed: 17,
		task: "Remove two workers and watch the surviving endpoints adapt.",
		controls: { workers: true },
		conditions: [
			{ id: "remove", label: "Remove capacity", description: "Reduce the fleet to two workers.", when: (state) => state.workers === 2 },
			{ id: "continue", label: "Sustain useful work", description: "Keep completing work without rejection for five seconds after scale-down.", sustainMs: 5000, when: (state) => state.workers === 2 && state.completedRate > 0.3 && state.rejectionRate === 0 },
		],
	},
	"fixed-rate-client-scale": {
		id: "fixed-rate-client-scale",
		title: "A fixed rate meets more clients",
		strategy: "rate",
		clients: 1,
		workers: 4,
		randomSeed: 17,
		task: "Add clients until the fixed rate overloads the workers.",
		controls: { clients: true },
		conditions: [
			{ id: "scaled", label: "Multiply the senders", description: "Run at least three independent clients.", when: (state, baseline) => state.strategy === "rate" && state.clients.length >= baseline.clients.length + 2 },
			{ id: "queue", label: "Create a persistent queue", description: "Keep at least four more requests waiting than at the start for five seconds.", sustainMs: 5000, when: (state, baseline) => state.strategy === "rate" && state.clients.length >= baseline.clients.length + 2 && state.queueDepth >= baseline.queueDepth + 4 },
			{ id: "loss", label: "Observe rejection", description: "Keep the rolling rejection rate above 5% for five seconds.", sustainMs: 5000, when: (state, baseline) => state.strategy === "rate" && state.clients.length >= baseline.clients.length + 2 && (state.rejectionRate ?? 0) > 0.05 },
		],
	},
	"fixed-rate-slowdown": {
		id: "fixed-rate-slowdown",
		title: "The same rate meets slower work",
		strategy: "rate",
		clients: 1,
		workers: 4,
		randomSeed: 23,
		task: "Slow the workers until the unchanged rate causes queueing and rejection.",
		controls: { processingTime: true },
		conditions: [
			{ id: "slow", label: "Reduce capacity", description: "Select the 3× slower processing time.", when: (state) => state.strategy === "rate" && state.serviceMs === 3000 },
			{ id: "queue", label: "See waiting grow", description: "Keep at least four more requests waiting than at the start for five seconds.", sustainMs: 5000, when: (state, baseline) => state.strategy === "rate" && state.serviceMs === 3000 && state.queueDepth >= baseline.queueDepth + 4 },
			{ id: "loss", label: "See loss follow the queue", description: "Keep rejection above 5% for five seconds.", sustainMs: 5000, when: (state) => state.strategy === "rate" && state.serviceMs === 3000 && (state.rejectionRate ?? 0) > 0.05 },
		],
	},
	"concurrency-slowdown": {
		id: "concurrency-slowdown",
		title: "Limit unfinished work instead",
		strategy: "concurrency",
		clients: 1,
		workers: 4,
		randomSeed: 23,
		task: "Slow the workers and let the concurrency limit reduce admissions.",
		controls: { processingTime: true },
		conditions: [
			{ id: "slow", label: "Apply the same slowdown", description: "Select the 3× slower processing time.", when: (state) => state.strategy === "concurrency" && state.serviceMs === 3000 },
			{ id: "paced", label: "Let admissions fall", description: "Wait until offered load is below one request per second.", sustainMs: 5000, when: (state) => state.strategy === "concurrency" && state.serviceMs === 3000 && state.sentRate > 0 && state.sentRate < 1 },
			{ id: "protected", label: "Avoid sustained loss", description: "Keep the queue empty and rejection at zero for five seconds.", sustainMs: 5000, when: (state) => state.strategy === "concurrency" && state.serviceMs === 3000 && state.queueDepth === 0 && state.rejectionRate === 0 },
		],
	},
	"vegas-client-scale": {
		id: "vegas-client-scale",
		title: "Let delay adjust the target",
		strategy: "vegas",
		clients: 2,
		workers: 4,
		randomSeed: 17,
		task: "Add two clients and watch their local Vegas estimates warm and adapt.",
		controls: { clients: true },
		conditions: [
			{ id: "scaled", label: "Add independent clients", description: "Increase the fleet from two clients to four.", when: (state, baseline) => state.strategy === "vegas" && state.clients.length >= baseline.clients.length + 2 },
			{ id: "warm", label: "Warm the new endpoint tables", description: "Let every newly added client observe at least one successful RTT.", when: (state, baseline) => state.strategy === "vegas" && state.clients.slice(baseline.clients.length).length >= 2 && state.clients.slice(baseline.clients.length).every((client) => client.endpoints.some((endpoint) => endpoint.observed)) },
			{ id: "adapt", label: "Observe a changed target", description: "Find a new client endpoint whose target has moved away from one request.", when: (state, baseline) => state.strategy === "vegas" && state.clients.slice(baseline.clients.length).some((client) => client.endpoints.some((endpoint) => endpoint.controller.limit !== 1)) },
		],
	},
};

export function createChallenge(id: CongestionChallengeId): SimulationState {
	const challenge = CONGESTION_CHALLENGES[id];
	return setWorkerCount(setClientCount(createInitialState(challenge.strategy, challenge.randomSeed), challenge.clients), challenge.workers);
}
