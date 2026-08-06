export type ScheduleCheck = {
  level: string;
  title: string;
  detail: string;
};

export type ScheduleReviewTarget = {
  dayId: string;
  blockId?: string;
  personId?: string;
};

export function scheduleMutationAffectsReviewTarget(
  reviewTarget: ScheduleReviewTarget | null,
  mutationTarget: ScheduleReviewTarget,
) {
  if (!reviewTarget || reviewTarget.dayId !== mutationTarget.dayId) return false;
  if (reviewTarget.blockId && reviewTarget.blockId !== mutationTarget.blockId) return false;
  if (reviewTarget.personId && reviewTarget.personId !== mutationTarget.personId) return false;
  return true;
}

export function getScheduleChecksViewState<T extends ScheduleCheck>(
  checks: T[],
  loading: boolean,
  error: string,
) {
  return {
    phase: loading ? "loading" as const : checks.length ? "ready" as const : "empty" as const,
    checks,
    error,
  };
}
