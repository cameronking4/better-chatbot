import { getSession } from "auth/server";
import { scheduledTaskRepository } from "@/lib/db/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  try {
    // Check if task exists and belongs to user
    const task = await scheduledTaskRepository.selectScheduledTask(
      id,
      session.user.id,
    );

    if (!task) {
      return new Response("Not Found", { status: 404 });
    }

    // Get execution history
    const history = await scheduledTaskRepository.selectExecutionHistory(id);

    return Response.json(history);
  } catch (error) {
    console.error("Failed to fetch execution history:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
