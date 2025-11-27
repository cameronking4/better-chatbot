# Task Orchestration System

A comprehensive system for orchestrating long-running, multi-step chat tasks that provides resilience, traceability, and durability for complex operations.

## Overview

The Task Orchestration System transforms the chat route from a simple request-response handler into a sophisticated orchestrator capable of:

- **Resilience**: Automatic retry logic, error recovery, and graceful degradation
- **Traceability**: Complete audit trails of decisions, tool calls, and progress
- **Durability**: State persistence, checkpoints, and resumable execution
- **Scalability**: Background processing with queue-based task execution
- **Context Management**: Smart summarization to overcome context window limits

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│   Chat Route (Detector)     │  ← Detects complex tasks
└──────┬──────────────────────┘
       │
       ├─→ Simple Task → Streaming Response
       │
       ▼
┌─────────────────────────────┐
│   Orchestrate API Route     │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│   Task Orchestrator         │  ← Decomposes goal
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│   Task Queue (BullMQ)       │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│   Task Worker (Background)  │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│   Task Executor             │  ← Executes steps
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│   PostgreSQL (State Store)  │
└─────────────────────────────┘
```

## Core Components

### 1. Task Orchestrator (`task-orchestrator.ts`)

The brain of the system that:
- Analyzes requests to determine if orchestration is needed
- Decomposes complex goals into actionable subtasks
- Manages task lifecycle and progress evaluation
- Handles context summarization and checkpoint creation

**Key Methods:**
- `shouldOrchestrate(message)` - Determines if a task needs orchestration
- `decomposeGoal(goal, tools)` - Breaks down goals into steps
- `evaluateProgress(task)` - Checks if task should continue
- `summarizeContext(messages)` - Compresses conversation history

### 2. Task Queue (`task-queue.ts`)

BullMQ-based queue system for:
- Queueing task steps for background execution
- Managing job lifecycle and status
- Providing job retry and backoff strategies

**Key Functions:**
- `queueTaskStep(data)` - Adds a step to the queue
- `queueTaskContinuation(data, delay)` - Queues next step with delay
- `getJobStatus(jobId)` - Retrieves job status
- `cancelJob(jobId)` - Cancels a running job

### 3. Task Worker (`task-worker.ts`)

Background worker process that:
- Processes queued task steps
- Executes orchestration logic
- Handles errors and retries
- Updates task state

**Configuration:**
- Concurrency: 5 tasks simultaneously
- Rate limit: 10 jobs per second
- Auto-retry with exponential backoff

### 4. Task Executor (`task-executor.ts`)

Executes individual task steps:

**Step Types:**
- **LLM Reasoning**: Uses LLM for analysis and decision-making
- **Tool Call**: Executes MCP tools, workflows, or app tools
- **Checkpoint**: Creates state snapshots for resumability
- **Summarization**: Compresses context to manage token limits

### 5. Task Repository (`task-execution-repository.pg.ts`)

Database layer providing:
- CRUD operations for tasks, steps, and traces
- Checkpoint management
- Context updates
- Query operations for monitoring

## Database Schema

### `task_execution` Table
Stores high-level task information:
- Status tracking (pending, running, paused, completed, failed)
- Strategy and goal
- Context and checkpoints
- Tool call history
- Retry count and error tracking

### `task_execution_step` Table
Stores individual step execution details:
- Step description and type
- Input/output data
- Token usage
- Duration metrics
- Error information

### `task_execution_trace` Table
Provides detailed audit trail:
- Tool call traces
- LLM request/response traces
- Decision traces
- Error traces
- Checkpoint traces

## Usage

### Automatic Orchestration

The chat route automatically detects complex tasks:

```typescript
// User sends a complex request
POST /api/chat
{
  "id": "thread-123",
  "message": {
    "id": "msg-456",
    "role": "user",
    "parts": [
      { "type": "text", "text": "Analyze all issues in my GitHub repo and create a summary report" }
    ]
  },
  "chatModel": { "provider": "anthropic", "model": "claude-3-5-sonnet-20241022" }
}

// System detects complexity and returns:
{
  "id": "msg-456",
  "role": "assistant",
  "content": "I'll work on this as a long-running task...",
  "taskId": "task-789",
  "orchestrated": true
}
```

### Manual Orchestration

Explicitly create an orchestrated task:

```typescript
POST /api/chat/orchestrate
{
  "goal": "Migrate all TODO comments to GitHub issues",
  "threadId": "thread-123",
  "chatModel": { "provider": "anthropic", "model": "claude-3-5-sonnet-20241022" },
  "mentions": [...],
  "allowedMcpServers": {...}
}

