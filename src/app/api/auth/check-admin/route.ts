import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";

export async function GET() {
  const admin = await isAdmin();
  return NextResponse.json({ isAdmin: admin }, { status: admin ? 200 : 403 });
}
