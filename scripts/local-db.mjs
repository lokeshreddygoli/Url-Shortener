import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), ".pgdata");
const port = Number(process.env.PGPORT || 5432);
const user = process.env.PGUSER || "shortly";
const password = process.env.PGPASSWORD || "shortly_dev_password";

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user,
  password,
  port,
  persistent: true,
});

async function main() {
  const alreadyInitialised = fs.existsSync(path.join(dataDir, "PG_VERSION"));
  if (!alreadyInitialised) {
    await pg.initialise();
    console.log(`Initialized PostgreSQL data directory at ${dataDir}`);
  }

  await pg.start();
  console.log(`PostgreSQL listening on localhost:${port}`);

  for (const dbName of ["shortly", "shortly_test"]) {
    try {
      await pg.createDatabase(dbName);
      console.log(`Created database '${dbName}'`);
    } catch {
      console.log(`Database '${dbName}' ready`);
    }
  }

  const shutdown = async () => {
    console.log("Stopping local PostgreSQL...");
    await pg.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Failed to start embedded PostgreSQL:", err);
  process.exit(1);
});
