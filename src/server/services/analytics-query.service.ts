import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

export type AnalyticsRange = "24h" | "7d" | "30d" | "all";

function getRangeStart(range: AnalyticsRange): Date | null {
  const now = Date.now();
  switch (range) {
    case "24h":
      return new Date(now - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case "all":
    default:
      return null;
  }
}

export const analyticsQueryService = {
  async getOverview(userId: string) {
    const now = new Date();
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000);

    const [
      totalLinks,
      activeLinks,
      clickAgg,
      todayClicks,
      topLinks,
      recentEvents,
      trendRows,
    ] = await Promise.all([
      prisma.shortUrl.count({
        where: { userId, deletedAt: null },
      }),
      prisma.shortUrl.count({
        where: {
          userId,
          deletedAt: null,
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      prisma.shortUrl.aggregate({
        where: { userId, deletedAt: null },
        _sum: { clickCount: true },
      }),
      prisma.clickEvent.count({
        where: {
          shortUrl: { userId, deletedAt: null },
          clickedAt: { gte: startOfToday },
        },
      }),
      prisma.shortUrl.findMany({
        where: { userId, deletedAt: null },
        orderBy: { clickCount: "desc" },
        take: 5,
        select: {
          id: true,
          code: true,
          originalUrl: true,
          clickCount: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.clickEvent.findMany({
        where: { shortUrl: { userId, deletedAt: null } },
        orderBy: { clickedAt: "desc" },
        take: 10,
        select: {
          id: true,
          clickedAt: true,
          deviceType: true,
          browser: true,
          country: true,
          referrerHost: true,
          isBot: true,
          source: true,
          shortUrl: {
            select: { id: true, code: true },
          },
        },
      }),
      prisma.$queryRaw<
        Array<{ day: Date; total: bigint; human: bigint; bot: bigint }>
      >(Prisma.sql`
        SELECT
          date_trunc('day', ce."clickedAt") AS day,
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE ce."isBot" = false)::bigint AS human,
          COUNT(*) FILTER (WHERE ce."isBot" = true)::bigint AS bot
        FROM "ClickEvent" ce
        INNER JOIN "ShortUrl" su ON su.id = ce."shortUrlId"
        WHERE su."userId" = ${userId}
          AND su."deletedAt" IS NULL
          AND ce."clickedAt" >= ${fourteenDaysAgo}
        GROUP BY 1
        ORDER BY 1 ASC
      `),
    ]);

    const trendMap = new Map<
      string,
      { total: number; human: number; bot: number }
    >();
    for (const row of trendRows) {
      const key = new Date(row.day).toISOString().slice(0, 10);
      trendMap.set(key, {
        total: Number(row.total),
        human: Number(row.human),
        bot: Number(row.bot),
      });
    }

    const trend = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400 * 1000);
      const key = d.toISOString().slice(0, 10);
      const entry = trendMap.get(key);
      trend.push({
        date: key,
        clicks: entry?.total ?? 0,
        humanClicks: entry?.human ?? 0,
        botClicks: entry?.bot ?? 0,
      });
    }

    return {
      stats: {
        totalLinks,
        activeLinks,
        totalClicks: clickAgg._sum.clickCount ?? 0,
        todayClicks,
      },
      hasData: (clickAgg._sum.clickCount ?? 0) > 0,
      trend,
      topLinks: topLinks.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
      recentActivity: recentEvents.map((e) => ({
        id: e.id,
        shortUrlId: e.shortUrl.id,
        code: e.shortUrl.code,
        clickedAt: e.clickedAt.toISOString(),
        deviceType: e.deviceType,
        browser: e.browser,
        country: e.country,
        referrerHost: e.referrerHost,
        isBot: e.isBot,
        source: e.source,
      })),
    };
  },

  async getLinkAnalytics(
    shortUrlId: string,
    caller: { userId: string; isAdmin?: boolean },
    range: AnalyticsRange = "7d"
  ) {
    const link = await prisma.shortUrl.findFirst({
      where: { id: shortUrlId, deletedAt: null },
      select: { id: true, userId: true, code: true },
    });

    if (!link) {
      throw new AppError(404, "NOT_FOUND", "Link not found");
    }
    if (link.userId !== caller.userId && !caller.isAdmin) {
      throw new AppError(403, "FORBIDDEN", "You do not have access to this link");
    }

    const start = getRangeStart(range);
    const timeFilterSql = start
      ? Prisma.sql`AND "clickedAt" >= ${start}`
      : Prisma.empty;
    const bucketUnit = range === "24h" ? "hour" : "day";

    const [
      summaryRows,
      timeseriesRows,
      referrerRows,
      deviceRows,
      browserRows,
      osRows,
      countryRows,
      utmRows,
      heatmapRows,
      variantRows,
      recentClicks,
    ] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          total: bigint;
          human: bigint;
          bot: bigint;
          unique_visitors: bigint;
          qr: bigint;
        }>
      >(Prisma.sql`
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE "isBot" = false)::bigint AS human,
          COUNT(*) FILTER (WHERE "isBot" = true)::bigint AS bot,
          COUNT(DISTINCT "visitorHash") FILTER (WHERE "isBot" = false)::bigint AS unique_visitors,
          COUNT(*) FILTER (WHERE "source" = 'qr')::bigint AS qr
        FROM "ClickEvent"
        WHERE "shortUrlId" = ${shortUrlId} ${timeFilterSql}
      `),
      prisma.$queryRaw<
        Array<{ bucket: Date; total: bigint; human: bigint; bot: bigint }>
      >(Prisma.sql`
        SELECT
          date_trunc(${bucketUnit}, "clickedAt") AS bucket,
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE "isBot" = false)::bigint AS human,
          COUNT(*) FILTER (WHERE "isBot" = true)::bigint AS bot
        FROM "ClickEvent"
        WHERE "shortUrlId" = ${shortUrlId} ${timeFilterSql}
        GROUP BY 1
        ORDER BY 1 ASC
      `),
      prisma.$queryRaw<Array<{ name: string; count: bigint }>>(Prisma.sql`
        SELECT COALESCE("referrerHost", 'Direct') AS name, COUNT(*)::bigint AS count
        FROM "ClickEvent"
        WHERE "shortUrlId" = ${shortUrlId} ${timeFilterSql}
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 10
      `),
      prisma.$queryRaw<Array<{ name: string; count: bigint }>>(Prisma.sql`
        SELECT "deviceType" AS name, COUNT(*)::bigint AS count
        FROM "ClickEvent"
        WHERE "shortUrlId" = ${shortUrlId} ${timeFilterSql}
        GROUP BY 1
        ORDER BY count DESC
      `),
      prisma.$queryRaw<Array<{ name: string; count: bigint }>>(Prisma.sql`
        SELECT "browser" AS name, COUNT(*)::bigint AS count
        FROM "ClickEvent"
        WHERE "shortUrlId" = ${shortUrlId} ${timeFilterSql}
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 10
      `),
      prisma.$queryRaw<Array<{ name: string; count: bigint }>>(Prisma.sql`
        SELECT "os" AS name, COUNT(*)::bigint AS count
        FROM "ClickEvent"
        WHERE "shortUrlId" = ${shortUrlId} ${timeFilterSql}
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 10
      `),
      prisma.$queryRaw<Array<{ name: string; count: bigint }>>(Prisma.sql`
        SELECT "country" AS name, COUNT(*)::bigint AS count
        FROM "ClickEvent"
        WHERE "shortUrlId" = ${shortUrlId} ${timeFilterSql}
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 15
      `),
      prisma.$queryRaw<
        Array<{
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          count: bigint;
        }>
      >(Prisma.sql`
        SELECT "utmSource" AS utm_source, "utmMedium" AS utm_medium, "utmCampaign" AS utm_campaign, COUNT(*)::bigint AS count
        FROM "ClickEvent"
        WHERE "shortUrlId" = ${shortUrlId}
          AND ("utmSource" IS NOT NULL OR "utmMedium" IS NOT NULL OR "utmCampaign" IS NOT NULL)
          ${timeFilterSql}
        GROUP BY 1, 2, 3
        ORDER BY count DESC
        LIMIT 15
      `),
      prisma.$queryRaw<
        Array<{ dow: number; hour: number; count: bigint }>
      >(Prisma.sql`
        SELECT
          EXTRACT(DOW FROM "clickedAt")::int AS dow,
          EXTRACT(HOUR FROM "clickedAt")::int AS hour,
          COUNT(*)::bigint AS count
        FROM "ClickEvent"
        WHERE "shortUrlId" = ${shortUrlId} ${timeFilterSql}
        GROUP BY 1, 2
      `),
      prisma.$queryRaw<Array<{ variant_id: string | null; count: bigint }>>(Prisma.sql`
        SELECT COALESCE("variantId", 'default') AS variant_id, COUNT(*)::bigint AS count
        FROM "ClickEvent"
        WHERE "shortUrlId" = ${shortUrlId} ${timeFilterSql}
        GROUP BY 1
        ORDER BY count DESC
      `),
      prisma.clickEvent.findMany({
        where: {
          shortUrlId,
          ...(start ? { clickedAt: { gte: start } } : {}),
        },
        orderBy: { clickedAt: "desc" },
        take: 25,
        select: {
          id: true,
          clickedAt: true,
          referrerHost: true,
          country: true,
          deviceType: true,
          browser: true,
          os: true,
          isBot: true,
          source: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          variantId: true,
        },
      }),
    ]);

    const summary = summaryRows[0];
    const totalClicks = Number(summary?.total ?? 0);

    return {
      range,
      hasData: totalClicks > 0,
      summary: {
        totalClicks,
        humanClicks: Number(summary?.human ?? 0),
        botClicks: Number(summary?.bot ?? 0),
        uniqueVisitors: Number(summary?.unique_visitors ?? 0),
        qrClicks: Number(summary?.qr ?? 0),
      },
      timeseries: timeseriesRows.map((r) => ({
        bucket: new Date(r.bucket).toISOString(),
        total: Number(r.total),
        human: Number(r.human),
        bot: Number(r.bot),
      })),
      topReferrers: referrerRows.map((r) => ({ name: r.name, count: Number(r.count) })),
      devices: deviceRows.map((r) => ({ name: r.name, count: Number(r.count) })),
      browsers: browserRows.map((r) => ({ name: r.name, count: Number(r.count) })),
      oses: osRows.map((r) => ({ name: r.name, count: Number(r.count) })),
      countries: countryRows.map((r) => ({ name: r.name, count: Number(r.count) })),
      utm: utmRows.map((r) => ({
        source: r.utm_source,
        medium: r.utm_medium,
        campaign: r.utm_campaign,
        count: Number(r.count),
      })),
      heatmap: heatmapRows.map((r) => ({
        dayOfWeek: r.dow,
        hour: r.hour,
        count: Number(r.count),
      })),
      variants: variantRows.map((r) => ({
        variantId: r.variant_id ?? "default",
        count: Number(r.count),
      })),
      recentClicks: recentClicks.map((c) => ({
        ...c,
        clickedAt: c.clickedAt.toISOString(),
      })),
    };
  },
};
