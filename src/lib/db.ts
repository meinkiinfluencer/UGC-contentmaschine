import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;

export async function log(type: string, message: string, ref: { contentId?: string; runId?: string } = {}) {
  await db.event.create({ data: { type, message: message.slice(0, 2000), ...ref } });
}
