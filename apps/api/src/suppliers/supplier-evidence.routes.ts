import { Router } from "express";
import { z } from "zod";
import { AuthRequest, requireRole } from "../auth/auth.middleware.js";
import { withTenantContext } from "../auth/tenant-context.js";

export const supplierEvidenceRouter = Router();
const uuid = z.string().uuid();
export function evidenceReviewEligibility(input:{uploadedByUserId:string;reviewerUserId:string;storageProvider:string;malwareScanVerified:boolean}):"SELF_REVIEW"|"NOT_SCANNED"|"ELIGIBLE"{
  if(input.uploadedByUserId===input.reviewerUserId)return "SELF_REVIEW";
  if(input.storageProvider==="s3"&&!input.malwareScanVerified)return "NOT_SCANNED";
  return "ELIGIBLE";
}

const evidenceSchema = z.object({
  fileName: z.string().trim().min(1).max(240),
  mediaType: z.string().trim().regex(/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/).max(120),
  byteSize: z.number().int().positive().max(52_428_800),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  storageProvider: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_-]+$/),
  objectKey: z.string().trim().min(1).max(500).refine(v => !v.startsWith("/") && !v.includes("..") && !v.includes("\\") && !/[\r\n]/.test(v)),
  description: z.string().trim().max(1000).optional()
}).strict();
const reviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "NEEDS_CHANGES"]),
  comment: z.string().trim().max(2000).optional()
}).strict();

