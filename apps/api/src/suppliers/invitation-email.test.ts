import assert from "node:assert/strict";
import test from "node:test";
import { invitationEmailRetryDelayMs } from "./invitation-email.js";
test("supplier email retry delay grows exponentially and is capped",()=>{
 assert.equal(invitationEmailRetryDelayMs(1),30_000);
 assert.equal(invitationEmailRetryDelayMs(2),60_000);
 assert.equal(invitationEmailRetryDelayMs(6),16*60_000);
 assert.equal(invitationEmailRetryDelayMs(20),6*60*60_000);
});
