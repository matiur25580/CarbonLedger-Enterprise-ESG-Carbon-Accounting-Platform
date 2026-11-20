import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { AuthRequest, requireRole } from "../auth/auth.middleware.js";
import { withTenantContext } from "../auth/tenant-context.js";
import { activityFingerprint, parseCsv, sha256 } from "./csv-parser.js";

export const activityImportRouter = Router();
const categories = ["ELECTRICITY","NATURAL_GAS","DIESEL","PETROL","LPG","REFRIGERANTS","COMPANY_VEHICLES","BUSINESS_TRAVEL","WASTE","WATER","PURCHASED_GOODS","FREIGHT","OTHER"] as const;
const scopes = ["SCOPE_1","SCOPE_2","SCOPE_3"] as const;
const requiredHeaders = ["facilityCode","category","scope","quantity","unit","periodStart","periodEnd","sourceName"];
const optionalHeaders = ["sourceReference","notes"];
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a valid YYYY-MM-DD date");
const rowSchema = z.object({
  facilityCode: z.string().trim().min(1).max(40),
  category: z.enum(categories),
  scope: z.enum(scopes),
  quantity: z.string().trim().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/, "Use a positive decimal with up to 6 fractional digits").refine((v) => Number(v) > 0, "Quantity must be greater than zero"),
  unit: z.string().trim().min(1).max(40),
  periodStart: dateString,
  periodEnd: dateString,
  sourceName: z.string().trim().min(2).max(160),
  sourceReference: z.string().trim().max(240).optional().transform((v) => v || undefined),
  notes: z.string().trim().max(2000).optional().transform((v) => v || undefined)
}).strict().refine((v) => v.periodEnd >= v.periodStart, { path: ["periodEnd"], message: "Period end must not precede period start" })
  .refine((v) => {
    const expected: Record<string,string> = { ELECTRICITY:"SCOPE_2", NATURAL_GAS:"SCOPE_1", DIESEL:"SCOPE_1", PETROL:"SCOPE_1", LPG:"SCOPE_1", REFRIGERANTS:"SCOPE_1", COMPANY_VEHICLES:"SCOPE_1", BUSINESS_TRAVEL:"SCOPE_3", WASTE:"SCOPE_3", WATER:"SCOPE_3", PURCHASED_GOODS:"SCOPE_3", FREIGHT:"SCOPE_3" };
    return !expected[v.category] || expected[v.category] === v.scope;
  }, { path: ["scope"], message: "Scope does not match the selected activity category" });

type ValidRow = z.infer<typeof rowSchema> & { rowNumber: number; facilityId: string; fingerprint: string };
type RowIssue = { rowNumber: number; code: string; message: string };
type Preview = { totalRows: number; validRows: number; duplicateRows: number; errorRows: number; canCommit: boolean; issues: RowIssue[]; duplicateDetails: Array<{rowNumber:number; duplicateOf?:number; reason:string}>; contentSha256: string; fileName: string };

const requestSchema = z.object({
  fileName: z.string().trim().min(1).max(180).regex(/^[^/\\\\\u0000-\u001f]+$/, "File name must not contain path separators or control characters"),
  csvText: z.string().min(1)
}).strict();

