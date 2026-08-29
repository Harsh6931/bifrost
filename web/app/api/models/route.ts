import { NextRequest, NextResponse } from "next/server";
import { getModels, updateModel } from "@/lib/repositories/models";
import { z } from "zod";

const UpdateModelSchema = z.object({
  enabled: z.boolean().optional(),
  price_in_per_1m: z.number().positive().optional(),
  price_out_per_1m: z.number().positive().optional(),
  display_name: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const includeDisabled = searchParams.get("include_disabled") === "true";

  try {
    const models = await getModels(includeDisabled);
    return NextResponse.json({ models });
  } catch (error) {
    console.error("GET /api/models error:", error);
    return NextResponse.json(
      { error: "Failed to fetch models" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "Missing model id query parameter" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const parsed = UpdateModelSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const updated = await updateModel(id, parsed.data);

    if (!updated) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/models error:", error);
    return NextResponse.json(
      { error: "Failed to update model" },
      { status: 500 }
    );
  }
}
