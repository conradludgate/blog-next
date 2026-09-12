import assert from "node:assert/strict";
import { test } from "node:test";
import { createConditionProgress, updateConditionProgress } from "../src/components/congestion/conditions.ts";
import { createInitialState } from "../src/components/congestion/simulation.ts";

test("lesson conditions require a sustained observation and remain complete", () => {
	const conditions = [{
		id: "overload",
		label: "Overloaded",
		description: "Queue work for one second.",
		sustainMs: 1000,
		when: (state) => state.queueDepth >= 4,
	}];
	const baseline = createInitialState();
	let progress = createConditionProgress(conditions);

	progress = updateConditionProgress(conditions, progress, { ...baseline, nowMs: 0, queueDepth: 4 }, baseline, true);
	assert.equal(progress.overload.completedAtMs, null);
	progress = updateConditionProgress(conditions, progress, { ...baseline, nowMs: 500, queueDepth: 4 }, baseline, true);
	assert.equal(progress.overload.completedAtMs, null);
	progress = updateConditionProgress(conditions, progress, { ...baseline, nowMs: 750, queueDepth: 0 }, baseline, true);
	assert.equal(progress.overload.activeSinceMs, null, "a brief healthy tick resets the sustained observation");
	progress = updateConditionProgress(conditions, progress, { ...baseline, nowMs: 1000, queueDepth: 4 }, baseline, true);
	progress = updateConditionProgress(conditions, progress, { ...baseline, nowMs: 2000, queueDepth: 4 }, baseline, true);
	assert.equal(progress.overload.completedAtMs, 2000);
	progress = updateConditionProgress(conditions, progress, { ...baseline, nowMs: 2250, queueDepth: 0 }, baseline, true);
	assert.equal(progress.overload.completedAtMs, 2000, "a completed lesson check is never undone by a later transient");
});

test("lesson conditions do not begin before the CTA action", () => {
	const conditions = [{
		id: "changed",
		label: "Changed",
		description: "Apply the change.",
		when: (state) => state.serviceMs === 3000,
	}];
	const baseline = createInitialState();
	const changed = { ...baseline, nowMs: 10_000, serviceMs: 3000 };
	let progress = updateConditionProgress(conditions, createConditionProgress(conditions), changed, baseline, false);
	assert.equal(progress.changed.completedAtMs, null);
	progress = updateConditionProgress(conditions, progress, changed, baseline, true);
	assert.equal(progress.changed.completedAtMs, 10_000);
});

test("lesson conditions can require a change from the action-time baseline", () => {
	const conditions = [{
		id: "growth",
		label: "Queue grew",
		description: "Add four waiting requests.",
		when: (state, baseline) => state.queueDepth >= baseline.queueDepth + 4,
	}];
	const baseline = { ...createInitialState(), nowMs: 10_000, queueDepth: 5 };
	const unchanged = { ...baseline, nowMs: 10_250 };
	const changed = { ...baseline, nowMs: 10_500, queueDepth: 9 };
	let progress = createConditionProgress(conditions);
	progress = updateConditionProgress(conditions, progress, unchanged, baseline, true);
	assert.equal(progress.growth.completedAtMs, null);
	progress = updateConditionProgress(conditions, progress, changed, baseline, true);
	assert.equal(progress.growth.completedAtMs, 10_500);
});
