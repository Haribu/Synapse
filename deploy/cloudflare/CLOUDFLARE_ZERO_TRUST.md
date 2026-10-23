# Cloudflare Zero Trust Lockdown Guide for Synapse

This guide details how to expose Synapse securely to your mobile devices and remote laptops with Zero Trust authentication, requiring zero open router ports.

---

## 1. Architecture & Threat Model

```
Mobile / Laptop (Remote)
       │
       ▼ (HTTPS with Cloudflare Access Edge Policy)
Cloudflare Edge Network
       │
       │  [Encrypted Outbound-Only Tunnel (No router ports open)]
       ▼
Host Server (Docker: synapse-reader on port 3000)
       │
       ▼ (Validates Cf-Access-Authenticated-User-Email header)
Synapse Application
```

- **Zero Inbound Router Ports:** Your home router opens 0 ports.
- **Identity Gated:** Only authorized user emails with One-Time Pin (OTP) or Hardware Passkeys can reach the container.
- **Application-Layer Validation:** When `AUTH_MODE=cloudflare` is enabled in Synapse, `src/middleware.ts` inspects incoming `Cf-Access-Authenticated-User-Email` and rejects unauthorized traffic.

---

## 2. Setup Guide

1. Open **[Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)**.
2. Navigate to **Networks** ➔ **Tunnels** ➔ click **Create Tunnel**.
3. Under **Public Hostnames**, click **Add a public hostname**:
   - **Subdomain:** `synapse`
   - **Domain:** `yourdomain.com`
   - **Type:** `HTTP`
   - **URL:** `localhost:3000` (or `synapse:3000` if `cloudflared` runs in the same Docker network)
4. Navigate to **Access** ➔ **Applications** ➔ **Add an application**:
   - **Type:** Self-hosted
   - **Application Name:** `Synapse Reader`
   - **Application Domain:** `synapse.yourdomain.com`
   - **Session Duration:** 1 month (or desired duration for mobile PWA use)
5. Under **Policies**:
   - **Policy Name:** `Allow Authorized Users`
   - **Action:** `Allow`
   - **Include Rule:** `Emails` ➔ enter your allowed email addresses.
6. Configure Synapse `.env`:
   ```bash
   AUTH_MODE=cloudflare
   ALLOWED_EMAILS=user@yourdomain.com
   ```
7. Save and deploy.
