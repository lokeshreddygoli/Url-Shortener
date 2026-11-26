import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getEmailTransport } from "@/lib/email";
import { invalidateCachedLink } from "@/lib/cache";
import { logger } from "@/lib/logger";
import {
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateAccountSchema,
  verifyEmailSchema,
} from "@/lib/validators/auth";
import { urlService } from "@/server/services/url.service";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const BCRYPT_COST = 10;

export const authService = {
  async register(rawInput: unknown) {
    const parsed = registerSchema.parse(rawInput);
    const email = parsed.email.toLowerCase();
    const passwordHash = await bcrypt.hash(parsed.password, BCRYPT_COST);

    try {
      const user = await prisma.user.create({
        data: {
          email,
          name: parsed.name,
          passwordHash,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      let claimedLinks = 0;
      if (parsed.claimTokens && parsed.claimTokens.length > 0) {
        for (const token of parsed.claimTokens) {
          try {
            await urlService.claimGuestLink(token, user.id);
            claimedLinks += 1;
          } catch {
            // Ignore invalid/expired guest tokens during signup
          }
        }
      }

      try {
        await this.issueVerificationEmail(user.email);
      } catch (emailErr) {
        logger.warn({ err: emailErr, userId: user.id }, "Failed to send verification email on signup");
      }

      return { user, claimedLinks };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new AppError(
          409,
          "ALIAS_TAKEN",
          "An account with this email already exists"
        );
      }
      throw err;
    }
  },

  async verifyCredentials(rawInput: unknown) {
    const parsed = loginSchema.safeParse(rawInput);
    if (!parsed.success) return null;

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash || user.isDisabled) {
      return null;
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new AppError(
        429,
        "RATE_LIMITED",
        "Account temporarily locked due to too many failed attempts"
      );
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      const nextAttempts = user.failedLoginAttempts + 1;
      const shouldLock = nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: nextAttempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + LOCKOUT_DURATION_MS)
            : null,
        },
      });
      return null;
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  },

  async requestPasswordReset(rawInput: unknown) {
    const parsed = forgotPasswordSchema.parse(rawInput);
    const email = parsed.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.isDisabled) {
      // Never disclose whether the account exists
      return { sent: true };
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
    const resetLink = `${appUrl}/reset-password?token=${rawToken}`;

    await getEmailTransport().send({
      to: user.email,
      subject: "Reset your Shortly password",
      text: `Click the link below to reset your password (valid for 1 hour): ${resetLink}`,
    });

    return {
      sent: true,
      ...(process.env.NODE_ENV === "test" ? { devResetToken: rawToken } : {}),
    };
  },

  async resetPassword(rawInput: unknown) {
    const parsed = resetPasswordSchema.parse(rawInput);
    const tokenHash = crypto
      .createHash("sha256")
      .update(parsed.token)
      .digest("hex");

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new AppError(
        400,
        "INVALID_INPUT",
        "Password reset token is invalid or has expired"
      );
    }

    const passwordHash = await bcrypt.hash(parsed.password, BCRYPT_COST);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { reset: true };
  },

  async issueVerificationEmail(email: string) {
    const normalizedEmail = email.toLowerCase();
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await prisma.verificationToken.deleteMany({
      where: { identifier: normalizedEmail },
    });
    await prisma.verificationToken.create({
      data: {
        identifier: normalizedEmail,
        token: tokenHash,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
    const verifyUrl = `${appUrl}/verify-email?token=${rawToken}`;

    await getEmailTransport().send({
      to: normalizedEmail,
      subject: "Verify your Shortly email address",
      text: `Confirm your email address by visiting: ${verifyUrl} (valid for 24 hours).`,
    });

    return {
      sent: true,
      ...(process.env.NODE_ENV === "test" ? { devVerificationToken: rawToken } : {}),
    };
  },

  async resendVerification(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerified: true },
    });
    if (!user) {
      throw new AppError(404, "NOT_FOUND", "User not found");
    }
    if (user.emailVerified) {
      return { alreadyVerified: true };
    }
    return this.issueVerificationEmail(user.email);
  },

  async verifyEmail(rawInput: unknown) {
    const parsed = verifyEmailSchema.parse(rawInput);
    const tokenHash = crypto.createHash("sha256").update(parsed.token).digest("hex");

    const record = await prisma.verificationToken.findUnique({
      where: { token: tokenHash },
    });

    if (!record || record.expires.getTime() <= Date.now()) {
      throw new AppError(400, "INVALID_INPUT", "Verification token is invalid or has expired");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { email: record.identifier },
        data: { emailVerified: new Date() },
      }),
      prisma.verificationToken.delete({
        where: { token: tokenHash },
      }),
    ]);

    return { verified: true, email: record.identifier };
  },

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        passwordHash: true,
        createdAt: true,
        _count: {
          select: { shortUrls: true, apiKeys: true, webhooks: true },
        },
      },
    });

    if (!user) {
      throw new AppError(404, "NOT_FOUND", "User not found");
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: Boolean(user.emailVerified),
      hasPassword: Boolean(user.passwordHash),
      createdAt: user.createdAt.toISOString(),
      counts: {
        links: user._count.shortUrls,
        apiKeys: user._count.apiKeys,
        webhooks: user._count.webhooks,
      },
    };
  },

  async updateAccount(userId: string, rawInput: unknown) {
    const parsed = updateAccountSchema.parse(rawInput);

    if (parsed.action === "profile") {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { name: parsed.name },
        select: { id: true, email: true, name: true, role: true },
      });
      return updated;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(404, "NOT_FOUND", "User not found");
    }

    if (user.passwordHash) {
      const ok = await bcrypt.compare(parsed.currentPassword, user.passwordHash);
      if (!ok) {
        throw new AppError(403, "FORBIDDEN", "Current password is incorrect");
      }
    }

    const nextHash = await bcrypt.hash(parsed.newPassword, BCRYPT_COST);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: nextHash },
    });

    return { passwordUpdated: true };
  },

  async deleteAccount(userId: string, rawInput: unknown) {
    const parsed = deleteAccountSchema.parse(rawInput);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { shortUrls: { select: { normalizedCode: true } } },
    });

    if (!user) {
      throw new AppError(404, "NOT_FOUND", "User not found");
    }

    if (user.passwordHash) {
      if (!parsed.currentPassword) {
        throw new AppError(
          400,
          "INVALID_INPUT",
          "Current password is required to delete your account"
        );
      }
      const valid = await bcrypt.compare(parsed.currentPassword, user.passwordHash);
      if (!valid) {
        throw new AppError(403, "FORBIDDEN", "Current password is incorrect");
      }
    }

    const codes = user.shortUrls.map((s) => s.normalizedCode);
    await prisma.user.delete({ where: { id: userId } });
    await Promise.all(codes.map((c) => invalidateCachedLink(c)));

    return { deleted: true };
  },
};
