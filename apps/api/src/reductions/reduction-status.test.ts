import test from "node:test";
import assert from "node:assert/strict";
import { compareAndSetInitiativeStatus } from "./reduction-status.js";

test("initiative status update is conditional on the previously observed status", async () => {
  let loaded = false;
  let observedStatus = "";
  const result = await compareAndSetInitiativeStatus(
    "PLANNED",
    async (expectedStatus) => { observedStatus = expectedStatus; return 1; },
    async () => { loaded = true; return { id: "initiative-1", status: "IN_PROGRESS" }; },
  );
  assert.equal(observedStatus, "PLANNED");
  assert.equal(loaded, true);
  assert.deepEqual(result, { ok: true, record: { id: "initiative-1", status: "IN_PROGRESS" } });
});

test("stale concurrent initiative updates do not load or overwrite the newer status", async () => {
  let loaded = false;
  const result = await compareAndSetInitiativeStatus(
    "PLANNED",
    async () => 0,
    async () => { loaded = true; return { id: "initiative-1", status: "CANCELLED" }; },
  );
  assert.deepEqual(result, { ok: false });
  assert.equal(loaded, false);
});