supplierEvidenceRouter.post("/submissions/:submissionId/evidence", requireRole("OWNER","ADMIN","MEMBER","AUDITOR"), async (req,res,next) => {
  const id=uuid.safeParse(req.params.submissionId), body=evidenceSchema.safeParse(req.body);
  if(!id.success || !body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid evidence metadata",details:body.success?undefined:body.error.flatten()}});return;}
  try {
    const auth=(req as AuthRequest).auth!;
    const evidence=await withTenantContext(auth.organizationId,async tx=>{
      const submission=await tx.supplierSubmission.findFirst({where:{id:id.data,organizationId:auth.organizationId},select:{id:true}});
      if(!submission)return null;
      const created=await tx.supplierEvidence.create({data:{...body.data,sha256:body.data.sha256.toLowerCase(),organizationId:auth.organizationId,submissionId:id.data,uploadedByUserId:auth.userId,byteSize:BigInt(body.data.byteSize)}});
      await tx.auditLog.create({data:{organizationId:auth.organizationId,actorUserId:auth.userId,action:"supplier.evidence_registered",resourceType:"supplier_evidence",resourceId:created.id,metadata:{submissionId:id.data,sha256:created.sha256,byteSize:created.byteSize.toString(),storageProvider:created.storageProvider}}});
      return created;
    });
    if(!evidence){res.status(404).json({error:{code:"SUBMISSION_NOT_FOUND",message:"Supplier submission not found"}});return;}
    res.status(201).json({evidence:{...evidence,byteSize:evidence.byteSize.toString()}});
  } catch(error){next(error);}
});

supplierEvidenceRouter.get("/submissions/:submissionId/evidence", requireRole("OWNER","ADMIN","MEMBER","AUDITOR"), async(req,res,next)=>{
  const id=uuid.safeParse(req.params.submissionId);
  if(!id.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid submission ID"}});return;}
  try{
    const auth=(req as AuthRequest).auth!;
    const evidence=await withTenantContext(auth.organizationId,tx=>tx.supplierEvidence.findMany({where:{organizationId:auth.organizationId,submissionId:id.data},orderBy:{createdAt:"asc"},select:{id:true,fileName:true,mediaType:true,byteSize:true,sha256:true,storageProvider:true,objectKey:true,description:true,createdAt:true,uploadedByUserId:true}}));
    res.status(200).json({evidence:evidence.map(item=>({...item,byteSize:item.byteSize.toString()}))});
  }catch(error){next(error);}
});

supplierEvidenceRouter.post("/submissions/:submissionId/reviews", requireRole("OWNER","ADMIN","AUDITOR"), async(req,res,next)=>{
  const id=uuid.safeParse(req.params.submissionId),body=reviewSchema.safeParse(req.body);
  if(!id.success||!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid review decision"}});return;}
  try{
    const auth=(req as AuthRequest).auth!;
    const review=await withTenantContext(auth.organizationId,async tx=>{
      const submission=await tx.supplierSubmission.findFirst({where:{id:id.data,organizationId:auth.organizationId},select:{id:true}});
      if(!submission)return null;
      const created=await tx.supplierSubmissionReview.create({data:{organizationId:auth.organizationId,submissionId:id.data,reviewerUserId:auth.userId,decision:body.data.decision,comment:body.data.comment}});
      await tx.auditLog.create({data:{organizationId:auth.organizationId,actorUserId:auth.userId,action:"supplier.submission_reviewed",resourceType:"supplier_submission",resourceId:id.data,metadata:{reviewId:created.id,decision:created.decision,commentPresent:!!created.comment}}});
      return created;
    });
    if(!review){res.status(404).json({error:{code:"SUBMISSION_NOT_FOUND",message:"Supplier submission not found"}});return;}
    res.status(201).json({review});
  }catch(error){next(error);}
});


supplierEvidenceRouter.post("/submissions/:submissionId/evidence/:evidenceId/reviews", requireRole("OWNER","ADMIN","AUDITOR"), async(req,res,next)=>{
  const submissionId=uuid.safeParse(req.params.submissionId), evidenceId=uuid.safeParse(req.params.evidenceId);
  const body=reviewSchema.safeParse(req.body);
  if(!submissionId.success||!evidenceId.success||!body.success){
    res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid evidence review request",details:body.success?undefined:body.error.flatten()}});
    return;
  }
  try{
    const auth=(req as AuthRequest).auth!;
    const result=await withTenantContext(auth.organizationId,async tx=>{
      const evidence=await tx.supplierEvidence.findFirst({
        where:{id:evidenceId.data,submissionId:submissionId.data,organizationId:auth.organizationId},
        select:{id:true,uploadedByUserId:true,storageProvider:true}
      });
      if(!evidence)return {kind:"NOT_FOUND" as const};

      const scan=await tx.auditLog.findFirst({
        where:{organizationId:auth.organizationId,resourceType:"supplier_evidence",resourceId:evidence.id,action:"supplier.evidence_scanned_and_registered"},
        select:{id:true}
      });
      const eligibility=evidenceReviewEligibility({uploadedByUserId:evidence.uploadedByUserId,reviewerUserId:auth.userId,storageProvider:evidence.storageProvider,malwareScanVerified:!!scan});
      if(eligibility!=="ELIGIBLE")return {kind:eligibility};
      const review=await tx.supplierEvidenceReview.create({data:{
        organizationId:auth.organizationId,evidenceId:evidence.id,submissionId:submissionId.data,
        reviewerUserId:auth.userId,decision:body.data.decision,comment:body.data.comment
      },include:{reviewer:{select:{id:true,name:true,email:true}}}});
      await tx.auditLog.create({data:{
        organizationId:auth.organizationId,actorUserId:auth.userId,action:"supplier.evidence_reviewed",
        resourceType:"supplier_evidence",resourceId:evidence.id,
        metadata:{reviewId:review.id,submissionId:submissionId.data,decision:review.decision,commentPresent:!!review.comment}
      }});
      return {kind:"OK" as const,review};
    });
    if(result.kind==="NOT_FOUND"){res.status(404).json({error:{code:"EVIDENCE_NOT_FOUND",message:"Evidence not found"} });return;}
    if(result.kind==="SELF_REVIEW"){res.status(403).json({error:{code:"SELF_REVIEW_FORBIDDEN",message:"Evidence uploaders cannot review their own evidence"} });return;}
    if(result.kind==="NOT_SCANNED"){res.status(409).json({error:{code:"EVIDENCE_NOT_SCANNED",message:"Evidence must pass malware scanning before review"} });return;}
    res.status(201).json({review:result.review});
  }catch(error){next(error);}
});

supplierEvidenceRouter.get("/submissions/:submissionId/evidence/:evidenceId/reviews", requireRole("OWNER","ADMIN","MEMBER","AUDITOR"), async(req,res,next)=>{
  const submissionId=uuid.safeParse(req.params.submissionId), evidenceId=uuid.safeParse(req.params.evidenceId);
  if(!submissionId.success||!evidenceId.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid evidence reference"}});return;}
  try{
    const auth=(req as AuthRequest).auth!;
    const result=await withTenantContext(auth.organizationId,async tx=>{
      const evidence=await tx.supplierEvidence.findFirst({where:{id:evidenceId.data,submissionId:submissionId.data,organizationId:auth.organizationId},select:{id:true}});
      if(!evidence)return null;
      return tx.supplierEvidenceReview.findMany({
        where:{organizationId:auth.organizationId,evidenceId:evidence.id,submissionId:submissionId.data},
        orderBy:[{createdAt:"asc"},{id:"asc"}],
        include:{reviewer:{select:{id:true,name:true,email:true}}}
      });
    });
    if(!result){res.status(404).json({error:{code:"EVIDENCE_NOT_FOUND",message:"Evidence not found"}});return;}
    res.status(200).json({reviews:result,currentDecision:result.at(-1)?.decision??null});
  }catch(error){next(error);}
});

supplierEvidenceRouter.get("/submissions/:submissionId/reviews", requireRole("OWNER","ADMIN","MEMBER","AUDITOR"), async(req,res,next)=>{
  const id=uuid.safeParse(req.params.submissionId);
  if(!id.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid submission ID"}});return;}
  try{
    const auth=(req as AuthRequest).auth!;
    const reviews=await withTenantContext(auth.organizationId,tx=>tx.supplierSubmissionReview.findMany({where:{organizationId:auth.organizationId,submissionId:id.data},orderBy:{createdAt:"asc"},include:{reviewer:{select:{id:true,name:true,email:true}}}}));
    res.status(200).json({reviews});
  }catch(error){next(error);}
});
