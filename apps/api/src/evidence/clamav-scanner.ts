import net from "node:net";
import { env } from "../config/env.js";

/** Fail-closed ClamAV INSTREAM scanner. */
export async function scanBufferWithClamAv(buffer: Buffer): Promise<{ clean: true; engine: string }> {
  if (!env.CLAMAV_HOST) throw new Error("ClamAV scanner is not configured; evidence remains quarantined");
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: env.CLAMAV_HOST!, port: env.CLAMAV_PORT });
    let response = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else if (response.trim().endsWith("OK")) resolve({ clean: true, engine: "ClamAV-INSTREAM" });
      else reject(new Error(response.includes("FOUND") ? "Malware detected in uploaded evidence" : "ClamAV did not return a clean verdict"));
    };
    socket.setTimeout(30_000, () => finish(new Error("ClamAV scan timed out")));
    socket.on("error", finish);
    socket.on("data", chunk => {
      response += chunk.toString("utf8");
      if (response.includes("\n")) finish();
    });
    socket.on("connect", () => {
      socket.write("INSTREAM\0");
      const size = 64 * 1024;
      for (let offset = 0; offset < buffer.length; offset += size) {
        const part = buffer.subarray(offset, Math.min(offset + size, buffer.length));
        const length = Buffer.alloc(4);
        length.writeUInt32BE(part.length);
        socket.write(length);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}
