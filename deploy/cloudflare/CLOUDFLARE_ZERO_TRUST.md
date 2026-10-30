# Cloudflare Zero Trust Lockdown & Remote PWA Guide

This comprehensive guide details how to securely expose your self-hosted **Synapse** instance to your mobile devices, tablets, and remote laptops via a secure custom domain (e.g. `read.yourdomain.com`) backed by enterprise Zero Trust security — **without opening a single inbound port on your home router**.

---

## 1. Architectural Model & Threat Defense

Synapse implements a defense-in-depth security model combining an encrypted outbound tunnel at the edge with cryptographic application-layer identity enforcement inside the container.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        REMOTE CLIENT / PWA                             │
│  • Mobile Safari / Chrome PWA                                          │
│  • Desktop Browser                                                     │
│  • Local AI Agents & MCP Clients                                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS (TLS 1.3)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE EDGE NETWORK                            │
│  • WebAuthn Hardware Passkeys (FaceID / TouchID / YubiKey)             │
│  • Magic Email One-Time PIN (OTP) or Google / GitHub OIDC              │
│  • Cloudflare Access Edge Policy Evaluation                            │
│  • Session Cookie Generation (1-month persistent PWA lifetime)         │
│  • Injects identity: Cf-Access-Authenticated-User-Email                │
│  • Injects cryptographic signature: Cf-Access-Jwt-Assertion            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Outbound Encrypted QUIC/TLS Tunnel
                                    │ (0 Inbound Router Ports Required)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       LOCAL DOCKER HOST                                │
│  • cloudflared daemon / container                                      │
│  • Forwards sanitized HTTP traffic to container port 3000              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Internal Docker Bridge Network
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       SYNAPSE CONTAINER (port 3000)                    │
│  • src/middleware.ts:                                                  │
│    1. Anti-Spoof Guard: Blocks localhost spoofing if cf-* headers exist│
│    2. API Key Check: Constant-time validation on SYNAPSE_API_KEY       │
│    3. Email Whitelist: Checks Cf-Access email against ALLOWED_EMAILS   │
│    4. Security Headers: nosniff, SAMEORIGIN, strict referrer-policy   │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Security Guarantees:
- **Zero Inbound Open Ports:** Your home router never opens ports (e.g. 80, 443, 3000) to the public internet. The `cloudflared` daemon establishes an encrypted outbound connection directly to the nearest Cloudflare data center.
- **DDoS & IP Masking:** Your origin home IP address is completely invisible. Public DNS points solely to Cloudflare's Anycast edge.
- **Dual-Layer Enforcement (Edge + App):** Even if an attacker were to bypass edge routing or join the local Docker network, Synapse's internal `src/middleware.ts` independently verifies `Cf-Access-Authenticated-User-Email` against `ALLOWED_EMAILS`.
- **Anti-Spoofing Loopback Shield:** Synapse inspects incoming headers. If external proxy headers (`cf-ray`, `cf-connecting-ip`, `x-forwarded-for`) are present on a request claiming to be `localhost`, Synapse denies local loopback privileges and forces full Cloudflare Access verification.

---

## 2. Cloudflare Zero Trust Setup Walkthrough

### Step A: Create the Cloudflare Tunnel (`cloudflared`)

1. Open the **[Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)**.
2. In the sidebar, navigate to **Networks** ➔ **Tunnels** and click **Create a tunnel**.
3. Select **Cloudflared** connector and give it a descriptive name (e.g., `synapse-home-tunnel`). Click **Save tunnel**.
4. Cloudflare will display your tunnel token. Save this token — you will use it as `CLOUDFLARE_TUNNEL_TOKEN`.
5. Under the **Public Hostnames** tab of your tunnel configuration:
   - **Subdomain:** `read` (or `synapse`)
   - **Domain:** `yourdomain.com` (your Cloudflare-managed domain)
   - **Path:** leave blank
   - **Service Type:** `HTTP`
   - **URL:** `synapse:3000` (when running `cloudflared` inside Docker Compose) or `localhost:3005` (if running host `cloudflared` pointing to mapped port).
6. Click **Save hostname**.

---

### Step B: Configure the Zero Trust Access Application

