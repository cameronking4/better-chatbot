"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "ui/sheet";
import { Input } from "ui/input";
import { Skeleton } from "ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import {
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useScheduledTaskExecutions } from "@/hooks/queries/use-scheduled-task-executions";
import {
  ScheduledTask,
  ScheduledTaskExecutionStatus,
} from "@/types/scheduled-task";
import { cn } from "lib/utils";

interface ScheduledTaskExecutionSheetProps {
  task: ScheduledTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDuration(duration?: string): string {
  if (!duration) return "-";
  const ms = parseInt(duration, 10);
  if (isNaN(ms)) return duration;

  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

function getStatusIcon(status: ScheduledTaskExecutionStatus) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case "running":
      return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
    case "pending":
      return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
  }
}

export function ScheduledTaskExecutionSheet({
  task,
  open,
  onOpenChange,
}: ScheduledTaskExecutionSheetProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    ScheduledTaskExecutionStatus | "all"
  >("all");

  const { executions, isLoading } = useScheduledTaskExecutions(
    task?.id ?? null,
  );

  const filteredExecutions = useMemo(() => {
    if (!executions) return [];

    return executions.filter((execution) => {
      // Status filter
      if (statusFilter !== "all" && execution.status !== statusFilter) {
        return false;
      }

      // Search filter (by thread title)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const threadTitle = execution.threadTitle?.toLowerCase() ?? "";
        return threadTitle.includes(query);
      }

      return true;
    });
  }, [executions, searchQuery, statusFilter]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-2 md:p-4">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="text-lg">
            {task?.name || "Execution History"}
          </SheetTitle>
          {task?.description && (
            <SheetDescription className="text-xs mt-1">
              {task.description}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by thread title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as ScheduledTaskExecutionStatus | "all")
              }
            >
              <SelectTrigger className="w-full sm:w-[140px] h-8 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Execution List */}
          {isLoading ? (
            <div className="space-y-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filteredExecutions.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-sm font-medium mb-1">
                  {executions?.length === 0
                    ? "No executions yet"
                    : "No executions match your filters"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {executions?.length === 0
                    ? "This task hasn't been executed yet."
                    : "Try adjusting your search or filter criteria."}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredExecutions.map((execution) => (
                <div
                  key={execution.id}
                  className={cn(
                    "group relative flex items-center gap-3 px-3 py-2 rounded-md border border-transparent hover:border-border hover:bg-muted/30 transition-colors",
                    execution.threadId && "cursor-pointer",
                  )}
                >
                  {/* Status Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {getStatusIcon(execution.status)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {execution.threadId ? (
                        <Link
                          href={`/chat/${execution.threadId}`}
                          className="text-sm font-medium hover:underline truncate flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {execution.threadTitle || "Untitled Chat"}
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-muted-foreground">
                          No thread created
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        {formatDistanceToNow(new Date(execution.startedAt), {
                          addSuffix: true,
                        })}
                      </span>
                      {execution.completedAt && (
                        <>
                          <span>•</span>
                          <span>{formatDuration(execution.duration)}</span>
                        </>
                      )}
                      {execution.status === "failed" && execution.error && (
                        <>
                          <span>•</span>
                          <span className="text-red-500 truncate max-w-[200px]">
                            {execution.error}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
