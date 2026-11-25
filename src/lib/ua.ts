export interface ParsedUserAgent {
  deviceType: "desktop" | "mobile" | "tablet" | "bot" | "unknown";
  browser: string;
  os: string;
  isBot: boolean;
}

const BOT_PATTERNS =
  /(bot|crawl|spider|slurp|mediapartners|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|applebot|bingpreview|googlebot|yandex|baiduspider|duckduckbot|semrush|ahrefs|mj12bot|bytespider|gptbot|claudebot|ccbot|headlesschrome|lighthouse|pingdom|uptimerobot|curl|wget|python-requests|python-urllib|go-http-client|httpie|postmanruntime|axios|node-fetch|undici)/i;

export function parseUserAgent(uaRaw: string | null | undefined): ParsedUserAgent {
  const ua = (uaRaw ?? "").trim();
  if (!ua) {
    return {
      deviceType: "unknown",
      browser: "unknown",
      os: "unknown",
      isBot: false,
    };
  }

  const isBot = BOT_PATTERNS.test(ua);

  // OS detection
  let os = "unknown";
  if (/windows nt/i.test(ua)) os = "Windows";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/cros/i.test(ua)) os = "ChromeOS";
  else if (/linux/i.test(ua)) os = "Linux";

  // Browser detection (order matters because Chrome UA includes Safari, Edge includes Chrome)
  let browser = "unknown";
  if (isBot) {
    if (/curl/i.test(ua)) browser = "curl";
    else if (/googlebot/i.test(ua)) browser = "Googlebot";
    else if (/twitterbot/i.test(ua)) browser = "Twitterbot";
    else if (/slackbot/i.test(ua)) browser = "Slackbot";
    else if (/discordbot/i.test(ua)) browser = "Discordbot";
    else if (/whatsapp/i.test(ua)) browser = "WhatsApp";
    else browser = "Bot";
  } else if (/edg\//i.test(ua) || /edge\//i.test(ua)) browser = "Edge";
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = "Opera";
  else if (/firefox\/|fxios\//i.test(ua)) browser = "Firefox";
  else if (/chrome\/|crios\//i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua)) browser = "Safari";

  // Device type detection
  let deviceType: ParsedUserAgent["deviceType"] = "desktop";
  if (isBot) {
    deviceType = "bot";
  } else if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) {
    deviceType = "tablet";
  } else if (/mobile|iphone|ipod|android.*mobile|blackberry|iemobile/i.test(ua)) {
    deviceType = "mobile";
  }

  return { deviceType, browser, os, isBot };
}
