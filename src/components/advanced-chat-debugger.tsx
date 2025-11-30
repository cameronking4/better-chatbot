"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "ui/button";
import { Textarea } from "ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";
import { Badge } from "ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "ui/tabs";
import { ScrollArea } from "ui/scroll-area";
import { Separator } from "ui/separator";
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  Activity,
  Database,
  Zap,
  Clock,
  AlertCircle,
  CheckCircle,
  Loader2,
  Copy,
  ExternalLink,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { generateUUID } from "lib/utils";
import type {
  AdvancedChatJob,
  AdvancedChatIteration,
  AdvancedChatContextSummary,
} from "@/types/advanced-chat";
import { ChatModel, ChatMention } from "@/types/chat";
import { UIMessage } from "ai";
import { formatDistanceToNow } from "date-fns";
import { cn } from "lib/utils";
import { SelectModel } from "./select-model";
import { ToolSelectDropdown } from "./tool-select-dropdown";
import { ToolModeDropdown } from "./tool-mode-dropdown";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { WorkflowSummary } from "app-types/workflow";
import { AgentSummary } from "app-types/agent";
import { AppDefaultToolkit } from "lib/ai/tools";
import { AllowedMCPServer } from "app-types/mcp";
import { appStore } from "@/app/store";
import { useShallow } from "zustand/shallow";
import { PreviewMessage } from "./message";
import { isToolUIPart } from "ai";

interface JobStatus {
  jobId: string;
  correlationId: string;
  status: AdvancedChatJob["status"];
  currentIteration: number;
  error?: string;
  completedAt?: string;
}