1. In the Zero Trust dashboard sidebar, go to **Access** ➔ **Applications** and click **Add an application**.
2. Select **Self-hosted**.
3. Configure **Application Configuration**:
   - **Application Name:** `Synapse Reader`
   - **Session Duration:** Select **1 month** (essential for seamless mobile PWA use so you do not have to re-authenticate daily).
   - **Application Domain:** `read.yourdomain.com`
4. Configure **Identity Providers**:
   - Enable your preferred authentication methods: **One-Time PIN (Email OTP)**, **WebAuthn (Passkeys)**, **GitHub**, or **Google Workspace**.
5. Configure **Access Policies** (click **Add a policy**):
   - **Policy Name:** `Allow Authorized Readers`
   - **Action:** `Allow`
   - **Session Duration:** Same as application (1 month)
   - **Include Rules:**
     - Selector: `Emails`
     - Value: `your-email@domain.com` (matches what you put in `ALLOWED_EMAILS`).
6. Click **Save policy**, then click **Add application** at the bottom.

---

### Step C: Configure Synapse Environment Variables

In your `docker-compose.override.yml` (or `.env`):

```yaml
services:
  synapse:
    environment:
      # Enable Cloudflare Access validation
      - AUTH_MODE=cloudflare
      # Whitelist of allowed emails matching Cloudflare Access policy
      - ALLOWED_EMAILS=your-email@domain.com,partner@domain.com
      # Secure secret for programmatic API access (Agents & MCP)
      - SYNAPSE_API_KEY=your-secure-random-64-char-string
```

When `AUTH_MODE=cloudflare` is set, Synapse will inspect `Cf-Access-Authenticated-User-Email` on every non-API request. If the email is missing or not present in `ALLOWED_EMAILS`, Synapse returns an immediate `HTTP 403 Forbidden`.

---

## 3. Docker Compose Sidecar Deployment

You can run `cloudflared` as an automated sidecar service directly within Synapse's Docker Compose stack.

Edit your `docker-compose.override.yml`:

```yaml
services:
  synapse:
    environment:
      - AUTH_MODE=cloudflare
      - ALLOWED_EMAILS=you@yourdomain.com
      - SYNAPSE_API_KEY=${SYNAPSE_API_KEY}

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - default
    depends_on:
      - synapse
```

Then start the stack:
```bash
docker compose up -d
```

The `cloudflared` container boots, connects outbound to Cloudflare, and securely routes incoming traffic to `http://synapse:3000`.

---

## 4. Mobile PWA Installation & Session Persistence

Synapse is built as a progressive web application with offline reading capabilities and touch triage gestures.

