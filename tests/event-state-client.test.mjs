import assert from "node:assert/strict";
import test from "node:test";

import { publishEventState } from "../app/event-state-client.ts";

test("publishes the latest event and returns the persisted version", async () => {
  const draft = { eventId: "event-1", draftChanges: 2, publishedAt: "Yesterday", days: [{ id: "day-1" }] };
  let persisted;
  const request = async (url, options) => {
    assert.equal(url, "/api/event-state/publish");
    assert.equal(options.method, "POST");
    persisted = JSON.parse(options.body);
    return Response.json({ ok: true, state: persisted });
  };

  const published = await publishEventState(draft, request, "Today at 10:30 AM");

  assert.deepEqual(persisted, { ...draft, draftChanges: 0, publishedAt: "Today at 10:30 AM" });
  assert.deepEqual(published, persisted);
  assert.equal(draft.draftChanges, 2);
  assert.equal(draft.publishedAt, "Yesterday");
});

test("rejects failed publications with the server error and no success state", async () => {
  const draft = { eventId: "event-1", draftChanges: 1, publishedAt: "Yesterday" };
  const request = async () => Response.json({ error: "Database is unavailable." }, { status: 503 });

  await assert.rejects(
    publishEventState(draft, request),
    /Database is unavailable\./,
  );
  assert.equal(draft.draftChanges, 1);
  assert.equal(draft.publishedAt, "Yesterday");
});

test("rejects a success response that does not return the published version", async () => {
  const request = async () => Response.json({ ok: true });

  await assert.rejects(
    publishEventState({ draftChanges: 1, publishedAt: "Yesterday" }, request),
    /published version was not returned/,
  );
});
