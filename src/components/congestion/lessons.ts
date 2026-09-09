import { createInitialState, setClientCount } from "./simulation";
import type { ControllerKind, SimulationState } from "./simulation";

export const LESSONS: Array<{
	title: string; strategy: ControllerKind; clients: number; action: string;
	introduction: string; observation: string; change: "clients" | "slowdown";
}> = [
	{
		title: "A fixed rate meets more clients", strategy: "rate", clients: 1,
		action: "Add two clients", change: "clients",
		introduction: "Each client may send up to 0.5 requests/s to each worker. Let a few requests finish, then triple the client count without changing anyone’s limit.",
		observation: "Watch completed throughput and the queues. More independent senders increase total demand, but worker capacity stays the same. A rate that was comfortable for one client can produce waiting and rejection with three.",
	},
	{
		title: "The same rate meets slower work", strategy: "rate", clients: 2,
		action: "Triple processing time", change: "slowdown",
		introduction: "This fresh run has two clients and four workers. Keep their rate limits fixed and increase the cost of processing each new request.",
		observation: "Capacity falls while the per-worker rate budgets stay fixed. Routing can choose a destination, but it cannot create capacity when every worker slows down. Watch waiting and rejection over the next 10–20 seconds.",
	},
	{
		title: "Limit unfinished work instead", strategy: "concurrency", clients: 2,
		action: "Triple processing time", change: "slowdown",
		introduction: "Repeat the previous setup with one in-flight request allowed per client–worker pair. Apply the same slowdown and compare how the send rate responds.",
		observation: "A permit stays occupied until the request finishes, so slower responses reduce admissions automatically. This bounds outstanding work; it does not guarantee an empty queue. Each added client still brings another independent permit per worker.",
	},
	{
		title: "Let delay adjust the target", strategy: "vegas", clients: 2,
		action: "Add two clients", change: "clients",
		introduction: "Now each client–worker pair uses Vegas to adjust a paced target from its successful RTT samples. Let the estimates warm, then add two more independent clients.",
		observation: "Open the endpoint inspector and follow the targets as latency changes. New clients start with cold histories; existing clients keep theirs. Compare queueing, throughput, and recovery. Delay is useful feedback, but its baseline and the other clients’ behaviour still matter.",
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
