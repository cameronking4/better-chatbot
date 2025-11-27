import { getSession } from "auth/server";
import { apiKeyRepository } from "@/lib/db/repository";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();

    if (!session?.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await apiKeyRepository.rotateApiKey(id, session.user.id);

    // Return the new key value only once
    return Response.json({
      id: result.id,
      key: result.key,
    });
  } catch (error: any) {
    if (error.message === "API key not found") {
      return Response.json({ error: "API key not found" }, { status: 404 });
    }

    console.error("Failed to rotate API key:", error);
    return Response.json(
      { error: error.message || "Failed to rotate API key" },
      { status: 500 },
    );
  }
}
