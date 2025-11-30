import { Worker, Job } from "bullmq";
import { redisConnection } from "./queue";
import { advancedChatRepository } from "@/lib/db/repository";
import { chatRepository } from "@/lib/db/repository";
import { publishStreamEvent } from "./advanced-chat-stream";
import logger from "logger";
import type { AdvancedChatJobData } from "./advanced-chat-queue";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  smoothStream,
  UIMessage,
} from "ai";
import { customModelProvider } from "@/lib/ai/models";
import {
  loadAllToolsForAdvanced,
  buildSystemPromptForAdvanced,
  combineTools,
} from "@/app/api/chat/advanced/shared.advanced-chat";
import {
  summarizeContext,
  checkSummarizationNeeded,
} from "@/lib/ai/context-summarizer";
import { extractTokenCount, isContextExceeded } from "@/lib/ai/token-monitor";
import { ChatTracer } from "@/lib/observability/chat-tracer";
import {
  rememberAgentAction,
  rememberMcpServerCustomizationsAction,
} from "@/app/api/chat/actions";
import { filterMcpServerCustomizations } from "@/app/api/chat/shared.chat";
import { generateUUID } from "@/lib/utils";
import { buildCsvIngestionPreviewParts } from "@/lib/ai/ingest/csv-ingest";
import { serverFileStorage } from "@/lib/file-storage";
import { convertToSavePart } from "@/app/api/chat/shared.chat";
import type { ChatMetadata } from "@/types/chat";

const MAX_ITERATIONS = 100; // Maximum number of iterations per job
const MAX_STEPS_PER_ITERATION = 100; // Maximum tool call steps per iteration

/**
 * Process an advanced chat job
 */
