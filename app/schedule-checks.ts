export type ScheduleCheck = {
  level: string;
  title: string;
  detail: string;
};

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
