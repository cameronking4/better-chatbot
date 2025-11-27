"use client";

import { ScheduledTaskDialog } from "@/components/scheduled-task/scheduled-task-dialog";
import { ScheduledTaskExecutionSheet } from "@/components/scheduled-task/scheduled-task-execution-sheet";
import { ScheduledTaskCard } from "@/components/scheduled-task/scheduled-task-card";
import { ScheduledTaskGreeting } from "@/components/scheduled-task/scheduled-task-greeting";
import { canCreateWorkflow } from "lib/auth/client-permissions";

import { ArrowUpRight, ChevronDown, MousePointer2 } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "ui/card";
import { Button } from "ui/button";
import { Skeleton } from "ui/skeleton";
import { BackgroundPaths } from "ui/background-paths";
import { ScheduledTask } from "@/types/scheduled-task";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { DailyDigest, WeeklyReport } from "@/lib/scheduler/examples";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "ui/dialog";
import { useScheduledTasks } from "@/hooks/queries/use-scheduled-tasks";
import { useState } from "react";
import { notify } from "lib/notify";
import { CreateScheduledTaskInput } from "@/types/scheduled-task";

interface ScheduledTaskListPageProps {
  userRole?: string | null;
}

export default function ScheduledTaskListPage({
  userRole,
}: ScheduledTaskListPageProps = {}) {
  const t = useTranslations();
  // const { data: session } = authClient.useSession();
  const { tasks, isLoading, deleteTask, executeTask, updateTask, createTask } =
    useScheduledTasks();
  const [editingTask, setEditingTask] = useState<ScheduledTask | undefined>(
    undefined,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ScheduledTask | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const canCreate = canCreateWorkflow(userRole); // Using same permission as workflow

  const createExample = async (exampleTask: CreateScheduledTaskInput) => {
    try {
      await createTask(exampleTask);
      toast.success("Scheduled task created successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to create scheduled task");
    }
  };

  const handleEdit = (task: ScheduledTask) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  const handleDelete = async (taskId: string) => {
    const ok = await notify.confirm({
      description: "Are you sure you want to delete this scheduled task?",
    });
    if (!ok) return;

    try {
      await deleteTask(taskId);
      toast.success("Task deleted successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete task");
    }
  };

  const handleToggleTask = async (task: ScheduledTask) => {
    try {
      const newEnabled = !task.enabled;
      await updateTask({ id: task.id, enabled: newEnabled });
      toast.success(
        newEnabled ? "Task resumed successfully" : "Task paused successfully",
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to update task");
    }
  };

  const handleExecute = async (taskId: string) => {
    try {
      toast.promise(executeTask(taskId), {
        loading: "Executing task...",
        success: "Task executed successfully",
        error: "Failed to execute task",
      });
    } catch (_error: any) {
      // Error handled by toast promise
    }
  };

  const handleCreate = () => {
    setEditingTask(undefined);
    setDialogOpen(true);
  };

  const handleCardClick = (task: ScheduledTask) => {
    setSelectedTask(task);
    setSheetOpen(true);
  };

  return (
    <div className="w-full flex flex-col gap-4 p-8">
      <div className="flex flex-row gap-2 items-center">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant={"ghost"} className="relative group">
              {t("ScheduledTask.whatIsScheduledTask")}
              <div className="absolute left-0 -top-1.5 opacity-100 group-hover:opacity-0 transition-opacity duration-300">
                <MousePointer2 className="rotate-180 text-blue-500 fill-blue-500 size-3 wiggle" />
              </div>
            </Button>
          </DialogTrigger>
          <DialogContent className="md:max-w-3xl!">
            <DialogTitle className="sr-only">
              scheduled task greeting
            </DialogTitle>
            <ScheduledTaskGreeting />
          </DialogContent>
        </Dialog>

        {canCreate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                className="min-w-54 justify-between data-[state=open]:bg-input"
                data-testid="create-scheduled-task-with-example-button"
              >
                {t("Common.createWithExample")}
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-54">
              <DropdownMenuItem onClick={() => createExample(DailyDigest())}>
                📰 {t("ScheduledTask.example.dailyDigest")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => createExample(WeeklyReport())}>
                📊 {t("ScheduledTask.example.weeklyReport")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* My Scheduled Tasks Section */}
      {(canCreate || (tasks && tasks.length > 0)) && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              {t("ScheduledTask.myScheduledTasks")}
            </h2>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {canCreate && (
              <Card
                className="relative bg-secondary overflow-hidden w-full hover:bg-input transition-colors h-[196px] cursor-pointer"
                onClick={handleCreate}
              >
                <div className="absolute inset-0 w-full h-full opacity-50">
                  <BackgroundPaths />
                </div>
                <CardHeader>
                  <CardTitle>
                    <h1 className="text-lg font-bold">
                      {t("ScheduledTask.createScheduledTask")}
                    </h1>
                  </CardTitle>
                  <CardDescription className="mt-2">
                    <p className="">
                      {t("ScheduledTask.createScheduledTaskDescription")}
                    </p>
                  </CardDescription>
                  <div className="mt-auto ml-auto flex-1">
                    <Button variant="ghost" size="lg">
                      {t("Common.create")}
                      <ArrowUpRight className="size-3.5" />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            )}
            {isLoading
              ? Array(6)
                  .fill(null)
                  .map((_, index) => (
                    <Skeleton key={index} className="w-full h-[196px]" />
                  ))
              : tasks?.map((task) => (
                  <ScheduledTaskCard
                    key={task.id}
                    task={task}
                    onEdit={canCreate ? handleEdit : undefined}
                    onDelete={canCreate ? handleDelete : undefined}
                    onExecute={canCreate ? handleExecute : undefined}
                    onToggle={canCreate ? handleToggleTask : undefined}
                    onClick={handleCardClick}
                  />
                ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!canCreate && (!tasks || tasks.length === 0) && !isLoading && (
        <Card className="col-span-full bg-transparent border-none">
          <CardHeader className="text-center py-12">
            <CardTitle>{t("ScheduledTask.noScheduledTasks")}</CardTitle>
            <CardDescription>
              {t("ScheduledTask.noScheduledTasksDescription")}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <ScheduledTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
      />

      <ScheduledTaskExecutionSheet
        task={selectedTask}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onEdit={canCreate ? handleEdit : undefined}
      />
    </div>
  );
}
