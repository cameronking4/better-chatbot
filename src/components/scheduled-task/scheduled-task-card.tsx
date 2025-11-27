"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "ui/card";
import { Badge } from "ui/badge";
import { format } from "date-fns";
import { cn } from "lib/utils";
import { ScheduledTask } from "@/types/scheduled-task";
import { getScheduleDescription } from "@/lib/scheduler/schedule-utils";
import { PlayIcon, PauseIcon, Hourglass } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { Button } from "ui/button";
import { MoreHorizontal, PencilIcon, TrashIcon, Rocket } from "lucide-react";

interface ScheduledTaskCardProps {
  task: ScheduledTask;
  onEdit?: (task: ScheduledTask) => void;
  onDelete?: (taskId: string) => void;
  onExecute?: (taskId: string) => void;
  onToggle?: (task: ScheduledTask) => void;
  onClick?: (task: ScheduledTask) => void;
}

export function ScheduledTaskCard({
  task,
  onEdit,
  onDelete,
  onExecute,
  onToggle,
  onClick,
}: ScheduledTaskCardProps) {
  const handleCardClick = () => {
    onClick?.(task);
  };

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Check if next run is within 10 minutes (and in the future)
  // const isWithin10Minutes = task.enabled && task.nextRunAt
  //   ? (() => {
  //       const timeDiff = new Date(task.nextRunAt).getTime() - Date.now();
  //       return timeDiff > 0 && timeDiff <= 10 * 60 * 1000;
  //     })()
  //   : false;

  // Determine icon styling based on task state
  // const getIconStyles = () => {
  //   if (!task.enabled) {
  //     // Red/destructive for paused/disabled
  //     return "text-destructive";
  //   }
  //   if (isWithin10Minutes) {
  //     // Green with pulsing animation for imminent runs
  //     return "text-green-500 animate-pulse";
  //   }
  //   // Green for enabled tasks
  //   return "text-green-500";
  // };

  return (
    <Card
      className={cn(
        "w-full min-h-[196px] transition-colors group flex flex-col gap-3 cursor-pointer hover:bg-input",
      )}
      onClick={handleCardClick}
    >
      <CardHeader className="shrink gap-y-0">
        <CardTitle className="flex gap-3 items-stretch min-w-0">
          <div className="flex flex-col justify-around min-w-0 flex-1 overflow-hidden">
            <span className="truncate font-medium">{task.name}</span>
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1 min-w-0">
              <time className="shrink-0">
                {format(task.updatedAt || new Date(), "MMM d, yyyy")}
              </time>
              {!task.enabled && (
                <span className="px-2 rounded-sm bg-secondary text-foreground shrink-0">
                  Paused
                </span>
              )}
            </div>
          </div>

          {task.nextRunAt && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              <span>
                <Hourglass className="size-3" />
              </span>
              {formatDistanceToNow(new Date(task.nextRunAt), {
                addSuffix: true,
              })}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="min-h-0 grow">
        <CardDescription className="text-xs line-clamp-3 wrap-break-word overflow-hidden">
          {task.description ||
            `No description provided, likely a task related to generating ${task.name}`}
        </CardDescription>
        <div className="mt-3 flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">
            <span className="font-bold">Schedule: </span>
            {getScheduleDescription(task.schedule)}
          </div>
          {/* {task.nextRunAt && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Next run: </span>
              {formatDistanceToNow(new Date(task.nextRunAt), {
                addSuffix: true,
              })}
            </div>
          )} */}
        </div>
      </CardContent>

      <CardFooter className="shrink min-h-0 overflow-visible">
        <div className="flex items-center justify-between w-full min-w-0">
          <Badge
            variant={task.enabled ? "outline" : "secondary"}
            className={cn(
              task.enabled &&
                "bg-green-500/10 text-green-500 border-green-500/20",
            )}
          >
            {task.enabled ? "Enabled" : "Disabled"}
          </Badge>

          <div onClick={handleMenuClick}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                {onExecute && (
                  <DropdownMenuItem onClick={() => onExecute(task.id)}>
                    <Rocket className="mr-2 h-4 w-4" />
                    Run Now
                  </DropdownMenuItem>
                )}
                {onToggle && (
                  <DropdownMenuItem onClick={() => onToggle(task)}>
                    {task.enabled ? (
                      <>
                        <PauseIcon className="mr-2 h-4 w-4" />
                        Pause
                      </>
                    ) : (
                      <>
                        <PlayIcon className="mr-2 h-4 w-4" />
                        Resume
                      </>
                    )}
                  </DropdownMenuItem>
                )}
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(task)}>
                    <PencilIcon className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(task.id)}
                      className="text-destructive"
                    >
                      <TrashIcon className="mr-2 h-4 w-4 text-destructive" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
