export const AVAILABILITY_IDLE_SAVE_MS = 1000;
export const AVAILABILITY_MAX_SAVE_MS = 3000;
export const AVAILABILITY_REFRESH_MS = 2500;

export type BatchedAvailabilityChange = { personId: string; dayId: string; slotKey: string; available: boolean };

export function availabilityBatchKey(change: Pick<BatchedAvailabilityChange, "personId" | "dayId" | "slotKey">) {
  return `${change.personId}\u0000${change.dayId}\u0000${change.slotKey}`;
}

export function mergeAvailabilityBatch(changes: BatchedAvailabilityChange[]) {
  const merged = new Map<string, BatchedAvailabilityChange>();
  for (const change of changes) merged.set(availabilityBatchKey(change), change);
  return Array.from(merged.values());
}
