export function isSecureCookieEnv(): boolean {
  const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "";
  if (appUrl.startsWith("https://")) return true;
  if (appUrl.startsWith("http://")) return false;
  return process.env.NODE_ENV === "production";
}
