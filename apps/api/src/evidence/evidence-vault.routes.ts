import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { AuthRequest, requireRole } from "../auth/auth.middleware.js";
import { withTenantContext } from "../auth/tenant-context.js";
import { createEvidenceDownloadUrl, createEvidenceUploadUrl, deleteEvidenceObject, inspectEvidenceObject, readEvidenceObject } from "./s3-evidence-storage.js";
import { scanBufferWithClamAv } from "./clamav-scanner.js";

export const evidenceVaultRouter = Router();
const uuid = z.string().uuid();
const uploadSchema = z.object({
  fileName: z.string().trim().min(1).max(240),
  mediaType: z.string().trim().regex(/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/).max(120),
  byteSize: z.number().int().positive().max(52_428_800),
  description: z.string().trim().max(1000).optional()
}).strict();

evidenceVaultRouter.post("/submissions/:submissionId/evidence/upload-intents", requireRole("OWNER","ADMIN","MEMBER"), async(req,res,next)=>{
  const id=uuid.safeParse(req.params.submissionId), body=uploadSchema.safeParse(req.body);
  if(!id.success||!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid evidence upload request"}});return;}
  try{
    const auth=(req as AuthRequest).auth!;
    const submission=await withTenantContext(auth.organizationId,tx=>tx.supplierSubmission.findFirst({where:{id:id.data,organizationId:auth.organizationId},select:{id:true}}));
    if(!submission){res.status(404).json({error:{code:"SUBMISSION_NOT_FOUND",message:"Supplier submission not found"}});return;}
    const evidenceId=randomUUID();
    const key=`quarantine/${auth.organizationId}/${id.data}/${evidenceId}`;
    const uploadUrl=await createEvidenceUploadUrl(key,body.data.mediaType,body.data.byteSize);
    res.status(201).json({upload:{evidenceId,uploadUrl,method:"PUT",requiredHeaders:{"Content-Type":body.data.mediaType},expiresInSeconds:300,maxBytes:52_428_800},message:"Object remains quarantined until the completion endpoint verifies and scans it."});
  }catch(error){next(error);}
});

evidenceVaultRouter.post("/submissions/:submissionId/evidence/:evidenceId/complete",requireRole("OWNER","ADMIN","MEMBER"),async(req,res,next)=>{
  const submissionId=uuid.safeParse(req.params.submissionId), evidenceId=uuid.safeParse(req.params.evidenceId), body=uploadSchema.safeParse(req.body);
  if(!submissionId.success||!evidenceId.success||!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid evidence completion request"}});return;}
  try{
    const auth=(req as AuthRequest).auth!;
    const key=`quarantine/${auth.organizationId}/${submissionId.data}/${evidenceId.data}`;
    const submission=await withTenantContext(auth.organizationId,tx=>tx.supplierSubmission.findFirst({where:{id:submissionId.data,organizationId:auth.organizationId},select:{id:true}}));
    if(!submission){res.status(404).json({error:{code:"SUBMISSION_NOT_FOUND",message:"Supplier submission not found"}});return;}
    const head=await inspectEvidenceObject(key);
    if(head.byteSize!==body.data.byteSize||head.mediaType!==body.data.mediaType||head.byteSize<1||head.byteSize>52_428_800){
      await deleteEvidenceObject(key).catch(()=>undefined);
      res.status(422).json({error:{code:"EVIDENCE_METADATA_MISMATCH",message:"Uploaded object size or media type does not match the upload request"}});return;
    }
    const bytes=await readEvidenceObject(key);
    const sha256=createHash("sha256").update(bytes).digest("hex");
    const scan=await scanBufferWithClamAv(bytes);
    const evidence=await withTenantContext(auth.organizationId,async tx=>{
      const created=await tx.supplierEvidence.create({data:{
        id:evidenceId.data,organizationId:auth.organizationId,submissionId:submissionId.data,uploadedByUserId:auth.userId,
        fileName:body.data.fileName,mediaType:body.data.mediaType,byteSize:BigInt(bytes.length),sha256,
        storageProvider:"s3",objectKey:key,description:body.data.description
      }});
      await tx.auditLog.create({data:{organizationId:auth.organizationId,actorUserId:auth.userId,action:"supplier.evidence_scanned_and_registered",resourceType:"supplier_evidence",resourceId:created.id,metadata:{submissionId:submissionId.data,sha256,byteSize:bytes.length,scanner:scan.engine,scanStatus:"CLEAN"}}});
      return created;
    });
    res.status(201).json({evidence:{...evidence,byteSize:evidence.byteSize.toString(),scanStatus:"CLEAN"}});
  }catch(error){next(error);}
});

evidenceVaultRouter.get("/submissions/:submissionId/evidence/:evidenceId/download",requireRole("OWNER","ADMIN","MEMBER","AUDITOR"),async(req,res,next)=>{
  const submissionId=uuid.safeParse(req.params.submissionId), evidenceId=uuid.safeParse(req.params.evidenceId);
  if(!submissionId.success||!evidenceId.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid evidence reference"}});return;}
  try{
    const auth=(req as AuthRequest).auth!;
    const evidence=await withTenantContext(auth.organizationId,async tx=>{
      const record=await tx.supplierEvidence.findFirst({where:{id:evidenceId.data,submissionId:submissionId.data,organizationId:auth.organizationId,storageProvider:"s3"},select:{id:true,objectKey:true,fileName:true}});
      if(!record)return null;
      // Legacy metadata registration remains available, so require the scan-success audit
      // event created atomically by the vault completion flow before issuing a URL.
      const scanEvent=await tx.auditLog.findFirst({where:{organizationId:auth.organizationId,resourceType:"supplier_evidence",resourceId:record.id,action:"supplier.evidence_scanned_and_registered"},select:{id:true}});
      return scanEvent?record:null;
    });
    if(!evidence){res.status(404).json({error:{code:"EVIDENCE_NOT_FOUND",message:"Scanned evidence not found"}});return;}
    const url=await createEvidenceDownloadUrl(evidence.objectKey);
    await withTenantContext(auth.organizationId,tx=>tx.auditLog.create({data:{organizationId:auth.organizationId,actorUserId:auth.userId,action:"supplier.evidence_download_url_issued",resourceType:"supplier_evidence",resourceId:evidence.id,metadata:{fileName:evidence.fileName,expiresInSeconds:60}}}));
    res.status(200).json({download:{url,expiresInSeconds:60}});
  }catch(error){next(error);}
});
