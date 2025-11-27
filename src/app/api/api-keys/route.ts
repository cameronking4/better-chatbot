import { getSession } from "auth/server";
import { apiKeyRepository } from "@/lib/db/repository";
import { z } from "zod";

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().nullable().optional(),
  rateLimit: z.number().int().positive().nullable().optional(),
});

export async function GET() {
  try {
    const session = await getSession();

    if (!session?.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKeys = await apiKeyRepository.selectApiKeysByUserId(
      session.user.id,
    );

    return Response.json(apiKeys);
  } catch (error: any) {
    console.error("Failed to fetch API keys:", error);
    return Response.json(
      { error: error.message || "Failed to fetch API keys" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session?.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = CreateApiKeySchema.parse(body);

    const result = await apiKeyRepository.insertApiKey(session.user.id, {
      name: data.name,
      expiresAt: data.expiresAt ?? null,
      rateLimit: data.rateLimit ?? null,
    });

    // Return the key value only once
    return Response.json({
      id: result.id,
      key: result.key,
      name: data.name,
      createdAt: new Date().toISOString(),
      expiresAt: data.expiresAt ?? null,
      rateLimit: data.rateLimit ?? null,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 },
      );
    }

    console.error("Failed to create API key:", error);
    return Response.json(
      { error: error.message || "Failed to create API key" },
      { status: 500 },
    );
  }
}
