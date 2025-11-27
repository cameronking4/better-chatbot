"use client";

import { Agent } from "app-types/agent";
import { ChatThread } from "app-types/chat";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { ArrowLeft, Search, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import useSWR from "swr";
import { fetcher } from "lib/utils";
import { BACKGROUND_COLORS, EMOJI_DATA } from "lib/const";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "ui/skeleton";

type AgentChatsViewProps = {
  agent: Agent;
};

type ThreadWithLastMessage = ChatThread & {
  lastMessageAt: number;
};

export function AgentChatsView({ agent }: AgentChatsViewProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: threads, isLoading } = useSWR<ThreadWithLastMessage[]>(
    `/api/agent/${agent.id}/chats`,
    fetcher,
    {
      fallbackData: [],
    },
  );

  const filteredThreads = useMemo(() => {
    if (!threads) return [];
    if (!searchQuery) return threads;

    return threads.filter((thread) =>
      thread.title.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [threads, searchQuery]);

  const groupedThreads = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups = {
      today: [] as ThreadWithLastMessage[],
      yesterday: [] as ThreadWithLastMessage[],
      lastWeek: [] as ThreadWithLastMessage[],
      older: [] as ThreadWithLastMessage[],
    };

    if (!filteredThreads) return groups;

    filteredThreads.forEach((thread) => {
      const threadDate = thread.lastMessageAt
        ? new Date(thread.lastMessageAt)
        : new Date(thread.createdAt);
      threadDate.setHours(0, 0, 0, 0);

      if (threadDate.getTime() === today.getTime()) {
        groups.today.push(thread);
      } else if (threadDate.getTime() === yesterday.getTime()) {
        groups.yesterday.push(thread);
      } else if (threadDate.getTime() >= lastWeek.getTime()) {
        groups.lastWeek.push(thread);
      } else {
        groups.older.push(thread);
      }
    });

    return groups;
  }, [filteredThreads]);

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/agents")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-full ring-2 ring-border bg-background"
            style={{
              backgroundColor:
                agent.icon?.style?.backgroundColor || BACKGROUND_COLORS[0],
            }}
          >
            <Avatar className="size-8">
              <AvatarImage src={agent.icon?.value || EMOJI_DATA[0]} />
              <AvatarFallback className="bg-transparent">
                {agent.name[0]}
              </AvatarFallback>
            </Avatar>
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{agent.name}</h1>
            {agent.description && (
              <p className="text-sm text-muted-foreground">
                {agent.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search conversations..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4 rounded-lg">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No conversations found</h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? "Try adjusting your search query"
                : `No conversations with ${agent.name} yet`}
            </p>
          </div>
        ) : (
          <>
            {groupedThreads.today.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground mb-3">
                  Today
                </h2>
                <div className="space-y-2">
                  {groupedThreads.today.map((thread) => (
                    <ThreadCard key={thread.id} thread={thread} />
                  ))}
                </div>
              </div>
            )}

            {groupedThreads.yesterday.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground mb-3">
                  Yesterday
                </h2>
                <div className="space-y-2">
                  {groupedThreads.yesterday.map((thread) => (
                    <ThreadCard key={thread.id} thread={thread} />
                  ))}
                </div>
              </div>
            )}

            {groupedThreads.lastWeek.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground mb-3">
                  Last 7 days
                </h2>
                <div className="space-y-2">
                  {groupedThreads.lastWeek.map((thread) => (
                    <ThreadCard key={thread.id} thread={thread} />
                  ))}
                </div>
              </div>
            )}

            {groupedThreads.older.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-muted-foreground mb-3">
                  Older
                </h2>
                <div className="space-y-2">
                  {groupedThreads.older.map((thread) => (
                    <ThreadCard key={thread.id} thread={thread} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ThreadCard({ thread }: { thread: ThreadWithLastMessage }) {
  const lastMessageTime = thread.lastMessageAt
    ? new Date(thread.lastMessageAt)
    : new Date(thread.createdAt);

  return (
    <Link href={`/chat/${thread.id}`}>
      <div className="flex items-center gap-3 p-4 rounded-lg hover:bg-accent transition-colors cursor-pointer border border-transparent hover:border-border">
        <MessageSquare className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{thread.title}</h3>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(lastMessageTime, { addSuffix: true })}
          </p>
        </div>
      </div>
    </Link>
  );
}
