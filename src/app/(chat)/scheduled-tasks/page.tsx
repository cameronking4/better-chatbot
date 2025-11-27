import ScheduledTaskListPage from "@/components/scheduled-task/scheduled-task-list-page";
import { getSession } from "auth/server";
import { redirect } from "next/navigation";

// Force dynamic rendering to avoid static generation issues with session
export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }
  return <ScheduledTaskListPage userRole={session.user.role} />;
}
