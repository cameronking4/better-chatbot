import useSWR, { mutate } from "swr";
import { ScheduledTask } from "@/types/scheduled-task";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

async function createScheduledTask(task: any): Promise<ScheduledTask> {
  const response = await fetch("/api/scheduled-task", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(task),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to create scheduled task");
  }
  return response.json();
}

async function updateScheduledTask({
  id,
  ...data
}: { id: string } & any): Promise<ScheduledTask> {
  const response = await fetch(`/api/scheduled-task/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to update scheduled task");
  }
  return response.json();
}

async function deleteScheduledTask(id: string): Promise<void> {
  const response = await fetch(`/api/scheduled-task/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete scheduled task");
  }
}

async function executeScheduledTask(id: string): Promise<any> {
  const response = await fetch(`/api/scheduled-task/${id}/execute`, {
    method: "POST",
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to execute scheduled task");
  }
  return response.json();
}

export function useScheduledTasks() {
  const { data, error, isLoading } = useSWR<ScheduledTask[]>(
    "/api/scheduled-task",
    fetcher,
  );

  const createTask = async (task: any) => {
    const result = await createScheduledTask(task);
    mutate("/api/scheduled-task");
    return result;
  };

  const updateTask = async (data: { id: string } & any) => {
    // Optimistically update the cache
    const optimisticUpdate = (tasks: ScheduledTask[] | undefined) => {
      if (!tasks) return tasks;
      return tasks.map((task) =>
        task.id === data.id ? { ...task, ...data } : task,
      );
    };
    mutate("/api/scheduled-task", optimisticUpdate, false);

    try {
      const result = await updateScheduledTask(data);
      // Revalidate with server data
      mutate("/api/scheduled-task");
      return result;
    } catch (error) {
      // Revalidate on error to revert optimistic update
      mutate("/api/scheduled-task");
      throw error;
    }
  };

  const deleteTask = async (id: string) => {
    await deleteScheduledTask(id);
    mutate("/api/scheduled-task");
  };

  const executeTaskWrapper = async (id: string) => {
    const result = await executeScheduledTask(id);
    mutate("/api/scheduled-task");
    return result;
  };

  return {
    tasks: data,
    isLoading,
    isError: error,
    error,
    createTask,
    updateTask,
    deleteTask,
    executeTask: executeTaskWrapper,
  };
}
