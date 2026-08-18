type PublishableEventState = {
  draftChanges: number;
  publishedAt: string;
};

type PublishResponse<T> = {
  error?: string;
  state?: T;
};

type EventMutationResponse<T> = {
  error?: string;
  eventId?: string;
  state?: T;
};

async function responsePayload<T>(response: Response): Promise<EventMutationResponse<T>> {
  return response.json().catch(() => ({})) as Promise<EventMutationResponse<T>>;
}

export async function publishEventState<T extends PublishableEventState>(
  state: T,
  request: typeof fetch = fetch,
  publishedAt = "Just now",
): Promise<T> {
  const next = { ...state, draftChanges: 0, publishedAt };
  const response = await request("/api/event-state/publish", {
    method: "POST",
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

export async function setEventArchived<T>(eventId: string, archived: boolean, request: typeof fetch = fetch): Promise<T> {
  const response = await request("/api/event-state", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId, archived }),
  });
  const payload = await responsePayload<T>(response);
  if (!response.ok) throw new Error(payload.error || `Unable to ${archived ? "archive" : "restore"} the event (HTTP ${response.status}).`);
  if (!payload.state) throw new Error(`The event was ${archived ? "archived" : "restored"}, but the updated event was not returned.`);
  return payload.state;
}

export async function deleteEventState(eventId: string, request: typeof fetch = fetch): Promise<void> {
  const response = await request(`/api/event-state?event=${encodeURIComponent(eventId)}`, { method: "DELETE" });
  const payload = await responsePayload<never>(response);
  if (!response.ok) throw new Error(payload.error || `Unable to delete the event (HTTP ${response.status}).`);
}
