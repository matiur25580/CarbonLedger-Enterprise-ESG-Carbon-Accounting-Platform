import assert from "node:assert/strict";
import test from "node:test";
test("evidence scan retry backoff is capped",()=>{const delay=(n:number)=>Math.min(60000,2000*2**Math.max(0,n-1));assert.equal(delay(1),2000);assert.equal(delay(2),4000);assert.equal(delay(9),60000);});
test("malware verdict and exhausted retries are terminal",()=>{const terminal=(message:string,attempt:number)=>message.toLowerCase().includes("malware detected")||attempt>=5;assert.equal(terminal("Malware detected",1),true);assert.equal(terminal("Scanner unavailable",1),false);assert.equal(terminal("Scanner unavailable",5),true);});
