import test from "node:test";
import assert from "node:assert/strict";
import { isPublicAddress, retryDelayMs } from "./webhook-delivery.js";

test("rejects loopback, private, link-local, documentation and reserved IPv4", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "192.0.2.1", "198.51.100.2", "203.0.113.4", "224.0.0.1"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
});

test("accepts public IPv4 and rejects non-global IPv6 ranges", () => {
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("1.1.1.1"), true);
  assert.equal(isPublicAddress("::1"), false);
  assert.equal(isPublicAddress("fc00::1"), false);
  assert.equal(isPublicAddress("fe80::1"), false);
  assert.equal(isPublicAddress("2001:db8::1"), false);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});

test("retry delay is bounded and increases by attempt", () => {
  const first = retryDelayMs(1);
  const second = retryDelayMs(2);
  const final = retryDelayMs(100);
  assert.ok(first >= 24_000 && first <= 36_000);
  assert.ok(second >= 48_000 && second <= 72_000);
  assert.ok(final <= 6 * 60 * 60 * 1000);
});
