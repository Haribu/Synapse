import { NextResponse } from "next/server";
import { isVaultConfigured, getVaultPath } from "@/lib/services/obsidian-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const vaultConfigured = isVaultConfigured();
    const vaultPath = getVaultPath();
    const hasGoogleAuth = Boolean(
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_OAUTH_ACCESS_TOKEN
    );
    const authMode = (process.env.AUTH_MODE || "none").toLowerCase();
    const hasAllowedEmails = Boolean(
      process.env.ALLOWED_EMAILS && process.env.ALLOWED_EMAILS.trim().length > 0
    );

    return NextResponse.json({
      success: true,
      obsidian: {
        configured: vaultConfigured,
        path: vaultConfigured ? vaultPath : null,
      },
      googleDocs: {
        configured: hasGoogleAuth,
      },
      auth: {
        mode: authMode,
        hasWhitelist: hasAllowedEmails,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
