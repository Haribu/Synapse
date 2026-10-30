/**
 * src/lib/security/dpop.ts
 *
 * RFC 9449: OAuth 2.0 Demonstrating Proof-of-Possession (DPoP) at the Application Layer.
 * Provides asymmetric cryptographic proof-of-possession for API tokens, binding requests
 * to client-generated key pairs so stolen bearer tokens cannot be replayed from other hosts.
 *
 * Designed to run in standard Web Crypto environments (Next.js Middleware, Bun, Node.js 18+).
 */

export interface DPoPHeader {
  typ: string;
  alg: string;
  jwk: {
    kty: string;
    crv?: string;
    x?: string;
    y?: string;
    n?: string;
    e?: string;
    [key: string]: unknown;
  };
}

export interface DPoPPayload {
  jti: string;
  htm: string;
  htu: string;
  iat: number;
  ath?: string;
  [key: string]: unknown;
}

export interface DPoPVerificationResult {
  valid: boolean;
  thumbprint?: string;
  error?: string;
  payload?: DPoPPayload;
}

// Helpers for Base64URL encoding / decoding without external dependencies
export function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Computes RFC 7638 JSON Web Key (JWK) SHA-256 Thumbprint (jkt)
 */
export async function computeJwkThumbprint(jwk: DPoPHeader["jwk"]): Promise<string> {
  let canonicalJson = "";
  if (jwk.kty === "EC") {
    // RFC 7638: EC requires crv, kty, x, y in alphabetical order
    canonicalJson = JSON.stringify({
      crv: jwk.crv,
      kty: jwk.kty,
      x: jwk.x,
      y: jwk.y,
    });
  } else if (jwk.kty === "RSA") {
    // RFC 7638: RSA requires e, kty, n in alphabetical order
    canonicalJson = JSON.stringify({
      e: jwk.e,
      kty: jwk.kty,
      n: jwk.n,
    });
  } else {
    throw new Error(`Unsupported JWK kty: ${jwk.kty}`);
  }

  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(canonicalJson));
  return base64UrlEncode(hash);
}

/**
 * Verifies an RFC 9449 DPoP proof JWT.
 *
 * @param dpopProof The raw JWT from the `DPoP` HTTP header
 * @param expectedMethod The HTTP request method (e.g. "GET", "POST")
 * @param requestUrl The request URL or pathname to match against `htu`
 * @param maxAgeSeconds Maximum allowed clock skew / proof age in seconds (default: 120s)
 */
