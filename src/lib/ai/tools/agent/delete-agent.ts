import { tool as createTool } from "ai";
import { z } from "zod";
import { agentRepository } from "lib/db/repository";
import { getSession } from "auth/server";

export const deleteAgentTool = createTool({
  description:
    "Delete an agent permanently. You can only delete agents that you own. This action cannot be undone.",
  inputSchema: z.object({
    agentId: z.string().describe("The ID of the agent to delete"),
  }),
  execute: async ({ agentId }) => {
    try {
      const session = await getSession();

      if (!session?.user.id) {
        return {
          isError: true,
          error: "Unauthorized - you must be logged in to delete agents",
        };
      }

      // First, verify the agent exists and get its name for the success message
      const agent = await agentRepository.selectAgentById(
        agentId,
        session.user.id,
      );

      if (!agent) {
        return {
          isError: true,
          error: "Agent not found or you don't have access to it",
          solution:
            "Make sure the agent ID is correct and you have permission to access this agent.",
        };
      }

      // Check if user owns the agent
      if (agent.userId !== session.user.id) {
        return {
          isError: true,
          error: "You can only delete agents that you own",
          solution: "Only the agent owner can delete it.",
        };
      }

      await agentRepository.deleteAgent(agentId, session.user.id);

      return {
        success: true,
        message: `Successfully deleted agent "${agent.name}" (ID: ${agentId})`,
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error.message || "Failed to delete agent",
        solution:
          "Make sure the agent ID is correct and you have permission to delete this agent.",
      };
    }
  },
});
