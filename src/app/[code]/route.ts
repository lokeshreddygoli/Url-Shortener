import { NextResponse } from "next/server";
import { resolveRedirect } from "@/server/services/redirect.service";
import { renderStatusPageHtml } from "@/lib/status-pages";
import { checkRateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/request-meta";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ code: string }>;
}

const NOINDEX_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export async function GET(req: Request, { params }: RouteParams) {
  const { code } = await params;

  try {
    const ip = extractClientIp(req.headers);
    const rl = await checkRateLimit(
      { ...RATE_LIMITS.REDIRECT, limit: Number(process.env.REDIRECT_RATE_LIMIT || 600) },
      `ip:${ip}`
    );
    if (!rl.allowed) {
      const html = renderStatusPageHtml({
        statusCode: 429,
        title: "Too Many Requests",
        heading: "Slow down",
        message: "You have exceeded the request rate limit. Please wait a moment and try again.",
      });
      return new NextResponse(html, {
        status: 429,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...NOINDEX_HEADERS,
          ...rateLimitHeaders(rl),
        },
      });
    }

    const decision = await resolveRedirect(code, req);

    switch (decision.kind) {
      case "redirect": {
        const headers = new Headers({
          Location: decision.destinationUrl,
          "Cache-Control": decision.cacheControl,
          "X-Robots-Tag": "noindex, nofollow",
        });
        return new NextResponse(null, { status: decision.status, headers });
      }

      case "password_required": {
        const target = new URL(`/unlock/${encodeURIComponent(decision.code)}`, req.url);
        return NextResponse.redirect(target, {
          status: 302,
          headers: NOINDEX_HEADERS,
        });
      }

      case "safety_warning": {
        const target = new URL(`/warning/${encodeURIComponent(decision.code)}`, req.url);
        return NextResponse.redirect(target, {
          status: 302,
          headers: NOINDEX_HEADERS,
        });
      }

      case "gone": {
        const messages = {
          disabled: "This short link has been disabled by its owner.",
          expired: "This short link has expired and is no longer active.",
          limit_reached: "This short link has reached its maximum click limit.",
        };
        const html = renderStatusPageHtml({
          statusCode: 410,
          title: "Link Unavailable",
          heading: "Link no longer available",
          message: messages[decision.reason],
        });
        return new NextResponse(html, {
          status: 410,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...NOINDEX_HEADERS,
          },
        });
      }

      case "not_found":
      default: {
        const html = renderStatusPageHtml({
          statusCode: 404,
          title: "Link Not Found",
          heading: "Short link not found",
          message: "We could not find a destination matching this short code.",
        });
        return new NextResponse(html, {
          status: 404,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...NOINDEX_HEADERS,
          },
        });
      }
    }
  } catch (err) {
    logger.error({ err, code }, "Redirect engine failed");
    const html = renderStatusPageHtml({
      statusCode: 503,
      title: "Service Temporarily Unavailable",
      heading: "Unable to resolve link right now",
      message: "Our link resolution service is temporarily unavailable. Please try again shortly.",
    });
    return new NextResponse(html, {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...NOINDEX_HEADERS,
      },
    });
  }
}
