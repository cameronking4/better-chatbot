import { getSession } from "auth/server";
import { chatRepository } from "lib/db/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { threadId } = await params;
  const thread = await chatRepository.selectThread(threadId);

  if (!thread) {
    return new Response("Thread not found", { status: 404 });
  }

  if (thread.userId !== session.user.id) {
    return new Response("Forbidden", { status: 403 });
  }

  const messages = await chatRepository.selectMessagesByThreadId(threadId);

  return Response.json({ messages });
}
