import "dotenv/config";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { qrApiRoutes } from "./routes/qr";
import { db } from "./db";
import { qrToken } from "./db/schema";
import { and, isNull, or, gt, sql, eq } from "drizzle-orm";

const app = new Hono();

app.use("/api/*", cors());

app.route("/api/qr", qrApiRoutes);

let htmlCache: string | null = null;

function getHtml() {
  if (htmlCache) return htmlCache;

  const raw = readFileSync(join(process.cwd(), "public", "index.html"), "utf-8");

  htmlCache = raw
    .replace(/\{\{ROTATION_INTERVAL_MS\}\}/g, process.env.ROTATION_INTERVAL_MS || "10000")
    .replace(/\{\{BATCH_SIZE\}\}/g, process.env.BATCH_SIZE || "20")
    .replace(/\{\{ROOM_NAME\}\}/g, process.env.ROOM_NAME || "");

  return htmlCache;
}

app.get("/", (c) => c.html(getHtml()));

app.get("*", serveStatic({ root: "./public" }));

const port = Number(process.env.PORT) || 3001;

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

async function cleanup() {
  try {
    const result = await db
      .delete(qrToken)
      .where(
        and(
          isNull(qrToken.usedAt),
          or(
            gt(sql`now()`, qrToken.expiresAt),
            eq(qrToken.isActive, false)
          )
        )
      )
      .returning({ id: qrToken.id });
    if (result.length > 0) {
      console.log(`[cleanup] Deleted ${result.length} expired/unused tokens`);
    }
  } catch (e) {
    console.error("[cleanup] Failed:", e);
  }
}

setInterval(cleanup, CLEANUP_INTERVAL_MS);

console.log(`QR Server running on http://localhost:${port}`);
console.log(`Cleanup running every ${CLEANUP_INTERVAL_MS / 1000 / 60} minutes`);
serve({ fetch: app.fetch, port });