async function buildPreview(tx: PrismaTypes.TransactionClient, organizationId: string, fileName: string, csvText: string): Promise<{ preview: Preview; validRows: ValidRow[] }> {
  const contentSha256 = sha256(csvText);
  const parsed = parseCsv(csvText);
  const empty = (issues: RowIssue[] = []): { preview: Preview; validRows: ValidRow[] } => ({
    preview: { totalRows: 0, validRows: 0, duplicateRows: 0, errorRows: issues.length, canCommit: false, issues, duplicateDetails: [], contentSha256, fileName },
    validRows: []
  });
  if (Buffer.byteLength(csvText, "utf8") > 1024 * 1024) return empty([{ rowNumber: 0, code: "FILE_TOO_LARGE", message: "CSV must not exceed 1 MiB" }]);
  if (parsed.error) return empty([{ rowNumber: 0, code: "CSV_FORMAT_INVALID", message: parsed.error }]);
  if (parsed.rows.length < 2) return empty([{ rowNumber: 0, code: "CSV_EMPTY", message: "CSV must contain a header and at least one data row" }]);
  const [headers, ...dataRows] = parsed.rows;
  if (dataRows.length > 500) return empty([{ rowNumber: 0, code: "ROW_LIMIT_EXCEEDED", message: "CSV is limited to 500 data rows" }]);
  const duplicateHeaders = headers.filter((h, i) => headers.indexOf(h) !== i);
  const unknownHeaders = headers.filter((h) => !requiredHeaders.includes(h) && !optionalHeaders.includes(h));
  const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
  if (duplicateHeaders.length || unknownHeaders.length || missingHeaders.length) {
    const messages = [
      ...(duplicateHeaders.length ? ["Duplicate headers: " + [...new Set(duplicateHeaders)].join(", ")] : []),
      ...(unknownHeaders.length ? ["Unknown headers: " + unknownHeaders.join(", ")] : []),
      ...(missingHeaders.length ? ["Missing required headers: " + missingHeaders.join(", ")] : [])
    ];
    return empty([{ rowNumber: 1, code: "CSV_HEADERS_INVALID", message: messages.join("; ") }]);
  }

  const issues: RowIssue[] = [];
  const candidateRows: Array<{ rowNumber: number; data: z.infer<typeof rowSchema> }> = [];
  dataRows.forEach((cells, index) => {
    const raw = Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? ""]));
    const parsedRow = rowSchema.safeParse(raw);
    if (!parsedRow.success) {
      for (const issue of parsedRow.error.issues) issues.push({ rowNumber: index + 2, code: "ROW_VALIDATION_FAILED", message: issue.path.join(".") + ": " + issue.message });
    } else candidateRows.push({ rowNumber: index + 2, data: parsedRow.data });
  });

  const facilityCodes = [...new Set(candidateRows.map((r) => r.data.facilityCode))];
  const facilities = facilityCodes.length ? await tx.facility.findMany({
    where: { organizationId, isActive: true, code: { in: facilityCodes } },
    select: { id: true, code: true }
  }) : [];
  const facilityByCode = new Map(facilities.map((f) => [f.code, f.id]));
  const validRows: ValidRow[] = [];
  for (const candidate of candidateRows) {
    const facilityId = facilityByCode.get(candidate.data.facilityCode);
    if (!facilityId) {
      issues.push({ rowNumber: candidate.rowNumber, code: "FACILITY_NOT_FOUND", message: "Facility code is not active in this organization" });
      continue;
    }
    const fingerprint = activityFingerprint({
      facilityId, category: candidate.data.category, scope: candidate.data.scope,
      quantity: new Prisma.Decimal(candidate.data.quantity).toFixed(6), unit: candidate.data.unit,
      periodStart: candidate.data.periodStart, periodEnd: candidate.data.periodEnd,
      sourceName: candidate.data.sourceName, sourceReference: candidate.data.sourceReference
    });
    validRows.push({ ...candidate.data, rowNumber: candidate.rowNumber, facilityId, fingerprint });
  }

  const seen = new Map<string, number>();
  const duplicateDetails: Preview["duplicateDetails"] = [];
  const uniqueRows: ValidRow[] = [];
  for (const row of validRows) {
    const first = seen.get(row.fingerprint);
    if (first !== undefined) duplicateDetails.push({ rowNumber: row.rowNumber, duplicateOf: first, reason: "Duplicate row in this CSV" });
    else { seen.set(row.fingerprint, row.rowNumber); uniqueRows.push(row); }
  }

  if (uniqueRows.length) {
    const existing = await tx.activityRecord.findMany({
      where: {
        organizationId,
        OR: uniqueRows.map((row) => ({
          facilityId: row.facilityId, category: row.category, scope: row.scope,
          quantity: new Prisma.Decimal(row.quantity).toDecimalPlaces(6), unit: row.unit,
          periodStart: new Date(row.periodStart), periodEnd: new Date(row.periodEnd),
          sourceName: row.sourceName, sourceReference: row.sourceReference ?? null
        }))
      },
      select: { facilityId: true, category: true, scope: true, quantity: true, unit: true, periodStart: true, periodEnd: true, sourceName: true, sourceReference: true }
    });
    const existingFingerprints = new Set(existing.map((item) => activityFingerprint({
      facilityId: item.facilityId, category: item.category, scope: item.scope, quantity: item.quantity.toFixed(6),
      unit: item.unit, periodStart: item.periodStart.toISOString().slice(0,10),
      periodEnd: item.periodEnd.toISOString().slice(0,10), sourceName: item.sourceName, sourceReference: item.sourceReference ?? undefined
    })));
    for (const row of uniqueRows) if (existingFingerprints.has(row.fingerprint)) duplicateDetails.push({ rowNumber: row.rowNumber, reason: "Matching activity record already exists in this organization" });
  }

  const duplicateRows = duplicateDetails.length;
  const errorRows = new Set(issues.map((issue) => issue.rowNumber)).size;
  const preview: Preview = {
    totalRows: dataRows.length, validRows: validRows.length - duplicateRows, duplicateRows, errorRows,
    canCommit: issues.length === 0 && duplicateRows === 0 && validRows.length === dataRows.length,
    issues, duplicateDetails, contentSha256, fileName
  };
  return { preview, validRows: uniqueRows };
}

