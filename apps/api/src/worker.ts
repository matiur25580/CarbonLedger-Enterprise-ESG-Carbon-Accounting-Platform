import { runWebhookWorker } from "./webhooks/webhook-worker.js";

runWebhookWorker().catch((error) => {
  console.error("Webhook worker terminated", error);
  process.exitCode = 1;
});
