import { createInitialState, setClientCount } from "./simulation";
import type { ControllerKind, SimulationState } from "./simulation";
import type { LessonCondition } from "./conditions";

export interface LessonStep {
	action: string;
	observation: string;
	apply: (state: SimulationState) => SimulationState;
	conditions: LessonCondition[];
}

export interface Lesson {
	title: string;
	strategy: ControllerKind;
	clients: number;
	randomSeed: number;
	introduction: string;
	steps: LessonStep[];
}

export const LESSONS: Lesson[] = [
	{
		title: "A fixed rate meets more clients",
		strategy: "rate",
		clients: 1,
		randomSeed: 17,
		introduction: "Each client may send up to 0.5 requests/s to each worker. Let a few requests finish, then triple the client count without changing anyone’s limit.",
		steps: [{
			action: "Add two clients",
			apply: (state) => setClientCount(state, state.clients.length + 2),
			observation: "Watch completed throughput and the queues. More independent senders increase total demand, but worker capacity stays the same. A rate that was comfortable for one client can produce waiting and rejection with three.",
			conditions: [
				{ id: "queue", label: "Create a persistent queue", description: "Keep at least four more requests waiting than before the change for five seconds.", sustainMs: 5000, when: (state, baseline) => state.queueDepth >= baseline.queueDepth + 4 },
				{ id: "loss", label: "Observe rejection", description: "Keep the rolling rejection rate above 5% for five seconds.", sustainMs: 5000, when: (state) => (state.rejectionRate ?? 0) > 0.05 },
			],
		}],
	},
	{
		title: "The same rate meets slower work",
		strategy: "rate",
		clients: 1,
		randomSeed: 23,
		introduction: "This fresh run has one client and four workers. At normal speed the fixed rate is below fleet capacity. Keep the rate limits fixed, then increase the cost of every new request.",
		steps: [{
			action: "Triple processing time",
			apply: (state) => ({ ...state, serviceMs: state.serviceMs * 3 }),
			observation: "Capacity falls below the unchanged rate budget. Routing can choose a destination, but it cannot create capacity when every worker slows down. Watch waiting and rejection over the next 10–20 seconds.",
			conditions: [
				{ id: "queue", label: "See waiting grow", description: "Keep at least four more requests waiting than before the slowdown for five seconds.", sustainMs: 5000, when: (state, baseline) => state.queueDepth >= baseline.queueDepth + 4 },
				{ id: "loss", label: "See loss follow the queue", description: "Keep the rolling rejection rate above 5% for five seconds.", sustainMs: 5000, when: (state) => (state.rejectionRate ?? 0) > 0.05 },
			],
		}],
	},
	{
		title: "Limit unfinished work instead",
		strategy: "concurrency",
		clients: 1,
		randomSeed: 23,
		introduction: "Repeat the previous one-client setup with one in-flight request allowed per client–worker pair. Apply the same slowdown and compare how the send rate responds.",
		steps: [{
			action: "Triple processing time",
			apply: (state) => ({ ...state, serviceMs: state.serviceMs * 3 }),
			observation: "A permit stays occupied until the request finishes, so slower responses reduce admissions automatically. This bounds outstanding work; it does not guarantee an empty queue. Each added client would still bring another independent permit per worker.",
			conditions: [
				{ id: "slow", label: "Hold the slower service", description: "Apply the 3× processing-time change.", when: (state, baseline) => state.serviceMs === baseline.serviceMs * 3 },
				{ id: "protected", label: "Avoid sustained loss", description: "Keep the rejection rate at zero for five seconds after slowing workers.", sustainMs: 5000, when: (state) => state.serviceMs >= 3000 && state.rejectionRate === 0 },
			],
		}],
	},
	{
		title: "Let delay adjust the target",
		strategy: "vegas",
		clients: 2,
		randomSeed: 17,
		introduction: "Now each client–worker pair uses Vegas to adjust a paced target from its successful RTT samples. Let the estimates warm, then add two more independent clients.",
		steps: [{
			action: "Add two clients",
			apply: (state) => setClientCount(state, state.clients.length + 2),
			observation: "Open the endpoint inspector and follow the targets as latency changes. New clients start with cold histories; existing clients keep theirs. Compare queueing, throughput, and recovery. Delay is useful feedback, but its baseline and the other clients’ behaviour still matter.",
			conditions: [
				{ id: "warm", label: "Warm the new endpoint tables", description: "Let every newly added client observe at least one successful RTT.", when: (state, baseline) => state.clients.slice(baseline.clients.length).every((client) => client.endpoints.some((endpoint) => endpoint.observed)) },
				{ id: "adapt", label: "Observe a new target change", description: "Wait for a newly added client’s Vegas target to move away from one request.", when: (state, baseline) => state.clients.slice(baseline.clients.length).some((client) => client.endpoints.some((endpoint) => endpoint.controller.limit !== 1)) },
			],
		}],
	},
];

export function createLesson(index: number): SimulationState {
	const lesson = LESSONS[index];
	return setClientCount(createInitialState(lesson.strategy, lesson.randomSeed), lesson.clients);
}

export function applyLessonAction(state: SimulationState, lessonIndex: number, stepIndex: number): SimulationState {
	return LESSONS[lessonIndex].steps[stepIndex].apply(state);
}
