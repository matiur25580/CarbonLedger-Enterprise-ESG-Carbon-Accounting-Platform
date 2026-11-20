import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { AuthRequest, requireRole } from "../auth/auth.middleware.js";
import { withTenantContext } from "../auth/tenant-context.js";

export const reductionRouter = Router();
const decimalString = z.string().regex(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/);
const targetSchema = z.object({
  name: z.string().trim().min(2).max(180),
  scope: z.enum(["SCOPE_1","SCOPE_2","SCOPE_3"]),
  baselineYear: z.number().int().min(1900).max(2200),
  targetYear: z.number().int().min(1901).max(2201),
  baselineKgCo2e: decimalString,
  reductionPercent: z.string().regex(/^(?:[1-9]\d?|100)(?:\.\d{1,4})?$/)
}).strict().refine(v=>v.targetYear>v.baselineYear,"Target year must follow baseline year");
const initiativeSchema = z.object({
  name: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional(),
  expectedAnnualReductionKg: decimalString,
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional()
}).strict().refine(v=>!v.startDate||!v.endDate||v.endDate>=v.startDate,"End date must not precede start date");
const statusSchema=z.object({status:z.enum(["PLANNED","IN_PROGRESS","COMPLETED","CANCELLED"])}).strict();
const scenarioSchema=z.object({name:z.string().trim().min(2).max(180)}).strict();
const uuid=z.string().uuid();

