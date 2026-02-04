/**
 * Role Sync Queue Queries
 * Public-facing queries for fetching role sync queue status
 */

import { query } from '../_generated/server'
import { v } from 'convex/values'
import { authContextSchema } from '../types/auth'

/**
 * Get all role sync queue items
 * For admin view of sync queue status
 */
export const list = query({
  args: {
    authContext: authContextSchema,
    status: v.optional(v.union(v.literal('pending'), v.literal('retry'), v.literal('failed'))),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('roleSyncQueue'),
      _creationTime: v.number(),
      userId: v.id('users'),
      targetRole: v.union(
        v.literal('Administrator'),
        v.literal('Executive Officers'),
        v.literal('General Officers'),
        v.literal('Member')
      ),
      attempts: v.number(),
      lastAttemptAt: v.optional(v.number()),
      nextAttemptAt: v.number(),
      status: v.union(v.literal('pending'), v.literal('retry'), v.literal('failed')),
      errorMessage: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const { getCurrentUser } = await import('../auth_helpers')
    const userContext = await getCurrentUser(ctx, args.authContext)

    if (!userContext || userContext.role !== 'Administrator') {
      throw new Error('Forbidden: Admin access required')
    }

    let items
    if (args.status) {
      items = await ctx.db
        .query('roleSyncQueue')
        .withIndex('by_status', (q) => q.eq('status', args.status!))
        .collect()
    } else {
      items = await ctx.db.query('roleSyncQueue').collect()
    }

    // Sort by nextAttemptAt and optionally limit
    const sortedItems = items.sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)
    return args.limit ? sortedItems.slice(0, args.limit) : sortedItems
  },
})

/**
 * Get role sync queue summary stats
 * For admin dashboard or stats cards
 */
export const getSummary = query({
  args: {
    authContext: authContextSchema,
  },
  returns: v.object({
    pending: v.number(),
    retry: v.number(),
    failed: v.number(),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    const { getCurrentUser } = await import('../auth_helpers')
    const userContext = await getCurrentUser(ctx, args.authContext)

    if (!userContext || userContext.role !== 'Administrator') {
      throw new Error('Forbidden: Admin access required')
    }

    const pending = await ctx.db
      .query('roleSyncQueue')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .collect()

    const retry = await ctx.db
      .query('roleSyncQueue')
      .withIndex('by_status', (q) => q.eq('status', 'retry'))
      .collect()

    const failed = await ctx.db
      .query('roleSyncQueue')
      .withIndex('by_status', (q) => q.eq('status', 'failed'))
      .collect()

    return {
      pending: pending.length,
      retry: retry.length,
      failed: failed.length,
      total: pending.length + retry.length + failed.length,
    }
  },
})

/**
 * Get user's role sync queue items
 * For checking if a user has pending role syncs
 */
export const getUserSyncStatus = query({
  args: {
    authContext: authContextSchema,
    userId: v.id('users'),
  },
  returns: v.nullable(
    v.object({
      _id: v.id('roleSyncQueue'),
      targetRole: v.union(
        v.literal('Administrator'),
        v.literal('Executive Officers'),
        v.literal('General Officers'),
        v.literal('Member')
      ),
      attempts: v.number(),
      lastAttemptAt: v.optional(v.number()),
      nextAttemptAt: v.number(),
      status: v.union(v.literal('pending'), v.literal('retry'), v.literal('failed')),
      errorMessage: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const { getCurrentUser } = await import('../auth_helpers')
    const userContext = await getCurrentUser(ctx, args.authContext)

    if (!userContext || userContext.role !== 'Administrator') {
      throw new Error('Forbidden: Admin access required')
    }

    const item = await ctx.db
      .query('roleSyncQueue')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first()

    return item
  },
})
