import useSWR from "swr";
import type {
  AutonomousSession,
  CreateAutonomousSessionInput,
  UpdateAutonomousSessionInput,
  AutonomousIteration,
  AutonomousObservation,
} from "@/types/autonomous";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useAutonomousSessions() {
  const { data, error, isLoading, mutate } = useSWR<AutonomousSession[]>(
    "/api/autonomous",
    fetcher,
    {
      refreshInterval: 5000, // Refresh every 5 seconds
    },
  );

  const createSession = async (input: CreateAutonomousSessionInput) => {
    const response = await fetch("/api/autonomous", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create session");
    }

    const session = await response.json();
    mutate();
    return session;
  };

  const updateSession = async (params: {
    id: string;
    data: UpdateAutonomousSessionInput;
  }) => {
    const response = await fetch(`/api/autonomous/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update session");
    }

    const session = await response.json();
    mutate();
    return session;
  };

  const deleteSession = async (id: string) => {
    const response = await fetch(`/api/autonomous/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to delete session");
    }

    mutate();
  };

  const continueSession = async (params: {
    id: string;
    userFeedback?: string;
  }) => {
    const response = await fetch(`/api/autonomous/${params.id}/continue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userFeedback: params.userFeedback }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to continue session");
    }

    const result = await response.json();
    mutate();
    return result;
  };

  return {
    sessions: data || [],
    isLoading,
    error,
    createSession,
    updateSession,
    deleteSession,
    continueSession,
    mutate,
  };
}

export function useAutonomousSession(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<AutonomousSession>(
    id ? `/api/autonomous/${id}` : null,
    fetcher,
    {
      refreshInterval: 3000, // Refresh every 3 seconds for detailed view
    },
  );

  return {
    session: data,
    isLoading,
    error,
    mutate,
  };
}

export function useAutonomousIterations(sessionId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<AutonomousIteration[]>(
    sessionId ? `/api/autonomous/${sessionId}/iterations` : null,
    fetcher,
    {
      refreshInterval: 3000,
    },
  );

  return {
    iterations: data || [],
    isLoading,
    error,
    mutate,
  };
}

export function useAutonomousObservations(sessionId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<AutonomousObservation[]>(
    sessionId ? `/api/autonomous/${sessionId}/observations` : null,
    fetcher,
    {
      refreshInterval: 3000,
    },
  );

  return {
    observations: data || [],
    isLoading,
    error,
    mutate,
  };
}