### Why `crossOrigin="use-credentials"` Matters
Cloudflare Access sets an `HttpOnly`, `Secure` cookie (`CF_Authorization`) upon successful authentication. By default, browser manifest link tags omit credentials on subresource requests. Synapse explicitly includes `crossOrigin="use-credentials"` on its `<link rel="manifest">` in [layout.tsx](file:///Users/harrymclaren/Projects/Synapse/src/app/layout.tsx), ensuring iOS and Android can download `manifest.json` and web app icons through the Cloudflare Access barrier.

### Installing on iOS (Safari)
1. Navigate to `https://read.yourdomain.com` in Safari.
2. Complete your Cloudflare Access authentication (Passkey or Email OTP).
3. Once Synapse loads, tap the **Share** button in the Safari toolbar.
4. Scroll down and select **Add to Home Screen**.
5. Tap **Add** in the top-right corner.
6. Launch Synapse from your iOS home screen. It will open in standalone fullscreen mode without Safari URL bars or browser chrome.

### Installing on Android (Chrome)
1. Navigate to `https://read.yourdomain.com` in Chrome.
2. Complete Cloudflare Access authentication.
3. Tap the three dots menu (⋮) in the top-right corner.
4. Select **Install app** or **Add to Home screen**.
5. Launch Synapse from your app launcher.

---

## 5. Machine-to-Machine & AI Agent Authentication

When using AI agents (Antigravity, Claude Desktop, Cursor) or external scripts to interact with your Synapse instance, you have two options depending on your network topology:

### Option 1: Direct App API Key (`SYNAPSE_API_KEY`) & DPoP (RFC 9449)
Synapse's middleware inspects `Authorization: Bearer <key>` and `x-api-key: <key>` headers. When a valid pre-shared key is provided, the request is authenticated via constant-time string comparison, bypassing interactive Cloudflare Access email challenges.

#### Cryptographic Token Binding via DPoP (RFC 9449)
To prevent stolen API keys from being replayed from untrusted environments, Synapse natively supports **DPoP (Demonstrating Proof-of-Possession)**:
1. When an agent or script passes a `DPoP: <jwt>` header alongside the Bearer token, Synapse validates the asymmetric proof (HTTP method, target URI, timestamp, and client key thumbprint).
2. The bundled Synapse MCP server supports DPoP out of the box via the `--dpop` CLI flag or `SYNAPSE_DPOP=true` environment variable:

```json
{
  "mcpServers": {
    "synapse": {
      "command": "bun",
      "args": ["run", "mcp", "--dpop"],
      "env": {
        "SYNAPSE_URL": "https://read.yourdomain.com",
        "SYNAPSE_API_KEY": "your-secure-random-64-char-string",
        "SYNAPSE_DPOP": "true"
      }
    }
  }
}
```

---

## 6. Tier 3: 1-Tap Biometric Passkey Login (Google / GitHub SSO)

For enterprise-grade hardware binding on Cloudflare Zero Trust's free tier, leverage **FIDO2 Passkeys (WebAuthn Discoverable Credentials)** via Google or GitHub SSO. 

*(Note: Custom root CA mTLS uploads require Cloudflare Access Enterprise. WebAuthn Passkeys provide equivalent hardware-backed cryptographic protection using your device's Secure Enclave, Android StrongBox, or Windows TPM with zero cost and no certificate expiration maintenance).*

### Step 1: Connect Identity Provider in Cloudflare
1. In Cloudflare Zero Trust, navigate to **Settings ➔ Authentication**.
2. Under **Login methods**, add **Google** (or **GitHub**).
3. Paste your OAuth Client ID and Secret with the callback URL:
   `https://<your-team>.cloudflareaccess.com/cdn-cgi/access/callback`

### Step 2: Enforce Hardware MFA in Zero Trust
1. In **Settings ➔ Authentication ➔ Multi-factor authentication (MFA)**:
   - Enable **Biometrics** (Touch ID, Face ID, Android fingerprint).
   - Enable **FIDO2 / Security Keys** (YubiKey).
   - Keep software authenticator apps (TOTP) **Off** for phishing resistance.
2. In your Access Application, set Session Duration to **1 month** for frictionless mobile PWA use.

### Step 3: Application-Layer Cryptographic Defense
In your `docker-compose.override.yml` (or `.env`), configure container-level attestation:
```yaml
environment:
  - AUTH_MODE=cloudflare
  - ALLOWED_EMAILS=your-email@gmail.com
  - CF_ACCESS_TEAM_NAME=your-team-domain
```
Synapse will independently fetch Cloudflare's JWKS and verify edge cryptographic signatures (`Cf-Access-Jwt-Assertion`) against your email whitelist.

---

## 7. Troubleshooting & Diagnostics

| Symptom | Cause | Remediation |
| :--- | :--- | :--- |
| `HTTP 403 Forbidden: Access restricted to authorized users` | Authenticated email does not match `ALLOWED_EMAILS`. | Ensure the email logged in via Cloudflare Access matches `ALLOWED_EMAILS` in `docker-compose.override.yml` exactly (case-insensitive). |
| Continuous redirect loop to Cloudflare login | Session expired or third-party cookies blocked. | Set Access Application **Session Duration** to `1 month`. Ensure browser allows first-party cookies for your domain. |
| PWA "Add to Home Screen" does not install as standalone app | Manifest request blocked by Access. | Verify [layout.tsx](file:///Users/harrymclaren/Projects/Synapse/src/app/layout.tsx) includes `crossOrigin="use-credentials"` on the manifest link. |
| Embedded images fail to load inside articles | Third-party image CDN blocks referrers from custom domain. | Synapse automatically injects `<meta name="referrer" content="no-referrer">` into the document head and strips external referrers. |
| AI Agent receives `401 Unauthorized` | Invalid or missing `SYNAPSE_API_KEY`. | Verify `SYNAPSE_API_KEY` matches between client config and Synapse container environment. |
