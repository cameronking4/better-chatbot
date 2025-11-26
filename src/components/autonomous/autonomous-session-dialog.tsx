import { Dialog, DialogContent, DialogHeader, DialogTitle } from "ui/dialog";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Textarea } from "ui/textarea";
import { useState } from "react";
import { useAutonomousSessions } from "@/hooks/queries/use-autonomous-sessions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface AutonomousSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AutonomousSessionDialog({
  open,
  onOpenChange,
}: AutonomousSessionDialogProps) {
  const { createSession } = useAutonomousSessions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    goal: "",
    maxIterations: 20,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await createSession({
        name: formData.name,
        goal: formData.goal,
        maxIterations: formData.maxIterations,
      });
      toast.success("Session created successfully");
      onOpenChange(false);
      // Reset form
      setFormData({
        name: "",
        goal: "",
        maxIterations: 20,
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to create session");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Autonomous Session</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Session Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g., Research Market Trends"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal">Goal</Label>
            <Textarea
              id="goal"
              value={formData.goal}
              onChange={(e) =>
                setFormData({ ...formData, goal: e.target.value })
              }
              placeholder="Describe what you want the autonomous agent to achieve..."
              rows={4}
              required
            />
            <p className="text-sm text-muted-foreground">
              Be specific about the desired outcome. The agent will work toward
              this goal autonomously.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxIterations">Max Iterations</Label>
            <Input
              id="maxIterations"
              type="number"
              min={1}
              max={100}
              value={formData.maxIterations}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  maxIterations: parseInt(e.target.value),
                })
              }
              required
            />
            <p className="text-sm text-muted-foreground">
              Maximum number of execution cycles (1-100). Default is 20.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Session
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
