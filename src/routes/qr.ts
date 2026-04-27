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

interface RedeemBody {
  code: string;
  userId: string;
}

export const qrApiRoutes = new Hono();

qrApiRoutes.post("/generate-batch", async (c) => {
  const body: GenerateBatchBody = await c.req.json().catch(() => ({}));

  const count = body.count || Number(process.env.BATCH_SIZE) || 20;
  const roomId = body.roomId || process.env.ROOM_ID || null;
  const createdBy = body.createdBy || process.env.CREATED_BY_USER_ID || "local-qr-server";

  const rotationMs = Number(process.env.ROTATION_INTERVAL_MS) || 5000;
  const tokenExpiryMs = Number(process.env.TOKEN_EXPIRY_MS) || 20000;

  // All tokens in a batch share the same expiration so every visible token
  // has the full validity window regardless of when it appears on screen.
  const batchDurationMs = (count - 1) * rotationMs;
  const baseExpiryMs = tokenExpiryMs + batchDurationMs;

  const values = Array.from({ length: count }, () => {
    const expiresAt =
      body.expiresInMinutes != null
        ? new Date(Date.now() + body.expiresInMinutes * 60 * 1000)
        : new Date(Date.now() + baseExpiryMs);

    return {
      id: uuidv4(),
      code: `QR-${uuidv4().replace(/-/g, "").toUpperCase().slice(0, 16)}`,
      roomId: roomId || null,
      expiresAt,
      createdBy,
      isActive: true,
    };
  });

  const tokens = await db
    .insert(qrToken)
    .values(values)
    .returning();

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
        or(
          gt(sql`now()`, qrToken.expiresAt),
          eq(qrToken.isActive, false)
        )
      )
    )
    .returning({ id: qrToken.id });

  return c.json({ deleted: result.length });
});

qrApiRoutes.post("/redeem", async (c) => {
  const body: RedeemBody = await c.req.json().catch(() => ({} as RedeemBody));

  if (!body.code || !body.userId) {
    return c.json({ error: "code and userId are required" }, 400);
  }

  const GRACE_PERIOD_MS = 10000;

  const tokens = await db
    .select()
    .from(qrToken)
    .where(eq(qrToken.code, body.code))
    .limit(1);

  if (tokens.length === 0) {
    return c.json({ error: "Invalid code" }, 400);
  }

  const token = tokens[0];

  if (!token.isActive) {
    return c.json({ error: "Code is inactive" }, 400);
  }

  const now = Date.now();
  const expiresAt = new Date(token.expiresAt).getTime();

  if (now > expiresAt + GRACE_PERIOD_MS) {
    return c.json({ error: "Code expired" }, 400);
  }

  // Atomically insert attendance. ON CONFLICT ignores duplicate scans
  // from the same user on the same token, eliminating race conditions.
  await db
    .insert(attendance)
    .values({
      id: uuidv4(),
      tokenId: token.id,
      userId: body.userId,
      roomId: token.roomId,
    })
    .onConflictDoNothing();

  return c.json({ success: true });
});

qrApiRoutes.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});
