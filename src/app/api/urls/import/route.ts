import { z } from "zod";
import { getRequestId, handleApiError, ok, parseJsonBody } from "@/lib/api-response";
import { assertSameOriginIfBrowser } from "@/lib/csrf";
import { AppError } from "@/lib/errors";
import { requireAuthenticatedContext } from "@/server/auth/request-context";
import { urlService } from "@/server/services/url.service";

const importSchema = z.object({
  csv: z.string().min(1).max(60_000),
});

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    assertSameOriginIfBrowser(req);
    const caller = await requireAuthenticatedContext(req, "links:write");
    const body = importSchema.parse(await parseJsonBody(req));

    const lines = body.csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      throw new AppError(400, "INVALID_INPUT", "CSV content is empty");
    }
    if (lines.length > 101) {
      throw new AppError(400, "INVALID_INPUT", "CSV import is limited to 100 rows at a time");
    }

    const firstCells = parseCsvLine(lines[0]!).map((c) => c.toLowerCase());
    const hasHeader =
      firstCells[0] === "originalurl" ||
      firstCells[0] === "url" ||
      firstCells[0] === "destination";
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const created: Array<{ row: number; code: string; shortUrl: string }> = [];
    const errors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < dataLines.length; i++) {
      const rowNum = hasHeader ? i + 2 : i + 1;
      const cells = parseCsvLine(dataLines[i]!);
      const originalUrl = cells[0] ?? "";
      const alias = cells[1] || undefined;
      const title = cells[2] || undefined;
      const expiresAt = cells[3] || undefined;

      try {
        const res = await urlService.createUrl(
          { originalUrl, alias, title, expiresAt },
          caller
        );
        created.push({
          row: rowNum,
          code: res.link.code,
          shortUrl: res.link.shortUrl,
        });
      } catch (err) {
        const msg =
          err instanceof AppError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Invalid row";
        errors.push({ row: rowNum, message: msg });
      }
    }

    return ok(
      {
        totalRows: dataLines.length,
        createdCount: created.length,
        failedCount: errors.length,
        created,
        errors,
      },
      200,
      { requestId }
    );
  } catch (err) {
    return handleApiError(err, requestId);
  }
}
