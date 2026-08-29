import { NextRequest, NextResponse } from "next/server";
import { getStatsTimeseries } from "@/lib/repositories/analytics";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawDays = searchParams.get("days");
  const parsedDays = rawDays ? Number.parseInt(rawDays, 10) : 30;
  const days = Number.isFinite(parsedDays) ? parsedDays : 30;

  try {
    const timeseries = await getStatsTimeseries(days);
    return NextResponse.json(timeseries);
  } catch (error) {
    console.error("GET /api/stats/timeseries error:", error);
    return NextResponse.json(
      { error: "Failed to fetch timeseries" },
      { status: 500 }
    );
  }
}
