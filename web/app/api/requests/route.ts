import { NextRequest, NextResponse } from "next/server";
import { getRequests } from "@/lib/repositories/requests";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const perPage = Math.min(
    500,
    Math.max(1, parseInt(searchParams.get("per_page") ?? "50", 10))
  );
  const modelFilter = searchParams.get("model") ?? undefined;

  try {
    const data = await getRequests(page, perPage, modelFilter);
    return NextResponse.json({
      requests: data.requests,
      total: data.total,
      page,
      per_page: perPage,
    });
  } catch (error) {
    console.error("GET /api/requests error:", error);
    return NextResponse.json(
      { error: "Failed to fetch requests" },
      { status: 500 }
    );
  }
}
