import { NextResponse } from "next/server";

export async function GET() {
  const serverUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");

  const spec = {
    openapi: "3.0.3",
    info: {
      title: "Shortly URL Shortener API",
      version: "1.0.0",
      description:
        "Production REST API for shortening URLs, managing smart routing rules, generating QR codes, and querying privacy-first analytics.",
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        BearerApiKey: {
          type: "http",
          scheme: "bearer",
          description: "Scoped API key generated in Settings (sk_live_...)",
        },
      },
      schemas: {
        CreateUrlRequest: {
          type: "object",
          required: ["originalUrl"],
          properties: {
            originalUrl: { type: "string", format: "uri", example: "https://nextjs.org/docs" },
            alias: { type: "string", minLength: 3, maxLength: 32, example: "launch-26" },
            redirectType: { type: "integer", enum: [302, 307, 301], default: 302 },
            expiresAt: { type: "string", format: "date-time", nullable: true },
            clickLimit: { type: "integer", minimum: 1, nullable: true },
            password: { type: "string", minLength: 4, nullable: true },
            title: { type: "string", nullable: true },
          },
        },
      },
    },
    paths: {
      "/api/urls": {
        get: {
          summary: "List owned short links",
          security: [{ BearerApiKey: [] }],
          parameters: [
            { name: "search", in: "query", schema: { type: "string" } },
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: ["all", "active", "expired", "disabled", "password", "has-qr"] },
            },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "pageSize", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { "200": { description: "Paginated short URL list" }, "401": { description: "Unauthenticated" } },
        },
        post: {
          summary: "Create a short link",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateUrlRequest" } } },
          },
          responses: {
            "201": { description: "Short link created" },
            "409": { description: "Custom alias already taken" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/api/urls/{id}": {
        get: {
          summary: "Get link details and routing rules",
          security: [{ BearerApiKey: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Link details" }, "403": { description: "Forbidden" }, "404": { description: "Not found" } },
        },
        patch: {
          summary: "Update link destination, alias, expiry, or status",
          security: [{ BearerApiKey: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Updated" } },
        },
        delete: {
          summary: "Delete link and release alias",
          security: [{ BearerApiKey: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "204": { description: "Deleted" } },
        },
      },
      "/api/urls/{id}/analytics": {
        get: {
          summary: "Get time-series, geo, device, referrer, UTM, and heatmap analytics",
          security: [{ BearerApiKey: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "range", in: "query", schema: { type: "string", enum: ["24h", "7d", "30d", "all"] } },
          ],
          responses: { "200": { description: "Analytics report" } },
        },
      },
      "/api/urls/{id}/qr": {
        get: {
          summary: "Generate PNG or SVG QR code for a short link",
          security: [{ BearerApiKey: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "format", in: "query", schema: { type: "string", enum: ["png", "svg"] } },
          ],
          responses: { "200": { description: "Binary PNG or SVG image" } },
        },
      },
      "/api/urls/bulk": {
        post: {
          summary: "Bulk enable, disable, or delete links",
          security: [{ BearerApiKey: [] }],
          responses: { "200": { description: "Affected count" } },
        },
      },
      "/api/analytics/overview": {
        get: {
          summary: "Workspace KPI overview and 14-day trend",
          security: [{ BearerApiKey: [] }],
          responses: { "200": { description: "Overview stats" } },
        },
      },
      "/api/keys": {
        get: { summary: "List API keys", security: [{ BearerApiKey: [] }], responses: { "200": { description: "Keys" } } },
        post: { summary: "Create scoped API key", security: [{ BearerApiKey: [] }], responses: { "201": { description: "Created" } } },
        delete: { summary: "Revoke API key", security: [{ BearerApiKey: [] }], responses: { "200": { description: "Revoked" } } },
      },
      "/api/health": { get: { summary: "Liveness probe", responses: { "200": { description: "Healthy" } } } },
      "/api/ready": { get: { summary: "PostgreSQL & Redis readiness probe", responses: { "200": { description: "Ready" }, "503": { description: "Unavailable" } } } },
    },
  };

  return NextResponse.json(spec, {
    status: 200,
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