export async function verifyDPoPProof(
  dpopProof: string,
  expectedMethod: string,
  requestUrl: string,
  maxAgeSeconds = 120
): Promise<DPoPVerificationResult> {
  try {
    const parts = dpopProof.trim().split(".");
    if (parts.length !== 3) {
      return { valid: false, error: "DPoP proof must be a valid 3-part JWS." };
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    const decoder = new TextDecoder();

    let header: DPoPHeader;
    let payload: DPoPPayload;

    try {
      header = JSON.parse(decoder.decode(base64UrlDecode(headerB64)));
      payload = JSON.parse(decoder.decode(base64UrlDecode(payloadB64)));
    } catch {
      return { valid: false, error: "Malformed DPoP header or payload JSON." };
    }

    // 1. Verify typ header
    if (header.typ?.toLowerCase() !== "dpop+jwt") {
      return { valid: false, error: "Invalid typ header: must be 'dpop+jwt'." };
    }

    // 2. Verify jwk is present in header
    if (!header.jwk || typeof header.jwk !== "object" || !header.jwk.kty) {
      return { valid: false, error: "Missing or invalid embedded jwk in DPoP header." };
    }

    // 3. Supported algorithms: ES256 (P-256) and RS256
    let subtleAlg: RsaHashedImportParams | EcKeyImportParams;
    let verifyAlg: AlgorithmIdentifier | RsaPssParams | EcdsaParams;

    if (header.alg === "ES256" && header.jwk.kty === "EC" && header.jwk.crv === "P-256") {
      subtleAlg = { name: "ECDSA", namedCurve: "P-256" };
      verifyAlg = { name: "ECDSA", hash: { name: "SHA-256" } };
    } else if (header.alg === "RS256" && header.jwk.kty === "RSA") {
      subtleAlg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
      verifyAlg = { name: "RSASSA-PKCS1-v1_5" };
    } else {
      return {
        valid: false,
        error: `Unsupported algorithm ${header.alg} or key type ${header.jwk.kty}. Use ES256 or RS256.`,
      };
    }

    // 4. Import public key
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      header.jwk,
      subtleAlg,
      false,
      ["verify"]
    );

    // 5. Verify cryptographic signature
    const signatureBytes = base64UrlDecode(signatureB64);
    const dataToVerify = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

    const isSigValid = await crypto.subtle.verify(
      verifyAlg,
      publicKey,
      signatureBytes,
      dataToVerify
    );

    if (!isSigValid) {
      return { valid: false, error: "DPoP signature verification failed." };
    }

    // 6. Validate HTTP Method (htm)
    if (!payload.htm || payload.htm.toUpperCase() !== expectedMethod.toUpperCase()) {
      return {
        valid: false,
        error: `DPoP htm mismatch: expected ${expectedMethod.toUpperCase()}, got ${payload.htm}.`,
      };
    }

    // 7. Validate HTTP URI (htu)
    // Matches normalized pathname or full URL without query string
    const normalizedHtu = payload.htu?.split("?")[0]?.toLowerCase();
    const parsedTarget = requestUrl.split("?")[0]?.toLowerCase();

    const matchesUrl =
      normalizedHtu === parsedTarget ||
      parsedTarget.endsWith(normalizedHtu) ||
      (normalizedHtu.startsWith("http") && new URL(normalizedHtu).pathname === new URL(requestUrl, "http://localhost").pathname);

    if (!matchesUrl) {
      return {
        valid: false,
        error: `DPoP htu mismatch: expected matching path for ${requestUrl}, got ${payload.htu}.`,
      };
    }

    // 8. Validate Timestamp (iat)
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.iat !== "number" || Math.abs(now - payload.iat) > maxAgeSeconds) {
      return {
        valid: false,
        error: `DPoP proof expired or clock skew exceeded (${Math.abs(now - (payload.iat || 0))}s > ${maxAgeSeconds}s).`,
      };
    }

    const thumbprint = await computeJwkThumbprint(header.jwk);
    return {
      valid: true,
      thumbprint,
      payload,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `DPoP verification exception: ${message}` };
  }
}

/**
 * Creates an RFC 9449 DPoP proof for client applications (CLI, MCP server, agents).
 */
export async function createDPoPProof(
  keyPair: CryptoKeyPair,
  httpMethod: string,
  targetUrl: string
): Promise<string> {
  const exportedJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  
  // Clean public JWK (strip private/unneeded params)
  const publicJwk: DPoPHeader["jwk"] = {
    kty: exportedJwk.kty!,
    crv: exportedJwk.crv,
    x: exportedJwk.x,
    y: exportedJwk.y,
  };

  const header: DPoPHeader = {
    typ: "dpop+jwt",
    alg: "ES256",
    jwk: publicJwk,
  };

  const payload: DPoPPayload = {
    jti: crypto.randomUUID(),
    htm: httpMethod.toUpperCase(),
    htu: targetUrl.split("?")[0],
    iat: Math.floor(Date.now() / 1000),
  };

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    keyPair.privateKey,
    encoder.encode(signingInput)
  );

  const signatureB64 = base64UrlEncode(signature);
  return `${signingInput}.${signatureB64}`;
}

/**
 * Generates an in-memory client ECDSA keypair for DPoP.
 */
export async function generateDPoPKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}
