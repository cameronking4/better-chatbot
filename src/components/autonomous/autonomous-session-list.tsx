import { useAutonomousSessions } from "@/hooks/queries/use-autonomous-sessions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";
import { Button } from "ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import {
  MoreHorizontal,
  PlayIcon,
  PauseIcon,
  TrashIcon,
  EyeIcon,
  Loader2,
  RocketIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "ui/skeleton";
import { Badge } from "ui/badge";
import { formatDistanceToNow } from "date-fns";
import { AutonomousSession } from "@/types/autonomous";
import { AutonomousSessionDialog } from "./autonomous-session-dialog";
import { AutonomousSessionDetailSheet } from "./autonomous-session-detail-sheet";

const statusColors = {
  planning: "bg-blue-500/10 text-blue-500",
  executing: "bg-green-500/10 text-green-500 animate-pulse",
  paused: "bg-yellow-500/10 text-yellow-500",
  completed: "bg-gray-500/10 text-gray-500",
  failed: "bg-red-500/10 text-red-500",
};

const statusLabels = {
  planning: "Planning",
  executing: "Executing",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
};

export function AutonomousSessionList() {
  const {
    sessions,
    isLoading,
    deleteSession,
    continueSession,
    updateSession,
  } = useAutonomousSessions();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] =
    useState<AutonomousSession | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [continuingSessionId, setContinuingSessionId] = useState<
    string | null
  >(null);

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this session?")) {
      try {
        await deleteSession(id);
        toast.success("Session deleted successfully");
      } catch (error: any) {
        toast.error(error.message || "Failed to delete session");
      }
    }
  };

  const handlePause = async (session: AutonomousSession) => {
    try {
      await updateSession({
        id: session.id,
        data: { status: "paused" },
      });
      toast.success("Session paused");
    } catch (error: any) {
      toast.error(error.message || "Failed to pause session");
    }
  };

  const handleContinue = async (sessionId: string) => {
    try {
      setContinuingSessionId(sessionId);
      const result = await continueSession({ id: sessionId });
      toast.success(result.message);
    } catch (error: any) {
      toast.error(error.message || "Failed to continue session");
    } finally {
      setContinuingSessionId(null);
    }
  };

  const handleViewDetails = (session: AutonomousSession) => {
    setSelectedSession(session);
    setSheetOpen(true);
  };

  const handleCreate = () => {
    setDialogOpen(true);
  };

  const handleRowClick = (
    session: AutonomousSession,
    event: React.MouseEvent,
  ) => {
    const target = event.target as HTMLElement;
    if (
      target.closest("[role='menu']") ||
      target.closest("button") ||
      target.closest("[data-radix-popper-content-wrapper]")
    ) {
      return;
    }
    handleViewDetails(session);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const activeSessions = sessions.filter(
    (s) => s.status === "executing" || s.status === "planning",
  );
  const pausedSessions = sessions.filter((s) => s.status === "paused");
  const completedSessions = sessions.filter(
    (s) => s.status === "completed" || s.status === "failed",
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          <Badge variant="outline" className="text-sm">
            Active: {activeSessions.length}
          </Badge>
          <Badge variant="outline" className="text-sm">
            Paused: {pausedSessions.length}
          </Badge>
          <Badge variant="outline" className="text-sm">
            Completed: {completedSessions.length}
          </Badge>
        </div>
        <Button onClick={handleCreate}>
          <RocketIcon className="mr-2 h-4 w-4" />
          New Session
        </Button>
      </div>

      {sessions.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center">
          <RocketIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            No Autonomous Sessions
          </h3>
          <p className="text-muted-foreground mb-4">
            Create your first autonomous agent session to get started.
          </p>
          <Button onClick={handleCreate}>
            <RocketIcon className="mr-2 h-4 w-4" />
            Create Session
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Goal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Iteration</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow
                  key={session.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={(e) => handleRowClick(session, e)}
                >
                  <TableCell className="font-medium">{session.name}</TableCell>
                  <TableCell className="max-w-md truncate">
                    {session.goal}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={statusColors[session.status]}
                    >
                      {statusLabels[session.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-muted rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{
                            width: `${session.progressPercentage}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {session.progressPercentage}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {session.currentIteration}/{session.maxIterations}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(session.lastActivityAt), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetails(session);
                          }}
                        >
                          <EyeIcon className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        {(session.status === "paused" ||
                          session.status === "planning") && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleContinue(session.id);
                            }}
                            disabled={continuingSessionId === session.id}
                          >
                            {continuingSessionId === session.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <PlayIcon className="mr-2 h-4 w-4" />
                            )}
                            Continue
                          </DropdownMenuItem>
                        )}
                        {session.status === "executing" && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePause(session);
                            }}
                          >
                            <PauseIcon className="mr-2 h-4 w-4" />
                            Pause
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(session.id);
                          }}
                          className="text-destructive"
                        >
                          <TrashIcon className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AutonomousSessionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <AutonomousSessionDetailSheet
        session={selectedSession}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
