import test from "node:test";
import assert from "node:assert/strict";
import { activityFingerprint, parseCsv, sha256 } from "./csv-parser.js";

test("parses commas, escaped quotes, and multiline quoted values", () => {
  const result = parseCsv('a,b,c\r\n1,"two, too","say ""hello"""\r\n2,"line one\nline two",x');
  assert.equal(result.error, undefined);
  assert.deepEqual(result.rows, [["a","b","c"],["1","two, too",'say "hello"'],["2","line one\nline two","x"]]);
});

test("rejects malformed quoting and inconsistent column counts", () => {
  assert.match(parseCsv('a,b\n1,"oops').error ?? "", /unterminated/);
  assert.match(parseCsv("a,b\n1").error ?? "", /same number/);
});

test("fingerprints are deterministic and content hashes are stable", () => {
  const value = { facilityId:"facility",category:"ELECTRICITY",scope:"SCOPE_2",quantity:"10",unit:"kWh",periodStart:"2026-01-01",periodEnd:"2026-01-31",sourceName:"Utility",sourceReference:"INV-1" };
  assert.equal(activityFingerprint(value), activityFingerprint({...value}));
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
