# Retry Strategy Documentation

## Current State

The orchestration system currently has two retry mechanisms:

1. **BullMQ Job-Level Retries** (task-queue.ts)
   - 5 attempts per job
   - Exponential backoff starting at 5000ms
   - Configured at the queue level

2. **Application-Level Retries** (task-orchestrator.ts)
   - 3 attempts per tool call
   - Exponential backoff starting at 1000ms (2^attemptNumber * 1000)
   - Handled in `handleToolFailure()`

## Problem

These two retry mechanisms can result in:
- Up to 5 × 3 = 15 total retry attempts (excessive)
- Different backoff strategies causing confusion
- Task could be marked as failed in the database while BullMQ continues retrying

## Recommended Solution

**Use BullMQ retries as the primary mechanism** and make application code more idempotent:

### Changes Required:

1. **Remove application-level retries from `handleToolFailure()`**
   - Let errors bubble up to BullMQ
   - BullMQ will handle the retry logic
   - Application code should focus on idempotency

2. **Update `handleToolFailure()` to be idempotent**
   - Check if tool call was already successful before retrying
   - Store tool call results in database to enable replay
   - Return cached results if available

3. **Sync retry counts**
   - Access BullMQ job attempt count in the worker
   - Store this in the task execution entity
   - Update UI to show actual retry count from BullMQ

### Implementation Example:

```typescript
// In task-worker.ts
worker.on('failed', (job, err) => {
  const attemptNumber = job.attemptsMade;
  const maxAttempts = job.opts.attempts || 5;

  if (attemptNumber >= maxAttempts) {
    // Final failure - update task as failed
    await taskExecutionRepository.updateTaskExecution(job.data.taskId, {
      status: 'failed',
      lastError: err.message,
      retryCount: attemptNumber.toString(),
    });
  } else {
    // Will retry - just log
    logger.warn(\`Task \${job.data.taskId} failed (attempt \${attemptNumber}/\${maxAttempts}), will retry\`);
  }
});
```

## Migration Path

1. First, update documentation (this file) ✅
2. Make application code idempotent (check for existing results)
3. Remove retry logic from `handleToolFailure()`
4. Update worker to sync retry counts with BullMQ
5. Test thoroughly with intentional failures

## Notes

- BullMQ retries are more reliable in distributed systems
- Application-level retries should only be used for specific, non-retriable errors
- Current implementation is functional but could be improved for efficiency
