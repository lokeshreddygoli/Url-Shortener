import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      data: {
        status: "ok",
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      error: null,
    },
    { status: 200 }
  );
}
