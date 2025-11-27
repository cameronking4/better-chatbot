import { getSession } from "auth/server";
import { agentRepository } from "lib/db/repository";
import { notFound, redirect } from "next/navigation";
import { AgentChatsView } from "@/components/agent/agent-chats-view";

export default async function AgentChatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: agentId } = await params;
  const session = await getSession();

  if (!session?.user.id) {
    redirect("/sign-in");
  }

  // Fetch the agent data to display its name and verify access
  const agent = await agentRepository.selectAgentById(agentId, session.user.id);

  if (!agent) {
    notFound();
  }

  return <AgentChatsView agent={agent} />;
}
