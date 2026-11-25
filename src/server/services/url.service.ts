import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { generateShortCode } from "@/lib/short-code";
import { invalidateCachedLink } from "@/lib/cache";
import {
  createGuestClaimToken,
  hashGuestClaimToken,
  verifyGuestClaimToken,
} from "@/lib/guest-claim";
import {
  bulkMutateUrlsSchema,
  createUrlSchema,
  listUrlsQuerySchema,
  updateUrlSchema,
  validateCustomAlias,
} from "@/lib/validators/url";
import { urlRepository } from "@/server/repositories/url.repository";
import { scanDestinationSafety } from "@/server/services/safety-scanner.service";
import { prisma } from "@/lib/db";

const MAX_CODE_GENERATION_ATTEMPTS = 5;

export interface PublicShortUrl {
  id: string;
  userId: string | null;
  originalUrl: string;
  code: string;
  shortUrl: string;
  isCustom: boolean;
  redirectType: number;
  hasPassword: boolean;
  clickLimit: number | null;
  clickCount: number;
  expiresAt: string | null;
  isActive: boolean;
  safetyStatus: string;
  safetyReason: string | null;
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  hasQr: boolean;
  createdAt: string;
  updatedAt: string;
}

export function buildShortLinkUrl(code: string): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/${code}`;
}

export function serializeShortUrl(record: {
  id: string;
  userId: string | null;
  originalUrl: string;
  code: string;
  isCustom: boolean;
  redirectType: number;
  passwordHash: string | null;
  clickLimit: number | null;
  clickCount: number;
  expiresAt: Date | null;
  isActive: boolean;
  safetyStatus: string;
  safetyReason: string | null;
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  hasQr: boolean;
  createdAt: Date;
  updatedAt: Date;
}): PublicShortUrl {
  return {
    id: record.id,
    userId: record.userId,
    originalUrl: record.originalUrl,
    code: record.code,
    shortUrl: buildShortLinkUrl(record.code),
    isCustom: record.isCustom,
    redirectType: record.redirectType,
    hasPassword: Boolean(record.passwordHash),
    clickLimit: record.clickLimit,
    clickCount: record.clickCount,
    expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
    isActive: record.isActive,
    safetyStatus: record.safetyStatus,
    safetyReason: record.safetyReason,
    title: record.title,
    description: record.description,
    faviconUrl: record.faviconUrl,
    ogImageUrl: record.ogImageUrl,
    hasQr: record.hasQr,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export interface CallerContext {
  userId: string | null;
  isAdmin?: boolean;
}

export const urlService = {
  async createUrl(rawInput: unknown, caller: CallerContext) {
    const parsed = createUrlSchema.parse(rawInput);

    let expiresAt: Date | null = null;
    if (parsed.expiresAt) {
      expiresAt = new Date(parsed.expiresAt);
      if (expiresAt.getTime() <= Date.now()) {
        throw new AppError(
          422,
          "UNPROCESSABLE_ENTITY",
          "Expiry date must be in the future"
        );
      }
    } else if (!caller.userId) {
      // Guest links expire by default (e.g. 30 days)
      const days = Number(process.env.GUEST_LINK_EXPIRY_DAYS || 30);
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    const passwordHash = parsed.password
      ? await bcrypt.hash(parsed.password, 10)
      : null;

    const safety = await scanDestinationSafety(parsed.originalUrl);
    const isCustom = Boolean(parsed.alias);

    if (isCustom && parsed.alias) {
      const aliasCheck = validateCustomAlias(parsed.alias);
      if (!aliasCheck.ok) {
        throw new AppError(400, "INVALID_INPUT", aliasCheck.message);
      }

      try {
        const created = await urlRepository.create({
          userId: caller.userId,
          originalUrl: parsed.originalUrl,
          code: aliasCheck.alias,
          normalizedCode: aliasCheck.normalizedCode,
          isCustom: true,
          redirectType: parsed.redirectType,
          passwordHash,
          clickLimit: parsed.clickLimit ?? null,
          expiresAt,
          isActive: parsed.isActive,
          safetyStatus: safety.status,
          safetyReason: safety.reason,
          title: parsed.title ?? null,
        });

        await invalidateCachedLink(created.normalizedCode);

        let guestClaimToken: string | undefined;
        if (!caller.userId) {
          const claim = createGuestClaimToken(created.id);
          guestClaimToken = claim.token;
          await urlRepository.updateById(created.id, {
            guestClaimTokenHash: claim.tokenHash,
          });
        }

        return {
          link: serializeShortUrl(created),
          ...(guestClaimToken ? { guestClaimToken } : {}),
        };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          throw new AppError(
            409,
            "ALIAS_TAKEN",
            `The alias '${aliasCheck.alias}' is already in use`
          );
        }
        throw err;
      }
    }

    // Auto-generated 7-char Base62 short code with bounded retries on collision
    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
      const code = generateShortCode();
      const normalizedCode = code.toLowerCase();
      try {
        const created = await urlRepository.create({
          userId: caller.userId,
          originalUrl: parsed.originalUrl,
          code,
          normalizedCode,
          isCustom: false,
          redirectType: parsed.redirectType,
          passwordHash,
          clickLimit: parsed.clickLimit ?? null,
          expiresAt,
          isActive: parsed.isActive,
          safetyStatus: safety.status,
          safetyReason: safety.reason,
          title: parsed.title ?? null,
        });

        await invalidateCachedLink(created.normalizedCode);

        let guestClaimToken: string | undefined;
        if (!caller.userId) {
          const claim = createGuestClaimToken(created.id);
          guestClaimToken = claim.token;
          await urlRepository.updateById(created.id, {
            guestClaimTokenHash: claim.tokenHash,
          });
        }

        return {
          link: serializeShortUrl(created),
          ...(guestClaimToken ? { guestClaimToken } : {}),
        };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          continue;
        }
        throw err;
      }
    }

    throw new AppError(
      500,
      "INTERNAL_ERROR",
      "Failed to generate a unique short code after retries"
    );
  },

  async listUrls(rawQuery: Record<string, unknown>, caller: CallerContext) {
    if (!caller.userId) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    }

    const query = listUrlsQuerySchema.parse(rawQuery);
    const { items, total } = await urlRepository.list({
      userId: caller.userId,
      search: query.search,
      status: query.status,
      sort: query.sort,
      order: query.order,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: items.map((item) => ({
        ...serializeShortUrl(item),
        rulesCount: item._count.rules,
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  },

  async getUrl(id: string, caller: CallerContext) {
    if (!caller.userId) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    }

    const record = await urlRepository.findById(id);
    if (!record) {
      throw new AppError(404, "NOT_FOUND", "Link not found");
    }

    if (record.userId !== caller.userId && !caller.isAdmin) {
      throw new AppError(403, "FORBIDDEN", "You do not have access to this link");
    }

    return {
      ...serializeShortUrl(record),
      rules: record.rules,
    };
  },

  async updateUrl(id: string, rawInput: unknown, caller: CallerContext) {
    if (!caller.userId) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    }

    const existing = await urlRepository.findById(id);
    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "Link not found");
    }

    if (existing.userId !== caller.userId && !caller.isAdmin) {
      throw new AppError(403, "FORBIDDEN", "You do not have access to this link");
    }

    const parsed = updateUrlSchema.parse(rawInput);
    const updateData: Prisma.ShortUrlUpdateInput = {};

    if (parsed.originalUrl !== undefined) {
      updateData.originalUrl = parsed.originalUrl;
    }

    if (parsed.alias !== undefined) {
      const aliasCheck = validateCustomAlias(parsed.alias);
      if (!aliasCheck.ok) {
        throw new AppError(400, "INVALID_INPUT", aliasCheck.message);
      }
      updateData.code = aliasCheck.alias;
      updateData.normalizedCode = aliasCheck.normalizedCode;
      updateData.isCustom = true;
    }

    if (parsed.redirectType !== undefined) {
      updateData.redirectType = parsed.redirectType;
    }

    if (parsed.expiresAt !== undefined) {
      if (parsed.expiresAt === null) {
        updateData.expiresAt = null;
      } else {
        const expDate = new Date(parsed.expiresAt);
        if (expDate.getTime() <= Date.now()) {
          throw new AppError(
            422,
            "UNPROCESSABLE_ENTITY",
            "Expiry date must be in the future"
          );
        }
        updateData.expiresAt = expDate;
      }
    }

    if (parsed.clickLimit !== undefined) {
      updateData.clickLimit = parsed.clickLimit;
    }

    if (parsed.clearPassword) {
      updateData.passwordHash = null;
    } else if (parsed.password !== undefined) {
      updateData.passwordHash =
        parsed.password === null ? null : await bcrypt.hash(parsed.password, 10);
    }

    if (parsed.isActive !== undefined) {
      updateData.isActive = parsed.isActive;
    }

    if (parsed.title !== undefined) {
      updateData.title = parsed.title;
    }

    try {
      const updated = await urlRepository.updateById(id, updateData);
      await invalidateCachedLink(existing.normalizedCode);
      if (updated.normalizedCode !== existing.normalizedCode) {
        await invalidateCachedLink(updated.normalizedCode);
      }
      return serializeShortUrl(updated);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new AppError(
          409,
          "ALIAS_TAKEN",
          `The alias '${parsed.alias ?? ""}' is already in use`
        );
      }
      throw err;
    }
  },

  async deleteUrl(id: string, caller: CallerContext) {
    if (!caller.userId) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    }

    const existing = await urlRepository.findById(id);
    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "Link not found");
    }

    if (existing.userId !== caller.userId && !caller.isAdmin) {
      throw new AppError(403, "FORBIDDEN", "You do not have access to this link");
    }

    await urlRepository.deleteById(id);
    await invalidateCachedLink(existing.normalizedCode);
  },

  async bulkMutate(rawInput: unknown, caller: CallerContext) {
    if (!caller.userId) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    }

    const parsed = bulkMutateUrlsSchema.parse(rawInput);
    const owned = await urlRepository.findManyOwned(parsed.ids, caller.userId);
    const ownedIds = owned.map((o) => o.id);

    if (ownedIds.length === 0) {
      return { affected: 0 };
    }

    let affected = 0;
    if (parsed.action === "enable") {
      const res = await urlRepository.bulkSetActive(ownedIds, caller.userId, true);
      affected = res.count;
    } else if (parsed.action === "disable") {
      const res = await urlRepository.bulkSetActive(ownedIds, caller.userId, false);
      affected = res.count;
    } else if (parsed.action === "delete") {
      const res = await urlRepository.bulkDelete(ownedIds, caller.userId);
      affected = res.count;
    }

    await Promise.all(owned.map((o) => invalidateCachedLink(o.normalizedCode)));

    return { affected };
  },

  async claimGuestLink(token: string, userId: string) {
    const payload = verifyGuestClaimToken(token);
    if (!payload) {
      throw new AppError(400, "INVALID_INPUT", "Invalid or expired guest claim token");
    }

    const tokenHash = hashGuestClaimToken(token);
    const link = await prisma.shortUrl.findFirst({
      where: {
        id: payload.shortUrlId,
        userId: null,
        guestClaimTokenHash: tokenHash,
        deletedAt: null,
      },
    });

    if (!link) {
      throw new AppError(
        404,
        "NOT_FOUND",
        "Claimable guest link not found or already claimed"
      );
    }

    const updated = await prisma.shortUrl.update({
      where: { id: link.id },
      data: {
        userId,
        guestClaimTokenHash: null,
      },
    });

    await invalidateCachedLink(updated.normalizedCode);
    return serializeShortUrl(updated);
  },
};
