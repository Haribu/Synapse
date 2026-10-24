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

### Option 1: Direct App API Key (`SYNAPSE_API_KEY`)
Synapse's middleware inspects `Authorization: Bearer <key>` and `x-api-key: <key>` headers. When a valid pre-shared key is provided, the request is authenticated via constant-time string comparison, bypassing interactive Cloudflare Access email challenges.

Configure your MCP config (`claude_desktop_config.json` or `antigravity.json`):
```json
{
  "mcpServers": {
    "synapse": {
      "command": "bun",
      "args": ["run", "mcp"],
      "env": {
        "SYNAPSE_URL": "https://read.yourdomain.com",
        "SYNAPSE_API_KEY": "your-secure-random-64-char-string"
      }
    }
  }
}
```

### Option 2: Cloudflare Access Service Tokens (Edge Bypass)
If you require machine requests to pass through Cloudflare Edge without an interactive browser login:
1. In the Zero Trust dashboard, go to **Access** ➔ **Service Credentials** ➔ click **Add a Service Credential**.
2. Name it (e.g., `synapse-agent-token`) and set a duration.
3. Cloudflare will generate a **Client ID** and **Client Secret**.
4. In your Zero Trust Application Policy, add a policy with Action: **Non Identity** / **Service Auth** matching this Service Credential.
5. In your agent client or script, pass the edge headers alongside your Synapse API key:
   - `CF-Access-Client-Id: <CLIENT_ID>`
   - `CF-Access-Client-Secret: <CLIENT_SECRET>`
   - `Authorization: Bearer <SYNAPSE_API_KEY>`

---

## 6. Troubleshooting & Diagnostics

| Symptom | Cause | Remediation |
| :--- | :--- | :--- |
| `HTTP 403 Forbidden: Access restricted to authorized users` | Authenticated email does not match `ALLOWED_EMAILS`. | Ensure the email logged in via Cloudflare Access matches `ALLOWED_EMAILS` in `docker-compose.override.yml` exactly (case-insensitive). |
| Continuous redirect loop to Cloudflare login | Session expired or third-party cookies blocked. | Set Access Application **Session Duration** to `1 month`. Ensure browser allows first-party cookies for your domain. |
| PWA "Add to Home Screen" does not install as standalone app | Manifest request blocked by Access. | Verify [layout.tsx](file:///Users/harrymclaren/Projects/Synapse/src/app/layout.tsx) includes `crossOrigin="use-credentials"` on the manifest link. |
| Embedded images fail to load inside articles | Third-party image CDN blocks referrers from custom domain. | Synapse automatically injects `<meta name="referrer" content="no-referrer">` into the document head and strips external referrers. |
| AI Agent receives `401 Unauthorized` | Invalid or missing `SYNAPSE_API_KEY`. | Verify `SYNAPSE_API_KEY` matches between client config and Synapse container environment. |
