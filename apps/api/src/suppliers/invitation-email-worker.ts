import { prisma } from "../lib/prisma.js";
import { withTenantContext } from "../auth/tenant-context.js";
import { decryptInvitationEmail, sendInvitationEmail } from "./invitation-email.js";
type Job={id:string;organization_id:string;invitation_id:string;payload_ciphertext:string;payload_iv:string;payload_auth_tag:string;attempts:number;locked_at:Date};
const MAX_ATTEMPTS=6,BATCH_SIZE=5,POLL_MS=5000;
function backoff(attempt:number){return Math.min(6*60*60*1000,30000*2**Math.min(10,Math.max(0,attempt-1)));}
async function claim(org:string):Promise<Job[]>{
 return withTenantContext(org,tx=>tx.$queryRaw<Job[]>\`
  WITH due AS (SELECT id FROM supplier_invitation_emails WHERE organization_id=${org}::uuid AND attempts<${MAX_ATTEMPTS} AND ((status='PENDING' AND next_attempt_at<=NOW()) OR (status='PROCESSING' AND locked_at<NOW()-INTERVAL '2 minutes')) ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT ${BATCH_SIZE})
  UPDATE supplier_invitation_emails e SET status='PROCESSING',attempts=e.attempts+1,locked_at=NOW(),last_error=NULL,updated_at=NOW() FROM due WHERE e.id=due.id
  RETURNING e.id,e.organization_id,e.invitation_id,e.payload_ciphertext,e.payload_iv,e.payload_auth_tag,e.attempts,e.locked_at
 \`);
}
async function finish(job:Job,status:"SENT"|"PENDING"|"FAILED",data:{messageId?:string|null;error?:string}={}){
 return withTenantContext(job.organization_id,async tx=>{
  const result=await tx.supplierInvitationEmail.updateMany({where:{id:job.id,organizationId:job.organization_id,status:"PROCESSING",lockedAt:job.locked_at},data:{
   status,lockedAt:null,lastError:data.error?.slice(0,1000)??null,providerMessageId:data.messageId??undefined,
   sentAt:status==="SENT"?new Date():null,nextAttemptAt:status==="PENDING"?new Date(Date.now()+backoff(job.attempts)):new Date(),updatedAt:new Date()
  }});
  if(result.count!==1)return false;
  if(status==="SENT")await tx.auditLog.create({data:{organizationId:job.organization_id,actorUserId:null,action:"supplier.invitation_email_sent",resourceType:"supplier_invitation",resourceId:job.invitation_id,metadata:{deliveryId:job.id,provider:"resend",providerMessageId:data.messageId??null}}});
  if(status==="FAILED")await tx.auditLog.create({data:{organizationId:job.organization_id,actorUserId:null,action:"supplier.invitation_email_failed",resourceType:"supplier_invitation",resourceId:job.invitation_id,metadata:{deliveryId:job.id,attempts:job.attempts}}});
  return true;
 });
}
async function process(job:Job){
 try{const payload=decryptInvitationEmail({payloadCiphertext:job.payload_ciphertext,payloadIv:job.payload_iv,payloadAuthTag:job.payload_auth_tag});
  const messageId=await sendInvitationEmail(payload,job.id);await finish(job,"SENT",{messageId});
  console.info("Supplier invitation email sent",{deliveryId:job.id,attempt:job.attempts});
 }catch(error){
  const message=error instanceof Error?error.message:"Unknown email delivery failure";
  const statusCode=typeof error==="object"&&error!==null&&"statusCode" in error?Number((error as {statusCode:unknown}).statusCode):undefined;
  const permanent=statusCode!==undefined&&statusCode>=400&&statusCode<500&&statusCode!==408&&statusCode!==429;
  const terminal=permanent||job.attempts>=MAX_ATTEMPTS;
  await finish(job,terminal?"FAILED":"PENDING",{error:message});
  console.warn("Supplier invitation email delivery failed",{deliveryId:job.id,attempt:job.attempts,terminal,error:message});
 }
}
export async function runSupplierEmailWorker():Promise<void>{
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM||!process.env.SUPPLIER_EMAIL_ENCRYPTION_KEY){console.info("Supplier email worker disabled: Resend or encryption settings are missing");return;}
 let stopping=false;const stop=()=>{stopping=true};process.on("SIGINT",stop);process.on("SIGTERM",stop);
 console.info("Supplier invitation email worker started");
 try{while(!stopping){try{const orgs=await prisma.organization.findMany({select:{id:true}});for(const org of orgs){if(stopping)break;for(const job of await claim(org.id)){if(stopping)break;await process(job);}}}catch(error){console.error("Supplier email worker poll failed",error);}if(!stopping)await new Promise(resolve=>setTimeout(resolve,POLL_MS));}}
 finally{process.off("SIGINT",stop);process.off("SIGTERM",stop);console.info("Supplier invitation email worker stopped");}
}
