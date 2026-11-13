import dns from "node:dns/promises";

/**
 * SSRF and Network Security Guard
 * Prevents server-side request forgery to local/private network ranges (RFC 1918),
 * Docker bridge subnets (172.16.0.0/12), carrier-grade NAT (100.64.0.0/10),
 * cloud metadata endpoints (169.254.169.254), IPv6 loopback/unique-local, and non-HTTP protocols.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const clean = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    clean === "::1" ||
    clean === "::" ||
    clean === "0:0:0:0:0:0:0:1" ||
    clean === "0:0:0:0:0:0:0:0" ||
    clean.startsWith("fe80:") ||
    clean.startsWith("fc00:") ||
    clean.startsWith("fd") ||
    clean.startsWith("::ffff:")
  ) {
    return true;
  }
  if (
    clean === "0.0.0.0" ||
    clean.startsWith("0.") ||
    clean.startsWith("127.") ||
    clean.startsWith("10.") ||
    clean.startsWith("192.168.") ||
    clean.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(clean) ||
    /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(clean)
  ) {
    return true;
  }
  return false;
}
export function validateSafeUrl(targetUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error("Invalid URL format.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Invalid protocol. Only HTTP and HTTPS are permitted.");
  }

  // Strip IPv6 brackets if present
  const rawHost = parsed.hostname.toLowerCase();
  const hostname = rawHost.replace(/^\[|\]$/g, "");

  // Block localhost and local domain suffixes
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal"
  ) {
    throw new Error("Access to local or internal hostnames is blocked for security.");
  }

  // Block IPv6 loopback (::1), unspecified (::), link-local (fe80::/10), unique local (fc00::/7, fd00::/8), and IPv4-mapped (::ffff:0:0/96)
  if (
    hostname === "::1" ||
    hostname === "::" ||
    hostname === "0:0:0:0:0:0:0:1" ||
    hostname === "0:0:0:0:0:0:0:0" ||
    hostname.startsWith("fe80:") ||
    hostname.startsWith("fc00:") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("::ffff:")
  ) {
    throw new Error("Access to private or loopback IPv6 addresses is blocked for security.");
  }

  // Block IPv4 loopback (127.0.0.0/8), unspecified (0.0.0.0/8), RFC 1918 (10/8, 172.16/12, 192.168/16),
  // link-local / cloud metadata (169.254.0.0/16), and CGNAT (100.64.0.0/10)
  if (
    hostname === "0.0.0.0" ||
    hostname.startsWith("0.") ||
    hostname.startsWith("127.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(hostname)
  ) {
    throw new Error("Access to local or private network addresses is blocked for security.");
  }

  // Block integer/hex/octal encoded IPv4 hostnames (e.g., 2130706433 or 0x7f000001)
  if (/^\d+$/.test(hostname) || /^0x[0-9a-f]+$/i.test(hostname)) {
    throw new Error("Numeric IP encoding is blocked for security.");
  }

  return parsed;
}

/**
 * Resolves DNS for a validated URL and ensures no resolved IP is private/reserved.
 */
export async function validateSafeUrlWithDns(targetUrl: string): Promise<URL> {
  const parsed = validateSafeUrl(targetUrl);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  // Skip DNS lookup if hostname is already an IP literal
  if (/^[\d.]+$/.test(hostname) || hostname.includes(":")) {
    return parsed;
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    for (const record of records) {
      if (isPrivateOrReservedIp(record.address)) {
        throw new Error(`DNS resolution for ${hostname} pointed to a blocked private IP.`);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("blocked private IP")) {
      throw err;
    }
    // If DNS fails, let fetch handle the network error naturally
  }

  return parsed;
}

/**
 * SSRF-hardened fetch wrapper that validates DNS and manually follows redirects,
 * re-validating every Location hop against validateSafeUrlWithDns.
 */
export async function safeFetch(
  targetUrl: string,
  init: RequestInit = {},
  maxRedirects = 5
): Promise<Response> {
  let currentUrl = targetUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safeUrl = await validateSafeUrlWithDns(currentUrl);
    const res = await fetch(safeUrl.toString(), {
      ...init,
      redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return res;
      }
      if (hop === maxRedirects) {
        throw new Error(`Too many redirects (>${maxRedirects}) while fetching ${targetUrl}`);
      }
      currentUrl = new URL(location, safeUrl).toString();
      continue;
    }

    return res;
  }

  throw new Error(`Redirect loop exceeded for ${targetUrl}`);
}
