import useSWR from "swr";
import { ScheduledTaskExecution } from "@/types/scheduled-task";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useScheduledTaskExecutions(taskId: string | null) {
  const { data, error, isLoading } = useSWR<ScheduledTaskExecution[]>(
    taskId ? `/api/scheduled-task/${taskId}/history` : null,
    fetcher,
  );

  return {
    executions: data,
    isLoading,
    isError: error,
    error,
  };
}
