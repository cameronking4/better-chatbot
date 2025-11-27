"use client";

import { useTranslations } from "next-intl";
import { Label } from "ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { Checkbox } from "ui/checkbox";
import { useChatModels } from "@/hooks/queries/use-chat-models";
import { useAgents } from "@/hooks/queries/use-agents";
import { useMcpList } from "@/hooks/queries/use-mcp-list";
import useSWR from "swr";
import { fetcher } from "lib/utils";
import { AppDefaultToolkit } from "lib/ai/tools";
import { Input } from "ui/input";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

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

interface MCPPlaygroundConfigProps {
  config: PlaygroundConfig;
  updateConfig: (updates: Partial<PlaygroundConfig>) => void;
  section?:
    | "auth"
    | "model"
    | "agents"
    | "mcpServers"
    | "workflows"
    | "defaultTools";
}

export function MCPPlaygroundConfig({
  config,
  updateConfig,
  section,
}: MCPPlaygroundConfigProps) {
  const t = useTranslations("MCP");
  const { data: providers } = useChatModels();
  const { agents } = useAgents();
  const { data: mcpList } = useMcpList();
  const { data: workflows = [] } = useSWR("/api/workflow", fetcher);

  const [expandedServers, setExpandedServers] = useState<
    Record<string, boolean>
  >({});

  const toggleServer = (serverId: string) => {
    setExpandedServers((prev) => ({
      ...prev,
      [serverId]: !prev[serverId],
    }));
  };

  const allModels =
    providers?.flatMap((p) =>
      p.models.map((m) => ({
        provider: p.provider,
        model: m.name,
        label: `${p.provider}/${m.name}`,
      })),
    ) || [];

  const defaultToolOptions = [
    { value: AppDefaultToolkit.Visualization, label: "Visualization" },
    { value: AppDefaultToolkit.WebSearch, label: "Web Search" },
    { value: AppDefaultToolkit.Http, label: "HTTP" },
    { value: AppDefaultToolkit.Code, label: "Code" },
    { value: AppDefaultToolkit.Agent, label: "Agent" },
    { value: AppDefaultToolkit.Workflow, label: "Workflow" },
    { value: AppDefaultToolkit.Schedule, label: "Schedule" },
  ];

  // Auth section
  if (section === "auth") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t("apiKey")}</Label>
          <Input
            type="password"
            value={config.apiKey || ""}
            onChange={(e) => updateConfig({ apiKey: e.target.value || null })}
            placeholder="Enter API key (leave empty to use session auth)"
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to use your current session authentication
          </p>
        </div>
      </div>
    );
  }

  // Model section
  if (section === "model") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t("model")}</Label>
          <Select
            value={
              config.chatModel
                ? `${config.chatModel.provider}/${config.chatModel.model}`
                : ""
            }
            onValueChange={(value) => {
              const [provider, model] = value.split("/");
              if (provider && model) {
                updateConfig({ chatModel: { provider, model } });
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("selectModel")} />
            </SelectTrigger>
            <SelectContent>
              {allModels.map((m) => (
                <SelectItem key={m.label} value={m.label}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("toolChoice")}</Label>
          <Select
            value={config.toolChoice}
            onValueChange={(value: "auto" | "none" | "manual") =>
              updateConfig({ toolChoice: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{t("toolChoiceAuto")}</SelectItem>
              <SelectItem value="none">{t("toolChoiceNone")}</SelectItem>
              <SelectItem value="manual">{t("toolChoiceManual")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  // Agents section
  if (section === "agents") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t("agents")}</Label>
          <Select
            value=""
            onValueChange={(agentId) => {
              if (agentId && !config.selectedAgents.includes(agentId)) {
                updateConfig({
                  selectedAgents: [...config.selectedAgents, agentId],
                });
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("selectAgents")} />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {config.selectedAgents.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {config.selectedAgents.map((agentId) => {
                const agent = agents.find((a) => a.id === agentId);
                return (
                  <div
                    key={agentId}
                    className="flex items-center gap-1 px-2 py-1 bg-secondary rounded text-sm"
                  >
                    <span>{agent?.name || agentId}</span>
                    <button
                      onClick={() =>
                        updateConfig({
                          selectedAgents: config.selectedAgents.filter(
                            (id) => id !== agentId,
                          ),
                        })
                      }
                      className="ml-1 hover:text-destructive"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // MCP Servers section
  if (section === "mcpServers") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t("mcpTools")}</Label>
          <div className="space-y-2">
            {mcpList?.map((server) => {
              const isExpanded = expandedServers[server.id];
              const selectedTools = config.selectedMcpServers[server.id] || [];
              const serverTools = server.toolInfo || [];
              const allToolsSelected =
                serverTools.length > 0 &&
                serverTools.every((tool) => selectedTools.includes(tool.name));
              const someToolsSelected =
                selectedTools.length > 0 && !allToolsSelected;

              const handleSelectAll = () => {
                if (allToolsSelected) {
                  // Deselect all
                  updateConfig({
                    selectedMcpServers: {
                      ...config.selectedMcpServers,
                      [server.id]: [],
                    },
                  });
                } else {
                  // Select all
                  updateConfig({
                    selectedMcpServers: {
                      ...config.selectedMcpServers,
                      [server.id]: serverTools.map((tool) => tool.name),
                    },
                  });
                }
              };

              return (
                <div key={server.id} className="border rounded-md">
                  <button
                    type="button"
                    onClick={() => toggleServer(server.id)}
                    className="flex items-center gap-2 w-full text-left p-2 hover:bg-accent rounded-t-md"
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                    <span className="flex-1">{server.name}</span>
                    {selectedTools.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {selectedTools.length}/{serverTools.length} selected
                      </span>
                    )}
                  </button>
                  {isExpanded && (
                    <div className="pl-6 space-y-2 mt-2 pb-2">
                      {/* Select All checkbox */}
                      {serverTools.length > 0 && (
                        <div className="flex items-center space-x-2 pb-2 border-b">
                          <Checkbox
                            checked={allToolsSelected}
                            onCheckedChange={handleSelectAll}
                          />
                          <label
                            className="text-sm font-medium cursor-pointer"
                            onClick={handleSelectAll}
                          >
                            Select All ({serverTools.length} tools)
                            {someToolsSelected && (
                              <span className="text-muted-foreground ml-1">
                                ({selectedTools.length} selected)
                              </span>
                            )}
                          </label>
                        </div>
                      )}
                      {/* Individual tool checkboxes */}
                      {serverTools.map((tool) => {
                        const isSelected = selectedTools.includes(tool.name);
                        return (
                          <div
                            key={tool.name}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                const current =
                                  config.selectedMcpServers[server.id] || [];
                                const updated = checked
                                  ? [...current, tool.name]
                                  : current.filter((t) => t !== tool.name);
                                updateConfig({
                                  selectedMcpServers: {
                                    ...config.selectedMcpServers,
                                    [server.id]: updated,
                                  },
                                });
                              }}
                            />
                            <label className="text-sm cursor-pointer">
                              {tool.name}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Workflows section
  if (section === "workflows") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t("workflows")}</Label>
          <Select
            value=""
            onValueChange={(workflowId) => {
              if (
                workflowId &&
                !config.selectedWorkflows.includes(workflowId)
              ) {
                updateConfig({
                  selectedWorkflows: [...config.selectedWorkflows, workflowId],
                });
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("selectWorkflows")} />
            </SelectTrigger>
            <SelectContent>
              {workflows.map((workflow: any) => (
                <SelectItem key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {config.selectedWorkflows.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {config.selectedWorkflows.map((workflowId) => {
                const workflow = workflows.find(
                  (w: any) => w.id === workflowId,
                );
                return (
                  <div
                    key={workflowId}
                    className="flex items-center gap-1 px-2 py-1 bg-secondary rounded text-sm"
                  >
                    <span>{workflow?.name || workflowId}</span>
                    <button
                      onClick={() =>
                        updateConfig({
                          selectedWorkflows: config.selectedWorkflows.filter(
                            (id) => id !== workflowId,
                          ),
                        })
                      }
                      className="ml-1 hover:text-destructive"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default Tools section
  if (section === "defaultTools") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t("defaultTools")}</Label>
          <div className="space-y-2">
            {defaultToolOptions.map((tool) => (
              <div key={tool.value} className="flex items-center space-x-2">
                <Checkbox
                  checked={config.selectedDefaultTools.includes(tool.value)}
                  onCheckedChange={(checked) => {
                    const updated = checked
                      ? [...config.selectedDefaultTools, tool.value]
                      : config.selectedDefaultTools.filter(
                          (t) => t !== tool.value,
                        );
                    updateConfig({ selectedDefaultTools: updated });
                  }}
                />
                <label className="text-sm cursor-pointer">{tool.label}</label>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Default: show all (for backward compatibility)
  return null;
}
