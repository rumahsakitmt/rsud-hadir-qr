import { Hono } from "hono";
import { db } from "../db";
import { qrToken, attendance } from "../db/schema";
import { eq, and, isNull, gt, isNotNull, or, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

interface GenerateBatchBody {
  roomId?: string;
  count?: number;
  expiresInMinutes?: number;
  createdBy?: string;
}

export const qrApiRoutes = new Hono();

qrApiRoutes.post("/generate-batch", async (c) => {
  const body: GenerateBatchBody = await c.req.json().catch(() => ({}));

  const count = body.count || Number(process.env.BATCH_SIZE) || 20;
  const roomId = body.roomId || process.env.ROOM_ID || null;
  const createdBy =
    body.createdBy || process.env.CREATED_BY_USER_ID || "local-qr-server";

  const rotationMs = Number(process.env.ROTATION_INTERVAL_MS) || 5000;
  const tokenExpiryMs = Number(process.env.TOKEN_EXPIRY_MS) || 20000;

  const values = Array.from({ length: count }, (_, index) => {
    const expiresAt =
      body.expiresInMinutes != null
        ? new Date(Date.now() + body.expiresInMinutes * 60 * 1000)
        : new Date(Date.now() + index * rotationMs + tokenExpiryMs);

    return {
      id: uuidv4(),
      code: `QR-${uuidv4().replace(/-/g, "").toUpperCase().slice(0, 16)}`,
      roomId: roomId || null,
      expiresAt,
      createdBy,
      isActive: true,
    };
  });

  const tokens = await db.insert(qrToken).values(values).returning();

  return c.json({ tokens, count: tokens.length });
});

qrApiRoutes.get("/active", async (c) => {
  const roomId = c.req.query("roomId") || process.env.ROOM_ID || undefined;

  const conditions = [
    eq(qrToken.isActive, true),
    gt(qrToken.expiresAt, sql`now()`),
    isNull(qrToken.usedAt),
  ];

  if (roomId) {
    conditions.push(eq(qrToken.roomId, roomId));
  }

  const tokens = await db
    .select()
    .from(qrToken)
    .where(and(...conditions))
    .orderBy(qrToken.createdAt);

  return c.json({ tokens });
});

qrApiRoutes.post("/cleanup", async (c) => {
  const result = await db
    .delete(qrToken)
    .where(
      and(
        isNull(qrToken.usedAt),
        or(gt(sql`now()`, qrToken.expiresAt), eq(qrToken.isActive, false)),
      ),
    )
    .returning({ id: qrToken.id });

  return c.json({ deleted: result.length });
});

qrApiRoutes.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});
