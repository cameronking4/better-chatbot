"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useScheduledTasks } from "@/hooks/queries/use-scheduled-tasks";
import { toast } from "sonner";
import { ChatMetadata, ChatModel, ChatMessage } from "app-types/chat";
import { appStore } from "@/app/store";
import { useShallow } from "zustand/shallow";
import { AgentToolSelector } from "@/components/agent/agent-tool-selector";
import { ChatMention } from "app-types/chat";
import { convertMentionsToToolConfig } from "@/lib/utils/mentions-to-tools";
import { useMcpList } from "@/hooks/queries/use-mcp-list";
import { useWorkflowToolList } from "@/hooks/queries/use-workflow-tool-list";
import { useAgents } from "@/hooks/queries/use-agents";
import { Label } from "ui/label";
import useSWR from "swr";
import { fetcher } from "lib/utils";
import { cn } from "lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "ui/tabs";

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

interface ScheduleTaskFromMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageText: string;
  threadId: string;
  messageMetadata?: ChatMetadata;
}

export function ScheduleTaskFromMessageDialog({
  open,
  onOpenChange,
  messageText,
  threadId,
  messageMetadata,
}: ScheduleTaskFromMessageDialogProps) {
  const { createTask } = useScheduledTasks();

  // Get thread context from appStore
  const threadMentions = appStore(
    useShallow((state) => state.threadMentions[threadId] ?? []),
  );
  const chatModel = appStore((state) => state.chatModel);

  // Extract context from message metadata
  const agentId = messageMetadata?.agentId;
  const toolChoice = messageMetadata?.toolChoice || "auto";
  const modelFromMetadata = messageMetadata?.chatModel;

  // Use model from metadata if available, otherwise from appStore
  const taskChatModel: ChatModel | undefined = modelFromMetadata || chatModel;

  // State for tool selector
  const [mentions, setMentions] = useState<ChatMention[]>(threadMentions);
  const { isLoading: isMcpLoading } = useMcpList();
  const { isLoading: isWorkflowLoading } = useWorkflowToolList();
  const { isLoading: isAgentsLoading } = useAgents({ limit: 50 });
  const isLoadingTool = isMcpLoading || isWorkflowLoading || isAgentsLoading;

  // Fetch conversation messages (optional)
  const { data: threadData } = useSWR<{
    messages: ChatMessage[];
  }>(threadId && open ? `/api/chat/thread/${threadId}` : null, fetcher);

  const conversationMessages = useMemo(() => {
    if (!threadData?.messages) return [];
    // Return messages up to and including the current message
    return threadData.messages;
  }, [threadData]);

  // State for editable conversation messages
  const [editableMessages, setEditableMessages] = useState<
    Array<{ id: string; role: string; text: string }>
  >([]);

  // Initialize editable messages when conversation messages load
  useEffect(() => {
    if (conversationMessages.length > 0) {
      setEditableMessages(
        conversationMessages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          text: msg.parts
            .filter((p) => p.type === "text")
            .map((p) => (p as any).text)
            .join(" "),
        })),
      );
    }
  }, [conversationMessages]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      prompt: messageText,
      scheduleType: "interval",
      cronExpression: "0 9 * * *",
      intervalValue: 1,
      intervalUnit: "days",
      enabled: true,
    },
  });

  const scheduleType = form.watch("scheduleType");

  // Reset form when dialog opens or messageText changes
  useEffect(() => {
    if (open) {
      form.reset({
        name: "",
        description: "",
        prompt: messageText,
        scheduleType: "interval",
        cronExpression: "0 9 * * *",
        intervalValue: 1,
        intervalUnit: "days",
        enabled: true,
      });
      // Initialize mentions from thread context
      setMentions(threadMentions);
    }
  }, [open, messageText, form, threadMentions]);

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

      const {
        allowedMcpServers: convertedMcpServers,
        allowedAppDefaultToolkit: convertedToolkit,
      } = convertMentionsToToolConfig(mentions);

      const taskData = {
        name: values.name,
        description: values.description,
        prompt: values.prompt,
        schedule,
        enabled: values.enabled,
        // Include thread context
        agentId,
        chatModel: taskChatModel,
        toolChoice,
        mentions: mentions.length > 0 ? mentions : undefined,
        allowedMcpServers: convertedMcpServers ?? undefined,
        allowedAppDefaultToolkit: convertedToolkit ?? undefined,
      };

      await createTask(taskData);
      toast.success("Scheduled task created successfully");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to create scheduled task");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Schedule Task from Message</DialogTitle>
          <DialogDescription>
            Create a scheduled task using this message as the prompt. The task
            will use the same context, tools, and settings as this conversation.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col flex-1 min-h-0"
          >
            <Tabs defaultValue="basic" className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                <TabsTrigger value="tools">Tools</TabsTrigger>
                {editableMessages.length > 0 && (
                  <TabsTrigger value="context">Context</TabsTrigger>
                )}
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
                          <FormLabel>Cron Expression</FormLabel>
                          <FormControl>
                            <Input placeholder="0 9 * * *" {...field} />
                          </FormControl>
                          <FormDescription>
                            <a
                              href="https://crontab.guru/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              Help me
                            </a>
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
                    Tools from the current conversation are pre-selected.
                  </FormDescription>
                </div>
              </TabsContent>

              {editableMessages.length > 0 && (
                <TabsContent
                  value="context"
                  className="flex-1 overflow-y-auto space-y-4 mt-4 bg-muted/20 rounded-lg p-4"
                >
                  <div className="flex flex-col gap-2">
                    <Label className="text-base">Conversation Context</Label>
                    <div className="rounded-lg border p-3 bg-muted/30">
                      <FormDescription className="mb-3">
                        Previous messages from this conversation (editable):
                      </FormDescription>
                      <div className="space-y-3">
                        {editableMessages.map((msg, idx) => (
                          <div
                            key={msg.id}
                            className={cn(
                              "text-xs rounded border p-3",
                              msg.role === "user"
                                ? "bg-background border-border"
                                : "bg-muted/50 border-transparent",
                            )}
                          >
                            <div className="font-medium mb-2 capitalize">
                              {msg.role}
                            </div>
                            <Textarea
                              value={msg.text}
                              onChange={(e) => {
                                const updated = [...editableMessages];
                                updated[idx] = {
                                  ...updated[idx],
                                  text: e.target.value,
                                };
                                setEditableMessages(updated);
                              }}
                              className="min-h-[100px] text-xs resize-none"
                              placeholder={`${msg.role} message...`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              )}
            </Tabs>

            <DialogFooter className="mt-4 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Create Task</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
