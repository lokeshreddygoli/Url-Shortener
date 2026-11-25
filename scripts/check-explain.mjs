import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const sample = await prisma.shortUrl.findFirst({
    where: { deletedAt: null },
    select: { id: true, normalizedCode: true },
  });

  if (!sample) {
    console.log("No ShortUrl rows found; run npm run db:seed:demo first.");
    process.exit(1);
  }

  // Verify planner uses our composite & unique indexes (disable seqscan in session for small dev tables)
  await prisma.$executeRawUnsafe(`SET enable_seqscan = off`);

  const lookupPlan = await prisma.$queryRawUnsafe(
    `EXPLAIN ANALYZE SELECT id, "originalUrl", "isActive", "expiresAt", "clickLimit", "clickCount" FROM "ShortUrl" WHERE "normalizedCode" = $1 AND "deletedAt" IS NULL`,
    sample.normalizedCode
  );

  const analyticsPlan = await prisma.$queryRawUnsafe(
    `EXPLAIN ANALYZE SELECT date_trunc('day', "clickedAt") AS bucket, COUNT(*) FROM "ClickEvent" WHERE "shortUrlId" = $1 GROUP BY 1 ORDER BY 1 ASC`,
    sample.id
  );

  const rollupPlan = await prisma.$queryRawUnsafe(
    `EXPLAIN ANALYZE SELECT * FROM "DailyLinkStats" WHERE "shortUrlId" = $1 ORDER BY "day" DESC LIMIT 30`,
    sample.id
  );

  console.log("=== ShortUrl lookup EXPLAIN ANALYZE ===");
  lookupPlan.forEach((r) => console.log(r["QUERY PLAN"]));
  console.log("\n=== ClickEvent analytics EXPLAIN ANALYZE ===");
  analyticsPlan.forEach((r) => console.log(r["QUERY PLAN"]));
  console.log("\n=== DailyLinkStats rollup EXPLAIN ANALYZE ===");
  rollupPlan.forEach((r) => console.log(r["QUERY PLAN"]));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
