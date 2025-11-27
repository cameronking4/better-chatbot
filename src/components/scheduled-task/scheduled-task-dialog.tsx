import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "ui/form";
import { Input } from "ui/input";
import { Textarea } from "ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { Switch } from "ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import { ScheduledTask } from "@/types/scheduled-task";
import { useScheduledTasks } from "@/hooks/queries/use-scheduled-tasks";
import { toast } from "sonner";
import { AgentToolSelector } from "@/components/agent/agent-tool-selector";
import { ChatMention } from "app-types/chat";
import { convertMentionsToToolConfig } from "@/lib/utils/mentions-to-tools";
import { useMcpList } from "@/hooks/queries/use-mcp-list";
import { useWorkflowToolList } from "@/hooks/queries/use-workflow-tool-list";
import { useAgents } from "@/hooks/queries/use-agents";
import { Label } from "ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "ui/tabs";
import { WandSparklesIcon } from "lucide-react";
import { notify } from "lib/notify";
import { generateCronExpressionAction } from "@/app/api/chat/actions";
import { appStore } from "@/app/store";
import { SelectModel } from "@/components/select-model";
import { useCallback } from "react";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  prompt: z.string().min(1, "Prompt is required"),
  scheduleType: z.enum(["cron", "interval"]),
  cronExpression: z.string().optional(),
  intervalValue: z.coerce.number().min(1).optional(),
  intervalUnit: z.enum(["minutes", "hours", "days", "weeks"]).optional(),
  enabled: z.boolean().default(true),
});

interface ScheduledTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: ScheduledTask;
}

export function ScheduledTaskDialog({
  open,
  onOpenChange,
  task,
}: ScheduledTaskDialogProps) {
  const { createTask, updateTask } = useScheduledTasks();
  const [mentions, setMentions] = useState<ChatMention[]>(task?.mentions || []);
  const { isLoading: isMcpLoading } = useMcpList();
  const { isLoading: isWorkflowLoading } = useWorkflowToolList();
  const { isLoading: isAgentsLoading } = useAgents({ limit: 50 });
  const isLoadingTool = isMcpLoading || isWorkflowLoading || isAgentsLoading;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      prompt: "",
      scheduleType: "interval",
      cronExpression: "0 9 * * *",
      intervalValue: 1,
      intervalUnit: "days",
      enabled: true,
    },
  });

  const scheduleType = form.watch("scheduleType");

  const handleGenerateCronExpression = useCallback(async () => {
    let model = appStore.getState().chatModel;
    const result = await notify.prompt({
      title: "Generate Cron Expression",
      description: (
        <div className="flex items-center gap-2">
          <p className="mr-auto">
            Describe when you want the task to run (e.g., "every day at 9 AM",
            "every Monday at 3 PM", "every 30 minutes").
          </p>
          <SelectModel
            onSelect={(m) => {
              model = m;
            }}
          />
        </div>
      ),
    });
    if (!result) return;

    toast.promise(
      generateCronExpressionAction({
        model,
        prompt: result,
      }).then((cronExpr) => {
        form.setValue("cronExpression", cronExpr);
      }),
      {
        loading: "Generating cron expression...",
        success: "Cron expression generated successfully",
        error: "Failed to generate cron expression",
      },
    );
  }, [form]);

  useEffect(() => {
    if (task) {
      form.reset({
        name: task.name,
        description: task.description || "",
        prompt: task.prompt,
        scheduleType: task.schedule.type,
        cronExpression:
          task.schedule.type === "cron" ? task.schedule.expression : "",
        intervalValue:
          task.schedule.type === "interval" ? task.schedule.value : 1,
        intervalUnit:
          task.schedule.type === "interval" ? task.schedule.unit : "days",
        enabled: task.enabled,
      });
      setMentions(task.mentions || []);
    } else {
      form.reset({
        name: "",
        description: "",
        prompt: "",
        scheduleType: "interval",
        cronExpression: "0 9 * * *",
        intervalValue: 1,
        intervalUnit: "days",
        enabled: true,
      });
      setMentions([]);
    }
  }, [task, form, open]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const schedule =
        values.scheduleType === "cron"
          ? {
              type: "cron" as const,
              expression: values.cronExpression!,
            }
          : {
              type: "interval" as const,
              value: values.intervalValue!,
              unit: values.intervalUnit!,
            };

      const { allowedMcpServers, allowedAppDefaultToolkit } =
        convertMentionsToToolConfig(mentions);

      const taskData = {
        name: values.name,
        description: values.description,
        prompt: values.prompt,
        schedule,
        enabled: values.enabled,
        mentions: mentions.length > 0 ? mentions : undefined,
        allowedMcpServers,
        allowedAppDefaultToolkit,
      };

      if (task) {
        await updateTask({ id: task.id, ...taskData });
        toast.success("Task updated successfully");
      } else {
        await createTask(taskData);
        toast.success("Task created successfully");
      }
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save task");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {task ? "Edit Scheduled Task" : "Create Scheduled Task"}
          </DialogTitle>
          <DialogDescription>
            Configure a task to run automatically on a schedule.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col flex-1 min-h-0"
          >
            <Tabs defaultValue="basic" className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                <TabsTrigger value="tools">Tools</TabsTrigger>
              </TabsList>

              <TabsContent
                value="basic"
                className="flex-1 overflow-y-auto space-y-4 mt-4 bg-muted/20 rounded-lg p-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Daily Summary" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Runs every morning..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="prompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prompt</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Summarize the latest news..."
                          className="min-h-[200px]"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        This prompt will be used for each scheduled execution.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent
                value="schedule"
                className="flex-1 overflow-y-auto space-y-4 mt-4 bg-muted/20 rounded-lg p-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="scheduleType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Schedule Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="interval">Interval</SelectItem>
                            <SelectItem value="cron">
                              Cron Expression
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {scheduleType === "cron" ? (
                    <FormField
                      control={form.control}
                      name="cronExpression"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>Cron Expression</FormLabel>
                          </div>
                          <FormControl>
                            <Input placeholder="0 9 * * *" {...field} />
                          </FormControl>
                          <FormDescription>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleGenerateCronExpression}
                              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                            >
                              <WandSparklesIcon className="size-3" />
                              Generate with AI
                            </Button>
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <div className="flex gap-2">
                      <FormField
                        control={form.control}
                        name="intervalValue"
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel>Value</FormLabel>
                            <FormControl>
                              <Input type="number" min={1} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="intervalUnit"
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel>Unit</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Unit" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="minutes">Minutes</SelectItem>
                                <SelectItem value="hours">Hours</SelectItem>
                                <SelectItem value="days">Days</SelectItem>
                                <SelectItem value="weeks">Weeks</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>
                <FormField
                  control={form.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Enabled</FormLabel>
                        <FormDescription>
                          Turn off to pause this task without deleting it.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent
                value="tools"
                className="flex-1 overflow-y-auto space-y-4 mt-4 bg-muted/20 rounded-lg p-4"
              >
                <div className="flex flex-col gap-2">
                  <Label className="text-base">Tools</Label>
                  <AgentToolSelector
                    mentions={mentions}
                    isLoading={isLoadingTool}
                    disabled={false}
                    hasEditAccess={true}
                    onChange={setMentions}
                  />
                  <FormDescription>
                    Select tools that will be available when this task runs.
                  </FormDescription>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-4 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
