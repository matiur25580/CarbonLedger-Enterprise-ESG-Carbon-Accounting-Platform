import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { Router } from "express";
import { z } from "zod";
import { AuthRequest, requireRole } from "../auth/auth.middleware.js";
import { withTenantContext } from "../auth/tenant-context.js";
import { env } from "../config/env.js";

export const supplierRouter = Router();
const uuid = z.string().uuid();
const questionSchema = z.object({
  id: z.string().trim().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  label: z.string().trim().min(3).max(500),
  type: z.enum(["TEXT","NUMBER","BOOLEAN","CHOICE"]),
  required: z.boolean().default(true),
  options: z.array(z.string().trim().min(1).max(120)).max(30).optional()
}).strict().superRefine((q, ctx) => {
  if (q.type === "CHOICE" && (!q.options || q.options.length < 2)) ctx.addIssue({code:"custom",path:["options"],message:"Choice questions require at least two options"});
  if (q.type !== "CHOICE" && q.options) ctx.addIssue({code:"custom",path:["options"],message:"Options are only valid for CHOICE questions"});
});
const questionnaireSchema=z.object({
  title:z.string().trim().min(3).max(180),
  description:z.string().trim().max(2000).optional(),
  questions:z.array(questionSchema).min(1).max(50)
}).strict().superRefine((value,ctx)=>{
  const ids=value.questions.map(q=>q.id);
  if(new Set(ids).size!==ids.length) ctx.addIssue({code:"custom",path:["questions"],message:"Question IDs must be unique"});
});
const supplierSchema=z.object({
  name:z.string().trim().min(2).max(180),
  contactName:z.string().trim().min(2).max(120),
  contactEmail:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),
  countryCode:z.string().trim().length(2).regex(/^[A-Za-z]{2}$/).transform(v=>v.toUpperCase()),
  website:z.string().trim().url().max(300).optional(),
  category:z.string().trim().min(2).max(100)
}).strict();

type PortalClaims={organizationId:string;supplierId:string;invitationId:string};
function tokenHash(token:string):string{return createHash("sha256").update(token).digest("hex")}
function issuePortalToken(claims:PortalClaims):string{
  return jwt.sign(claims,env.JWT_ACCESS_SECRET,{algorithm:"HS256",expiresIn:"7d",issuer:"carbonledger-supplier-portal",audience:"carbonledger-supplier"});
}
function verifyPortalToken(token:string):PortalClaims{
  const value=jwt.verify(token,env.JWT_ACCESS_SECRET,{algorithms:["HS256"],issuer:"carbonledger-supplier-portal",audience:"carbonledger-supplier"});
  if(typeof value==="string"||!value.organizationId||!value.supplierId||!value.invitationId) throw new Error("Invalid supplier invitation");
  return value as PortalClaims;
}
function answerMatches(question:z.infer<typeof questionSchema>,answer:unknown):boolean{
  if(question.type==="TEXT") return typeof answer==="string" && answer.length<=5000;
  if(question.type==="NUMBER") return typeof answer==="number" && Number.isFinite(answer);
  if(question.type==="BOOLEAN") return typeof answer==="boolean";
  return typeof answer==="string" && !!question.options?.includes(answer);
}
async function resolveInvitation(token:string){
  const claims=verifyPortalToken(token);
  const invitation=await withTenantContext(claims.organizationId,tx=>tx.supplierInvitation.findFirst({
    where:{id:claims.invitationId,organizationId:claims.organizationId,supplierId:claims.supplierId,tokenHash:tokenHash(token)},
    include:{supplier:{select:{id:true,name:true,status:true}},questionnaire:{select:{id:true,title:true,description:true,version:true,questions:true,isPublished:true}}}
  }));
  if(!invitation||invitation.expiresAt<=new Date()||invitation.usedAt||invitation.supplier.status!=="ACTIVE"||!invitation.questionnaire.isPublished) return null;
  return {claims,invitation};
}

supplierRouter.get("/portal/:token",async(req,res)=>{
  try{
    const token=z.string().min(20).max(4096).safeParse(req.params.token);
    if(!token.success){res.status(400).json({error:{code:"INVALID_INVITATION",message:"Invalid supplier invitation"}});return;}
    const result=await resolveInvitation(token.data);
    if(!result){res.status(410).json({error:{code:"INVITATION_EXPIRED_OR_USED",message:"This supplier invitation is expired, revoked or already submitted"}});return;}
    const q=result.invitation.questionnaire;
    res.status(200).json({supplier:{name:result.invitation.supplier.name},questionnaire:{title:q.title,description:q.description,version:q.version,questions:q.questions}});
  }catch{res.status(401).json({error:{code:"INVALID_INVITATION",message:"Supplier invitation is invalid or expired"}})}
});

