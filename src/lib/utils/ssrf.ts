/**
 * SSRF and Network Security Guard
 * Prevents server-side request forgery to local/private network ranges (RFC 1918),
 * Docker bridge subnets (172.16.0.0/12), carrier-grade NAT (100.64.0.0/10),
 * cloud metadata endpoints (169.254.169.254), IPv6 loopback/unique-local, and non-HTTP protocols.
 */
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
