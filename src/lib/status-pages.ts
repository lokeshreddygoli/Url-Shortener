export function renderStatusPageHtml(opts: {
  statusCode: number;
  title: string;
  heading: string;
  message: string;
}): string {
  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(opts.title)} — Shortly</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      background: #fafafa; color: #09090b; display: flex; min-height: 100vh;
      align-items: center; justify-content: center; padding: 24px;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #09090b; color: #fafafa; }
      .card { background: #18181b; border-color: #27272a; }
      .muted { color: #a1a1aa; }
    }
    .card {
      max-width: 440px; width: 100%; padding: 32px; border-radius: 16px;
      border: 1px solid #e4e4e7; background: #ffffff; text-align: center;
      box-shadow: 0 4px 24px rgba(0,0,0,0.04);
    }
    .badge {
      display: inline-block; padding: 4px 10px; border-radius: 9999px;
      font-size: 12px; font-weight: 600; background: #eef2ff; color: #4f46e5;
      margin-bottom: 16px;
    }
    h1 { font-size: 22px; margin: 0 0 8px; font-weight: 600; }
    .muted { color: #52525b; font-size: 14px; line-height: 1.6; margin: 0 0 24px; }
    a.btn {
      display: inline-block; padding: 10px 18px; border-radius: 10px;
      background: #4f46e5; color: #ffffff; text-decoration: none;
      font-size: 14px; font-weight: 500;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">HTTP ${opts.statusCode}</div>
    <h1>${escapeHtml(opts.heading)}</h1>
    <p class="muted">${escapeHtml(opts.message)}</p>
    <a class="btn" href="/">Go to Shortly</a>
  </main>
</body>
</html>`;
}