async function processAdvancedChatJob(
  job: Job<AdvancedChatJobData>,
): Promise<{ success: boolean; error?: string }> {
  const {
    jobId,
    threadId,
    userId,
    message,
    chatModel,
    toolChoice,
    mentions = [],
    allowedMcpServers,
    allowedAppDefaultToolkit,
    imageTool,
    attachments = [],
    correlationId,
  } = job.data;

  const tracer = new ChatTracer(correlationId, jobId);
  let actualJobId = jobId; // Will be updated to actual DB ID if found

  try {
    tracer.logInfo("Starting advanced chat job processing", {
      jobId,
      userId,
      correlationId,
    });

    // Load job from database - try by ID first, then by correlation ID
    let jobRecord = await advancedChatRepository.selectJob(jobId, userId);

    if (!jobRecord) {
      // Try to find by correlation ID as fallback (in case userId doesn't match)
      logger.warn(
        `Job ${jobId} not found by ID/userId, trying correlation ID ${correlationId}`,
      );
      const jobByCorrelation =
        await advancedChatRepository.selectJobByCorrelationId(correlationId);
      if (jobByCorrelation) {
        logger.info(
          `Found job by correlation ID: ${jobByCorrelation.id}, original jobId was ${jobId}`,
        );
        jobRecord = jobByCorrelation;
        // Use the actual job ID from database
        actualJobId = jobByCorrelation.id;
      } else {
        logger.error(
          `Job ${jobId} not found for userId ${userId}, correlationId: ${correlationId}. Available jobs for user:`,
        );
        // List jobs for debugging
        const userJobs =
          await advancedChatRepository.selectJobsByUserId(userId);
        logger.error(`User has ${userJobs.length} jobs total`);
        throw new Error(`Job ${jobId} not found`);
      }
    } else {
      // Use the actual job ID from the database record
      actualJobId = jobRecord.id;
    }

    // Update job status to running
    if (jobRecord.status === "pending") {
      await advancedChatRepository.updateJob(actualJobId, {
        status: "running",
        startedAt: new Date(),
      });
      tracer.logStateTransition("pending", "running");
      jobRecord = await advancedChatRepository.selectJob(
        actualJobId,
        jobRecord.userId,
      );
      if (!jobRecord) {
        throw new Error(`Job ${actualJobId} not found after status update`);
      }
    }

    // Load thread and messages
    const thread = await chatRepository.selectThreadDetails(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }

    if (thread.userId !== userId) {
      throw new Error("Forbidden: Thread does not belong to user");
    }

    // Get existing messages
    const messages: UIMessage[] = thread.messages.map((m) => ({
      id: m.id,
      role: m.role,
      parts: m.parts,
      metadata: m.metadata,
    }));

    // Ensure the user's initial message is saved to the thread
    const userMessageExists = messages.some((m) => m.id === message.id);
    if (!userMessageExists) {
      await chatRepository.upsertMessage({
        threadId,
        ...message,
        parts: message.parts.map(convertToSavePart),
        metadata: message.metadata as ChatMetadata | undefined,
      });
      messages.push(message);
    }

    // Remove duplicate last message if exists (in case it was already added)
    if (
      messages.length > 1 &&
      messages.at(-1)?.id == message.id &&
      messages.at(-2)?.id == message.id
    ) {
      messages.pop();
    }

    // Handle CSV ingestion preview parts
    const ingestionPreviewParts = await buildCsvIngestionPreviewParts(
      attachments,
      (key) => serverFileStorage.download(key),
    );
    if (ingestionPreviewParts.length) {
      const baseParts = [...message.parts];
      let insertionIndex = -1;
      for (let i = baseParts.length - 1; i >= 0; i -= 1) {
        if (baseParts[i]?.type === "text") {
          insertionIndex = i;
          break;
        }
      }
      if (insertionIndex !== -1) {
        baseParts.splice(insertionIndex, 0, ...ingestionPreviewParts);
        message.parts = baseParts;
      } else {
        message.parts = [...baseParts, ...ingestionPreviewParts];
      }
    }

    // Handle attachments
    if (attachments.length) {
      const firstTextIndex = message.parts.findIndex(
        (part: any) => part?.type === "text",
      );
      const attachmentParts: any[] = [];

      attachments.forEach((attachment) => {
        const exists = message.parts.some(
          (part: any) =>
            part?.type === attachment.type && part?.url === attachment.url,
        );
        if (exists) return;

        if (attachment.type === "file") {
          attachmentParts.push({
            type: "file",
            url: attachment.url,
            mediaType: attachment.mediaType,
            filename: attachment.filename,
          });
        } else if (attachment.type === "source-url") {
          attachmentParts.push({
            type: "source-url",
            url: attachment.url,
            mediaType: attachment.mediaType,
            title: attachment.filename,
          });
        }
      });

      if (attachmentParts.length) {
        if (firstTextIndex >= 0) {
          message.parts = [
            ...message.parts.slice(0, firstTextIndex),
            ...attachmentParts,
            ...message.parts.slice(firstTextIndex),
          ];
        } else {
          message.parts = [...message.parts, ...attachmentParts];
        }
      }
    }

    messages.push(message);

    // Get agent if mentioned
    const agentId = (
      mentions.find((m) => m.type === "agent") as Extract<
        (typeof mentions)[number],
        { type: "agent" }
      >
    )?.agentId;

    const agent = await rememberAgentAction(agentId, userId);
    const enhancedMentions = agent?.instructions?.mentions
      ? [...mentions, ...agent.instructions.mentions]
      : mentions;

    // Get user preferences
    const userPreferences = thread.userPreferences;

    // Load tools
    const toolsResult = await loadAllToolsForAdvanced(
      enhancedMentions,
      allowedMcpServers,
      allowedAppDefaultToolkit,
      imageTool,
      undefined, // No dataStream for worker (we'll handle streaming differently)
    );

    // Get MCP server customizations
    const mcpServerCustomizations = await safe(() => {
      if (Object.keys(toolsResult.mcpTools).length === 0) {
        throw new Error("No MCP tools found");
      }
      return rememberMcpServerCustomizationsAction(userId);
    })
      .map((v) => filterMcpServerCustomizations(toolsResult.mcpTools, v))
      .orElse({});

    // Build system prompt
    const systemPrompt = buildSystemPromptForAdvanced(
      {
        id: userId,
        name: "API User",
        email: "api@system",
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: false,
      },
      userPreferences,
      agent,
      mcpServerCustomizations,
      chatModel,
    );

    // Combine all tools
    const allTools = combineTools(toolsResult, toolChoice);

    // Get model
    const model = customModelProvider.getModel(chatModel);

    // Get previous iterations for context summarization
    const previousIterations =
      await advancedChatRepository.selectIterationsByJobId(actualJobId);

    // Process iterations
    let currentIteration = jobRecord.currentIteration;
    let shouldContinue = true;

    while (shouldContinue && currentIteration < MAX_ITERATIONS) {
      currentIteration++;
      const iterationTracer = tracer.forIteration(currentIteration);
      iterationTracer.logIterationStart();

      const iterationStartTime = Date.now();

      try {
        // Check if summarization is needed
        const needsSummarization = checkSummarizationNeeded(
          previousIterations,
          messages,
          systemPrompt,
          chatModel,
        );

        let optimizedMessages = messages;
        let contextSummaryId: string | undefined;

        if (needsSummarization) {
          iterationTracer.logInfo(
            "Context summarization needed, summarizing...",
          );
          const summaryResult = await summarizeContext(
            messages,
            systemPrompt,
            chatModel,
            previousIterations.map((iter) => ({
              inputTokens: iter.inputTokens,
              outputTokens: iter.outputTokens,
            })),
          );

          if (summaryResult.summaryText) {
            // Save context summary
            const contextSummary =
              await advancedChatRepository.insertContextSummary({
                jobId: actualJobId,
                summaryText: summaryResult.summaryText,
                messagesSummarized: summaryResult.messagesSummarized,
                tokenCountBefore: summaryResult.tokenCountBefore,
                tokenCountAfter: summaryResult.tokenCountAfter,
              });
            contextSummaryId = contextSummary.id;

            iterationTracer.logContextSummarization(
              summaryResult.messagesSummarized,
              summaryResult.tokenCountBefore,
              summaryResult.tokenCountAfter,
            );

            optimizedMessages = summaryResult.optimizedMessages;
          }
        }

        // Execute LLM call
        const result = streamText({
          model,
          system: systemPrompt,
          messages: convertToModelMessages(optimizedMessages),
          experimental_transform: smoothStream({ chunking: "word" }),
          maxRetries: 3,
          tools: allTools,
          stopWhen: stepCountIs(MAX_STEPS_PER_ITERATION),
          toolChoice: "auto",
        });

        // Consume the stream and collect the response
        const responseMessage: UIMessage = {
          id: generateUUID(),
          role: "assistant",
          parts: [],
        };

        const toolCalls: any[] = [];
        let finalUsage: any = null;
        let collectedText = "";
        // Map to track toolName by toolCallId for tool-result events
        const toolCallIdToToolName = new Map<string, string>();

        // Publish message start event
        await publishStreamEvent(actualJobId, {
          type: "message-start",
          messageId: responseMessage.id,
          iteration: currentIteration,
        });

        // Collect text from textStream (most reliable way to get complete text)
        // Also publish text deltas for real-time streaming
        try {
          for await (const chunk of result.textStream) {
            collectedText += chunk;
            // Publish text delta for real-time streaming
            await publishStreamEvent(actualJobId, {
              type: "text-delta",
              messageId: responseMessage.id,
              delta: chunk,
              iteration: currentIteration,
            });
          }
        } catch (e) {
          logger.warn("Error reading textStream:", e);
        }

        // Process the full stream to collect tool calls, tool results, and usage
        try {
          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              // Also collect from text-delta as backup
              if (!collectedText) {
                collectedText += part.text;
              }
            } else if (part.type === "tool-call") {
              // Store toolName for later use in tool-result
              toolCallIdToToolName.set(part.toolCallId, part.toolName);

              toolCalls.push({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: part.input,
              });
              // Add tool call part to message with proper structure
              // The UI expects tool parts to use format: type: "tool-${toolName}"
              // and have input/output properties, not args/result
              // State should be "input-available" initially, then "output-available" when result arrives
              // Ensure input is always an object, never undefined
              const toolPart = {
                type: `tool-${part.toolName}`,
                toolCallId: part.toolCallId,
                input: part.input || {},
                state: "input-available", // Will be updated to "output-available" when tool-result arrives
              } as any;

              responseMessage.parts.push(toolPart);

              // Publish tool call event for real-time streaming
              await publishStreamEvent(actualJobId, {
                type: "tool-call",
                messageId: responseMessage.id,
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: part.input,
                iteration: currentIteration,
              });

              logger.info(
                `Added tool call part for job ${actualJobId}, iteration ${currentIteration}:`,
                {
                  type: toolPart.type,
                  toolCallId: toolPart.toolCallId,
                  toolName: part.toolName,
                  hasInput: !!toolPart.input,
                  inputKeys: toolPart.input ? Object.keys(toolPart.input) : [],
                  inputValue: toolPart.input
                    ? JSON.stringify(toolPart.input).substring(0, 200)
                    : undefined,
                },
              );
            } else if (part.type === "tool-result") {
              // Get toolName from our map
              const toolName = toolCallIdToToolName.get(part.toolCallId);

              // Find the corresponding tool-call part and update it
              const toolCallIndex = responseMessage.parts.findIndex(
                (p: any) => p.toolCallId === part.toolCallId,
              );

              if (toolCallIndex >= 0) {
                // Update the tool-call part with result - use proper structure
                const toolPart = responseMessage.parts[toolCallIndex] as any;
                toolPart.state = "output-available";
                toolPart.output = part.output;

                // Ensure input is preserved (should already be there from tool-call)
                if (!toolPart.input) {
                  toolPart.input = {};
                  logger.warn(
                    `Tool part missing input when updating with result: ${part.toolCallId}`,
                  );
                }

                // Publish tool result event for real-time streaming
                await publishStreamEvent(actualJobId, {
                  type: "tool-result",
                  messageId: responseMessage.id,
                  toolCallId: part.toolCallId,
                  toolName,
                  result: part.output,
                  iteration: currentIteration,
                });

                logger.info(
                  `Updated tool call part with result for job ${actualJobId}, iteration ${currentIteration}:`,
                  {
                    toolCallId: part.toolCallId,
                    toolName,
                    hasInput: !!toolPart.input,
                    hasOutput: !!toolPart.output,
                    inputKeys: toolPart.input
                      ? Object.keys(toolPart.input)
                      : [],
                    outputType: typeof toolPart.output,
                    outputValue: toolPart.output
                      ? JSON.stringify(toolPart.output).substring(0, 200)
                      : undefined,
                  },
                );
              } else if (toolName) {
                // If no matching tool-call found, create a complete tool part
                // This shouldn't happen normally, but handle it gracefully
                const completeToolPart = {
                  type: `tool-${toolName}`,
                  toolCallId: part.toolCallId,
                  input: {}, // Empty input since we didn't see the call
                  output: part.output,
                  state: "output-available",
                } as any;

                responseMessage.parts.push(completeToolPart);

                logger.warn(
                  `Created tool part without matching call for job ${actualJobId}, iteration ${currentIteration}:`,
                  {
                    toolCallId: part.toolCallId,
                    toolName,
                    hasOutput: !!completeToolPart.output,
                  },
                );
              } else {
                logger.warn(
                  `Tool result received for unknown toolCallId: ${part.toolCallId}`,
                );
              }
            } else if (part.type === "finish") {
              // The finish event contains usage information
              // Use totalUsage from the finish part
              if (part.totalUsage) {
                finalUsage = part.totalUsage;
              }
            }
          }
        } catch (e) {
          logger.warn("Error reading fullStream:", e);
        }

        // Add collected text as a text part if we have any
        if (collectedText.trim()) {
          responseMessage.parts.unshift({
            type: "text",
            text: collectedText,
          });
        } else {
          // Fallback: try to get complete text from result.text promise
          try {
            const resultText = await result.text;
            if (resultText && resultText.trim()) {
              responseMessage.parts.unshift({
                type: "text",
                text: resultText,
              });
              collectedText = resultText;
            }
          } catch (e) {
            logger.warn("Could not get text from result.text:", e);
          }
        }

        // Get usage from result if not found in stream or if it doesn't have breakdown
        // result.usage should always have promptTokens/completionTokens/totalTokens
        try {
          const resultUsage = await result.usage;
          if (resultUsage) {
            // Prefer result.usage as it should have the full breakdown
            // Only use finalUsage from stream if result.usage doesn't have breakdown
            const resultUsageAny = resultUsage as any;
            if (
              resultUsageAny.promptTokens !== undefined &&
              resultUsageAny.completionTokens !== undefined
            ) {
              finalUsage = resultUsage;
            } else if (!finalUsage) {
              // Fallback to resultUsage even without breakdown
              finalUsage = resultUsage;
            }
          }
        } catch (e) {
          logger.warn("Could not get usage from result:", e);
          // Keep finalUsage from stream if available
        }

        // Log usage details for debugging
        if (finalUsage) {
          logger.info(
            `Usage for job ${actualJobId}, iteration ${currentIteration}:`,
            {
              promptTokens: finalUsage.promptTokens,
              completionTokens: finalUsage.completionTokens,
              totalTokens: finalUsage.totalTokens,
              usage: finalUsage,
            },
          );
        } else {
          logger.warn(
            `No usage data available for job ${actualJobId}, iteration ${currentIteration}`,
          );
        }

        // Log warning if we still don't have text
        if (!responseMessage.parts.some((p: any) => p.type === "text")) {
          logger.warn(
            `No text content collected for job ${actualJobId}, iteration ${currentIteration}. Parts: ${JSON.stringify(responseMessage.parts.map((p: any) => p.type))}`,
          );
        } else {
          logger.info(
            `Collected ${collectedText.length} characters of text for job ${actualJobId}, iteration ${currentIteration}`,
          );
        }

        const iterationDuration = Date.now() - iterationStartTime;
        const tokenCount = extractTokenCount(finalUsage);

        // Log extracted token counts for debugging
        logger.info(
          `Extracted token counts for job ${actualJobId}, iteration ${currentIteration}:`,
          {
            inputTokens: tokenCount.inputTokens,
            outputTokens: tokenCount.outputTokens,
            totalTokens: tokenCount.totalTokens,
            finalUsage,
          },
        );

        // Save iteration
        const iteration = await advancedChatRepository.insertIteration({
          jobId: actualJobId,
          iterationNumber: currentIteration,
          inputTokens: tokenCount.inputTokens,
          outputTokens: tokenCount.outputTokens,
          totalTokens: tokenCount.totalTokens,
          contextSummaryId,
          messagesSnapshot: optimizedMessages,
          toolCalls: [], // Tool calls will be tracked separately if needed
          duration: iterationDuration,
        });

        // Log iteration completion - function handles undefined gracefully
        iterationTracer.logIterationComplete(finalUsage, iterationDuration);

        // Update job iteration count
        await advancedChatRepository.updateJob(actualJobId, {
          currentIteration,
        });

        // Add response to messages
        messages.push(responseMessage);

        // Log tool parts before saving
        const toolParts = responseMessage.parts.filter((p: any) =>
          p.type?.startsWith("tool-"),
        );
        if (toolParts.length > 0) {
          logger.info(
            `Saving ${toolParts.length} tool parts for job ${actualJobId}, iteration ${currentIteration}:`,
            toolParts.map((p: any) => ({
              type: p.type,
              toolCallId: p.toolCallId,
              state: p.state,
              hasInput: !!p.input,
              hasOutput: !!p.output,
              inputKeys: p.input ? Object.keys(p.input) : [],
              inputValue: p.input
                ? JSON.stringify(p.input).substring(0, 100)
                : undefined,
              outputValue: p.output
                ? JSON.stringify(p.output).substring(0, 100)
                : undefined,
            })),
          );
        }

        // Save messages to thread
        const partsToSave = responseMessage.parts.map((part: any) => {
          // Ensure tool parts have input/output preserved
          if (part.type?.startsWith("tool-")) {
            const converted = convertToSavePart(part) as any;
            const partAny = part as any;
            // Double-check that input/output are preserved
            if (!converted.input && partAny.input) {
              logger.warn(
                `Tool part lost input after convertToSavePart: ${part.type}`,
              );
              return { ...converted, input: partAny.input };
            }
            if (!converted.output && partAny.output) {
              logger.warn(
                `Tool part lost output after convertToSavePart: ${part.type}`,
              );
              return { ...converted, output: partAny.output };
            }
            return converted;
          }
          return convertToSavePart(part);
        });

        // Log parts after convertToSavePart
        const toolPartsAfterConvert = partsToSave.filter((p: any) =>
          p.type?.startsWith("tool-"),
        );
        if (toolPartsAfterConvert.length > 0) {
          logger.info(
            `Tool parts after convertToSavePart for job ${actualJobId}, iteration ${currentIteration}:`,
            toolPartsAfterConvert.map((p: any) => ({
              type: p.type,
              toolCallId: p.toolCallId,
              state: p.state,
              hasInput: !!p.input,
              hasOutput: !!p.output,
              inputKeys: p.input ? Object.keys(p.input) : [],
              inputValue: p.input
                ? JSON.stringify(p.input).substring(0, 100)
                : undefined,
              outputValue: p.output
                ? JSON.stringify(p.output).substring(0, 100)
                : undefined,
            })),
          );
        }

        await chatRepository.upsertMessage({
          threadId,
          ...responseMessage,
          parts: partsToSave,
          metadata: {
            chatModel,
            toolChoice,
            toolCount: Object.keys(allTools).length,
            agentId: agent?.id,
            usage: finalUsage,
          },
        });

        // Publish message complete event
        await publishStreamEvent(actualJobId, {
          type: "message-complete",
          messageId: responseMessage.id,
          iteration: currentIteration,
        });

        // Check if we should continue (if there are pending tool calls or max steps reached)
        // For now, we'll stop after each iteration and let the system decide if continuation is needed
        // This can be enhanced to check for pending tool calls
        shouldContinue = false; // Stop after one iteration for now (can be enhanced)

        previousIterations.push({
          id: iteration.id,
          jobId,
          iterationNumber: currentIteration,
          inputTokens: tokenCount.inputTokens,
          outputTokens: tokenCount.outputTokens,
          totalTokens: tokenCount.totalTokens,
          contextSummaryId,
          messagesSnapshot: optimizedMessages,
          toolCalls: [],
          startedAt: iteration.startedAt,
          completedAt: iteration.completedAt || new Date(),
          duration: iterationDuration,
        });
      } catch (error: any) {
        const iterationDuration = Date.now() - iterationStartTime;
        iterationTracer.logError(error, { iteration: currentIteration });

        // Check if error is due to context exceeded
        const previousIterationsForError = previousIterations.map((iter) => ({
          inputTokens: iter.inputTokens,
          outputTokens: iter.outputTokens,
        }));
        const cumulativeTokens = {
          totalInputTokens: previousIterationsForError.reduce(
            (acc, iter) => acc + iter.inputTokens,
            0,
          ),
          totalOutputTokens: previousIterationsForError.reduce(
            (acc, iter) => acc + iter.outputTokens,
            0,
          ),
          totalTokens: previousIterationsForError.reduce(
            (acc, iter) => acc + iter.inputTokens + iter.outputTokens,
            0,
          ),
          iterations: previousIterationsForError.length,
        };

        if (isContextExceeded(error, cumulativeTokens, chatModel)) {
          // Try to summarize and retry
          iterationTracer.logWarning(
            "Context exceeded, attempting summarization",
          );
          // This would trigger summarization and retry logic
          // For now, we'll mark as failed
        }

        // Save failed iteration
        await advancedChatRepository.insertIteration({
          jobId: actualJobId,
          iterationNumber: currentIteration,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          messagesSnapshot: messages,
          error: error.message,
          duration: iterationDuration,
        });

        // Update job status
        await advancedChatRepository.updateJob(actualJobId, {
          status: "failed",
          error: error.message,
          completedAt: new Date(),
        });

        tracer.logStateTransition("running", "failed", {
          error: error.message,
        });
        throw error;
      }
    }

    // Mark job as completed
    await advancedChatRepository.updateJob(actualJobId, {
      status: "completed",
      completedAt: new Date(),
    });

    tracer.logStateTransition("running", "completed", {
      iterations: currentIteration,
    });

    return { success: true };
  } catch (error: any) {
    tracer.logError(error);
    try {
      // Try to update job status using correlation ID as fallback
      let existingJob =
        await advancedChatRepository.selectJobByCorrelationId(correlationId);
      if (!existingJob && jobId) {
        // Try with original jobId and userId from queue
        existingJob = await advancedChatRepository.selectJob(jobId, userId);
      }
      if (existingJob) {
        await advancedChatRepository.updateJob(existingJob.id, {
          status: "failed",
          error: error.message,
          completedAt: new Date(),
        });
      }
    } catch (updateError: any) {
      tracer.logError(updateError, { context: "Failed to update job status" });
    }
    return { success: false, error: error.message };
  }
}

/**
 * Create and start the BullMQ worker for advanced chat jobs
 */
export function createAdvancedChatWorker() {
  const worker = new Worker<AdvancedChatJobData>(
    "advanced-chat-jobs",
    processAdvancedChatJob,
    {
      connection: redisConnection,
      concurrency: 3, // Process up to 3 jobs concurrently
      limiter: {
        max: 10, // Max 10 jobs
        duration: 1000, // Per second
      },
    },
  );

  worker.on("completed", (job) => {
    logger.info(`Advanced chat worker completed job ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`Advanced chat worker failed job ${job?.id}:`, err);
  });

  worker.on("error", (err) => {
    logger.error("Advanced chat worker error:", err);
  });

  logger.info("Advanced chat worker started");

  return worker;
}

import { safe } from "ts-safe";
