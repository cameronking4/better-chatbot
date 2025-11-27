import { NextRequest, NextResponse } from "next/server";
import { getSession } from "auth/server";
import { apiKeyRepository } from "lib/db/repository";
import { z } from "zod";

const UpdateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const parsed = UpdateApiKeySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.errors },
        { status: 400 },
      );
    }

    const { name, expiresAt } = parsed.data;

    const updatedKey = await apiKeyRepository.update(id, session.user.id, {
      name,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    return NextResponse.json({
      key: {
        id: updatedKey.id,
        name: updatedKey.name,
        keyPrefix: updatedKey.keyPrefix,
        scopes: updatedKey.scopes,
        expiresAt: updatedKey.expiresAt,
        lastUsedAt: updatedKey.lastUsedAt,
        createdAt: updatedKey.createdAt,
        updatedAt: updatedKey.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating API key:", error);
    if (error instanceof Error && error.message === "API key not found") {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to update API key" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    await apiKeyRepository.revoke(id, session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error revoking API key:", error);
    return NextResponse.json(
      { error: "Failed to revoke API key" },
      { status: 500 },
    );
  }
}
