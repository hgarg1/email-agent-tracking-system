import { NextResponse } from "next/server";
import { deleteSession } from "@/src/lib/store";
import { getTokenFromRequest } from "@/src/lib/auth";

export async function POST(request: Request) {
  const token = getTokenFromRequest(request);
  if (token) {
    deleteSession(token);
  }
  return NextResponse.json({ ok: true });
}
