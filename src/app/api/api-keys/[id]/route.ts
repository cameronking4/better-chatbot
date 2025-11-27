import { getSession } from "auth/server";
import { apiKeyRepository } from "@/lib/db/repository";
import { z } from "zod";
import { hasAdminPermission } from "@/lib/auth/permissions";

const UpdateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  rateLimit: z.number().int().positive().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();

    if (!session?.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const apiKey = await apiKeyRepository.selectApiKeyById(id, session.user.id);

    // Allow admins to view any key
    if (!apiKey) {
      const isAdmin = await hasAdminPermission();
      if (isAdmin) {
        // Admin can view any key - need to query differently
        // For now, return 404 if not found
        return Response.json({ error: "API key not found" }, { status: 404 });
      }
      return Response.json({ error: "API key not found" }, { status: 404 });
    }

    return Response.json(apiKey);
  } catch (error: any) {
    console.error("Failed to fetch API key:", error);
    return Response.json(
      { error: error.message || "Failed to fetch API key" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();

    if (!session?.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = UpdateApiKeySchema.parse(body);

    const apiKey = await apiKeyRepository.updateApiKey(id, session.user.id, {
      name: data.name,
      expiresAt: data.expiresAt ?? undefined,
      rateLimit: data.rateLimit ?? undefined,
    });

    return Response.json(apiKey);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 },
      );
    }

    if (error.message === "API key not found") {
      return Response.json({ error: "API key not found" }, { status: 404 });
    }

    console.error("Failed to update API key:", error);
    return Response.json(
      { error: error.message || "Failed to update API key" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();

    if (!session?.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await apiKeyRepository.deleteApiKey(id, session.user.id);

    return Response.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete API key:", error);
    return Response.json(
      { error: error.message || "Failed to delete API key" },
      { status: 500 },
    );
  }
}
