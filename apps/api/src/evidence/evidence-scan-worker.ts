import { createHash } from "node:crypto";
import { withTenantContext } from "../auth/tenant-context.js";
import { prisma } from "../lib/prisma.js";
import { deleteEvidenceObject, readEvidenceObject } from "./s3-evidence-storage.js";
import { scanBufferWithClamAv } from "./clamav-scanner.js";

type ScanJob={id:string;organization_id:string;submission_id:string;uploaded_by_user_id:string;file_name:string;media_type:string;byte_size:bigint;object_key:string;description:string|null;attempts:number;locked_at:Date};
const MAX_ATTEMPTS=5, BATCH_SIZE=3, POLL_MS=3000;
async function claimJobs(org:string):Promise<ScanJob[]>{
 return withTenantContext(org,tx=>tx.$queryRaw<ScanJob[]>\`
  WITH due AS (
   SELECT id FROM evidence_scan_jobs WHERE organization_id=${org}::uuid AND attempts<${MAX_ATTEMPTS}
    AND ((status='PENDING' AND next_attempt_at<=NOW()) OR (status='PROCESSING' AND locked_at<NOW()-INTERVAL '3 minutes'))
   ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT ${BATCH_SIZE}
  )
  UPDATE evidence_scan_jobs j SET status='PROCESSING',attempts=j.attempts+1,locked_at=NOW(),last_error=NULL,updated_at=NOW()
  FROM due WHERE j.id=due.id
  RETURNING j.id,j.organization_id,j.submission_id,j.uploaded_by_user_id,j.file_name,j.media_type,j.byte_size,j.object_key,j.description,j.attempts,j.locked_at
 \`);
}
async function complete(job:ScanJob,verdict:"CLEAN"|"FAILED"|"PENDING",error?:string,hash?:string,engine?:string){
 await withTenantContext(job.organization_id,async tx=>{
  await tx.evidenceScanJob.updateMany({where:{id:job.id,organizationId:job.organization_id,status:"PROCESSING",lockedAt:job.locked_at},data:{
   status:verdict,lockedAt:null,lastError:error?.slice(0,1000)??null,
   nextAttemptAt:verdict==="PENDING"?new Date(Date.now()+Math.min(60_000,2000*2**Math.max(0,job.attempts-1))):new Date(),updatedAt:new Date()
  }});
  if(verdict!=="CLEAN")return;
  const existing=await tx.supplierEvidence.findFirst({where:{id:job.id,organizationId:job.organization_id}});
  if(existing)return;
  await tx.supplierEvidence.create({data:{id:job.id,organizationId:job.organization_id,submissionId:job.submission_id,uploadedByUserId:job.uploaded_by_user_id,fileName:job.file_name,mediaType:job.media_type,byteSize:job.byte_size,sha256:hash!,storageProvider:"s3",objectKey:job.object_key,description:job.description}});
  await tx.auditLog.create({data:{organizationId:job.organization_id,actorUserId:job.uploaded_by_user_id,action:"supplier.evidence_scanned_and_registered",resourceType:"supplier_evidence",resourceId:job.id,metadata:{submissionId:job.submission_id,sha256:hash,byteSize:job.byte_size.toString(),scanner:engine,scanStatus:"CLEAN"}}});
 });
}
async function process(job:ScanJob){
 try{
  const bytes=await readEvidenceObject(job.object_key);
  if(BigInt(bytes.length)!==job.byte_size)throw new Error("Stored object size changed after upload verification");
  const hash=createHash("sha256").update(bytes).digest("hex");
  const result=await scanBufferWithClamAv(bytes);
  await complete(job,"CLEAN",undefined,hash,result.engine);
  console.info("Evidence scan completed",{evidenceId:job.id,attempt:job.attempts});
 }catch(e){
  const message=e instanceof Error?e.message:"Unknown scan failure";
  const malware=message.toLowerCase().includes("malware detected"), terminal=malware||job.attempts>=MAX_ATTEMPTS;
  await complete(job,terminal?"FAILED":"PENDING",message);
  if(malware)await deleteEvidenceObject(job.object_key).catch(err=>console.error("Infected object cleanup failed",{evidenceId:job.id,error:String(err)}));
  console.warn("Evidence scan failed",{evidenceId:job.id,attempt:job.attempts,terminal,error:message});
 }
}
export async function runEvidenceScanWorker():Promise<void>{
 let stopping=false;const stop=()=>{stopping=true};
 process.on("SIGINT",stop);process.on("SIGTERM",stop);
 console.info("CarbonLedger evidence scan worker started");
 try{
  while(!stopping){
   try{
    const orgs=await prisma.organization.findMany({select:{id:true}});
    for(const org of orgs){if(stopping)break;for(const job of await claimJobs(org.id)){if(stopping)break;await process(job);}}
   }catch(error){console.error("Evidence scan poll failed",error);}
   if(!stopping)await new Promise(resolve=>setTimeout(resolve,POLL_MS));
  }
 }finally{process.off("SIGINT",stop);process.off("SIGTERM",stop);await prisma.$disconnect();console.info("Evidence scan worker stopped");}
}
