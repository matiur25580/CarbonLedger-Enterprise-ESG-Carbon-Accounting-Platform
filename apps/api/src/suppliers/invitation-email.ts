import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
export type InvitationEmailPayload={recipient:string;supplierName:string;questionnaireTitle:string;portalUrl:string;expiresAt:string};
export function encryptInvitationEmail(payload:InvitationEmailPayload){
 const key=env.SUPPLIER_EMAIL_ENCRYPTION_KEY;
 if(!key)throw new Error("SUPPLIER_EMAIL_ENCRYPTION_KEY is not configured");
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",Buffer.from(key,"hex"),iv);
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload),"utf8"),cipher.final()]);
 return {payloadCiphertext:ciphertext.toString("base64"),payloadIv:iv.toString("hex"),payloadAuthTag:cipher.getAuthTag().toString("hex")};
}
export function decryptInvitationEmail(job:{payloadCiphertext:string;payloadIv:string;payloadAuthTag:string}):InvitationEmailPayload{
 const key=env.SUPPLIER_EMAIL_ENCRYPTION_KEY;
 if(!key)throw new Error("SUPPLIER_EMAIL_ENCRYPTION_KEY is not configured");
 const decipher=createDecipheriv("aes-256-gcm",Buffer.from(key,"hex"),Buffer.from(job.payloadIv,"hex"));
 decipher.setAuthTag(Buffer.from(job.payloadAuthTag,"hex"));
 return JSON.parse(Buffer.concat([decipher.update(Buffer.from(job.payloadCiphertext,"base64")),decipher.final()]).toString("utf8")) as InvitationEmailPayload;
}
export async function sendInvitationEmail(payload:InvitationEmailPayload,idempotencyKey:string):Promise<string|null>{
 if(!env.RESEND_API_KEY||!env.EMAIL_FROM)throw new Error("Resend email delivery is not configured");
 const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json","Idempotency-Key":idempotencyKey},body:JSON.stringify({
  from:env.EMAIL_FROM,to:[payload.recipient],subject:`CarbonLedger supplier questionnaire: ${payload.questionnaireTitle}`,
  text:`Hello ${payload.supplierName},\n\nYou are invited to complete the supplier questionnaire "${payload.questionnaireTitle}".\n\nOpen your secure, single-use invitation: ${payload.portalUrl}\n\nThis link expires on ${new Date(payload.expiresAt).toUTCString()} and can only be submitted once. If you were not expecting this email, you can ignore it.\n\nCarbonLedger`,
  html:`<p>Hello ${escapeHtml(payload.supplierName)},</p><p>You are invited to complete the supplier questionnaire <strong>${escapeHtml(payload.questionnaireTitle)}</strong>.</p><p><a href="${escapeHtml(payload.portalUrl)}">Open your secure supplier questionnaire</a></p><p>This single-use link expires on ${escapeHtml(new Date(payload.expiresAt).toUTCString())}.</p><p>If you were not expecting this email, you can ignore it.</p><p>CarbonLedger</p>`
 }),signal:AbortSignal.timeout(10000)});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error(`Email provider returned HTTP ${response.status}`),{statusCode:response.status});
 return typeof body.id==="string"?body.id:null;
}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));}

export function isPermanentEmailProviderError(statusCode:number|undefined):boolean {
 return statusCode!==undefined&&statusCode>=400&&statusCode<500&&statusCode!==408&&statusCode!==429;
}

export function invitationEmailRetryDelayMs(attempt:number):number {
 return Math.min(6*60*60*1000,30000*2**Math.min(10,Math.max(0,attempt-1)));
}