// Response:
{
  "taskId": "task-789",
  "status": "queued",
  "strategy": {
    "steps": [
      { "id": "step-1", "description": "Scan repository for TODO comments", ... },
      { "id": "step-2", "description": "Extract and parse TODOs", ... },
      { "id": "step-3", "description": "Create GitHub issues", ... }
    ],
    "totalSteps": 3
  },
  "estimatedDuration": 180
}
```

### Check Task Status

Monitor task progress:

```typescript
GET /api/chat/orchestrate?taskId=task-789

// Response:
{
  "taskId": "task-789",
  "status": "running",
  "goal": "Migrate all TODO comments to GitHub issues",
  "progress": 66,
  "currentStep": 2,
  "totalSteps": 3,
  "steps": [
    { "index": "0", "description": "Scan repository...", "status": "completed" },
    { "index": "1", "description": "Extract and parse...", "status": "completed" },
    { "index": "2", "description": "Create GitHub issues", "status": "running" }
  ],
  "latestTraces": [
    { "type": "tool-call", "message": "Called tool: gh.create_issue", "timestamp": "..." }
  ]
}
```

## Configuration

### Environment Variables

- `DISABLE_TASK_WORKER=true` - Disables the background worker
- `REDIS_URL` - Redis connection URL (required for orchestration)
- `DATABASE_URL` - PostgreSQL connection URL

### Worker Configuration

Edit `task-worker.ts`:
- `concurrency`: Number of parallel task executions (default: 5)
- `limiter.max`: Max jobs per duration (default: 10)
- `limiter.duration`: Duration in ms (default: 1000)

### Orchestrator Configuration

```typescript
const orchestrator = new TaskOrchestrator({
  chatModel: { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
  maxSteps: 50,                  // Maximum steps per task
  contextWindowLimit: 100000,    // Token limit before summarization
  checkpointInterval: 5,         // Steps between checkpoints
});
```

## Database Migration

Run the following command to create the required tables:

```bash
pnpm db:push
```

Or manually apply the schema changes from `src/lib/db/pg/schema.pg.ts`.

## Monitoring and Debugging

### View Active Tasks

```typescript
import { taskExecutionRepository } from "lib/db/repository";

const runningTasks = await taskExecutionRepository.listRunningTasks();
```

### View Task Traces

```typescript
const traces = await taskExecutionRepository.listTaskTraces(taskId);
```

### View Task Steps

```typescript
const steps = await taskExecutionRepository.listTaskSteps(taskId);
```

### Worker Status

```typescript
import { getWorker } from "lib/orchestrator";

const worker = getWorker();
if (worker) {
  console.log("Worker is running");
}
```

## Key Features

### 1. Automatic Task Detection

The system analyzes incoming chat requests to determine if they require orchestration:
- Multiple sequential tool calls
- Large dataset processing
- Complex workflows
- Time-intensive operations

### 2. Goal Decomposition

Complex goals are broken down into concrete, actionable subtasks using LLM analysis.

### 3. Resilient Execution

- Automatic retry with exponential backoff
- Error recovery strategies
- State preservation on failure
- Graceful degradation

### 4. Progress Tracking

- Real-time status updates
- Step-by-step execution monitoring
- Token usage tracking
- Duration metrics

### 5. Context Management

- Automatic summarization when approaching limits
- Checkpoint system for state snapshots
- Hierarchical context compression
- Context restoration from checkpoints

### 6. Comprehensive Tracing

- Complete audit trail of all operations
- Tool call logging
- Decision point recording
- Error tracking

## Best Practices

1. **Use Checkpoints**: Create checkpoints before expensive operations
2. **Monitor Queue**: Regularly check queue health and job status
3. **Clean Old Tasks**: Implement cleanup for completed tasks
4. **Set Realistic Estimates**: Provide accurate duration estimates in strategy
5. **Handle Errors Gracefully**: Always provide meaningful error messages
6. **Test Incrementally**: Test with simple tasks before complex ones

## Troubleshooting

### Worker Not Starting

Check:
- Redis is running and accessible
- `REDIS_URL` environment variable is set
- No errors in worker initialization logs

### Tasks Stuck in Pending

Check:
- Worker is running (`getWorker()` returns non-null)
- Queue is not full
- Redis connection is healthy

### High Memory Usage

- Reduce worker concurrency
- Implement more aggressive cleanup
- Add checkpoints more frequently

### Context Window Exceeded

- Reduce `contextWindowLimit`
- Increase checkpoint frequency
- Enable automatic summarization

## Future Enhancements

- [ ] Web UI for task monitoring
- [ ] Real-time progress streaming via WebSockets
- [ ] Multi-model task execution
- [ ] Task prioritization system
- [ ] Advanced retry strategies
- [ ] Task templates and presets
- [ ] Performance analytics dashboard

## Support

For issues or questions:
1. Check the traces: `taskExecutionRepository.listTaskTraces(taskId)`
2. Review error logs in worker output
3. Verify database state in `task_execution` table
4. Check Redis queue status with BullMQ Board
