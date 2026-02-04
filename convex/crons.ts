import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

/**
 * Process role sync queue every minute
 * This handles background retries for failed Logto role syncs
 * with exponential backoff timing
 */
crons.interval(
  'process role sync queue',
  { minutes: 1 }, // Process every minute
  internal.role_sync_queue.mutations.processRoleSyncQueue,
)

/**
 * Clean up old failed role sync queue items daily
 * Removes items older than 30 days to keep the queue clean
 */
crons.cron(
  'cleanup role sync queue',
  '0 3 * * *', // Daily at 3:00 AM UTC (7:00 PM PST)
  internal.role_sync_queue.mutations.cleanupOldQueueItems,
  { olderThanDays: 30 },
)

export default crons
