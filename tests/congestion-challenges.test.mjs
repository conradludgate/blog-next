import assert from "node:assert/strict";
import { test } from "node:test";
import { CONGESTION_CHALLENGES, createChallenge } from "../src/components/congestion/challenges.ts";
import { createConditionProgress, updateConditionProgress } from "../src/components/congestion/conditions.ts";
import { advanceSimulation, setClientCount } from "../src/components/congestion/simulation.ts";

const readerChanges = {
	"fixed-rate-client-scale": (state) => setClientCount(state, 3),
	"fixed-rate-slowdown": (state) => ({ ...state, serviceMs: 3000 }),
	"concurrency-slowdown": (state) => ({ ...state, serviceMs: 3000 }),
	"vegas-client-scale": (state) => setClientCount(state, 4),
};

for (const challenge of Object.values(CONGESTION_CHALLENGES)) {
	test(`the ${challenge.id} section challenge is achievable through ordinary controls`, () => {
		const baseline = createChallenge(challenge.id);
		let state = structuredClone(baseline);
		let progress = createConditionProgress(challenge.conditions);

		for (let tick = 0; tick < 120; tick++) {
			state = advanceSimulation(state);
			progress = updateConditionProgress(challenge.conditions, progress, state, baseline);
		}
		assert.ok(Object.values(progress).every((condition) => condition.completedAtMs === null), "time alone must not solve the task");

		state = readerChanges[challenge.id](state);
		for (let tick = 0; tick < 720 && Object.values(progress).some((condition) => condition.completedAtMs === null); tick++) {
			state = advanceSimulation(state);
			progress = updateConditionProgress(challenge.conditions, progress, state, baseline);
		}

		assert.deepEqual(
			Object.fromEntries(Object.entries(progress).map(([id, condition]) => [id, condition.completedAtMs !== null])),
			Object.fromEntries(challenge.conditions.map((condition) => [condition.id, true])),
		);
	});
}
