"use client";

import { useState, useMemo } from "react";
import { Button } from "ui/button";
import { Label } from "ui/label";
import { toast } from "sonner";
import { Agent } from "app-types/agent";
import { Copy, Check } from "lucide-react";

interface McpExportDialogProps {
  agent: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function McpExportDialog({
  agent,
  open,
  onOpenChange,
}: McpExportDialogProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const mcpServerUrl = `${baseUrl}/api/mcp/agent/${agent.id}`;

  const mcpConfig = useMemo(() => {
    return {
      type: "http",
      url: mcpServerUrl,
      headers: {
        Authorization: "Bearer YOUR_API_KEY",
      },
    };
  }, [mcpServerUrl]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(mcpServerUrl);
      setCopiedUrl(true);
      toast.success("MCP server URL copied to clipboard!");
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (_error) {
      toast.error("Failed to copy URL");
    }
  };

  const handleCopyConfig = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(mcpConfig, null, 2));
      setCopiedConfig(true);
      toast.success("MCP configuration copied to clipboard!");
      setTimeout(() => setCopiedConfig(false), 2000);
    } catch (_error) {
      toast.error("Failed to copy configuration");
    }
  };

  if (!open) return null;

  const toolCount =
    agent.instructions?.mentions?.filter(
      (m) =>
        m.type === "mcpTool" ||
        m.type === "defaultTool" ||
        m.type === "workflow",
    ).length || 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="fixed left-[50%] top-[50%] z-50 w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Export as MCP Server</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              ×
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Export this agent as a Model Context Protocol (MCP) server. The
            server exposes the agent's instructions and forwards all its tools
            for use in external applications.
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">MCP Server URL</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyUrl}
                className="h-8"
              >
                {copiedUrl ? (
                  <>
                    <Check className="mr-2 size-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 size-3" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <div className="relative">
              <pre className="p-4 bg-secondary rounded-md overflow-x-auto text-xs">
                <code>{mcpServerUrl}</code>
              </pre>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                MCP Client Configuration
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyConfig}
                className="h-8"
              >
                {copiedConfig ? (
                  <>
                    <Check className="mr-2 size-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 size-3" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <div className="relative">
              <pre className="p-4 bg-secondary rounded-md overflow-x-auto text-xs">
                <code>{JSON.stringify(mcpConfig, null, 2)}</code>
              </pre>
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-semibold">Server Information</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Agent:</span>{" "}
                <span className="font-medium">{agent.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tools:</span>{" "}
                <span className="font-medium">{toolCount} forwarded</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              Authentication
            </h3>
            <p className="text-xs text-blue-800 dark:text-blue-200">
              Use your API key in the Authorization header. Create an API key
              from your account settings if you don't have one.
            </p>
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-semibold">Available Tools</h3>
            <div className="space-y-1">
              <div className="text-xs font-medium">Core Tools:</div>
              <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                <li>
                  <code className="bg-secondary px-1 py-0.5 rounded">
                    list_tools
                  </code>{" "}
                  - Lists all tools available from this agent
                </li>
                <li>
                  <code className="bg-secondary px-1 py-0.5 rounded">
                    delegateToAgent
                  </code>{" "}
                  - Calls the chat route using this agent and returns the
                  response
                </li>
                <li>
                  <code className="bg-secondary px-1 py-0.5 rounded">
                    getInstructions
                  </code>{" "}
                  - Returns the agent's instructions (role, system prompt,
                  mentions)
                </li>
              </ul>
              {toolCount > 0 && (
                <>
                  <div className="text-xs font-medium mt-2">
                    Forwarded Tools ({toolCount}):
                  </div>
                  <p className="text-xs text-muted-foreground">
                    All tools configured in this agent are automatically
                    forwarded and available through the MCP server.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
