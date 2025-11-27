"use client";

import { useTranslations } from "next-intl";
import { Label } from "ui/label";
import { ScrollArea } from "ui/scroll-area";
import { Skeleton } from "ui/skeleton";
import { Alert, AlertDescription } from "ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "ui/tabs";
import { PreviewMessage } from "./message";
import { UIMessage } from "ai";

interface Response {
  status: number | null;
  headers: Record<string, string>;
  body: string | null;
  rawStream: string | null;
  parsedMessage: UIMessage | null;
  error: string | null;
}

interface MCPPlaygroundResponseProps {
  response: Response | null;
  isLoading: boolean;
}

function parseStreamToUIMessage(streamData: string): UIMessage | null {
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
        } else if (data.type === "tool-result") {
          const existingTool = toolParts.find(
            (p) => p.toolCallId === data.toolCallId,
          );
          if (existingTool) {
            existingTool.result = data.result;
          } else {
            toolParts.push({
              type: "tool-result",
              toolCallId: data.toolCallId,
              result: data.result,
            });
          }
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
}

export function MCPPlaygroundResponse({
  response,
  isLoading,
}: MCPPlaygroundResponseProps) {
  const t = useTranslations("MCP");

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label>{t("response")}</Label>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-[200px] w-full" />
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="space-y-2">
        <Label>{t("response")}</Label>
        <div className="h-[200px] rounded-md border flex items-center justify-center text-muted-foreground">
          No response yet. Send a request to see the response here.
        </div>
      </div>
    );
  }

  const parsedMessage =
    response.parsedMessage ||
    (response.rawStream ? parseStreamToUIMessage(response.rawStream) : null);

  return (
    <div className="space-y-2">
      <Label>{t("response")}</Label>
      {response.error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{response.error}</AlertDescription>
        </Alert>
      )}
      {response.status && (
        <div className="text-sm mb-2">
          <span className="font-semibold">Status: </span>
          <span
            className={
              response.status >= 200 && response.status < 300
                ? "text-green-600"
                : "text-red-600"
            }
          >
            {response.status}
          </span>
        </div>
      )}

      <Tabs defaultValue="preview" className="w-full">
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="raw">Raw</TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="mt-4">
          <ScrollArea className="h-[400px] rounded-md border p-4">
            {parsedMessage ? (
              <div className="space-y-4">
                <PreviewMessage
                  message={parsedMessage}
                  prevMessage={undefined}
                  readonly={true}
                  threadId="playground"
                />
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">
                Unable to parse response. Check Raw tab for details.
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="raw" className="mt-4">
          <ScrollArea className="h-[400px] rounded-md border p-4 bg-muted">
            {response.rawStream ? (
              <pre className="text-xs overflow-auto whitespace-pre-wrap break-words">
                {(() => {
                  try {
                    // Format SSE stream data nicely
                    const lines = response.rawStream
                      .split("\n")
                      .filter((l) => l.trim());
                    const formatted = lines
                      .map((line) => {
                        if (line.startsWith("data: ")) {
                          const dataContent = line.slice(6).trim();
                          if (dataContent === "[DONE]") {
                            return "data: [DONE]";
                          }
                          try {
                            const parsed = JSON.parse(dataContent);
                            return `data: ${JSON.stringify(parsed, null, 2)}`;
                          } catch {
                            return line;
                          }
                        }
                        return line;
                      })
                      .join("\n");
                    return formatted || response.rawStream;
                  } catch {
                    return response.rawStream;
                  }
                })()}
              </pre>
            ) : (
              <div className="text-muted-foreground text-sm">
                No raw response data
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
