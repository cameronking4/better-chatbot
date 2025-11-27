"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Label } from "ui/label";
import { ScrollArea } from "ui/scroll-area";
import { generateUUID } from "lib/utils";
import { useAgents } from "@/hooks/queries/use-agents";
import useSWR from "swr";
import { fetcher } from "lib/utils";

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

interface MCPPlaygroundRequestProps {
  config: PlaygroundConfig;
}

export function MCPPlaygroundRequest({ config }: MCPPlaygroundRequestProps) {
  const _t = useTranslations("MCP");
  const { agents } = useAgents();
  const { data: workflows = [] } = useSWR("/api/workflow", fetcher);

  const requestBody = useMemo(() => {
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
    return JSON.parse(JSON.stringify(body));
  }, [config, agents, workflows]);

  return (
    <div>
      {/* <Label>{t("requestBody")}</Label> */}
      <ScrollArea className="h-[300px] rounded-md border p-4">
        <pre className="text-xs overflow-auto">
          {JSON.stringify(requestBody, null, 2)}
        </pre>
      </ScrollArea>
    </div>
  );
}
