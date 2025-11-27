"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "ui/button";
import { Label } from "ui/label";
import { ScrollArea } from "ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { generateUUID } from "lib/utils";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useCopy } from "@/hooks/use-copy";
import { useAgents } from "@/hooks/queries/use-agents";
import useSWR from "swr";
import { fetcher } from "lib/utils";
import { CodeBlock } from "ui/CodeBlock";

interface PlaygroundConfig {
  apiKey: string | null;
  chatModel: { provider: string; model: string } | null;
  toolChoice: "auto" | "none" | "manual";
  selectedAgents: string[];
  selectedMcpServers: Record<string, string[]>; // serverId -> tool names
  selectedWorkflows: string[];
  selectedDefaultTools: string[];
  message: string;
}

interface MCPPlaygroundExportProps {
  config: PlaygroundConfig;
}

export function MCPPlaygroundExport({ config }: MCPPlaygroundExportProps) {
  const t = useTranslations("MCP");
  const { copy, copied } = useCopy();
  const { agents } = useAgents();
  const { data: workflows = [] } = useSWR("/api/workflow", fetcher);
  const [environment, setEnvironment] = useState<"localhost" | "production">(
    "localhost",
  );

  const curlCommand = useMemo(() => {
    const threadId = generateUUID();
    const messageId = generateUUID();

    const mentions: any[] = [];

    // Add agent mentions
    for (const agentId of config.selectedAgents) {
      const agent = agents.find((a) => a.id === agentId);
      mentions.push({
        type: "agent",
        agentId,
        name: agent?.name || "",
      });
    }

    // Add workflow mentions
    for (const workflowId of config.selectedWorkflows) {
      const workflow = workflows.find((w: any) => w.id === workflowId);
      mentions.push({
        type: "workflow",
        workflowId,
        name: workflow?.name || "",
      });
    }

    // Build allowedMcpServers object
    const allowedMcpServers: Record<string, { tools: string[] }> = {};
    for (const [serverId, tools] of Object.entries(config.selectedMcpServers)) {
      if (tools.length > 0) {
        allowedMcpServers[serverId] = { tools };
      }
    }

    const body = {
      id: threadId,
      message: {
        id: messageId,
        role: "user",
        parts: [{ type: "text", text: config.message || "" }],
      },
      chatModel: config.chatModel || undefined,
      toolChoice: config.toolChoice,
      mentions: mentions.length > 0 ? mentions : undefined,
      allowedMcpServers:
        Object.keys(allowedMcpServers).length > 0
          ? allowedMcpServers
          : undefined,
      allowedAppDefaultToolkit:
        config.selectedDefaultTools.length > 0
          ? config.selectedDefaultTools
          : undefined,
      attachments: [],
    };

    // Remove undefined fields
    const cleanBody = JSON.parse(JSON.stringify(body));
    const bodyJson = JSON.stringify(cleanBody, null, 2);

    const baseUrl =
      environment === "localhost"
        ? "http://localhost:3000"
        : typeof window !== "undefined"
          ? window.location.origin
          : "https://your-domain.com";

    const headers = [`-H "Content-Type: application/json"`];

    if (config.apiKey) {
      headers.push(`-H "Authorization: Bearer ${config.apiKey}"`);
    } else {
      headers.push(`-H "Authorization: Bearer YOUR_API_KEY"`);
    }

    const curl = `curl -X POST ${baseUrl}/api/chat \\
  ${headers.join(" \\\n  ")} \\
  -d '${bodyJson.replace(/'/g, "'\\''")}'`;

    return curl;
  }, [config, environment, agents, workflows]);

  const handleCopy = () => {
    copy(curlCommand);
    toast.success(t("copied"));
  };

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      {/* Header with controls */}
      <div className="flex items-center justify-between gap-4">
        <Label className="text-base font-semibold">curl Command</Label>
        <div className="flex items-center gap-2">
          <Select
            value={environment}
            onValueChange={(v: "localhost" | "production") => setEnvironment(v)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="localhost">localhost</SelectItem>
              <SelectItem value="production">production</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={copied ? "default" : "outline"}
            size="default"
            onClick={handleCopy}
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="size-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Copy
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Code block with syntax highlighting */}
      <div className="flex-1 min-h-0 relative rounded-lg border bg-muted/50 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <div className="p-4">
            <CodeBlock
              code={curlCommand}
              lang="bash"
              fallback={
                <pre className="text-xs overflow-auto whitespace-pre-wrap wrap-break-words font-mono">
                  {curlCommand}
                </pre>
              }
              className="bg-transparent p-0 text-xs"
              showLineNumbers={false}
            />
          </div>
        </ScrollArea>
      </div>

      {/* Footer note */}
      {!config.apiKey && (
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Note:</span> Add{" "}
            <code className="px-1.5 py-0.5 bg-background rounded text-xs font-mono">
              -H "Authorization: Bearer YOUR_API_KEY"
            </code>{" "}
            to use API key authentication.
          </p>
        </div>
      )}
    </div>
  );
}
