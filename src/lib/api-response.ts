import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export interface ApiEnvelope<T> {
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
  meta?: Record<string, unknown>;
}

export function getRequestId(req?: Request): string {
  const headerId = req?.headers.get("x-request-id")?.trim();
  return headerId && headerId.length <= 128 ? headerId : crypto.randomUUID();
}

export function ok<T>(
  data: T,
  status = 200,
  meta?: Record<string, unknown>,
  headers?: HeadersInit
) {
  const body: ApiEnvelope<T> = {
    data,
    error: null,
    ...(meta ? { meta } : {}),
  };
  return NextResponse.json(body, { status, headers });
}

export function noContent(headers?: HeadersInit) {
  return new NextResponse(null, { status: 204, headers });
}

export function fail(
  statusCode: number,
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
  headers?: HeadersInit
) {
  const body: ApiEnvelope<never> = {
    data: null,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
    meta: { requestId },
  };
  const mergedHeaders = new Headers(headers);
  mergedHeaders.set("X-Request-Id", requestId);
  return NextResponse.json(body, { status: statusCode, headers: mergedHeaders });
}

export function handleApiError(err: unknown, requestId: string, headers?: HeadersInit) {
  if (err instanceof AppError) {
    return fail(err.statusCode, err.code, err.message, requestId, err.details, headers);
  }

  if (err instanceof ZodError) {
    return fail(
      400,
      "INVALID_INPUT",
      "Validation failed",
      requestId,
      err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
      headers
    );
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return fail(409, "ALIAS_TAKEN", "Resource conflict", requestId, undefined, headers);
    }
    if (err.code === "P2025") {
      return fail(404, "NOT_FOUND", "Resource not found", requestId, undefined, headers);
    }
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    logger.error({ requestId, err: err.message }, "Database unavailable");
    return fail(
      503,
      "SERVICE_UNAVAILABLE",
      "Database service is temporarily unavailable",
      requestId,
      undefined,
      headers
    );
  }

  logger.error({ requestId, err }, "Unhandled API error");
  return fail(
    500,
    "INTERNAL_ERROR",
    "An unexpected error occurred",
    requestId,
    undefined,
    headers
  );
}

export async function parseJsonBody<T = unknown>(
  req: Request,
  maxBytes = 65_536
): Promise<T> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new AppError(
      400,
      "INVALID_INPUT",
      "Content-Type must be application/json"
    );
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new AppError(
      413,
      "PAYLOAD_TOO_LARGE",
      `Request body exceeds ${maxBytes} bytes limit`
    );
  }

  const rawText = await req.text();
  if (Buffer.byteLength(rawText, "utf8") > maxBytes) {
    throw new AppError(
      413,
      "PAYLOAD_TOO_LARGE",
      `Request body exceeds ${maxBytes} bytes limit`
    );
  }

  if (!rawText.trim()) {
    throw new AppError(400, "INVALID_INPUT", "Request body cannot be empty");
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new AppError(400, "INVALID_INPUT", "Malformed JSON body");
  }
}
