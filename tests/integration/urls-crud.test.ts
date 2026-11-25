import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureTestDatabaseEnv } from "../helpers/setup-test-db";

configureTestDatabaseEnv();

import { prisma } from "@/lib/db";
import { urlService } from "@/server/services/url.service";
import { GET as getUrlsRoute, POST as postUrlsRoute } from "@/app/api/urls/route";
import {
  DELETE as deleteUrlRoute,
  GET as getUrlRoute,
  PATCH as patchUrlRoute,
} from "@/app/api/urls/[id]/route";
import { POST as bulkRoute } from "@/app/api/urls/bulk/route";
import { AppError } from "@/lib/errors";

describe("URL CRUD integration (real PostgreSQL)", () => {
  let userAId = "";
  let userBId = "";

  beforeAll(async () => {
    await prisma.clickEvent.deleteMany();
    await prisma.linkRule.deleteMany();
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();

    const userA = await prisma.user.create({
      data: { email: "usera-crud@test.local", name: "User A" },
    });
    const userB = await prisma.user.create({
      data: { email: "userb-crud@test.local", name: "User B" },
    });
    userAId = userA.id;
    userBId = userB.id;
  });

  beforeEach(async () => {
    await prisma.shortUrl.deleteMany();
  });

  afterAll(async () => {
    await prisma.shortUrl.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it("creates guest links with default expiry and allows claiming via signed token", async () => {
    const req = new Request("http://localhost:3000/api/urls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ originalUrl: "https://example.com/guest-page" }),
    });

    const res = await postUrlsRoute(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.error).toBeNull();
    expect(json.data.link.code).toHaveLength(7);
    expect(json.data.link.expiresAt).toBeTruthy();
    expect(json.data.guestClaimToken).toBeTruthy();

    const claimed = await urlService.claimGuestLink(
      json.data.guestClaimToken,
      userAId
    );
    expect(claimed.userId).toBe(userAId);
  });

  it("enforces case-insensitive custom alias uniqueness under 50 concurrent creations", async () => {
    const attempts = Array.from({ length: 50 }, (_, idx) =>
      urlService
        .createUrl(
          {
            originalUrl: `https://example.com/concurrent/${idx}`,
            alias: idx % 2 === 0 ? "Concurrent-Alias" : "concurrent-alias",
          },
          { userId: userAId }
        )
        .then((res) => ({ status: 201 as const, id: res.link.id }))
        .catch((err) => {
          if (err instanceof AppError) {
            return { status: err.statusCode, code: err.code };
          }
          throw err;
        })
    );

    const results = await Promise.all(attempts);
    const createdCount = results.filter((r) => r.status === 201).length;
    const conflictCount = results.filter((r) => r.status === 409).length;

    expect(createdCount).toBe(1);
    expect(conflictCount).toBe(49);
  });

  it("supports full CRUD, filtering, bulk operations, and strict ownership checks", async () => {
    const created1 = await urlService.createUrl(
      { originalUrl: "https://example.com/one", alias: "link-one" },
      { userId: userAId }
    );
    const created2 = await urlService.createUrl(
      { originalUrl: "https://example.com/two", alias: "link-two" },
      { userId: userAId }
    );

    const list = await urlService.listUrls(
      { search: "one", status: "active", page: "1", pageSize: "10" },
      { userId: userAId }
    );
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.code).toBe("link-one");

    // User B cannot read, update, or delete User A's link
    await expect(
      urlService.getUrl(created1.link.id, { userId: userBId })
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    await expect(
      urlService.updateUrl(created1.link.id, { isActive: false }, { userId: userBId })
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    await expect(
      urlService.deleteUrl(created1.link.id, { userId: userBId })
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    // Unauthenticated route call returns 401 for private endpoints
    const unauthedList = await getUrlsRoute(new Request("http://localhost:3000/api/urls"));
    expect(unauthedList.status).toBe(401);
    const unauthedGet = await getUrlRoute(
      new Request(`http://localhost:3000/api/urls/${created1.link.id}`),
      { params: Promise.resolve({ id: created1.link.id }) }
    );
    expect(unauthedGet.status).toBe(401);
    const unauthedPatch = await patchUrlRoute(
      new Request(`http://localhost:3000/api/urls/${created1.link.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      { params: Promise.resolve({ id: created1.link.id }) }
    );
    expect(unauthedPatch.status).toBe(401);
    const unauthedDel = await deleteUrlRoute(
      new Request(`http://localhost:3000/api/urls/${created1.link.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: created1.link.id }) }
    );
    expect(unauthedDel.status).toBe(401);
    const unauthedBulk = await bulkRoute(
      new Request("http://localhost:3000/api/urls/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [created1.link.id], action: "disable" }),
      })
    );
    expect(unauthedBulk.status).toBe(401);

    // Owner updates alias & destination
    const updated = await urlService.updateUrl(
      created1.link.id,
      { alias: "link-one-v2", originalUrl: "https://example.org/updated" },
      { userId: userAId }
    );
    expect(updated.code).toBe("link-one-v2");
    expect(updated.originalUrl).toBe("https://example.org/updated");

    // Bulk disable & delete
    const disabled = await urlService.bulkMutate(
      { ids: [created1.link.id, created2.link.id], action: "disable" },
      { userId: userAId }
    );
    expect(disabled.affected).toBe(2);

    const deleted = await urlService.bulkMutate(
      { ids: [created1.link.id, created2.link.id], action: "delete" },
      { userId: userAId }
    );
    expect(deleted.affected).toBe(2);

    // Deleted alias can be reused immediately
    const recreated = await urlService.createUrl(
      { originalUrl: "https://example.com/reused", alias: "link-one-v2" },
      { userId: userAId }
    );
    expect(recreated.link.code).toBe("link-one-v2");
  });

  it("rejects oversized JSON payload with 413 and past expiry with 422", async () => {
    const bigReq = new Request("http://localhost:3000/api/urls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ originalUrl: "https://example.com/" + "a".repeat(70000) }),
    });
    const bigRes = await postUrlsRoute(bigReq);
    expect(bigRes.status).toBe(413);

    const pastReq = new Request("http://localhost:3000/api/urls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        originalUrl: "https://example.com/past",
        expiresAt: "2020-01-01T00:00:00.000Z",
      }),
    });
    const pastRes = await postUrlsRoute(pastReq);
    expect(pastRes.status).toBe(422);
  });
});
