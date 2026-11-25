import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureTestDatabaseEnv } from "../helpers/setup-test-db";

configureTestDatabaseEnv();

import { prisma } from "@/lib/db";
import { authService } from "@/server/services/auth.service";
import { urlService } from "@/server/services/url.service";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { GET as accountGetRoute } from "@/app/api/account/route";

describe("Auth flows and IDOR authorization matrix (real PostgreSQL)", () => {
  beforeAll(async () => {
    await prisma.passwordResetToken.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();
  });

  beforeEach(async () => {
    await prisma.passwordResetToken.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.passwordResetToken.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("registers user, blocks duplicate email with 409, enforces lockout, and supports password reset", async () => {
    const regRes = await registerRoute(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "Alice@Example.com",
          name: "Alice",
          password: "StrongPassword123!",
        }),
      })
    );
    expect(regRes.status).toBe(201);
    const regJson = await regRes.json();
    expect(regJson.data.user.email).toBe("alice@example.com");

    // Duplicate email returns 409
    const dupRes = await registerRoute(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "alice@example.com",
          name: "Alice 2",
          password: "StrongPassword123!",
        }),
      })
    );
    expect(dupRes.status).toBe(409);

    // Correct credentials succeed
    const okCreds = await authService.verifyCredentials({
      email: "alice@example.com",
      password: "StrongPassword123!",
    });
    expect(okCreds?.email).toBe("alice@example.com");

    // 5 wrong password attempts trigger lockout (429)
    for (let i = 0; i < 5; i++) {
      const bad = await authService.verifyCredentials({
        email: "alice@example.com",
        password: "WrongPassword!",
      });
      expect(bad).toBeNull();
    }

    await expect(
      authService.verifyCredentials({
        email: "alice@example.com",
        password: "StrongPassword123!",
      })
    ).rejects.toMatchObject({ statusCode: 429, code: "RATE_LIMITED" });

    // Forgot & reset password clears lockout
    const resetReq = await authService.requestPasswordReset({
      email: "alice@example.com",
    });
    expect(resetReq.sent).toBe(true);
    expect(resetReq.devResetToken).toBeTruthy();

    await authService.resetPassword({
      token: resetReq.devResetToken!,
      password: "BrandNewPassword123!",
    });

    const afterReset = await authService.verifyCredentials({
      email: "alice@example.com",
      password: "BrandNewPassword123!",
    });
    expect(afterReset?.email).toBe("alice@example.com");
  });

  it("enforces complete IDOR matrix across users and cascades account deletion", async () => {
    const { user: alice } = await authService.register({
      email: "alice-idor@example.com",
      name: "Alice",
      password: "Password123!",
    });
    const { user: bob } = await authService.register({
      email: "bob-idor@example.com",
      name: "Bob",
      password: "Password123!",
    });

    const { link: aliceLink } = await urlService.createUrl(
      { originalUrl: "https://example.com/alice-secret", alias: "alice-only" },
      { userId: alice.id }
    );
    const { link: bobLink } = await urlService.createUrl(
      { originalUrl: "https://example.com/bob-secret", alias: "bob-only" },
      { userId: bob.id }
    );

    // Alice's list never leaks Bob's link
    const aliceList = await urlService.listUrls({}, { userId: alice.id });
    expect(aliceList.items.map((i) => i.id)).toEqual([aliceLink.id]);

    // Bob cannot read, modify, or delete Alice's link
    await expect(
      urlService.getUrl(aliceLink.id, { userId: bob.id })
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    await expect(
      urlService.updateUrl(aliceLink.id, { originalUrl: "https://evil.example" }, { userId: bob.id })
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    await expect(
      urlService.deleteUrl(aliceLink.id, { userId: bob.id })
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    // Bob's bulk mutate with Alice's ID affects 0 records
    const bulkRes = await urlService.bulkMutate(
      { ids: [aliceLink.id], action: "delete" },
      { userId: bob.id }
    );
    expect(bulkRes.affected).toBe(0);
    const stillThere = await urlService.getUrl(aliceLink.id, { userId: alice.id });
    expect(stillThere.id).toBe(aliceLink.id);

    // Unauthenticated /api/account returns 401
    const unauthedAccount = await accountGetRoute(
      new Request("http://localhost:3000/api/account")
    );
    expect(unauthedAccount.status).toBe(401);

    // Cross-origin browser CSRF rejected
    expect(() =>
      assertSameOriginIfBrowser(
        new Request("http://localhost:3000/api/urls", {
          method: "POST",
          headers: { origin: "https://evil-attacker.example", host: "localhost:3000" },
        })
      )
    ).toThrow(/Cross-origin/);

    // Account deletion cascades link deletion
    await authService.deleteAccount(bob.id, {
      confirmation: "DELETE",
      currentPassword: "Password123!",
    });
    const bobDb = await prisma.user.findUnique({ where: { id: bob.id } });
    const bobLinkDb = await prisma.shortUrl.findUnique({ where: { id: bobLink.id } });
    expect(bobDb).toBeNull();
    expect(bobLinkDb).toBeNull();
  });
});
