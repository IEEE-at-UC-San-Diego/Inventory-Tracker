import { v } from 'convex/values'
import { internalMutation } from '../_generated/server'
import { Id, Doc } from '../_generated/dataModel'

/**
 * Maximum number of retry attempts before marking as failed
 */
const MAX_RETRY_ATTEMPTS = 5

/**
 * Role Sync Queue Mutations
 * Handles background retry of failed Logto role syncs with exponential backoff
 */

export type UserRole = 'Administrator' | 'Executive Officers' | 'General Officers' | 'Member'

/**
 * Enqueue a role sync operation for retry
 * Called when role sync fails, adds item to queue with exponential backoff
 */
export const enqueueRoleSync = internalMutation({
  args: {
    userId: v.id('users'),
    targetRole: v.union(v.literal('Administrator'), v.literal('Executive Officers'), v.literal('General Officers'), v.literal('Member')),
    errorMessage: v.optional(v.string()),
    previousAttempts: v.optional(v.number()), // For rescheduling existing queue items
  },
  returns: v.id('roleSyncQueue'),
  handler: async (ctx, args) => {
    const now = Date.now()
    const attempts = args.previousAttempts ?? 0

    // Calculate exponential backoff: 2^n minutes
    // Attempt 0: 1 min, 1: 2 min, 2: 4 min, 3: 8 min, 4: 16 min
    const backoffMinutes = Math.pow(2, attempts)
    const nextAttemptAt = now + backoffMinutes * 60 * 1000

    const queueItemId = await ctx.db.insert('roleSyncQueue', {
      userId: args.userId,
      targetRole: args.targetRole,
      attempts: attempts,
      lastAttemptAt: now,
      nextAttemptAt,
      status: attempts === 0 ? 'pending' : 'retry',
      errorMessage: args.errorMessage,
    })

    return queueItemId
  },
})

/**
 * Process the role sync queue
 * Called by scheduled job for background processing
 * Handles items ready for retry and marks failed items
 */
export const processRoleSyncQueue = internalMutation({
  args: {},
  returns: v.object({
    processed: v.number(),
    failed: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now()
    let processed = 0
    let failed = 0
    let skipped = 0

    // Find all queue items that are ready for processing
    const readyItems = await ctx.db
      .query('roleSyncQueue')
      .withIndex('by_nextAttemptAt', (q) => q.lte('nextAttemptAt', now))
      .collect()

    for (const item of readyItems) {
      // Skip items that are already being processed (if multiple workers)
      if (item.status === 'failed') {
        skipped++
        continue
      }

      const user = await ctx.db.get('users', item.userId)
      if (!user) {
        // User no longer exists, mark as failed
        await ctx.db.patch(item._id, {
          status: 'failed',
          errorMessage: 'User not found',
        })
        failed++
        continue
      }

      try {
        // Attempt to sync the role
        await ctx.db.patch(user._id, {
          role: item.targetRole,
        })

        // Mark item as completed by deleting it
        await ctx.db.delete(item._id)
        processed++
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        if (item.attempts >= MAX_RETRY_ATTEMPTS - 1) {
          // Max attempts reached, mark as failed
          await ctx.db.patch(item._id, {
            status: 'failed',
            errorMessage,
          })
          failed++
        } else {
          // Reschedule with exponential backoff
          const backoffMinutes = Math.pow(2, item.attempts + 1)
          const nextAttemptAt = now + backoffMinutes * 60 * 1000

          await ctx.db.patch(item._id, {
            attempts: item.attempts + 1,
            lastAttemptAt: now,
            nextAttemptAt,
            status: 'retry',
            errorMessage,
          })
          processed++
        }
      }
    }

    return { processed, failed, skipped }
  },
})

/**
 * Manually mark a role sync as failed
 * Used when admin determines a sync should not be retried
 */
export const failRoleSync = internalMutation({
  args: {
    queueItemId: v.id('roleSyncQueue'),
    errorMessage: v.optional(v.string()),
  },
  returns: v.id('roleSyncQueue'),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.queueItemId, {
      status: 'failed',
      errorMessage: args.errorMessage || 'Manually failed by admin',
    })
    return args.queueItemId
  },
})

/**
 * Retry a failed role sync immediately
 * Admin can use this to retry a previously failed sync
 */
export const retryRoleSync = internalMutation({
  args: {
    queueItemId: v.id('roleSyncQueue'),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const item = await ctx.db.get('roleSyncQueue', args.queueItemId)
    if (!item) {
      return { success: false, message: 'Queue item not found' }
    }

    // Reset to pending and schedule for immediate retry
    await ctx.db.patch(args.queueItemId, {
      attempts: 0,
      lastAttemptAt: undefined,
      nextAttemptAt: Date.now(),
      status: 'pending',
      errorMessage: undefined,
    })

    return { success: true, message: 'Role sync queued for retry' }
  },
})

/**
 * Get all role sync queue items (for admin view)
 */
export const getRoleSyncQueueItems = internalMutation({
  args: {
    status: v.optional(v.union(v.literal('pending'), v.literal('retry'), v.literal('failed'))),
  },
  returns: v.array(
    v.object({
      _id: v.id('roleSyncQueue'),
      _creationTime: v.number(),
      userId: v.id('users'),
      targetRole: v.union(v.literal('Administrator'), v.literal('Executive Officers'), v.literal('General Officers'), v.literal('Member')),
      attempts: v.number(),
      lastAttemptAt: v.optional(v.number()),
      nextAttemptAt: v.number(),
      status: v.union(v.literal('pending'), v.literal('retry'), v.literal('failed')),
      errorMessage: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db.query('roleSyncQueue').withIndex('by_status', (q) => q.eq('status', args.status!)).collect()
    }
    return await ctx.db.query('roleSyncQueue').collect()
  },
})

/**
 * Clean up old completed/failed queue items
 * Can be run periodically to remove items older than specified days
 */
export const cleanupOldQueueItems = internalMutation({
  args: {
    olderThanDays: v.number(),
  },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000

    const oldItems = await ctx.db
      .query('roleSyncQueue')
      .filter((q) => q.eq(q.field('status'), 'failed'))
      .filter((q) => q.lt(q.field('lastAttemptAt'), cutoffTime))
      .collect()

    for (const item of oldItems) {
      await ctx.db.delete(item._id)
    }

    return { deleted: oldItems.length }
  },
})
