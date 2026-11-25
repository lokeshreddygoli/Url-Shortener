import fs from "node:fs";
import path from "node:path";

export function configureTestDatabaseEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(envPath);
    } catch {
      // Ignore if already loaded
    }
  }
  const testUrl =
    process.env.TEST_DATABASE_URL ||
    "postgresql://shortly:shortly_dev_password@localhost:5432/shortly_test?schema=public";
  process.env.DATABASE_URL = testUrl;
}
