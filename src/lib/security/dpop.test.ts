import { describe, it, expect } from "bun:test";
import {
  generateDPoPKeyPair,
  createDPoPProof,
  verifyDPoPProof,
  computeJwkThumbprint,
  base64UrlEncode,
} from "./dpop";

describe("DPoP (RFC 9449) Proof Verification", () => {
  it("generates a keypair, signs a valid proof, and successfully verifies it", async () => {
    const keyPair = await generateDPoPKeyPair();
    const url = "https://read.example.com/api/items";
    const method = "GET";

    const proof = await createDPoPProof(keyPair, method, url);
    expect(proof).toBeString();
    expect(proof.split(".").length).toBe(3);

    const result = await verifyDPoPProof(proof, method, url);
    expect(result.valid).toBe(true);
    expect(result.thumbprint).toBeString();
    expect(result.payload?.htm).toBe("GET");
    expect(result.payload?.htu).toBe(url);
  });

  it("verifies path-only URLs and matches case-insensitively for method", async () => {
    const keyPair = await generateDPoPKeyPair();
    const proof = await createDPoPProof(keyPair, "post", "/api/items/123/obsidian");

    const result = await verifyDPoPProof(proof, "POST", "/api/items/123/obsidian");
    expect(result.valid).toBe(true);
    expect(result.payload?.htm).toBe("POST");
  });

  it("rejects proof when HTTP method mismatches", async () => {
    const keyPair = await generateDPoPKeyPair();
    const proof = await createDPoPProof(keyPair, "GET", "/api/items");

    const result = await verifyDPoPProof(proof, "POST", "/api/items");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("DPoP htm mismatch");
  });

  it("rejects proof when target URI mismatches", async () => {
    const keyPair = await generateDPoPKeyPair();
    const proof = await createDPoPProof(keyPair, "GET", "/api/items");

    const result = await verifyDPoPProof(proof, "GET", "/api/feeds");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("DPoP htu mismatch");
  });

  it("rejects expired proofs", async () => {
    const keyPair = await generateDPoPKeyPair();
    const proof = await createDPoPProof(keyPair, "GET", "/api/items");

    // Test with maxAgeSeconds: -1 to simulate expiration
    const result = await verifyDPoPProof(proof, "GET", "/api/items", -1);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired or clock skew exceeded");
  });

  it("rejects tampered proofs where payload was modified after signing", async () => {
    const keyPair = await generateDPoPKeyPair();
    const proof = await createDPoPProof(keyPair, "GET", "/api/items");
    const [headerB64, payloadB64, sigB64] = proof.split(".");

    // Tamper with the payload
    const decodedPayload = JSON.parse(new TextDecoder().decode(Buffer.from(payloadB64, "base64")));
    decodedPayload.htm = "DELETE";
    const tamperedPayloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(decodedPayload)));

    const tamperedProof = `${headerB64}.${tamperedPayloadB64}.${sigB64}`;
    const result = await verifyDPoPProof(tamperedProof, "DELETE", "/api/items");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("signature verification failed");
  });

  it("computes deterministic RFC 7638 JWK thumbprints", async () => {
    const keyPair = await generateDPoPKeyPair();
    const exportedJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

    const thumbprint1 = await computeJwkThumbprint({
      kty: exportedJwk.kty!,
      crv: exportedJwk.crv,
      x: exportedJwk.x,
      y: exportedJwk.y,
    });

    const thumbprint2 = await computeJwkThumbprint({
      kty: exportedJwk.kty!,
      crv: exportedJwk.crv,
      x: exportedJwk.x,
      y: exportedJwk.y,
    });

    expect(thumbprint1).toBe(thumbprint2);
    expect(thumbprint1.length).toBeGreaterThan(10);
  });
});