activityImportRouter.post("/preview", requireRole("OWNER","ADMIN","MEMBER"), async (req, res, next) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code:"VALIDATION_ERROR", message:"Provide a fileName and CSV text", details:parsed.error.flatten() } }); return; }
  try {
    const auth = (req as AuthRequest).auth!;
    const result = await withTenantContext(auth.organizationId, (tx) => buildPreview(tx, auth.organizationId, parsed.data.fileName, parsed.data.csvText));
    res.status(200).json({ preview: result.preview });
  } catch (error) { next(error); }
});

activityImportRouter.post("/commit", requireRole("OWNER","ADMIN","MEMBER"), async (req, res, next) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code:"VALIDATION_ERROR", message:"Provide a fileName and CSV text", details:parsed.error.flatten() } }); return; }
  try {
    const auth = (req as AuthRequest).auth!;
    const result = await withTenantContext(auth.organizationId, async (tx) => {
      const contentSha256 = sha256(parsed.data.csvText);
      const prior = await tx.activityImportBatch.findFirst({ where: { organizationId: auth.organizationId, contentSha256 } });
      if (prior) return { batch: prior, reused: true as const, preview: null };
      const { preview, validRows } = await buildPreview(tx, auth.organizationId, parsed.data.fileName, parsed.data.csvText);
      if (!preview.canCommit) return { batch: null, reused: false as const, preview };
      const batch = await tx.activityImportBatch.create({
        data: {
          organizationId: auth.organizationId, createdByUserId: auth.userId,
          fileName: parsed.data.fileName, contentSha256, totalRows: preview.totalRows,
          importedRows: validRows.length, report: { totalRows: preview.totalRows, importedRows: validRows.length, duplicateRows: 0, errorRows: 0, issues: [], duplicateDetails: [] }
        }
      });
      await tx.activityRecord.createMany({
        data: validRows.map((row) => ({
          organizationId: auth.organizationId, facilityId: row.facilityId, category: row.category,
          scope: row.scope, quantity: new Prisma.Decimal(row.quantity), unit: row.unit,
          periodStart: new Date(row.periodStart), periodEnd: new Date(row.periodEnd),
          sourceName: row.sourceName, sourceReference: row.sourceReference ?? null, notes: row.notes ?? null,
          createdByUserId: auth.userId, importBatchId: batch.id
        }))
      });
      await tx.auditLog.create({
        data: { organizationId: auth.organizationId, actorUserId: auth.userId, action: "activity.import_committed", resourceType: "activity_import_batch", resourceId: batch.id, metadata: { contentSha256, totalRows: preview.totalRows, importedRows: validRows.length } }
      });
      return { batch, reused: false as const, preview };
    });
    if (result.preview && !result.preview.canCommit) {
      res.status(422).json({ error: { code:"IMPORT_VALIDATION_FAILED", message:"Import was not committed; fix every error and duplicate before retrying", preview:result.preview } });
      return;
    }
    res.status(result.reused ? 200 : 201).json({ batch: result.batch, reused: result.reused });
  } catch (error) { next(error); }
});

activityImportRouter.get("/", async (req, res, next) => {
  const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: { code:"VALIDATION_ERROR", message:"Invalid limit" } }); return; }
  try {
    const auth = (req as AuthRequest).auth!;
    const batches = await withTenantContext(auth.organizationId, (tx) => tx.activityImportBatch.findMany({
      where: { organizationId: auth.organizationId }, take: query.data.limit, orderBy: { createdAt:"desc" },
      select: { id:true, fileName:true, contentSha256:true, status:true, totalRows:true, importedRows:true, report:true, createdAt:true, createdBy:{select:{id:true,name:true}} }
    }));
    res.status(200).json({ batches });
  } catch (error) { next(error); }
});