supplierRouter.post("/portal/:token/submit",async(req,res,next)=>{
  try{
    const token=z.string().min(20).max(4096).safeParse(req.params.token);
    const body=z.object({answers:z.record(z.string(),z.unknown())}).strict().safeParse(req.body);
    if(!token.success||!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Provide valid questionnaire answers"}});return;}
    const result=await resolveInvitation(token.data);
    if(!result){res.status(410).json({error:{code:"INVITATION_EXPIRED_OR_USED",message:"This supplier invitation is expired, revoked or already submitted"}});return;}
    const questions=questionSchema.array().parse(result.invitation.questionnaire.questions);
    const allowed=new Set(questions.map(q=>q.id));
    const unknown=Object.keys(body.data.answers).filter(key=>!allowed.has(key));
    const invalid=questions.filter(q=>{
      const answer=body.data.answers[q.id];
      if(answer===undefined||answer===null||answer==="") return q.required;
      return !answerMatches(q,answer);
    });
    if(unknown.length||invalid.length){
      res.status(422).json({error:{code:"QUESTIONNAIRE_ANSWERS_INVALID",message:"Some answers are missing or invalid",details:{unknownQuestionIds:unknown,invalidQuestionIds:invalid.map(q=>q.id)}}});
      return;
    }
    const submission=await withTenantContext(result.claims.organizationId,async tx=>{
      const fresh=await tx.supplierInvitation.findFirst({where:{id:result.claims.invitationId,organizationId:result.claims.organizationId,tokenHash:tokenHash(token.data),usedAt:null,expiresAt:{gt:new Date()}}});
      if(!fresh) return null;
      const created=await tx.supplierSubmission.create({data:{
        organizationId:result.claims.organizationId,supplierId:result.claims.supplierId,
        questionnaireId:result.invitation.questionnaireId,invitationId:fresh.id,answers:body.data.answers
      }});
      await tx.supplierInvitation.update({where:{id:fresh.id},data:{usedAt:new Date()}});
      await tx.auditLog.create({data:{organizationId:result.claims.organizationId,actorUserId:null,action:"supplier.questionnaire_submitted",resourceType:"supplier_submission",resourceId:created.id,metadata:{supplierId:result.claims.supplierId,questionnaireId:result.invitation.questionnaireId}}});
      return created;
    });
    if(!submission){res.status(409).json({error:{code:"INVITATION_ALREADY_USED",message:"This invitation has already been submitted"}});return;}
    res.status(201).json({message:"Supplier questionnaire submitted",submissionId:submission.id,submittedAt:submission.submittedAt});
  }catch(error){next(error)}
});

supplierRouter.get("/",requireRole("OWNER","ADMIN","MEMBER","AUDITOR"),async(req,res,next)=>{
  try{const auth=(req as AuthRequest).auth!;
    const suppliers=await withTenantContext(auth.organizationId,tx=>tx.supplier.findMany({where:{organizationId:auth.organizationId},orderBy:{name:"asc"},select:{id:true,name:true,contactName:true,contactEmail:true,countryCode:true,website:true,category:true,status:true,createdAt:true,_count:{select:{submissions:true}}}}));
    res.status(200).json({suppliers});
  }catch(error){next(error)}
});
supplierRouter.post("/",requireRole("OWNER","ADMIN"),async(req,res,next)=>{
  const body=supplierSchema.safeParse(req.body);
  if(!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid supplier details",details:body.error.flatten()}});return}
  try{const auth=(req as AuthRequest).auth!;
    const supplier=await withTenantContext(auth.organizationId,async tx=>{
      const created=await tx.supplier.create({data:{...body.data,organizationId:auth.organizationId}});
      await tx.auditLog.create({data:{organizationId:auth.organizationId,actorUserId:auth.userId,action:"supplier.created",resourceType:"supplier",resourceId:created.id,metadata:{category:created.category,countryCode:created.countryCode}}});
      return created;
    });
    res.status(201).json({supplier});
  }catch(error){next(error)}
});
supplierRouter.patch("/:supplierId/status",requireRole("OWNER","ADMIN"),async(req,res,next)=>{
  const id=uuid.safeParse(req.params.supplierId),body=z.object({status:z.enum(["ACTIVE","INACTIVE"])}).strict().safeParse(req.body);
  if(!id.success||!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid supplier status request"}});return}
  try{const auth=(req as AuthRequest).auth!;
    const supplier=await withTenantContext(auth.organizationId,async tx=>{
      const updated=await tx.supplier.updateMany({where:{id:id.data,organizationId:auth.organizationId},data:{status:body.data.status}});
      if(!updated.count)return null;
      await tx.auditLog.create({data:{organizationId:auth.organizationId,actorUserId:auth.userId,action:"supplier.status_changed",resourceType:"supplier",resourceId:id.data,metadata:{status:body.data.status}}});
      return tx.supplier.findFirst({where:{id:id.data,organizationId:auth.organizationId}});
    });
    if(!supplier){res.status(404).json({error:{code:"SUPPLIER_NOT_FOUND",message:"Supplier not found"}});return}
    res.status(200).json({supplier});
  }catch(error){next(error)}
});
supplierRouter.post("/questionnaires",requireRole("OWNER","ADMIN"),async(req,res,next)=>{
  const body=questionnaireSchema.safeParse(req.body);
  if(!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid questionnaire",details:body.error.flatten()}});return}
  try{const auth=(req as AuthRequest).auth!;
    const questionnaire=await withTenantContext(auth.organizationId,async tx=>{
      const prior=await tx.supplierQuestionnaire.findFirst({where:{organizationId:auth.organizationId,title:body.data.title},orderBy:{version:"desc"}});
      return tx.supplierQuestionnaire.create({data:{organizationId:auth.organizationId,title:body.data.title,description:body.data.description,version:(prior?.version??0)+1,questions:body.data.questions}});
    });
    res.status(201).json({questionnaire});
  }catch(error){next(error)}
});
supplierRouter.post("/questionnaires/:questionnaireId/publish",requireRole("OWNER","ADMIN"),async(req,res,next)=>{
  const id=uuid.safeParse(req.params.questionnaireId);if(!id.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid questionnaire ID"}});return}
  try{const auth=(req as AuthRequest).auth!;
    const questionnaire=await withTenantContext(auth.organizationId,async tx=>{
      const updated=await tx.supplierQuestionnaire.updateMany({where:{id:id.data,organizationId:auth.organizationId},data:{isPublished:true}});
      if(!updated.count)return null;
      return tx.supplierQuestionnaire.findFirst({where:{id:id.data,organizationId:auth.organizationId}});
    });
    if(!questionnaire){res.status(404).json({error:{code:"QUESTIONNAIRE_NOT_FOUND",message:"Questionnaire not found"}});return}
    res.status(200).json({questionnaire});
  }catch(error){next(error)}
});
supplierRouter.get("/questionnaires",requireRole("OWNER","ADMIN","MEMBER","AUDITOR"),async(req,res,next)=>{
  try{const auth=(req as AuthRequest).auth!;
    const questionnaires=await withTenantContext(auth.organizationId,tx=>tx.supplierQuestionnaire.findMany({where:{organizationId:auth.organizationId},orderBy:[{title:"asc"},{version:"desc"}]}));
    res.status(200).json({questionnaires});
  }catch(error){next(error)}
});
supplierRouter.post("/:supplierId/invitations",requireRole("OWNER","ADMIN"),async(req,res,next)=>{
  const id=uuid.safeParse(req.params.supplierId),body=z.object({questionnaireId:uuid}).strict().safeParse(req.body);
  if(!id.success||!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Provide supplier and questionnaire IDs"}});return}
  try{const auth=(req as AuthRequest).auth!;
    const invitation=await withTenantContext(auth.organizationId,async tx=>{
      const supplier=await tx.supplier.findFirst({where:{id:id.data,organizationId:auth.organizationId,status:"ACTIVE"}});
      const questionnaire=await tx.supplierQuestionnaire.findFirst({where:{id:body.data.questionnaireId,organizationId:auth.organizationId,isPublished:true}});
      if(!supplier||!questionnaire)return null;
      const invitationId=randomUUID();
      const expiresAt=new Date(Date.now()+7*24*60*60*1000);
      const token=issuePortalToken({organizationId:auth.organizationId,supplierId:supplier.id,invitationId});
      await tx.supplierInvitation.create({data:{id:invitationId,organizationId:auth.organizationId,supplierId:supplier.id,questionnaireId:questionnaire.id,tokenHash:tokenHash(token),expiresAt}});
      await tx.auditLog.create({data:{organizationId:auth.organizationId,actorUserId:auth.userId,action:"supplier.invitation_created",resourceType:"supplier_invitation",resourceId:invitationId,metadata:{supplierId:supplier.id,questionnaireId:questionnaire.id,expiresAt:expiresAt.toISOString()}}});
      return {id:invitationId,token,expiresAt,supplierEmail:supplier.contactEmail};
    });
    if(!invitation){res.status(404).json({error:{code:"SUPPLIER_OR_QUESTIONNAIRE_UNAVAILABLE",message:"Active supplier or published questionnaire not found"}});return}
    res.status(201).json({invitation:{id:invitation.id,portalToken:invitation.token,expiresAt:invitation.expiresAt,deliveryStatus:"NOT_SENT",recipient:invitation.supplierEmail}});
  }catch(error){next(error)}
});
supplierRouter.get("/submissions",requireRole("OWNER","ADMIN","MEMBER","AUDITOR"),async(req,res,next)=>{
  const query=z.object({limit:z.coerce.number().int().min(1).max(100).default(50)}).safeParse(req.query);
  if(!query.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid limit"}});return}
  try{const auth=(req as AuthRequest).auth!;
    const submissions=await withTenantContext(auth.organizationId,tx=>tx.supplierSubmission.findMany({where:{organizationId:auth.organizationId},take:query.data.limit,orderBy:{submittedAt:"desc"},include:{supplier:{select:{id:true,name:true,contactEmail:true}},questionnaire:{select:{id:true,title:true,version:true}}}}));
    res.status(200).json({submissions});
  }catch(error){next(error)}
});
