import assert from "node:assert/strict";
import test from "node:test";
import { invitationEmailRetryDelayMs } from "./invitation-email.js";
test("supplier email retry delay grows exponentially and is capped",()=>{
 assert.equal(invitationEmailRetryDelayMs(1),30_000);
 assert.equal(invitationEmailRetryDelayMs(2),60_000);
 assert.equal(invitationEmailRetryDelayMs(6),16*60_000);
 assert.equal(invitationEmailRetryDelayMs(20),6*60*60_000);
});

test("permanent provider errors exclude rate limits and transient failures",async()=>{
 const {isPermanentEmailProviderError}=await import("./invitation-email.js");
 assert.equal(isPermanentEmailProviderError(400),true);
 assert.equal(isPermanentEmailProviderError(401),true);
 assert.equal(isPermanentEmailProviderError(408),false);
 assert.equal(isPermanentEmailProviderError(429),false);
 assert.equal(isPermanentEmailProviderError(500),false);
 assert.equal(isPermanentEmailProviderError(undefined),false);
});
