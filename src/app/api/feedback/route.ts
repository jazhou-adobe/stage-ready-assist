import { NextRequest, NextResponse } from "next/server";
import { sql as getSQL, ensureSchema } from "@/lib/db";
import type { FeedbackCategory, FeedbackEntry } from "@/lib/types";

const VALID_CATEGORIES: FeedbackCategory[] = ["bug", "feature", "general"];

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function GET() {
  try {
    await ensureSchema();
    const sql = getSQL();
    const rows = await sql`
      SELECT id, subject, category, message, submitted_at
      FROM feedbacks
      ORDER BY submitted_at DESC
    `;
    const entries: FeedbackEntry[] = rows.map((r) => ({
      id: r.id as string,
      subject: r.subject as string,
      category: r.category as FeedbackCategory,
      message: r.message as string,
      submittedAt: Number(r.submitted_at),
    }));
    return NextResponse.json(entries);
  } catch (err) {
    console.error("GET /api/feedback error:", err);
    return NextResponse.json({ error: "Failed to fetch feedback" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const subject = (body.subject ?? "").trim();
    const category = body.category as FeedbackCategory;
    const message = (body.message ?? "").trim();

    if (!subject || !message) {
      return NextResponse.json({ error: "subject and message are required" }, { status: 400 });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }

    await ensureSchema();
    const sql = getSQL();

    const id = makeId();
    const submittedAt = Date.now();

    await sql`
      INSERT INTO feedbacks (id, subject, category, message, submitted_at)
      VALUES (${id}, ${subject}, ${category}, ${message}, ${submittedAt})
    `;

    const entry: FeedbackEntry = { id, subject, category, message, submittedAt };
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    console.error("POST /api/feedback error:", err);
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }
}
