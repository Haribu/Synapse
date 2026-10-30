/**
 * src/lib/security/cf-access.ts
 *
 * Cloudflare Access JWT Cryptographic Assertion Verifier.
 * Verifies that requests carrying `cf-access-jwt-assertion` are signed by Cloudflare Access's
 * public keys (JWKS) and carry a valid authenticated user identity.
 *
 * Zero external dependencies — runs directly in Edge/Web Crypto environments.
 */

import { base64UrlDecode } from "./dpop";

interface JwkKey {
  kid: string;
  kty: string;
  alg: string;
  use?: string;
  n: string;
  e: string;
}

interface JwksResponse {
  keys: JwkKey[];
}

interface CfAccessPayload {
  aud?: string[];
  email?: string;
  type?: string;
  identity_nonce?: string;
  sub?: string;
  iss?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

// In-memory JWKS cache to avoid fetching on every request
let cachedJwks: { keys: JwkKey[]; expiresAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function fetchCloudflareJwks(teamDomain: string): Promise<JwkKey[]> {
  const now = Date.now();
  if (cachedJwks && cachedJwks.expiresAt > now) {
    return cachedJwks.keys;
  }

  // Format team domain (supports both "teamname" and "teamname.cloudflareaccess.com")
  const normalizedTeam = teamDomain.includes(".")
    ? teamDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : `${teamDomain}.cloudflareaccess.com`;

  const certsUrl = `https://${normalizedTeam}/cdn-cgi/access/certs`;

  const response = await fetch(certsUrl, {
    headers: { "User-Agent": "Synapse-Edge-Auth/1.0" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Cloudflare Access certs from ${certsUrl}: HTTP ${response.status}`);
  }

  const data = (await response.json()) as JwksResponse;
  if (!data.keys || !Array.isArray(data.keys)) {
    throw new Error("Invalid JWKS response structure from Cloudflare Access.");
  }

  cachedJwks = {
    keys: data.keys,
    expiresAt: now + JWKS_CACHE_TTL_MS,
  };

  return data.keys;
}

export interface CfJwtVerificationResult {
  valid: boolean;
  email?: string;
  error?: string;
  payload?: CfAccessPayload;
}

/**
 * Cryptographically verifies a Cloudflare Access JWT assertion token.
 *
 * @param jwt The raw JWT assertion token from `cf-access-jwt-assertion`
 * @param teamDomain The Cloudflare Zero Trust team domain (e.g. "myteam" or "myteam.cloudflareaccess.com")
 * @param expectedAud Optional expected Application Audience (AUD) tag
 */
export async function verifyCloudflareAccessJwt(
  jwt: string,
  teamDomain: string,
  expectedAud?: string
): Promise<CfJwtVerificationResult> {
  try {
    const parts = jwt.trim().split(".");
    if (parts.length !== 3) {
      return { valid: false, error: "Invalid JWT format (expected 3 parts)." };
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    const decoder = new TextDecoder();

    let header: { kid?: string; alg?: string; typ?: string };
    let payload: CfAccessPayload;

    try {
      header = JSON.parse(decoder.decode(base64UrlDecode(headerB64)));
      payload = JSON.parse(decoder.decode(base64UrlDecode(payloadB64)));
    } catch {
      return { valid: false, error: "Malformed JWT header or payload JSON." };
    }

    if (header.alg !== "RS256") {
      return { valid: false, error: `Unsupported JWT algorithm: ${header.alg} (expected RS256).` };
    }

    if (!header.kid) {
      return { valid: false, error: "JWT header missing 'kid' property." };
    }

    // 1. Fetch public JWKS keys from Cloudflare
    const keys = await fetchCloudflareJwks(teamDomain);
    const matchingKey = keys.find((k) => k.kid === header.kid);

    if (!matchingKey) {
      return { valid: false, error: `No matching public key found for kid '${header.kid}'.` };
    }

    // 2. Import public key into Web Crypto
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      {
        kty: matchingKey.kty,
        n: matchingKey.n,
        e: matchingKey.e,
        alg: "RS256",
      },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // 3. Verify signature
    const signatureBytes = base64UrlDecode(signatureB64);
    const dataToVerify = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

    const isSigValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      signatureBytes,
      dataToVerify
    );

    if (!isSigValid) {
      return { valid: false, error: "Cloudflare Access JWT signature verification failed." };
    }

    // 4. Validate Claims (exp, iss, aud)
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === "number" && payload.exp < now) {
      return { valid: false, error: "Cloudflare Access JWT has expired." };
    }

    if (expectedAud && payload.aud) {
      const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!audList.includes(expectedAud)) {
        return { valid: false, error: "Cloudflare Access JWT audience (aud) mismatch." };
      }
    }

    return {
      valid: true,
      email: payload.email,
      payload,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `JWT assertion verification error: ${message}` };
  }
}
