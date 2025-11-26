import { useScheduledTasks } from "@/hooks/queries/use-scheduled-tasks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";
import { Button } from "ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import {
  MoreHorizontal,
  PlayIcon,
  PencilIcon,
  TrashIcon,
  ClockIcon,
} from "lucide-react";
import { getScheduleDescription } from "@/lib/scheduler/schedule-utils";
import { useState } from "react";
import { ScheduledTaskDialog } from "./scheduled-task-dialog";
import { ScheduledTask } from "@/types/scheduled-task";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "ui/badge";
import { toast } from "sonner";
import { Skeleton } from "ui/skeleton";

export function ScheduledTaskList() {
  const { tasks, isLoading, deleteTask, executeTask } = useScheduledTasks();
  const [editingTask, setEditingTask] = useState<ScheduledTask | undefined>(
    undefined,
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleEdit = (task: ScheduledTask) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this task?")) {
      try {
        await deleteTask(id);
        toast.success("Task deleted successfully");
      } catch (error: any) {
        toast.error(error.message || "Failed to delete task");
      }
    }
  };

  const handleExecute = async (id: string) => {
    try {
      toast.promise(executeTask(id), {
        loading: "Executing task...",
        success: "Task executed successfully",
        error: "Failed to execute task",
      });
    } catch (error: any) {
      // Error handled by toast promise
    }
  };

  const handleCreate = () => {
    setEditingTask(undefined);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="border rounded-md">
          <div className="p-4 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Scheduled Tasks</h2>
          <p className="text-muted-foreground">
            Manage your automated tasks and schedules.
          </p>
        </div>
        <Button onClick={handleCreate}>
          <ClockIcon className="mr-2 h-4 w-4" />
          Create Task
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead>Next Run</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks && tasks.length > 0 ? (
              tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{task.name}</span>
                      {task.description && (
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {task.description}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getScheduleDescription(task.schedule)}</TableCell>
                  <TableCell>
                    {task.enabled ? (
                      <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                        Enabled
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Disabled
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {task.lastRunAt ? (
                      <span title={new Date(task.lastRunAt).toLocaleString()}>
                        {formatDistanceToNow(new Date(task.lastRunAt), {
                          addSuffix: true,
                        })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {task.nextRunAt ? (
                      <span title={new Date(task.nextRunAt).toLocaleString()}>
                        {formatDistanceToNow(new Date(task.nextRunAt), {
                          addSuffix: true,
                        })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleExecute(task.id)}>
                          <PlayIcon className="mr-2 h-4 w-4" />
                          Run Now
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(task)}>
                          <PencilIcon className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(task.id)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <TrashIcon className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No scheduled tasks found. Create one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ScheduledTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
      />
    </div>
  );
}
