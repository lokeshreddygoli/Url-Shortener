import { Prisma, SafetyStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface CreateShortUrlRecordInput {
  userId: string | null;
  originalUrl: string;
  code: string;
  normalizedCode: string;
  isCustom: boolean;
  redirectType: number;
  passwordHash: string | null;
  clickLimit: number | null;
  expiresAt: Date | null;
  isActive: boolean;
  safetyStatus?: SafetyStatus;
  safetyReason?: string | null;
  title?: string | null;
  guestClaimTokenHash?: string | null;
}

export interface ListShortUrlsFilter {
  userId: string;
  search?: string;
  status: "all" | "active" | "expired" | "disabled" | "password" | "has-qr";
  sort: "createdAt" | "clickCount" | "expiresAt";
  order: "asc" | "desc";
  page: number;
  pageSize: number;
}

export const urlRepository = {
  async create(input: CreateShortUrlRecordInput) {
    return prisma.shortUrl.create({
      data: {
        userId: input.userId,
        originalUrl: input.originalUrl,
        code: input.code,
        normalizedCode: input.normalizedCode,
        isCustom: input.isCustom,
        redirectType: input.redirectType,
        passwordHash: input.passwordHash,
        clickLimit: input.clickLimit,
        expiresAt: input.expiresAt,
        isActive: input.isActive,
        safetyStatus: input.safetyStatus ?? SafetyStatus.SAFE,
        safetyReason: input.safetyReason ?? null,
        title: input.title ?? null,
        guestClaimTokenHash: input.guestClaimTokenHash ?? null,
      },
    });
  },

  async findById(id: string) {
    return prisma.shortUrl.findFirst({
      where: { id, deletedAt: null },
      include: {
        rules: {
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        },
      },
    });
  },

  async findByNormalizedCode(normalizedCode: string) {
    return prisma.shortUrl.findFirst({
      where: { normalizedCode, deletedAt: null },
      include: {
        rules: {
          where: { isActive: true },
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        },
      },
    });
  },

  async list(filter: ListShortUrlsFilter) {
    const now = new Date();
    const where: Prisma.ShortUrlWhereInput = {
      userId: filter.userId,
      deletedAt: null,
    };

    if (filter.search) {
      where.OR = [
        { code: { contains: filter.search, mode: "insensitive" } },
        { originalUrl: { contains: filter.search, mode: "insensitive" } },
        { title: { contains: filter.search, mode: "insensitive" } },
      ];
    }

    switch (filter.status) {
      case "active":
        where.isActive = true;
        where.AND = [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ];
        break;
      case "expired":
        where.expiresAt = { lte: now };
        break;
      case "disabled":
        where.isActive = false;
        break;
      case "password":
        where.passwordHash = { not: null };
        break;
      case "has-qr":
        where.hasQr = true;
        break;
      case "all":
      default:
        break;
    }

    const orderBy: Prisma.ShortUrlOrderByWithRelationInput = {
      [filter.sort]: filter.order,
    };

    const skip = (filter.page - 1) * filter.pageSize;

    const [items, total] = await Promise.all([
      prisma.shortUrl.findMany({
        where,
        orderBy,
        skip,
        take: filter.pageSize,
        include: {
          _count: { select: { rules: true } },
        },
      }),
      prisma.shortUrl.count({ where }),
    ]);

    return { items, total };
  },

  async updateById(id: string, data: Prisma.ShortUrlUpdateInput) {
    return prisma.shortUrl.update({
      where: { id },
      data,
    });
  },

  async deleteById(id: string) {
    return prisma.shortUrl.delete({
      where: { id },
    });
  },

  async findManyOwned(ids: string[], userId: string) {
    return prisma.shortUrl.findMany({
      where: {
        id: { in: ids },
        userId,
        deletedAt: null,
      },
      select: { id: true, normalizedCode: true },
    });
  },

  async bulkSetActive(ids: string[], userId: string, isActive: boolean) {
    return prisma.shortUrl.updateMany({
      where: {
        id: { in: ids },
        userId,
        deletedAt: null,
      },
      data: { isActive },
    });
  },

  async bulkDelete(ids: string[], userId: string) {
    return prisma.shortUrl.deleteMany({
      where: {
        id: { in: ids },
        userId,
      },
    });
  },
};
