import { getSession } from "auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { ChatThreadTable, ChatMessageTable } from "lib/db/pg/schema.pg";
import { eq, and, sql, ilike } from "drizzle-orm";

export async function GET(req: Request) {
  const session = await getSession();

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const searchQuery = url.searchParams.get("q") || "";

  if (!searchQuery.trim()) {
    return Response.json([]);
  }

  const searchTerm = `%${searchQuery.trim()}%`;

  // Search threads by title
  const threadsByTitle = await db
    .select({
      threadId: ChatThreadTable.id,
      title: ChatThreadTable.title,
      createdAt: ChatThreadTable.createdAt,
      userId: ChatThreadTable.userId,
      lastMessageAt: sql<string>`MAX(${ChatMessageTable.createdAt})`.as(
        "last_message_at",
      ),
      matchType: sql<string>`'title'`.as("match_type"),
    })
    .from(ChatThreadTable)
    .leftJoin(
      ChatMessageTable,
      eq(ChatThreadTable.id, ChatMessageTable.threadId),
    )
    .where(
      and(
        eq(ChatThreadTable.userId, session.user.id),
        ilike(ChatThreadTable.title, searchTerm),
      ),
    )
    .groupBy(
      ChatThreadTable.id,
      ChatThreadTable.title,
      ChatThreadTable.createdAt,
      ChatThreadTable.userId,
    );

  // Search threads by message content
  // We need to search in the JSON parts array for text content
  const threadsByContent = await db
    .selectDistinct({
      threadId: ChatThreadTable.id,
      title: ChatThreadTable.title,
      createdAt: ChatThreadTable.createdAt,
      userId: ChatThreadTable.userId,
      lastMessageAt: sql<string>`MAX(${ChatMessageTable.createdAt})`.as(
        "last_message_at",
      ),
      matchType: sql<string>`'content'`.as("match_type"),
    })
    .from(ChatThreadTable)
    .innerJoin(
      ChatMessageTable,
      eq(ChatThreadTable.id, ChatMessageTable.threadId),
    )
    .where(
      and(
        eq(ChatThreadTable.userId, session.user.id),
        // Search in the JSON parts array - looking for text content
        sql`CAST(${ChatMessageTable.parts} AS TEXT) ILIKE ${searchTerm}`,
      ),
    )
    .groupBy(
      ChatThreadTable.id,
      ChatThreadTable.title,
      ChatThreadTable.createdAt,
      ChatThreadTable.userId,
    );

  // Combine and deduplicate results, prioritizing title matches
  const allResults = [...threadsByTitle, ...threadsByContent];
  const uniqueResults = new Map();

  allResults.forEach((result) => {
    const existing = uniqueResults.get(result.threadId);
    if (!existing || existing.matchType === "content") {
      uniqueResults.set(result.threadId, result);
    }
  });

  // Sort by lastMessageAt descending
  const sortedResults = Array.from(uniqueResults.values()).sort((a, b) => {
    const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return dateB - dateA;
  });

  return Response.json(
    sortedResults.map((row) => ({
      id: row.threadId,
      title: row.title,
      userId: row.userId,
      createdAt: row.createdAt,
      lastMessageAt: row.lastMessageAt
        ? new Date(row.lastMessageAt).getTime()
        : 0,
      matchType: row.matchType,
    })),
  );
}
