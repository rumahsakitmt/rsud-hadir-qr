import { pgTable, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";

export const qrToken = pgTable("qr_token", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  roomId: text("room_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByUserId: text("used_by_user_id"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  createdBy: text("created_by").notNull(),
});

export const attendance = pgTable("attendance", {
  id: text("id").primaryKey(),
  tokenId: text("token_id").notNull().references(() => qrToken.id),
  userId: text("user_id").notNull(),
  roomId: text("room_id"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex("attendance_user_token_idx").on(table.userId, table.tokenId),
]);

export type QrTokenType = typeof qrToken.$inferSelect;
export type AttendanceType = typeof attendance.$inferSelect;
