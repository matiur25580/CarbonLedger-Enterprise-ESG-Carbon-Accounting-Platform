import { prisma } from "./lib/prisma.js";
import { runWebhookWorker } from "./webhooks/webhook-worker.js";
import { runEvidenceScanWorker } from "./evidence/evidence-scan-worker.js";

Promise.all([runWebhookWorker(), runEvidenceScanWorker()])
  .catch((error) => {
    console.error("Background worker process terminated", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
