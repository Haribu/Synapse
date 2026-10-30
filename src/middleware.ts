import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyDPoPProof } from "./lib/security/dpop";
import { verifyCloudflareAccessJwt } from "./lib/security/cf-access";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function middleware(request: NextRequest) {
  // Always permit internal container health checks
  if (request.nextUrl.pathname === "/api/health") {
    return NextResponse.next();
  }

  const host = (request.headers.get("host") || "").toLowerCase();
  const authMode = (process.env.AUTH_MODE || "none").toLowerCase();
  const allowedEmailsEnv = process.env.ALLOWED_EMAILS || "";
  const allowedList = allowedEmailsEnv
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  // 1. Pre-shared API Key Authentication (Bearer token or x-api-key) with optional DPoP (RFC 9449)
  // Allows external AI agents, headless MCP servers, and CLI tools to access APIs directly
  const apiKeyConfigured = process.env.SYNAPSE_API_KEY?.trim();
  const authHeader = request.headers.get("authorization");
  const xApiKey = request.headers.get("x-api-key");
  const providedKey = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : xApiKey?.trim();

  if (apiKeyConfigured && providedKey) {
    if (constantTimeEqual(providedKey, apiKeyConfigured)) {
      // Optional RFC 9449 DPoP Verification
      const dpopHeader = request.headers.get("dpop");
      if (dpopHeader) {
        const dpopResult = await verifyDPoPProof(
          dpopHeader,
          request.method,
          request.nextUrl.pathname
        );
        if (!dpopResult.valid) {
          return new NextResponse(
            JSON.stringify({
              error: "Unauthorized: Invalid DPoP proof.",
              details: dpopResult.error,
            }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        const response = NextResponse.next();
        response.headers.set("X-Authenticated-By", "synapse-api-key-dpop");
        if (dpopResult.thumbprint) {
          response.headers.set("X-DPoP-Thumbprint", dpopResult.thumbprint);
        }
        return response;
      }

      // Standard Bearer Auth without DPoP (backward compatible)
      const response = NextResponse.next();
      response.headers.set("X-Authenticated-By", "synapse-api-key");
      return response;
    } else {
      return new NextResponse(JSON.stringify({ error: "Unauthorized: Invalid Synapse API key." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // 2. Genuine Local Loopback Whitelist
  // Only treated as local loopback when no external proxy/tunnel headers are present
  const hasProxyHeaders =
    request.headers.has("cf-ray") ||
    request.headers.has("cf-connecting-ip") ||
    request.headers.has("x-forwarded-for");

  const isLocalLoopback =
    !hasProxyHeaders &&
    (host === "localhost" ||
      host.startsWith("localhost:") ||
      host === "127.0.0.1" ||
      host.startsWith("127.0.0.1:"));

  // 3. Cloudflare Access Enforcement
  const isCloudflare = request.headers.has("cf-ray") || authMode === "cloudflare";
  if (isCloudflare && !isLocalLoopback && allowedList.length > 0) {
    const cfTeamDomain = process.env.CF_ACCESS_TEAM_NAME || process.env.CLOUDFLARE_TEAM_DOMAIN;
    const cfJwt = request.headers.get("cf-access-jwt-assertion");

    // Cryptographic JWT assertion verification if team domain is configured
    if (cfTeamDomain && cfJwt) {
      const expectedAud = process.env.CF_ACCESS_AUD || process.env.CLOUDFLARE_AUD;
      const jwtResult = await verifyCloudflareAccessJwt(cfJwt, cfTeamDomain, expectedAud);

      if (!jwtResult.valid || !jwtResult.email || !allowedList.includes(jwtResult.email.toLowerCase())) {
        return new NextResponse(
          JSON.stringify({
            error: "Unauthorized: Access restricted to authorized users.",
            details: jwtResult.error || "User email not whitelisted.",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      // Fast edge header check fallback
      const cfUserEmail = request.headers.get("cf-access-authenticated-user-email");
      if (!cfUserEmail || !allowedList.includes(cfUserEmail.toLowerCase())) {
        return new NextResponse(
          JSON.stringify({
            error: "Unauthorized: Access restricted to authorized users.",
            cfUserEmail: cfUserEmail || "None",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  }

  // 4. Generic Reverse Proxy Header Auth (e.g. Authelia, Authentik, Tailscale)
  if (authMode === "header" && !isLocalLoopback) {
    const remoteUser =
      request.headers.get("x-forwarded-user") ||
      request.headers.get("x-webauth-user") ||
      request.headers.get("tailscale-user-login");
    if (!remoteUser) {
      return new NextResponse(
        JSON.stringify({ error: "Unauthorized: Missing proxy identity header." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  const response = NextResponse.next();

  // Strict Security Headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), browsing-topics=()"
  );

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, manifest.json, robots.txt
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|robots.txt).*)",
  ],
};
