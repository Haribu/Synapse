import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let profile = db.select().from(userProfiles).where(eq(userProfiles.id, "default")).get();

    if (!profile) {
      const now = new Date();
      db.insert(userProfiles)
        .values({
          id: "default",
          displayName: "Reader",
          bio: "Curator & deep reader",
          readingSpeedWpm: 230,
          defaultCategory: "All",
          obsidianVaultSubfolder: "01 - Inbox/Synapse",
          obsidianSaveMode: "markdown_with_assets",
          workDigestName: "Work",
          workDigestEmail: null,
          themePreference: "system",
          summaryStyle: "concise",
          createdAt: now,
          updatedAt: now,
        })
        .run();

      profile = db.select().from(userProfiles).where(eq(userProfiles.id, "default")).get();
    }

    return NextResponse.json({ success: true, profile });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      displayName,
      bio,
      readingSpeedWpm,
      defaultCategory,
      obsidianVaultSubfolder,
      obsidianSaveMode,
      workDigestName,
      workDigestEmail,
      themePreference,
      summaryStyle,
    } = body;

    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (typeof displayName === "string" && displayName.trim().length > 0) {
      updates.displayName = displayName.trim();
    }
    if (typeof bio === "string") {
      updates.bio = bio.trim();
    }
    if (typeof readingSpeedWpm === "number" && readingSpeedWpm >= 50 && readingSpeedWpm <= 1000) {
      updates.readingSpeedWpm = readingSpeedWpm;
    }
    if (typeof defaultCategory === "string") {
      updates.defaultCategory = defaultCategory.trim();
    }
    if (typeof obsidianVaultSubfolder === "string") {
      updates.obsidianVaultSubfolder = obsidianVaultSubfolder.trim();
    }
    if (typeof obsidianSaveMode === "string") {
      updates.obsidianSaveMode = obsidianSaveMode;
    }
    if (typeof workDigestName === "string" && workDigestName.trim().length > 0) {
      updates.workDigestName = workDigestName.trim();
    }
    if (typeof workDigestEmail === "string") {
      updates.workDigestEmail = workDigestEmail.trim() || null;
    } else if (workDigestEmail === null) {
      updates.workDigestEmail = null;
    }
    if (typeof themePreference === "string") {
      updates.themePreference = themePreference;
    }
    if (typeof summaryStyle === "string") {
      updates.summaryStyle = summaryStyle;
    }

    db.update(userProfiles).set(updates).where(eq(userProfiles.id, "default")).run();

    const updated = db.select().from(userProfiles).where(eq(userProfiles.id, "default")).get();

    return NextResponse.json({ success: true, profile: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
