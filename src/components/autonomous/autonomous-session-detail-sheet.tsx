import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "ui/sheet";
import { Badge } from "ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { AutonomousSession } from "@/types/autonomous";
import {
  useAutonomousIterations,
  useAutonomousObservations,
} from "@/hooks/queries/use-autonomous-sessions";
import { Skeleton } from "ui/skeleton";
import { ScrollArea } from "ui/scroll-area";

interface AutonomousSessionDetailSheetProps {
  session: AutonomousSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusColors = {
  planning: "bg-blue-500/10 text-blue-500",
  executing: "bg-green-500/10 text-green-500",
  paused: "bg-yellow-500/10 text-yellow-500",
  completed: "bg-gray-500/10 text-gray-500",
  failed: "bg-red-500/10 text-red-500",
};

const observationTypeColors = {
  evaluation: "bg-blue-500/10 text-blue-500",
  planning: "bg-purple-500/10 text-purple-500",
  execution: "bg-green-500/10 text-green-500",
  tool_call: "bg-orange-500/10 text-orange-500",
  error: "bg-red-500/10 text-red-500",
  user_intervention: "bg-yellow-500/10 text-yellow-500",
};

export function AutonomousSessionDetailSheet({
  session,
  open,
  onOpenChange,
}: AutonomousSessionDetailSheetProps) {
  const { iterations, isLoading: iterationsLoading } =
    useAutonomousIterations(session?.id || null);
  const { observations, isLoading: observationsLoading } =
    useAutonomousObservations(session?.id || null);

  if (!session) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[600px] sm:w-[700px]">
        <SheetHeader>
          <SheetTitle>{session.name}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status Overview */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Badge
                variant="secondary"
                className={statusColors[session.status]}
              >
                {session.status}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Progress</span>
                <span className="font-medium">
                  {session.progressPercentage}%
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${session.progressPercentage}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span>Iterations</span>
              <span className="font-medium">
                {session.currentIteration} / {session.maxIterations}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span>Last Activity</span>
              <span className="text-muted-foreground">
                {formatDistanceToNow(new Date(session.lastActivityAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>

          {/* Goal */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Goal</h3>
            <p className="text-sm text-muted-foreground">{session.goal}</p>
          </div>

          {/* Tabs for Iterations and Observations */}
          <Tabs defaultValue="observations" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="observations">
                Observations ({observations.length})
              </TabsTrigger>
              <TabsTrigger value="iterations">
                Iterations ({iterations.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="observations" className="mt-4">
              {observationsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : (
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-3">
                    {observations.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No observations yet
                      </p>
                    ) : (
                      observations.map((obs) => (
                        <div
                          key={obs.id}
                          className="border rounded-lg p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <Badge
                              variant="secondary"
                              className={observationTypeColors[obs.type]}
                            >
                              {obs.type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(obs.createdAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                          <p className="text-sm">{obs.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            <TabsContent value="iterations" className="mt-4">
              {iterationsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : (
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-3">
                    {iterations.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No iterations yet
                      </p>
                    ) : (
                      iterations.map((iter) => (
                        <div
                          key={iter.id}
                          className="border rounded-lg p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              Iteration {iter.iterationNumber}
                            </span>
                            <Badge variant="outline">{iter.phase}</Badge>
                          </div>

                          {iter.evaluation && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">
                                Evaluation
                              </p>
                              <p className="text-sm">
                                Progress: {iter.evaluation.progressPercentage}%
                                {iter.evaluation.goalAchieved &&
                                  " - Goal Achieved ✓"}
                              </p>
                            </div>
                          )}

                          {iter.plan && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">
                                Plan
                              </p>
                              <p className="text-sm">{iter.plan.action}</p>
                            </div>
                          )}

                          {iter.duration && (
                            <div className="text-xs text-muted-foreground">
                              Duration: {Math.round(parseInt(iter.duration) / 1000)}s
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
