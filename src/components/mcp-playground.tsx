"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "ui/card";
import { Button } from "ui/button";
import { ScrollArea } from "ui/scroll-area";
import { Textarea } from "ui/textarea";
import { Label } from "ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "ui/tabs";
import { ChevronDown, ChevronUp, Send, TerminalSquare } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "ui/dialog";
import { useAgents } from "@/hooks/queries/use-agents";
import { MCPPlaygroundConfig } from "./mcp-playground-config";
import { MCPPlaygroundRequest } from "./mcp-playground-request";
import { MCPPlaygroundResponse } from "./mcp-playground-response";
import { MCPPlaygroundExport } from "./mcp-playground-export";
import { UIMessage } from "ai";

interface PlaygroundConfig {
  apiKey: string | null;
  chatModel: { provider: string; model: string } | null;
  toolChoice: "auto" | "none" | "manual";
  selectedAgents: string[];
  selectedMcpServers: Record<string, string[]>;
  selectedWorkflows: string[];
  selectedDefaultTools: string[];
  message: string;
}

const STORAGE_KEY = "mcp-playground-config";

export default function MCPPlayground() {
  const t = useTranslations("MCP");
  const { agents } = useAgents();
  const [config, setConfig] = useState<PlaygroundConfig>({
    apiKey: null,
    chatModel: null,
    toolChoice: "auto",
    selectedAgents: [],
    selectedMcpServers: {},
    selectedWorkflows: [],
    selectedDefaultTools: [],
    message: "",
  });

  const [response, setResponse] = useState<{
    status: number | null;
    headers: Record<string, string>;
    body: string | null;
    rawStream: string | null;
    parsedMessage: UIMessage | null;
    error: string | null;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showRequestBody, setShowRequestBody] = useState(false);

  // Load config from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConfig((prev) => ({ ...prev, ...parsed }));
      } catch (_e) {
        // Ignore parse errors
      }
    }
  }, []);

  // Save config to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const updateConfig = useCallback((updates: Partial<PlaygroundConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const parseStreamResponse = useCallback(
    (streamData: string): UIMessage | null => {
      try {
        // Parse SSE format: data: {...} or data: [DONE]
        const lines = streamData.split("\n").filter((line) => line.trim());
        let messageId: string | null = null;
        let textContent = "";
        const toolParts: any[] = [];

        for (const line of lines) {
          // Handle SSE format: "data: {...}" or "data: [DONE]"
          if (!line.startsWith("data: ")) {
            // Skip non-SSE lines
            continue;
          }

          const dataContent = line.slice(6).trim(); // Remove "data: " prefix

          // Handle [DONE] marker
          if (dataContent === "[DONE]") {
            break;
          }

          try {
            const data = JSON.parse(dataContent);

            // Extract messageId from start event
            if (data.type === "start" && data.messageId) {
              messageId = data.messageId;
            }

            // Accumulate text deltas
            if (data.type === "text-delta" && data.delta) {
              textContent += data.delta;
            }

            // Handle tool calls/results if needed
            if (data.type === "tool-call") {
              toolParts.push({
                type: "tool-call",
                toolCallId: data.toolCallId,
                toolName: data.toolName,
                args: data.args,
              });
            }
          } catch (_e) {
            // Skip invalid JSON
            continue;
          }
        }

        // Build UIMessage if we have content
        if (messageId || textContent || toolParts.length > 0) {
          const parts: any[] = [];

          if (textContent) {
            parts.push({
              type: "text",
              text: textContent,
            });
          }

          parts.push(...toolParts);

          return {
            id: messageId || crypto.randomUUID(),
            role: "assistant",
            parts,
          };
        }

        return null;
      } catch (_e) {
        return null;
      }
    },
    [],
  );

  const handleSendRequest = useCallback(async () => {
    if (!config.message.trim()) {
      toast.error(t("enterMessageToSend"));
      return;
    }

    setIsLoading(true);
    setResponse(null);

    try {
      // Transform selectedMcpServers from Record<string, string[]> to Record<string, { tools: string[] }>
      const allowedMcpServers = Object.keys(config.selectedMcpServers).reduce(
        (acc, serverId) => {
          const tools = config.selectedMcpServers[serverId];
          if (tools && tools.length > 0) {
            acc[serverId] = { tools };
          }
          return acc;
        },
        {} as Record<string, { tools: string[] }>,
      );

      const requestBody = {
        id: crypto.randomUUID(),
        message: {
          id: crypto.randomUUID(),
          role: "user" as const,
          parts: [{ type: "text", text: config.message }],
        },
        chatModel: config.chatModel || undefined,
        toolChoice: config.toolChoice,
        mentions: [] as any[],
        allowedMcpServers:
          Object.keys(allowedMcpServers).length > 0
            ? allowedMcpServers
            : undefined,
        allowedAppDefaultToolkit: config.selectedDefaultTools,
        attachments: [],
      };

      for (const agentId of config.selectedAgents) {
        const agent = agents.find((a) => a.id === agentId);
        requestBody.mentions.push({
          type: "agent",
          agentId,
          name: agent?.name || "",
        });
      }

      const workflowsResponse = await fetch("/api/workflow");
      const workflows = await workflowsResponse.json();
      for (const workflowId of config.selectedWorkflows) {
        const workflow = workflows.find((w: any) => w.id === workflowId);
        requestBody.mentions.push({
          type: "workflow",
          workflowId,
          name: workflow?.name || "",
        });
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      let rawStream = "";
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let done = false;

        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            rawStream += chunk;
          }
        }
      }

      const parsedMessage = parseStreamResponse(rawStream);

      setResponse({
        status: response.status,
        headers: responseHeaders,
        body: rawStream,
        rawStream,
        parsedMessage,
        error: response.ok ? null : rawStream || "Request failed",
      });

      if (response.ok) {
        toast.success(t("requestSent"));
      } else {
        toast.error(t("requestFailed"));
      }
    } catch (error: any) {
      setResponse({
        status: null,
        headers: {},
        body: null,
        rawStream: null,
        parsedMessage: null,
        error: error.message || "Failed to send request",
      });
      toast.error(t("requestFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [config, t, agents, parseStreamResponse]);

  const handleClear = useCallback(() => {
    setConfig({
      apiKey: null,
      chatModel: null,
      toolChoice: "auto",
      selectedAgents: [],
      selectedMcpServers: {},
      selectedWorkflows: [],
      selectedDefaultTools: [],
      message: "",
    });
    setResponse(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSendRequest();
      }
    },
    [handleSendRequest],
  );

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-[1600px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("playgroundTitle")}</h1>
          <p className="text-muted-foreground mt-2">
            {t("playgroundDescription")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowExport(!showExport)}>
            <TerminalSquare className="size-4" />
            {t("exportCurl")}
          </Button>
        </div>
      </div>

      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("exportCurl")}</DialogTitle>
          </DialogHeader>
          <MCPPlaygroundExport config={config} />
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
        {/* Left: Configuration Panel */}
        <Card>
          <CardContent className="h-full">
            <Tabs defaultValue="auth" className="w-full">
              <div className="flex flex-col md:flex-row gap-4 md:gap-4">
                {/* Tabs Sidebar - Vertical on md+, Horizontal on small */}
                {(() => {
                  const tabItems = [
                    { value: "auth", label: "Setup" },
                    { value: "agents", label: "Agents" },
                    { value: "mcpServers", label: "MCP Servers" },
                    { value: "workflows", label: "Workflows" },
                    { value: "defaultTools", label: "Default Tools" },
                  ] as const;

                  return (
                    <TabsList className="inline-flex flex-row md:flex-col h-auto md:h-fit w-full md:w-48 shrink-0 p-1 md:p-2 rounded-lg bg-muted/50">
                      {tabItems.map((tab) => (
                        <TabsTrigger
                          key={tab.value}
                          value={tab.value}
                          className="w-full md:w-full justify-start px-3 py-2 h-auto"
                        >
                          {tab.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  );
                })()}

                {/* Content Area */}
                <div className="flex-1 min-w-0">
                  <ScrollArea className="h-full">
                    <TabsContent
                      value="auth"
                      className="space-y-4 mt-0 border p-6 rounded-lg bg-muted/50"
                    >
                      <MCPPlaygroundConfig
                        config={config}
                        updateConfig={updateConfig}
                        section="auth"
                      />

                      <MCPPlaygroundConfig
                        config={config}
                        updateConfig={updateConfig}
                        section="model"
                      />
                    </TabsContent>

                    <TabsContent
                      value="agents"
                      className="space-y-4 mt-0 border p-6 rounded-lg bg-muted/50"
                    >
                      <MCPPlaygroundConfig
                        config={config}
                        updateConfig={updateConfig}
                        section="agents"
                      />
                    </TabsContent>

                    <TabsContent
                      value="mcpServers"
                      className="space-y-4 mt-0 border p-6 rounded-lg bg-muted/50"
                    >
                      <MCPPlaygroundConfig
                        config={config}
                        updateConfig={updateConfig}
                        section="mcpServers"
                      />
                    </TabsContent>

                    <TabsContent
                      value="workflows"
                      className="space-y-4 mt-0 border p-6 rounded-lg bg-muted/50"
                    >
                      <MCPPlaygroundConfig
                        config={config}
                        updateConfig={updateConfig}
                        section="workflows"
                      />
                    </TabsContent>

                    <TabsContent
                      value="defaultTools"
                      className="space-y-4 mt-0 border p-6 rounded-lg bg-muted/50"
                    >
                      <MCPPlaygroundConfig
                        config={config}
                        updateConfig={updateConfig}
                        section="defaultTools"
                      />
                    </TabsContent>
                  </ScrollArea>
                </div>
              </div>
            </Tabs>
          </CardContent>
        </Card>

        {/* Right: Message Input & Response Panel */}
        <div className="flex flex-col gap-6">
          <Card className="grow">
            <CardContent>
              <div className="space-y-4">
                {/* Message Input */}
                <div className="space-y-2">
                  <Label>{t("message")}</Label>
                  <Textarea
                    value={config.message}
                    onChange={(e) => updateConfig({ message: e.target.value })}
                    placeholder={t("enterMessage")}
                    rows={4}
                    onKeyDown={handleKeyDown}
                    className="resize-none"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => setShowRequestBody(!showRequestBody)}
                    className="flex items-center justify-between w-full"
                  >
                    <span className="font-medium">Request Body</span>
                    {showRequestBody ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </Button>
                  {showRequestBody && (
                    <div className="mt-2">
                      <MCPPlaygroundRequest config={config} />
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Press Cmd/Ctrl + Enter to send
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSendRequest}
                        disabled={isLoading || !config.message.trim()}
                        className="flex items-center gap-2"
                      >
                        {isLoading ? (
                          <>
                            <div className="size-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                            {t("loading")}
                          </>
                        ) : (
                          <>
                            <Send className="size-4" />
                            {t("sendRequest")}
                          </>
                        )}
                      </Button>
                      <Button variant="outline" onClick={handleClear}>
                        {t("clear")}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="grow">
            <CardContent>
              <div className="space-y-4">
                {/* Response */}
                <MCPPlaygroundResponse
                  response={response}
                  isLoading={isLoading}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
