import assert from "node:assert/strict";
import { after, it } from "node:test";
import express from "express";
import { calculationRateLimiter } from "./rate-limiters.js";

const app = express();
app.use(calculationRateLimiter);
app.get("/calculation", (_req, res) => res.status(200).json({ ok: true }));
const server = app.listen(0);
const address = server.address();
if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
const baseUrl = `http://127.0.0.1:${address.port}`;

after(() => new Promise<void>((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
}));

it("blocks calculation requests after the configured per-IP window limit", async () => {
  let lastStatus = 0;
  for (let index = 0; index < 31; index += 1) {
    const response = await fetch(`${baseUrl}/calculation`);
    lastStatus = response.status;
    await response.arrayBuffer();
  }
  assert.equal(lastStatus, 429);
});
