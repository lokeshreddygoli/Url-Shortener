import pino from "pino";

const level =
  process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === "test" ? "silent" : "info");

export const logger = pino({
  level,
  base: {
    service: "shortly",
    env: process.env.NODE_ENV ?? "development",
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "passwordHash",
      "token",
      "apiKey",
    ],
    censor: "[REDACTED]",
  },
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
