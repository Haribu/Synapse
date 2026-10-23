# Cloudflare Zero Trust Lockdown & Remote PWA Guide

This guide details how to expose your self-hosted **Synapse** instance to your mobile devices, tablets, and remote laptops via a secure custom subdomain (e.g. `read.yourdomain.com`) with enterprise Zero Trust authentication — **without opening a single port on your home router**.

---

## 1. Architecture & Threat Model

```
📱 Mobile / Laptop (Remote PWA)
       │
       ▼ (HTTPS with Hardware Passkeys / Email OTP)
☁️ Cloudflare Edge Network (Zero Trust Access Policy)
       │
       │  [Encrypted Outbound-Only Tunnel — 0 Inbound Router Ports]
       ▼
🖥️ Host Server (cloudflared daemon / container)
       │
       ▼ (Passes signed Cf-Access-Authenticated-User-Email header)
🐳 Synapse Container (port 3000)
```

- **Zero Inbound Router Ports:** Your home network remains 100% closed to the public internet. No port forwarding, dynamic DNS, or exposed IP addresses.
- **Biometric & OTP Gated:** Access is protected by Cloudflare Access edge policies using WebAuthn hardware passkeys (FaceID / TouchID) or magic email one-time pins.
- **Application-Layer Validation:** When `AUTH_MODE=cloudflare` is enabled in Synapse, `src/middleware.ts` cryptographically inspects incoming `Cf-Access-Authenticated-User-Email` headers and rejects unauthenticated traffic.
- **Service Token Authentication:** Local and remote AI agents authenticate directly using pre-shared `SYNAPSE_API_KEY` credentials via `Authorization: Bearer <token>` or `x-api-key` headers.

---

## 2. Cloudflare Zero Trust Setup Walkthrough

### Step A: Create an Outbound Tunnel

1. Log into the **[Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)**.
2. Navigate to **Networks** ➔ **Tunnels** ➔ click **Create Tunnel**.
3. Choose **Cloudflared** as the connector type and name it (e.g., `synapse-tunnel`).
4. Follow the instructions to install the connector on your host machine, or run it via Docker Compose (see Section 3 below).
5. Under **Public Hostnames**, configure:
   - **Subdomain:** `read` (or `synapse`)
   - **Domain:** `yourdomain.com`
   - **Type:** `HTTP`
   - **URL:** `localhost:3000` (or `http://synapse:3000` if on the same Docker network).

### Step B: Configure the Zero Trust Access Application

1. In the Zero Trust dashboard, go to **Access** ➔ **Applications** ➔ click **Add an application**.
2. Select **Self-hosted**.
3. Configure the application details:
   - **Application Name:** `Synapse Reading Sanctuary`
   - **Application Domain:** `read.yourdomain.com`
   - **Session Duration:** Select **1 month** (crucial for frictionless mobile PWA use so you stay logged in).
4. Under **Policies**, click **Add a policy**:
   - **Policy Name:** `Allow Personal Devices`
   - **Action:** `Allow`
   - **Include Rule:** Selector `Emails` ➔ Enter your authorized personal email address.
5. Under **Authentication**, enable your preferred identity providers (One-Time PIN, GitHub, Google, or WebAuthn Passkeys).

---

## 3. Docker Compose with Cloudflared Sidecar (Optional)

You can run `cloudflared` directly alongside Synapse in your `docker-compose.override.yml`:

```yaml
services:
  synapse:
    environment:
      - AUTH_MODE=cloudflare
      - ALLOWED_EMAILS=you@yourdomain.com
      - SYNAPSE_API_KEY=your-secure-random-api-key

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - synapse
```

---

## 4. Mobile PWA Installation (iOS & Android)

Once your custom subdomain (`https://read.yourdomain.com`) is live:

### On iOS (Safari)
1. Open `https://read.yourdomain.com` in Safari.
2. Complete your Cloudflare Access authentication (Passkey or Email OTP).
3. Tap the **Share** button (box with upward arrow) in the toolbar.
4. Scroll down and tap **Add to Home Screen**.
5. Tap **Add** in the top right corner.
6. Launch Synapse from your home screen. It will open as a fullscreen, standalone application with zero browser chrome, touch swipe gestures, and offline reading support.

### On Android (Chrome)
1. Open `https://read.yourdomain.com` in Chrome.
2. Complete Cloudflare Access authentication.
3. Tap the three dots menu in the top right.
4. Tap **Install app** or **Add to Home screen**.
5. Launch Synapse from your app drawer.

---

## 5. Connecting AI Agents to Remote Synapse

When running local AI tools (Antigravity, Claude Desktop, Cursor) that need to connect to your remote Synapse instance:

Configure your MCP config (`claude_desktop_config.json` or `antigravity.json`):

```json
{
  "mcpServers": {
    "synapse": {
      "command": "bun",
      "args": ["run", "mcp"],
      "env": {
        "SYNAPSE_URL": "https://read.yourdomain.com",
        "SYNAPSE_API_KEY": "your-secure-random-api-key"
      }
    }
  }
}
```

The MCP server automatically passes the `SYNAPSE_API_KEY` in the `Authorization: Bearer` header, which Synapse's middleware validates, granting secure API access while blocking unauthorized web traffic.
