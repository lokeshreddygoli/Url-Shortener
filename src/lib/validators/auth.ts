import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email("Valid email address is required").max(254),
  name: z.string().trim().min(1, "Name is required").max(100),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password cannot exceed 128 characters"),
  claimTokens: z.array(z.string().min(1)).max(20).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Valid email address is required").max(254),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(16, "Invalid reset token").max(256),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password cannot exceed 128 characters"),
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(16, "Invalid verification token").max(256),
});

export const updateAccountSchema = z.union([
  z.object({
    action: z.literal("profile"),
    name: z.string().trim().min(1, "Name cannot be empty").max(100),
  }),
  z.object({
    action: z.literal("password"),
    currentPassword: z.string().min(1).max(128),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(128),
  }),
]);

export const deleteAccountSchema = z.object({
  confirmation: z.literal("DELETE"),
  currentPassword: z.string().max(128).optional(),
});
