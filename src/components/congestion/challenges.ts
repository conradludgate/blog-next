import { createInitialState, setClientCount, setWorkerCount } from "./simulation.ts";
import type { ControllerKind, SimulationState } from "./simulation";
import type { LessonCondition } from "./conditions";

export type CongestionChallengeId =
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
