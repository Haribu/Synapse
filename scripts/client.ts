import fs from "fs";

export const SYNAPSE_PORT = process.env.SYNAPSE_PORT || "3005";

export function resolveBaseUrl(): string {
  if (process.env.SYNAPSE_URL) {
    return process.env.SYNAPSE_URL;
  }
  if (fs.existsSync("/.dockerenv")) {
    return "http://synapse:3000";
  }
  return `http://127.0.0.1:${SYNAPSE_PORT}`;
}

export function resolveAllowedEmail(): string {
  if (process.env.ALLOWED_EMAILS) {
    return process.env.ALLOWED_EMAILS.split(",")[0]?.trim() || "";
  }
  try {
    if (fs.existsSync("docker-compose.override.yml")) {
      const content = fs.readFileSync("docker-compose.override.yml", "utf8");
      const match = content.match(/ALLOWED_EMAILS=([^\s\n]+)/);
      if (match?.[1]) {
        return match[1].split(",")[0]?.trim() || "";
      }
    }
  } catch {}
  return "";
}

export function getAuthHeaders(userAgent = "Synapse-Client/1.0"): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": userAgent };
  const email = resolveAllowedEmail();
  if (email) {
    headers["CF-Access-Authenticated-User-Email"] = email;
  }
  if (process.env.SYNAPSE_API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.SYNAPSE_API_KEY}`;
  }
  return headers;
}

export async function authenticatedFetch(
  path: string,
  options: RequestInit = {},
  userAgent?: string
): Promise<Response> {
  const baseUrl = resolveBaseUrl();
  const url = path.startsWith("http") ? path : `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  const defaultHeaders = getAuthHeaders(userAgent);
  const headers = {
    ...defaultHeaders,
    ...((options.headers as Record<string, string>) || {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}
