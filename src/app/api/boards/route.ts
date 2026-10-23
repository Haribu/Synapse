import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { boards, boardItems } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allBoards = db.select().from(boards).orderBy(desc(boards.createdAt)).all();
    return NextResponse.json({ boards: allBoards });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description, color, icon } = body;

    if (!name) {
      return NextResponse.json({ error: "Board name is required" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = new Date();

    const newBoard = {
      id,
      name,
      description: description || null,
      color: color || "#3B82F6",
      icon: icon || "bookmark",
      createdAt: now,
    };

    db.insert(boards).values(newBoard).run();

    return NextResponse.json({ success: true, board: newBoard });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
