"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { fetcher } from "lib/utils";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { ChatThread } from "app-types/chat";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare } from "lucide-react";

type SearchResult = ChatThread & {
  lastMessageAt: number;
  matchType: "title" | "content";
};

interface SearchChatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchChatsDialog({
  open,
  onOpenChange,
}: SearchChatsDialogProps) {
  const router = useRouter();
  const t = useTranslations("Layout");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: searchResults = [], isLoading } = useSWR<SearchResult[]>(
    searchQuery.trim()
      ? `/api/thread/search?q=${encodeURIComponent(searchQuery)}`
      : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  const handleSelect = (threadId: string) => {
    router.push(`/chat/${threadId}`);
    onOpenChange(false);
    setSearchQuery("");
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("searchAllChats")}
      description={t("searchAllChatsDescription")}
    >
      <CommandInput
        placeholder={t("searchChatsPlaceholder")}
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        {isLoading && searchQuery.trim() ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t("searching")}
          </div>
        ) : searchResults.length === 0 && searchQuery.trim() ? (
          <CommandEmpty>{t("noChatsFound")}</CommandEmpty>
        ) : (
          <CommandGroup heading={t("searchResults")}>
            {searchResults.map((thread) => {
              const lastMessageTime = thread.lastMessageAt
                ? new Date(thread.lastMessageAt)
                : new Date(thread.createdAt);

              return (
                <CommandItem
                  key={thread.id}
                  value={`${thread.id}-${thread.title}`}
                  onSelect={() => handleSelect(thread.id)}
                  className="flex items-center gap-3 px-2 py-3"
                >
                  <MessageSquare className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {thread.title || "New Chat"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(lastMessageTime, {
                        addSuffix: true,
                      })}
                      {thread.matchType === "content" && (
                        <span className="ml-2">• {t("matchedInContent")}</span>
                      )}
                    </div>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
