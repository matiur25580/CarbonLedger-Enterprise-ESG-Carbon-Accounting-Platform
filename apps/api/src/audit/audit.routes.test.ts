import test from "node:test";
import assert from "node:assert/strict";
import { buildAuditCsv, csvCell, sha256Hex } from "./audit.routes.js";

test("audit CSV escapes quotes and neutralizes spreadsheet formulas", () => {
  assert.equal(csvCell('=HYPERLINK("https://bad.example")'), '"\'=HYPERLINK(""https://bad.example"")"');
  assert.equal(csvCell('reviewer "A"'), '"reviewer ""A"""');
});

test("audit export is deterministic and exposes a verifiable SHA-256 digest", () => {
  const rows = [{
    id: "event-1", createdAt: new Date("2026-11-20T10:00:00.000Z"),
    actorUserId: "user-1", actor: { name: "Auditor", email: "auditor@example.test" },
    action: "activity.approved", resourceType: "activity", resourceId: "activity-1",
    metadata: { decision: "APPROVED" }
  }];
  const csv = buildAuditCsv(rows);
  assert.equal(csv, buildAuditCsv(rows));
  assert.match(sha256Hex(csv), /^[a-f0-9]{64}$/);
  assert.equal(csv.split("\r\n").length, 2);
});

test("audit export preserves an empty actor and metadata safely", () => {
  const csv = buildAuditCsv([{
    id: "event-2", createdAt: new Date("2026-11-20T10:00:00.000Z"),
    actorUserId: null, actor: null, action: "system.event",
    resourceType: "system", resourceId: "service", metadata: null
  }]);
  assert.match(csv, /"\{\}"/);
});
