import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Baseline idempotent seed: verify database schema connectivity without inserting fake production metrics.
  const count = await prisma.shortUrl.count();
  console.log(`Baseline seed verified. Current shortUrls count: ${count}`);
}

main()
  .catch((err) => {
    console.error("Baseline seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
