const MIN_EVENT_DAYS = 1;
const MAX_EVENT_DAYS = 7;

export type DayCountValidation = {
  value: number | null;
  error: string;
};

export function validateDayCount(input: string): DayCountValidation {
  const trimmed = input.trim();
  if (!trimmed) return { value: null, error: "Enter the number of days." };

  const value = Number(trimmed);
  if (!Number.isInteger(value)) return { value: null, error: "Use a whole number of days." };
  if (value < MIN_EVENT_DAYS || value > MAX_EVENT_DAYS) return { value: null, error: `Enter a number from ${MIN_EVENT_DAYS} to ${MAX_EVENT_DAYS}.` };

  return { value, error: "" };
}