export default function AdvancedChatDebugger() {
  const [threadId] = useState(() => generateUUID());
  const [message, setMessage] = useState("");
  const [chatModel, setChatModel] = useState<ChatModel | undefined>();
  const [toolChoice, setToolChoice] = useState<"auto" | "none" | "manual">(
    "auto",
  );
  const [mentions, setMentions] = useState<ChatMention[]>([]);
  const [currentJob, setCurrentJob] = useState<JobStatus | null>(null);

  // Sync with appStore for MCP servers and default tools (matches regular chat behavior)
  const [appStoreAllowedMcpServers, appStoreAllowedAppDefaultToolkit] =
    appStore(
      useShallow((state) => [
        state.allowedMcpServers,
        state.allowedAppDefaultToolkit,
      ]),
    );
  const [jobDetails, setJobDetails] = useState<{
    job: AdvancedChatJob | null;
    iterations: AdvancedChatIteration[];
    summaries: AdvancedChatContextSummary[];
  }>({
    job: null,
    iterations: [],
    summaries: [],
  });
  const [threadMessages, setThreadMessages] = useState<UIMessage[]>([]);
  const [streamingMessages, setStreamingMessages] = useState<
    Map<string, UIMessage>
  >(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Initialize model from appStore if not set
  const [appStoreModel] = appStore(useShallow((state) => [state.chatModel]));
  useEffect(() => {
    if (!chatModel && appStoreModel) {
      setChatModel(appStoreModel);
    }
  }, [chatModel, appStoreModel]);

  // Fetch job details
  const fetchJobDetails = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`/api/chat/advanced/${jobId}`);
      if (response.ok) {
        const data = await response.json();
        setJobDetails(data);

        // If job is completed, fetch thread messages
        if (data.job?.status === "completed" && data.job?.threadId) {
          try {
            const threadResponse = await fetch(
              `/api/chat/thread/${data.job.threadId}`,
            );
            if (threadResponse.ok) {
              const threadData = await threadResponse.json();
              setThreadMessages(threadData.messages || []);
            }
          } catch (e) {
            console.error("Failed to fetch thread messages:", e);
          }
        }
      }
    } catch (error: any) {
      console.error("Failed to fetch job details:", error);
    }
  }, []);

  // Start SSE connection for job status updates
  useEffect(() => {
    if (!currentJob?.jobId) return;

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(
      `/api/chat/advanced?jobId=${currentJob.jobId}`,
    );
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        if (event.data.startsWith("data: ")) {
          const data = JSON.parse(event.data.slice(6));

          // Handle message streaming events
          if (data.type === "message-start") {
            setStreamingMessages((prev) => {
              const newMap = new Map(prev);
              newMap.set(data.messageId, {
                id: data.messageId,
                role: "assistant",
                parts: [],
              });
              return newMap;
            });
          } else if (data.type === "text-delta") {
            setStreamingMessages((prev) => {
              const newMap = new Map(prev);
              const message = newMap.get(data.messageId);
              if (message) {
                // Find or create text part
                let textPart = message.parts.find(
                  (p: any) => p.type === "text",
                );
                if (!textPart) {
                  textPart = { type: "text", text: "" };
                  message.parts.push(textPart);
                }
                textPart.text += data.delta;
                newMap.set(data.messageId, { ...message });
              }
              return newMap;
            });
          } else if (data.type === "tool-call") {
            setStreamingMessages((prev) => {
              const newMap = new Map(prev);
              const message = newMap.get(data.messageId);
              if (message) {
                const toolPart = {
                  type: `tool-${data.toolName}`,
                  toolCallId: data.toolCallId,
                  input: data.args || {},
                  state: "input-available",
                } as any;
                message.parts.push(toolPart);
                newMap.set(data.messageId, { ...message });
              }
              return newMap;
            });
          } else if (data.type === "tool-result") {
            setStreamingMessages((prev) => {
              const newMap = new Map(prev);
              const message = newMap.get(data.messageId);
              if (message) {
                const toolPart = message.parts.find(
                  (p: any) => p.toolCallId === data.toolCallId,
                );
                if (toolPart) {
                  toolPart.state = "output-available";
                  toolPart.output = data.result;
                }
                newMap.set(data.messageId, { ...message });
              }
              return newMap;
            });
          } else if (data.type === "message-complete") {
            setStreamingMessages((prev) => {
              const newMap = new Map(prev);
              const message = newMap.get(data.messageId);
              if (message) {
                // Move completed message to threadMessages
                setThreadMessages((prevMsgs) => [...prevMsgs, message]);
                newMap.delete(data.messageId);
              }
              return newMap;
            });
          } else if (
            data.type === "status-update" ||
            data.type === "job-status"
          ) {
            setCurrentJob((prev) =>
              prev
                ? {
                    ...prev,
                    status: data.status,
                    currentIteration: data.currentIteration,
                    error: data.error,
                  }
                : null,
            );
            if (data.jobId) {
              fetchJobDetails(data.jobId);
            }
          } else if (data.type === "job-complete") {
            setCurrentJob((prev) =>
              prev
                ? {
                    ...prev,
                    status: data.status,
                    currentIteration: data.currentIteration,
                    error: data.error,
                    completedAt: data.completedAt,
                  }
                : null,
            );
            fetchJobDetails(data.jobId);
            // Move any remaining streaming messages to threadMessages
            setStreamingMessages((prev) => {
              const remaining = Array.from(prev.values());
              if (remaining.length > 0) {
                setThreadMessages((prevMsgs) => [...prevMsgs, ...remaining]);
              }
              return new Map();
            });
            eventSource.close();
          }
        }
      } catch (error) {
        console.error("Failed to parse SSE data:", error);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [currentJob?.jobId, fetchJobDetails]);

  // Poll for job details periodically
  useEffect(() => {
    if (!currentJob?.jobId) return;

    const interval = setInterval(() => {
      fetchJobDetails(currentJob.jobId);
    }, 2000);

    return () => clearInterval(interval);
  }, [currentJob?.jobId, fetchJobDetails]);

  const handleSelectAgent = useCallback((agent: AgentSummary) => {
    setMentions((prev) => {
      // Only one agent can be selected at a time
      const filtered = prev.filter((m) => m.type !== "agent");
      return [
        ...filtered,
        {
          type: "agent",
          agentId: agent.id,
          name: agent.name,
          icon: agent.icon,
          description: agent.description,
        },
      ];
    });
  }, []);

  const handleSelectWorkflow = useCallback((workflow: WorkflowSummary) => {
    setMentions((prev) => {
      if (
        prev.some(
          (m) => m.type === "workflow" && (m as any).workflowId === workflow.id,
        )
      ) {
        return prev;
      }
      return [
        ...prev,
        {
          type: "workflow",
          workflowId: workflow.id,
          name: workflow.name,
          icon: workflow.icon,
          description: workflow.description,
        },
      ];
    });
  }, []);

  const handleRemoveMention = useCallback((index: number) => {
    setMentions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }

    if (!chatModel) {
      toast.error("Please select a model");
      return;
    }

    setIsLoading(true);
    setJobDetails({ job: null, iterations: [], summaries: [] });
    setThreadMessages([]);
    setStreamingMessages(new Map());
    setCurrentJob(null);

    try {
      const userMessage: UIMessage = {
        id: generateUUID(),
        role: "user",
        parts: [{ type: "text", text: message }],
      };

      // Build allowedMcpServers from mentions or appStore
      const mcpServers: Record<string, AllowedMCPServer> = {};
      if (mentions.length > 0) {
        // If mentions exist, use them to filter MCP servers
        mentions.forEach((mention) => {
          if (mention.type === "mcpServer" || mention.type === "mcpTool") {
            const serverId = mention.serverId;
            if (!mcpServers[serverId]) {
              mcpServers[serverId] = { tools: [] };
            }
            if (mention.type === "mcpTool") {
              mcpServers[serverId].tools.push(mention.name);
            }
          }
        });
      } else {
        // Otherwise use appStore settings (matches regular chat behavior)
        Object.assign(mcpServers, appStoreAllowedMcpServers || {});
      }

      const response = await fetch("/api/chat/advanced", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: threadId,
          message: userMessage,
          chatModel,
          toolChoice,
          mentions: mentions.length > 0 ? mentions : undefined,
          allowedMcpServers:
            Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
          allowedAppDefaultToolkit:
            appStoreAllowedAppDefaultToolkit &&
            appStoreAllowedAppDefaultToolkit.length > 0
              ? appStoreAllowedAppDefaultToolkit
              : undefined,
          attachments: [],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to create job");
      }

      // Parse SSE response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = JSON.parse(line.slice(6));
              if (data.type === "job-created") {
                // Add user message to display
                setThreadMessages([userMessage]);
                setCurrentJob({
                  jobId: data.jobId,
                  correlationId: data.correlationId,
                  status: data.status,
                  currentIteration: 0,
                });
                fetchJobDetails(data.jobId);
              }
            }
          }
        }
      }

      toast.success("Job created successfully");
      setMessage("");
    } catch (error: any) {
      toast.error(error.message || "Failed to create job");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResume = async () => {
    if (!currentJob?.jobId) return;

    try {
      const response = await fetch(`/api/chat/advanced/${currentJob.jobId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "resume" }),
      });

      if (response.ok) {
        toast.success("Job resumed");
        fetchJobDetails(currentJob.jobId);
      } else {
        const error = await response.json();
        toast.error(error.message || "Failed to resume job");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to resume job");
    }
  };

  const handleCancel = async () => {
    if (!currentJob?.jobId) return;

    try {
      const response = await fetch(`/api/chat/advanced/${currentJob.jobId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "cancel" }),
      });

      if (response.ok) {
        toast.success("Job cancelled");
        fetchJobDetails(currentJob.jobId);
      } else {
        const error = await response.json();
        toast.error(error.message || "Failed to cancel job");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel job");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500";
      case "running":
        return "bg-blue-500";
      case "failed":
        return "bg-red-500";
      case "paused":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  const totalTokens = jobDetails.iterations.reduce(
    (sum, iter) => sum + iter.totalTokens,
    0,
  );

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Advanced Chat Debugger</h1>
        <p className="text-muted-foreground">
          Test and debug the advanced chat mode with full observability
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Input & Controls */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create Job</CardTitle>
              <CardDescription>Start a new advanced chat job</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Thread ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={threadId}
                    readOnly
                    className="flex-1 px-3 py-2 border rounded-md bg-muted text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(threadId)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Model</label>
                <SelectModel currentModel={chatModel} onSelect={setChatModel} />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Tool Mode
                </label>
                <ToolModeDropdown
                  value={toolChoice}
                  onValueChange={setToolChoice}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Agents & Tools
                </label>
                <ToolSelectDropdown
                  mentions={mentions}
                  onSelectAgent={handleSelectAgent}
                  onSelectWorkflow={handleSelectWorkflow}
                />
              </div>

              {mentions.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Selected:</label>
                  <div className="flex flex-wrap gap-2">
                    {mentions.map((mention, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="flex items-center gap-1"
                      >
                        {mention.type === "agent" && (
                          <>
                            <Avatar className="size-4">
                              {(mention as any).icon && (
                                <AvatarImage
                                  src={(mention as any).icon?.url}
                                  alt={mention.name}
                                />
                              )}
                              <AvatarFallback className="text-xs">
                                {mention.name[0]}
                              </AvatarFallback>
                            </Avatar>
                            <span>{mention.name}</span>
                          </>
                        )}
                        {mention.type === "workflow" && (
                          <>
                            <Avatar className="size-4">
                              {(mention as any).icon && (
                                <AvatarImage
                                  src={(mention as any).icon?.url}
                                  alt={mention.name}
                                />
                              )}
                              <AvatarFallback className="text-xs">
                                {(mention as any).icon?.emoji || "W"}
                              </AvatarFallback>
                            </Avatar>
                            <span>{mention.name}</span>
                          </>
                        )}
                        {(mention.type === "mcpTool" ||
                          mention.type === "mcpServer") && (
                          <span>{mention.name}</span>
                        )}
                        <button
                          onClick={() => handleRemoveMention(index)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Message
                </label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter your message..."
                  rows={6}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      handleSubmit();
                    }
                  }}
                />
              </div>

              <Button
                onClick={handleSubmit}
                disabled={isLoading || !message.trim()}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Create Job
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Current Job Status */}
          {currentJob && (
            <Card>
              <CardHeader>
                <CardTitle>Current Job</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        getStatusColor(currentJob.status),
                      )}
                    />
                    <span className="font-medium capitalize">
                      {currentJob.status}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>Iteration: {currentJob.currentIteration}</div>
                    <div className="flex items-center gap-2">
                      <span>Job ID:</span>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {currentJob.jobId.slice(0, 8)}...
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-4 w-4 p-0"
                        onClick={() => copyToClipboard(currentJob.jobId)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>Correlation ID:</span>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {currentJob.correlationId.slice(0, 8)}...
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-4 w-4 p-0"
                        onClick={() =>
                          copyToClipboard(currentJob.correlationId)
                        }
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                {currentJob.error && (
                  <div className="p-2 bg-red-50 dark:bg-red-950 rounded text-sm text-red-700 dark:text-red-300">
                    {currentJob.error}
                  </div>
                )}

                <div className="flex gap-2">
                  {(currentJob.status === "paused" ||
                    currentJob.status === "failed") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleResume}
                      className="flex-1"
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Resume
                    </Button>
                  )}
                  {(currentJob.status === "running" ||
                    currentJob.status === "pending") && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleCancel}
                      className="flex-1"
                    >
                      <Square className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Job Details & Tracing */}
        <div className="lg:col-span-2 space-y-4">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="iterations">
                Iterations ({jobDetails.iterations.length})
              </TabsTrigger>
              <TabsTrigger value="summaries">
                Summaries ({jobDetails.summaries.length})
              </TabsTrigger>
              <TabsTrigger value="tracing">Tracing</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Job Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  {jobDetails.job ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground">
                            Status
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div
                              className={cn(
                                "w-2 h-2 rounded-full",
                                getStatusColor(jobDetails.job.status),
                              )}
                            />
                            <span className="font-medium capitalize">
                              {jobDetails.job.status}
                            </span>
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">
                            Iterations
                          </div>
                          <div className="font-medium mt-1">
                            {jobDetails.job.currentIteration}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">
                            Total Tokens
                          </div>
                          <div className="font-medium mt-1">
                            {totalTokens.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">
                            Created
                          </div>
                          <div className="font-medium mt-1">
                            {formatDistanceToNow(
                              new Date(jobDetails.job.createdAt),
                              { addSuffix: true },
                            )}
                          </div>
                        </div>
                      </div>

                      {jobDetails.job.metadata.chatModel && (
                        <div>
                          <div className="text-sm text-muted-foreground">
                            Model
                          </div>
                          <div className="font-medium mt-1">
                            {jobDetails.job.metadata.chatModel.provider}/
                            {jobDetails.job.metadata.chatModel.model}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No job selected
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="iterations" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Iterations</CardTitle>
                  <CardDescription>
                    Each LLM call iteration with token usage and tool calls
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-4">
                      {jobDetails.iterations.length > 0 ? (
                        jobDetails.iterations.map((iteration, _idx) => (
                          <Card key={iteration.id}>
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-base">
                                  Iteration #{iteration.iterationNumber}
                                </CardTitle>
                                <Badge variant="outline">
                                  {iteration.totalTokens.toLocaleString()}{" "}
                                  tokens
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <div className="text-muted-foreground">
                                    Input
                                  </div>
                                  <div className="font-medium">
                                    {iteration.inputTokens.toLocaleString()}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">
                                    Output
                                  </div>
                                  <div className="font-medium">
                                    {iteration.outputTokens.toLocaleString()}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">
                                    Duration
                                  </div>
                                  <div className="font-medium">
                                    {iteration.duration
                                      ? `${(iteration.duration / 1000).toFixed(1)}s`
                                      : "N/A"}
                                  </div>
                                </div>
                              </div>

                              {iteration.error && (
                                <div className="p-2 bg-red-50 dark:bg-red-950 rounded text-sm text-red-700 dark:text-red-300">
                                  <AlertCircle className="inline h-4 w-4 mr-1" />
                                  {iteration.error}
                                </div>
                              )}

                              {iteration.toolCalls &&
                                iteration.toolCalls.length > 0 && (
                                  <div>
                                    <div className="text-sm font-medium mb-2">
                                      Tool Calls ({iteration.toolCalls.length})
                                    </div>
                                    <div className="space-y-2">
                                      {iteration.toolCalls.map((toolCall) => (
                                        <div
                                          key={toolCall.toolCallId}
                                          className="p-2 bg-muted rounded text-sm"
                                        >
                                          <div className="font-medium">
                                            {toolCall.toolName}
                                          </div>
                                          {toolCall.duration && (
                                            <div className="text-xs text-muted-foreground">
                                              Duration:{" "}
                                              {(
                                                toolCall.duration / 1000
                                              ).toFixed(2)}
                                              s
                                            </div>
                                          )}
                                          {toolCall.error && (
                                            <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                                              Error: {toolCall.error}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                              <div className="text-xs text-muted-foreground">
                                Started:{" "}
                                {formatDistanceToNow(
                                  new Date(iteration.startedAt),
                                  { addSuffix: true },
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No iterations yet
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="summaries" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Context Summaries</CardTitle>
                  <CardDescription>
                    Conversation summaries created to manage context window
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-4">
                      {jobDetails.summaries.length > 0 ? (
                        jobDetails.summaries.map((summary) => (
                          <Card key={summary.id}>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base">
                                Summary #{summary.id.slice(0, 8)}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="text-sm">
                                {summary.summaryText}
                              </div>
                              <Separator />
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <div className="text-muted-foreground">
                                    Messages Summarized
                                  </div>
                                  <div className="font-medium">
                                    {summary.messagesSummarized}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">
                                    Tokens Before
                                  </div>
                                  <div className="font-medium">
                                    {summary.tokenCountBefore.toLocaleString()}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">
                                    Tokens After
                                  </div>
                                  <div className="font-medium">
                                    {summary.tokenCountAfter.toLocaleString()}
                                  </div>
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Created:{" "}
                                {formatDistanceToNow(
                                  new Date(summary.createdAt),
                                  { addSuffix: true },
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No summaries yet
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tracing" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Tracing Information</CardTitle>
                  <CardDescription>
                    Correlation IDs and observability data
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {jobDetails.job ? (
                    <div className="space-y-4">
                      <div>
                        <div className="text-sm font-medium mb-2">
                          Correlation ID
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-3 py-2 bg-muted rounded text-sm font-mono">
                            {jobDetails.job.correlationId}
                          </code>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              copyToClipboard(jobDetails.job!.correlationId)
                            }
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-medium mb-2">Job ID</div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-3 py-2 bg-muted rounded text-sm font-mono">
                            {jobDetails.job.id}
                          </code>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyToClipboard(jobDetails.job!.id)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-medium mb-2">
                          Thread ID
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-3 py-2 bg-muted rounded text-sm font-mono">
                            {jobDetails.job.threadId}
                          </code>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              copyToClipboard(jobDetails.job!.threadId)
                            }
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <div className="text-sm font-medium mb-2">
                          View Thread
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => {
                            window.open(
                              `/chat/${jobDetails.job!.threadId}`,
                              "_blank",
                            );
                          }}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Open Thread
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No job selected
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Results Section - Show conversation as it streams */}
          {(jobDetails.job ||
            streamingMessages.size > 0 ||
            threadMessages.length > 0) && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Conversation Results</CardTitle>
                <CardDescription>
                  {jobDetails.job?.status === "completed"
                    ? "View the complete conversation from this job"
                    : "Watch the conversation stream in real-time"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-6 py-4">
                    {(() => {
                      // Combine completed and streaming messages
                      const allMessages = [
                        ...threadMessages,
                        ...Array.from(streamingMessages.values()),
                      ];

                      if (allMessages.length > 0) {
                        return allMessages.map((msg, index) => {
                          // Skip system messages
                          if (msg.role === "system") return null;

                          // Filter out ingestion preview parts
                          const partsForDisplay = msg.parts.filter(
                            (part: any) =>
                              !(part.type === "text" && part.ingestionPreview),
                          );

                          if (partsForDisplay.length === 0) return null;

                          const isStreaming = streamingMessages.has(msg.id);

                          return (
                            <div
                              key={msg.id}
                              className={isStreaming ? "opacity-75" : ""}
                            >
                              {isStreaming && (
                                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                                  <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                                  Streaming...
                                </div>
                              )}
                              <PreviewMessage
                                message={{
                                  ...msg,
                                  parts: partsForDisplay,
                                }}
                                prevMessage={allMessages[index - 1]}
                                threadId={
                                  jobDetails.job?.threadId || currentJob?.jobId
                                }
                                readonly={true}
                                isLastMessage={index === allMessages.length - 1}
                                messageIndex={index}
                              />
                            </div>
                          );
                        });
                      } else {
                        return (
                          <div className="text-center py-8 text-muted-foreground">
                            {jobDetails.job?.status === "running"
                              ? "Waiting for messages to stream..."
                              : "No messages available. Messages may still be loading..."}
                          </div>
                        );
                      }
                    })()}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