reductionRouter.post("/targets",requireRole("OWNER","ADMIN"),async(req,res,next)=>{
  const body=targetSchema.safeParse(req.body);
  if(!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid reduction target",details:body.error.flatten()}});return;}
  if(new Prisma.Decimal(body.data.baselineKgCo2e).lte(0)||new Prisma.Decimal(body.data.reductionPercent).lte(0)||new Prisma.Decimal(body.data.reductionPercent).gt(100)){
    res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Baseline must be positive and reduction percent must be greater than 0 and at most 100"}});return;
  }
  try{
    const auth=(req as AuthRequest).auth!;
    const target=await withTenantContext(auth.organizationId,async tx=>{
      const created=await tx.reductionTarget.create({data:{organizationId:auth.organizationId,createdByUserId:auth.userId,...body.data,baselineKgCo2e:new Prisma.Decimal(body.data.baselineKgCo2e),reductionPercent:new Prisma.Decimal(body.data.reductionPercent)}});
      await tx.auditLog.create({data:{organizationId:auth.organizationId,actorUserId:auth.userId,action:"reduction.target_created",resourceType:"reduction_target",resourceId:created.id,metadata:{scope:created.scope,baselineYear:created.baselineYear,targetYear:created.targetYear}}});
      return created;
    });
    res.status(201).json({target});
  }catch(error){next(error);}
});

reductionRouter.get("/targets",async(req,res,next)=>{
  const q=z.object({limit:z.coerce.number().int().min(1).max(100).default(50)}).safeParse(req.query);
  if(!q.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid limit"}});return;}
  try{
    const auth=(req as AuthRequest).auth!;
    const targets=await withTenantContext(auth.organizationId,tx=>tx.reductionTarget.findMany({where:{organizationId:auth.organizationId},take:q.data.limit,orderBy:{createdAt:"desc"},include:{initiatives:true,scenarios:{orderBy:{createdAt:"desc"},take:5}}}));
    res.status(200).json({targets});
  }catch(error){next(error);}
});

reductionRouter.post("/targets/:targetId/initiatives",requireRole("OWNER","ADMIN","MEMBER"),async(req,res,next)=>{
  const id=uuid.safeParse(req.params.targetId),body=initiativeSchema.safeParse(req.body);
  if(!id.success||!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid target ID or initiative",details:body.success?undefined:body.error.flatten()}});return;}
  if(new Prisma.Decimal(body.data.expectedAnnualReductionKg).lte(0)){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Expected annual reduction must be positive"}});return;}
  try{
    const auth=(req as AuthRequest).auth!;
    const result=await withTenantContext(auth.organizationId,async tx=>{
      const target=await tx.reductionTarget.findFirst({where:{id:id.data,organizationId:auth.organizationId},select:{id:true}});
      if(!target)return null;
      const initiative=await tx.reductionInitiative.create({data:{organizationId:auth.organizationId,targetId:id.data,createdByUserId:auth.userId,name:body.data.name,description:body.data.description,expectedAnnualReductionKg:new Prisma.Decimal(body.data.expectedAnnualReductionKg),startDate:body.data.startDate?new Date(body.data.startDate):null,endDate:body.data.endDate?new Date(body.data.endDate):null}});
      await tx.auditLog.create({data:{organizationId:auth.organizationId,actorUserId:auth.userId,action:"reduction.initiative_created",resourceType:"reduction_initiative",resourceId:initiative.id,metadata:{targetId:id.data,expectedAnnualReductionKg:initiative.expectedAnnualReductionKg.toString()}}});
      return initiative;
    });
    if(!result){res.status(404).json({error:{code:"TARGET_NOT_FOUND",message:"Reduction target not found"}});return;}
    res.status(201).json({initiative:result});
  }catch(error){next(error);}
});

reductionRouter.patch("/initiatives/:initiativeId/status",requireRole("OWNER","ADMIN","MEMBER"),async(req,res,next)=>{
  const id=uuid.safeParse(req.params.initiativeId),body=statusSchema.safeParse(req.body);
  if(!id.success||!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid initiative status"}});return;}
  try{
    const auth=(req as AuthRequest).auth!;
    const result=await withTenantContext(auth.organizationId,async tx=>{
      const existing=await tx.reductionInitiative.findFirst({where:{id:id.data,organizationId:auth.organizationId},select:{id:true,status:true}});
      if(!existing)return null;
      const updated=await tx.reductionInitiative.update({where:{id_organizationId:{id:id.data,organizationId:auth.organizationId}},data:{status:body.data.status}});
      await tx.auditLog.create({data:{organizationId:auth.organizationId,actorUserId:auth.userId,action:"reduction.initiative_status_changed",resourceType:"reduction_initiative",resourceId:updated.id,metadata:{from:existing.status,to:updated.status}}});
      return updated;
    });
    if(!result){res.status(404).json({error:{code:"INITIATIVE_NOT_FOUND",message:"Initiative not found"}});return;}
    res.status(200).json({initiative:result});
  }catch(error){next(error);}
});

reductionRouter.post("/targets/:targetId/scenarios",requireRole("OWNER","ADMIN","MEMBER","AUDITOR"),async(req,res,next)=>{
  const id=uuid.safeParse(req.params.targetId),body=scenarioSchema.safeParse(req.body);
  if(!id.success||!body.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid scenario input"}});return;}
  try{
    const auth=(req as AuthRequest).auth!;
    const scenario=await withTenantContext(auth.organizationId,async tx=>{
      const target=await tx.reductionTarget.findFirst({where:{id:id.data,organizationId:auth.organizationId},include:{initiatives:{where:{status:{in:["PLANNED","IN_PROGRESS","COMPLETED"]}}}}});
      if(!target)return null;
      const baseline=new Prisma.Decimal(target.baselineKgCo2e);
      const targetKg=baseline.mul(new Prisma.Decimal(1).minus(new Prisma.Decimal(target.reductionPercent).div(100)));
      const planned=target.initiatives.reduce((sum,item)=>sum.plus(item.expectedAnnualReductionKg),new Prisma.Decimal(0));
      const projected=Prisma.Decimal.max(new Prisma.Decimal(0),baseline.minus(planned));
      const created=await tx.reductionScenario.create({data:{organizationId:auth.organizationId,targetId:id.data,createdByUserId:auth.userId,name:body.data.name,baselineKgCo2e:baseline,plannedReductionKg:planned,projectedKgCo2e:projected,targetKgCo2e:targetKg,assumptions:{includedInitiativeIds:target.initiatives.map(i=>i.id),includedStatuses:["PLANNED","IN_PROGRESS","COMPLETED"],reductionPercent:target.reductionPercent.toString(),method:"sum of initiative expected annual reductions; floor at zero"}}});
      await tx.auditLog.create({data:{organizationId:auth.organizationId,actorUserId:auth.userId,action:"reduction.scenario_created",resourceType:"reduction_scenario",resourceId:created.id,metadata:{targetId:id.data,plannedReductionKg:planned.toString(),projectedKgCo2e:projected.toString(),targetKgCo2e:targetKg.toString()}}});
      return created;
    });
    if(!scenario){res.status(404).json({error:{code:"TARGET_NOT_FOUND",message:"Reduction target not found"}});return;}
    res.status(201).json({scenario, targetMet:scenario.projectedKgCo2e.lte(scenario.targetKgCo2e), overshoot:scenario.plannedReductionKg.gt(scenario.baselineKgCo2e)});
  }catch(error){next(error);}
});

reductionRouter.get("/targets/:targetId/scenarios",async(req,res,next)=>{
  const id=uuid.safeParse(req.params.targetId);
  if(!id.success){res.status(400).json({error:{code:"VALIDATION_ERROR",message:"Invalid target ID"}});return;}
  try{
    const auth=(req as AuthRequest).auth!;
    const scenarios=await withTenantContext(auth.organizationId,tx=>tx.reductionScenario.findMany({where:{organizationId:auth.organizationId,targetId:id.data},orderBy:{createdAt:"desc"}}));
    res.status(200).json({scenarios});
  }catch(error){next(error);}
});
