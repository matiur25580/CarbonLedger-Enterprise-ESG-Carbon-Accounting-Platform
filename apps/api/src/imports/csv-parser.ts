import { createHash } from "node:crypto";

export type CsvParseResult = { rows: string[][]; error?: string };

export function parseCsv(input: string): CsvParseResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 1; }
        else { quoted = false; afterQuote = true; }
      } else field += char;
      continue;
    }
    if (afterQuote && char !== "," && char !== "\r" && char !== "\n" && char !== " " && char !== "\t") {
      return { rows: [], error: "Unexpected character after a quoted CSV field" };
    }
    if (char === '"' && field.length === 0 && !afterQuote) { quoted = true; continue; }
    if (char === ",") { row.push(field.trim()); field = ""; afterQuote = false; continue; }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field.trim()); field = ""; afterQuote = false;
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    if (afterQuote && (char === " " || char === "\t")) continue;
    field += char;
  }
  if (quoted) return { rows: [], error: "CSV contains an unterminated quoted field" };
  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  if (rows.some((item) => item.length !== rows[0]?.length)) return { rows: [], error: "CSV rows must all have the same number of columns" };
  return { rows };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function activityFingerprint(value: {
  facilityId: string; category: string; scope: string; quantity: string; unit: string;
  periodStart: string; periodEnd: string; sourceName: string; sourceReference?: string;
}): string {
  return sha256(JSON.stringify([
    value.facilityId, value.category, value.scope, value.quantity, value.unit,
    value.periodStart, value.periodEnd, value.sourceName, value.sourceReference ?? null
  ]));
}
