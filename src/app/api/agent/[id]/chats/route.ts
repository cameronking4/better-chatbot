import { getSession } from "auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { ChatThreadTable, ChatMessageTable } from "lib/db/pg/schema.pg";
import { eq, and, desc, sql } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const { id: agentId } = await params;

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Get URL search params for filtering
  const url = new URL(req.url);
  const searchQuery = url.searchParams.get("search") || "";

  // Query to get threads that have messages from the specified agent
  const threadsWithAgent = await db
    .select({
      threadId: ChatThreadTable.id,
      title: ChatThreadTable.title,
      createdAt: ChatThreadTable.createdAt,
      userId: ChatThreadTable.userId,
      lastMessageAt: sql<string>`MAX(${ChatMessageTable.createdAt})`.as(
        "last_message_at",
      ),
    })
    .from(ChatThreadTable)
    .innerJoin(
      ChatMessageTable,
      eq(ChatThreadTable.id, ChatMessageTable.threadId),
    )
    .where(
      and(
        eq(ChatThreadTable.userId, session.user.id),
        sql`${ChatMessageTable.metadata}->>'agentId' = ${agentId}`,
      ),
    )
    .groupBy(
      ChatThreadTable.id,
      ChatThreadTable.title,
      ChatThreadTable.createdAt,
      ChatThreadTable.userId,
    )
    .orderBy(desc(sql`MAX(${ChatMessageTable.createdAt})`));

  // Filter by search query if provided
  const filteredThreads = searchQuery
    ? threadsWithAgent.filter((thread) =>
        thread.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : threadsWithAgent;

  return Response.json(
    filteredThreads.map((row) => ({
      id: row.threadId,
      title: row.title,
      userId: row.userId,
      createdAt: row.createdAt,
      lastMessageAt: row.lastMessageAt
        ? new Date(row.lastMessageAt).getTime()
        : 0,
    })),
  );
}
