type PublishableEventState = {
  draftChanges: number;
  publishedAt: string;
};

type PublishResponse<T> = {
  error?: string;
  state?: T;
};

export async function publishEventState<T extends PublishableEventState>(
  state: T,
  request: typeof fetch = fetch,
  publishedAt = "Just now",
): Promise<T> {
  const next = { ...state, draftChanges: 0, publishedAt };
  const response = await request("/api/event-state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(next),
  });
  const payload = await response.json().catch(() => ({})) as PublishResponse<T>;

  if (!response.ok) {
    throw new Error(payload.error || `Unable to publish the event (HTTP ${response.status}).`);
  }
  if (!payload.state) {
    throw new Error("The event was saved, but the published version was not returned.");
  }

  return payload.state;
}
