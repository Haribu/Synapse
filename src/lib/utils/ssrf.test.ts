import { describe, expect, test } from "bun:test";
import { validateSafeUrl } from "./ssrf";

describe("validateSafeUrl - SSRF & Private Network Guard", () => {
  test("allows valid public HTTP and HTTPS URLs", () => {
    expect(validateSafeUrl("https://simonwillison.net/atom/everything/").hostname).toBe(
      "simonwillison.net"
    );
    expect(validateSafeUrl("http://feeds.arstechnica.com/arstechnica/index").hostname).toBe(
      "feeds.arstechnica.com"
    );
    expect(validateSafeUrl("https://172.15.0.1/feed.xml").hostname).toBe("172.15.0.1");
    expect(validateSafeUrl("https://172.32.0.1/feed.xml").hostname).toBe("172.32.0.1");
  });

  test("blocks non-HTTP protocols (file, ftp, javascript, data)", () => {
    expect(() => validateSafeUrl("file:///etc/passwd")).toThrow();
    expect(() => validateSafeUrl("ftp://example.com/file")).toThrow();
    expect(() => validateSafeUrl("javascript:alert(1)")).toThrow();
  });

  test("blocks loopback, RFC 1918 private subnets, Docker bridge (172.16/12), and cloud metadata", () => {
    expect(() => validateSafeUrl("http://localhost:3000/api/health")).toThrow();
    expect(() => validateSafeUrl("http://127.0.0.1:8080/admin")).toThrow();
    expect(() => validateSafeUrl("http://0.0.0.0:3000/")).toThrow();
    expect(() => validateSafeUrl("http://10.0.0.1/internal")).toThrow();
    expect(() => validateSafeUrl("http://172.16.0.1/docker")).toThrow();
    expect(() => validateSafeUrl("http://172.17.0.1:8123/api")).toThrow();
    expect(() => validateSafeUrl("http://172.31.255.255/")).toThrow();
    expect(() => validateSafeUrl("http://192.168.1.1/router")).toThrow();
    expect(() => validateSafeUrl("http://169.254.169.254/latest/meta-data/")).toThrow();
    expect(() => validateSafeUrl("http://metadata.google.internal/computeMetadata/v1/")).toThrow();
  });

  test("blocks IPv6 loopback, link-local, unique-local, and numeric IP encodings", () => {
    expect(() => validateSafeUrl("http://[::1]:3000/")).toThrow();
    expect(() => validateSafeUrl("http://[::ffff:127.0.0.1]/")).toThrow();
    expect(() => validateSafeUrl("http://[fe80::1]/")).toThrow();
    expect(() => validateSafeUrl("http://[fd00::1]/")).toThrow();
    expect(() => validateSafeUrl("http://2130706433/")).toThrow();
  });
});
