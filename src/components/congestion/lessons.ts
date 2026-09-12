import { createInitialState, setClientCount } from "./simulation";
import type { ControllerKind, SimulationState } from "./simulation";
import type { LessonCondition } from "./conditions";

export const LESSONS: Array<{
	title: string; strategy: ControllerKind; clients: number; action: string;
	introduction: string; observation: string; change: "clients" | "slowdown";
	conditions: LessonCondition[];
}> = [
	{
		title: "A fixed rate meets more clients", strategy: "rate", clients: 1,
		action: "Add two clients", change: "clients",
		introduction: "Each client may send up to 0.5 requests/s to each worker. Let a few requests finish, then triple the client count without changing anyone’s limit.",
		observation: "Watch completed throughput and the queues. More independent senders increase total demand, but worker capacity stays the same. A rate that was comfortable for one client can produce waiting and rejection with three.",
		conditions: [
			{ id: "queue", label: "Create a persistent queue", description: "Keep at least four requests waiting for five seconds.", sustainMs: 5000, when: (state) => state.queueDepth >= 4 },
			{ id: "loss", label: "Observe rejection", description: "Keep the rolling rejection rate above 5% for five seconds.", sustainMs: 5000, when: (state) => (state.rejectionRate ?? 0) > 0.05 },
		],
	},
	{
		title: "The same rate meets slower work", strategy: "rate", clients: 2,
		action: "Triple processing time", change: "slowdown",
		introduction: "This fresh run has two clients and four workers. Keep their rate limits fixed and increase the cost of processing each new request.",
		observation: "Capacity falls while the per-worker rate budgets stay fixed. Routing can choose a destination, but it cannot create capacity when every worker slows down. Watch waiting and rejection over the next 10–20 seconds.",
		conditions: [
			{ id: "queue", label: "See waiting grow", description: "Keep at least four requests waiting for five seconds.", sustainMs: 5000, when: (state) => state.queueDepth >= 4 },
			{ id: "loss", label: "See loss follow the queue", description: "Keep the rolling rejection rate above 5% for five seconds.", sustainMs: 5000, when: (state) => (state.rejectionRate ?? 0) > 0.05 },
		],
	},
	{
		title: "Limit unfinished work instead", strategy: "concurrency", clients: 2,
		action: "Triple processing time", change: "slowdown",
		introduction: "Repeat the previous setup with one in-flight request allowed per client–worker pair. Apply the same slowdown and compare how the send rate responds.",
		observation: "A permit stays occupied until the request finishes, so slower responses reduce admissions automatically. This bounds outstanding work; it does not guarantee an empty queue. Each added client still brings another independent permit per worker.",
		conditions: [
			{ id: "slow", label: "Hold the slower service", description: "Apply the 3× processing-time change.", when: (state) => state.serviceMs >= 3000 },
			{ id: "protected", label: "Avoid sustained loss", description: "Keep the rejection rate at zero for five seconds after slowing workers.", sustainMs: 5000, when: (state) => state.serviceMs >= 3000 && state.rejectionRate === 0 },
		],
	},
	{
		title: "Let delay adjust the target", strategy: "vegas", clients: 2,
		action: "Add two clients", change: "clients",
		introduction: "Now each client–worker pair uses Vegas to adjust a paced target from its successful RTT samples. Let the estimates warm, then add two more independent clients.",
		observation: "Open the endpoint inspector and follow the targets as latency changes. New clients start with cold histories; existing clients keep theirs. Compare queueing, throughput, and recovery. Delay is useful feedback, but its baseline and the other clients’ behaviour still matter.",
		conditions: [
			{ id: "warm", label: "Warm the new endpoint tables", description: "Let every client observe at least one successful RTT.", when: (state) => state.clients.every((client) => client.endpoints.some((endpoint) => endpoint.observed)) },
			{ id: "adapt", label: "Observe a changed target", description: "Find an endpoint whose Vegas target has moved away from one request.", when: (state) => state.clients.some((client) => client.endpoints.some((endpoint) => endpoint.controller.limit !== 1)) },
		],
	},
];

export function createLesson(index: number): SimulationState {
	const lesson = LESSONS[index];
	return setClientCount(createInitialState(lesson.strategy), lesson.clients);
}

export function applyLessonAction(state: SimulationState, index: number): SimulationState {
	return LESSONS[index].change === "clients"
		? setClientCount(state, state.clients.length + 2)
		: { ...state, serviceMs: state.serviceMs * 3 };
}
