"use client";

import { AutonomousSessionList } from "@/components/autonomous/autonomous-session-list";

export default function AutonomousPage() {
  return (
    <div className="container mx-auto p-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Autonomous Command Center</h1>
        <p className="text-muted-foreground mt-2">
          Monitor and control autonomous agent sessions
        </p>
      </div>
      <AutonomousSessionList />
    </div>
  );
}
