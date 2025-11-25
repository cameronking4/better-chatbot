import { tool as createTool } from "ai";
import { z } from "zod";
import { agentRepository } from "lib/db/repository";
import { getSession } from "auth/server";

export const listAgentsTool = createTool({
  description:
    "List agents based on filters. You can view your own agents, shared agents from others, bookmarked agents, or all available agents.",
  inputSchema: z.object({
    filters: z
      .array(z.enum(["all", "mine", "shared", "bookmarked"]))
      .optional()
      .default(["all"])
      .describe(
        "Filter agents by type: 'all' (all available), 'mine' (your agents), 'shared' (others' agents), 'bookmarked' (your bookmarked agents)",
      ),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .default(50)
      .describe("Maximum number of agents to return (1-100, default: 50)"),
  }),
  execute: async ({ filters, limit }) => {
    try {
      const session = await getSession();

      if (!session?.user.id) {
        return {
          isError: true,
          error: "Unauthorized - you must be logged in to list agents",
        };
      }

      const agents = await agentRepository.selectAgents(
        session.user.id,
        filters || ["all"],
        limit || 50,
      );

      return {
        success: true,
        count: agents.length,
        agents: agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          description: agent.description,
          visibility: agent.visibility,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
          isOwner: agent.userId === session.user.id,
          isBookmarked: agent.isBookmarked,
          userName: agent.userName,
        })),
        message: `Found ${agents.length} agent(s)`,
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to list agents",
        solution: "Try again or check your filters and limit parameters.",
      };
    }
  },
});
