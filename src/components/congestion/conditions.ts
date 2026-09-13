import type { SimulationState } from "./simulation";

export interface LessonCondition {
	id: string;
	label: string;
	description: string;
	// Conditions must remain true for this long before a lesson marks them done.
	sustainMs?: number;
	when: (state: SimulationState, baseline: SimulationState) => boolean;
}

export interface ConditionProgress {
	activeSinceMs: number | null;
	completedAtMs: number | null;
}

export function createConditionProgress(conditions: LessonCondition[]): Record<string, ConditionProgress> {
	return Object.fromEntries(conditions.map((condition) => [condition.id, {
		activeSinceMs: null,
		completedAtMs: null,
	}]));
}

export function updateConditionProgress(
	conditions: LessonCondition[],
	progress: Record<string, ConditionProgress>,
	state: SimulationState,
	baseline: SimulationState,
): Record<string, ConditionProgress> {
	return Object.fromEntries(conditions.map((condition) => {
		const current = progress[condition.id] ?? { activeSinceMs: null, completedAtMs: null };
		if (current.completedAtMs !== null || !condition.when(state, baseline)) {
			return [condition.id, current.completedAtMs !== null ? current : { ...current, activeSinceMs: null }];
		}
		const activeSinceMs = current.activeSinceMs ?? state.nowMs;
		const sustained = state.nowMs - activeSinceMs >= (condition.sustainMs ?? 0);
		return [condition.id, sustained ? { activeSinceMs, completedAtMs: state.nowMs } : { activeSinceMs, completedAtMs: null }];
	}));
}
