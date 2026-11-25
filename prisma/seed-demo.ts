import { PrismaClient, RuleType, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  const demoPasswordHash = await bcrypt.hash("DemoPass123!", 10);
  const adminPasswordHash = await bcrypt.hash("AdminPass123!", 10);

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@shortly.dev" },
    update: { name: "Alex Rivera" },
    create: {
      email: "demo@shortly.dev",
      name: "Alex Rivera",
      passwordHash: demoPasswordHash,
      role: UserRole.USER,
      emailVerified: new Date(),
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@shortly.dev" },
    update: { name: "Shortly Admin", role: UserRole.ADMIN },
    create: {
      email: "admin@shortly.dev",
      name: "Shortly Admin",
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
      emailVerified: new Date(),
    },
  });

  const sampleLinks = [
    {
      code: "launch-26",
      originalUrl: "https://nextjs.org/docs/app",
      isCustom: true,
      title: "Next.js App Router Documentation",
      hasQr: true,
    },
    {
      code: "prisma-guide",
      originalUrl: "https://www.prisma.io/docs",
      isCustom: true,
      title: "Prisma ORM Documentation",
      hasQr: false,
    },
    {
      code: "gh-repo",
      originalUrl: "https://github.com/vercel/next.js",
      isCustom: true,
      title: "vercel/next.js on GitHub",
      hasQr: true,
    },
  ];

  for (const item of sampleLinks) {
    const normalizedCode = item.code.toLowerCase();
    const link = await prisma.shortUrl.upsert({
      where: { normalizedCode },
      update: { originalUrl: item.originalUrl, title: item.title },
      create: {
        userId: demoUser.id,
        code: item.code,
        normalizedCode,
        originalUrl: item.originalUrl,
        isCustom: item.isCustom,
        title: item.title,
        hasQr: item.hasQr,
      },
    });

    const existingClicks = await prisma.clickEvent.count({
      where: { shortUrlId: link.id },
    });

    if (existingClicks === 0) {
      const devices = ["desktop", "mobile", "tablet"];
      const browsers = ["Chrome", "Safari", "Firefox", "Edge"];
      const oses = ["Windows", "macOS", "iOS", "Android", "Linux"];
      const countries = ["US", "GB", "DE", "IN", "CA"];
      const referrers = ["github.com", "x.com", "google.com", "news.ycombinator.com", null];

      const events = [];
      const now = Date.now();
      for (let i = 0; i < 24; i++) {
        const hoursAgo = (i * 11) % (14 * 24);
        const clickedAt = new Date(now - hoursAgo * 3600 * 1000);
        const isBot = i % 10 === 9;
        events.push({
          shortUrlId: link.id,
          clickedAt,
          referrerHost: referrers[i % referrers.length],
          country: countries[i % countries.length] ?? "unknown",
          region: "unknown",
          city: "unknown",
          deviceType: isBot ? "bot" : devices[i % devices.length] ?? "desktop",
          browser: browsers[i % browsers.length] ?? "Chrome",
          os: oses[i % oses.length] ?? "Windows",
          isBot,
          visitorHash: crypto
            .createHash("sha256")
            .update(`demo-visitor-${link.id}-${i % 15}`)
            .digest("hex")
            .slice(0, 32),
          source: i % 5 === 0 ? "qr" : null,
          utmSource: i % 3 === 0 ? "newsletter" : null,
          utmMedium: i % 3 === 0 ? "email" : null,
          utmCampaign: i % 3 === 0 ? "spring-launch" : null,
        });
      }

      await prisma.clickEvent.createMany({ data: events });
      await prisma.shortUrl.update({
        where: { id: link.id },
        data: { clickCount: events.length },
      });
    }
  }

  // Add one smart routing demo rule if none exists on launch-26
  const launchLink = await prisma.shortUrl.findUnique({
    where: { normalizedCode: "launch-26" },
  });
  if (launchLink) {
    const ruleCount = await prisma.linkRule.count({
      where: { shortUrlId: launchLink.id },
    });
    if (ruleCount === 0) {
      await prisma.linkRule.create({
        data: {
          shortUrlId: launchLink.id,
          type: RuleType.DEVICE,
          priority: 1,
          device: "mobile",
          targetUrl: "https://nextjs.org/docs/app/getting-started",
          label: "Mobile Getting Started",
        },
      });
    }
  }

  console.log("Demo seed complete. Demo account: demo@shortly.dev / DemoPass123!");
}

main()
  .catch((err) => {
    console.error("Demo seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
