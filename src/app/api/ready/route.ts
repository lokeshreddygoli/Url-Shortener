import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pingRedis } from "@/lib/redis";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    getEnv();
  } catch (err) {
    logger.error({ err }, "Environment validation failed in readiness probe");
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "ENV_INVALID",
          message: "Server environment configuration is invalid",
        },
      },
      { status: 503 }
    );
  }

  const dbStart = performance.now();
  let dbConnected = false;
  let dbLatencyMs: number | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbConnected = true;
    dbLatencyMs = Math.round(performance.now() - dbStart);
  } catch (err) {
    logger.error({ err }, "Database readiness check failed");
  }

  const redis = await pingRedis();
  const ready = dbConnected;

  return NextResponse.json(
    {
      data: {
        status: ready ? (redis.configured && !redis.connected ? "degraded" : "ready") : "unavailable",
        checks: {
          database: {
            connected: dbConnected,
            latencyMs: dbLatencyMs,
          },
          redis,
        },
        timestamp: new Date().toISOString(),
      },
      error: ready
        ? null
        : {
            code: "SERVICE_UNAVAILABLE",
            message: "Database connection unavailable",
          },
    },
    { status: ready ? 200 : 503 }
  );
}
