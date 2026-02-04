import { v } from 'convex/values'
import { query } from '../_generated/server'
import { Doc, Id } from '../_generated/dataModel'
import { getCurrentUser } from '../auth_helpers'
import { getCurrentOrgId } from '../organization_helpers'
import { authContextSchema } from '../types/auth'

/**
 * Get all transactions for the organization
 * Paginated, newest first
 * All roles can view transactions
 */
export const list = query({
  args: {
    authContext: authContextSchema,
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    items: v.array(
      v.object({
        _id: v.id('transactions'),
        _creationTime: v.number(),
        actionType: v.union(
          v.literal('Add'),
          v.literal('Remove'),
          v.literal('Move'),
          v.literal('Adjust')
        ),
        quantityDelta: v.number(),
        sourceCompartmentId: v.optional(v.id('compartments')),
        destCompartmentId: v.optional(v.id('compartments')),
        partId: v.id('parts'),
        userId: v.id('users'),
        timestamp: v.number(),
        notes: v.optional(v.string()),
        orgId: v.id('organizations'),
        part: v.optional(
          v.object({
            _id: v.id('parts'),
            name: v.string(),
            sku: v.string(),
          })
        ),
        user: v.optional(
          v.object({
            _id: v.id('users'),
            name: v.string(),
          })
        ),
        sourceCompartment: v.optional(
          v.object({
            _id: v.id('compartments'),
            label: v.optional(v.string()),
          })
        ),
        destCompartment: v.optional(
          v.object({
            _id: v.id('compartments'),
            label: v.optional(v.string()),
          })
        ),
      })
    ),
    nextCursor: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)
    const limit = args.limit ?? 50

    // Get transactions ordered by timestamp (newest first)
    let transactions: Doc<'transactions'>[]

    if (args.cursor) {
      // Decode cursor for pagination
      const cursorTimestamp = parseInt(args.cursor, 10)
      transactions = await ctx.db
        .query('transactions')
        .withIndex('by_orgId_and_timestamp', (q) =>
          q.eq('orgId', orgId).lt('timestamp', cursorTimestamp)
        )
        .take(limit)
    } else {
      transactions = await ctx.db
        .query('transactions')
        .withIndex('by_orgId_and_timestamp', (q) => q.eq('orgId', orgId))
        .order('desc')
        .take(limit)
    }

    // Enrich with related data
    const enrichedTransactions = await Promise.all(
      transactions.map(async (transaction) => {
        const [part, user, sourceCompartment, destCompartment] = await Promise.all([
          ctx.db.get(transaction.partId),
          ctx.db.get(transaction.userId),
          transaction.sourceCompartmentId
            ? ctx.db.get(transaction.sourceCompartmentId)
            : Promise.resolve(null),
          transaction.destCompartmentId
            ? ctx.db.get(transaction.destCompartmentId)
            : Promise.resolve(null),
        ])

        return {
          ...transaction,
          part: part
            ? {
                _id: part._id,
                name: part.name,
                sku: part.sku,
              }
            : undefined,
          user: user
            ? {
                _id: user._id,
                name: user.name,
              }
            : undefined,
          sourceCompartment: sourceCompartment
            ? {
                _id: sourceCompartment._id,
                label: sourceCompartment.label,
              }
            : undefined,
          destCompartment: destCompartment
            ? {
                _id: destCompartment._id,
                label: destCompartment.label,
              }
            : undefined,
        }
      })
    )

    // Create next cursor
    const lastTransaction = transactions[transactions.length - 1]
    const nextCursor = lastTransaction ? String(lastTransaction.timestamp) : undefined

    return { items: enrichedTransactions, nextCursor }
  },
})

/**
 * Get transactions for a specific part
 */
export const getByPart = query({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('transactions'),
      _creationTime: v.number(),
      actionType: v.union(
        v.literal('Add'),
        v.literal('Remove'),
        v.literal('Move'),
        v.literal('Adjust')
      ),
      quantityDelta: v.number(),
      sourceCompartmentId: v.optional(v.id('compartments')),
      destCompartmentId: v.optional(v.id('compartments')),
      partId: v.id('parts'),
      userId: v.id('users'),
      timestamp: v.number(),
      notes: v.optional(v.string()),
      orgId: v.id('organizations'),
      user: v.optional(
        v.object({
          _id: v.id('users'),
          name: v.string(),
        })
      ),
      sourceCompartment: v.optional(
        v.object({
          _id: v.id('compartments'),
          label: v.optional(v.string()),
        })
      ),
      destCompartment: v.optional(
        v.object({
          _id: v.id('compartments'),
          label: v.optional(v.string()),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      throw new Error('Unauthorized')
    }

    // Verify part belongs to org
    const part = await ctx.db.get(args.partId)
    if (!part || part.orgId !== userContext.user.orgId) {
      throw new Error('Part not found or access denied')
    }

    const limit = args.limit ?? 50

    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_partId', (q) => q.eq('partId', args.partId))
      .order('desc')
      .take(limit)

    // Enrich with user and compartment data
    const enrichedTransactions = await Promise.all(
      transactions.map(async (transaction) => {
        const [user, sourceCompartment, destCompartment] = await Promise.all([
          ctx.db.get(transaction.userId),
          transaction.sourceCompartmentId
            ? ctx.db.get(transaction.sourceCompartmentId)
            : Promise.resolve(null),
          transaction.destCompartmentId
            ? ctx.db.get(transaction.destCompartmentId)
            : Promise.resolve(null),
        ])

        return {
          ...transaction,
          user: user
            ? {
                _id: user._id,
                name: user.name,
              }
            : undefined,
          sourceCompartment: sourceCompartment
            ? {
                _id: sourceCompartment._id,
                label: sourceCompartment.label,
              }
            : undefined,
          destCompartment: destCompartment
            ? {
                _id: destCompartment._id,
                label: destCompartment.label,
              }
            : undefined,
        }
      })
    )

    return enrichedTransactions
  },
})

/**
 * Get transactions by a specific user
 */
export const getByUser = query({
  args: {
    authContext: authContextSchema,
    userId: v.id('users'),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('transactions'),
      _creationTime: v.number(),
      actionType: v.union(
        v.literal('Add'),
        v.literal('Remove'),
        v.literal('Move'),
        v.literal('Adjust')
      ),
      quantityDelta: v.number(),
      sourceCompartmentId: v.optional(v.id('compartments')),
      destCompartmentId: v.optional(v.id('compartments')),
      partId: v.id('parts'),
      userId: v.id('users'),
      timestamp: v.number(),
      notes: v.optional(v.string()),
      orgId: v.id('organizations'),
      part: v.optional(
        v.object({
          _id: v.id('parts'),
          name: v.string(),
          sku: v.string(),
        })
      ),
      sourceCompartment: v.optional(
        v.object({
          _id: v.id('compartments'),
          label: v.optional(v.string()),
        })
      ),
      destCompartment: v.optional(
        v.object({
          _id: v.id('compartments'),
          label: v.optional(v.string()),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      throw new Error('Unauthorized')
    }

    // Verify target user belongs to same org
    const targetUser = await ctx.db.get(args.userId)
    if (!targetUser || targetUser.orgId !== userContext.user.orgId) {
      throw new Error('User not found or access denied')
    }

    const limit = args.limit ?? 50

    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(limit)

    // Filter to only show transactions from user's org
    const orgTransactions = transactions.filter(
      (t) => t.orgId === userContext.user.orgId
    )

    // Enrich with part and compartment data
    const enrichedTransactions = await Promise.all(
      orgTransactions.map(async (transaction) => {
        const [part, sourceCompartment, destCompartment] = await Promise.all([
          ctx.db.get(transaction.partId),
          transaction.sourceCompartmentId
            ? ctx.db.get(transaction.sourceCompartmentId)
            : Promise.resolve(null),
          transaction.destCompartmentId
            ? ctx.db.get(transaction.destCompartmentId)
            : Promise.resolve(null),
        ])

        return {
          ...transaction,
          part: part
            ? {
                _id: part._id,
                name: part.name,
                sku: part.sku,
              }
            : undefined,
          sourceCompartment: sourceCompartment
            ? {
                _id: sourceCompartment._id,
                label: sourceCompartment.label,
              }
            : undefined,
          destCompartment: destCompartment
            ? {
                _id: destCompartment._id,
                label: destCompartment.label,
              }
            : undefined,
        }
      })
    )

    return enrichedTransactions
  },
})

/**
 * Get transactions within a date range
 */
export const getByDateRange = query({
  args: {
    authContext: authContextSchema,
    startDate: v.number(), // Unix timestamp
    endDate: v.number(), // Unix timestamp
  },
  returns: v.array(
    v.object({
      _id: v.id('transactions'),
      _creationTime: v.number(),
      actionType: v.union(
        v.literal('Add'),
        v.literal('Remove'),
        v.literal('Move'),
        v.literal('Adjust')
      ),
      quantityDelta: v.number(),
      sourceCompartmentId: v.optional(v.id('compartments')),
      destCompartmentId: v.optional(v.id('compartments')),
      partId: v.id('parts'),
      userId: v.id('users'),
      timestamp: v.number(),
      notes: v.optional(v.string()),
      orgId: v.id('organizations'),
      part: v.optional(
        v.object({
          _id: v.id('parts'),
          name: v.string(),
          sku: v.string(),
        })
      ),
      user: v.optional(
        v.object({
          _id: v.id('users'),
          name: v.string(),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_orgId_and_timestamp', (q) =>
        q.eq('orgId', orgId).gte('timestamp', args.startDate).lte('timestamp', args.endDate)
      )
      .collect()

    // Enrich with part and user data
    const enrichedTransactions = await Promise.all(
      transactions.map(async (transaction) => {
        const [part, user] = await Promise.all([
          ctx.db.get(transaction.partId),
          ctx.db.get(transaction.userId),
        ])

        return {
          ...transaction,
          part: part
            ? {
                _id: part._id,
                name: part.name,
                sku: part.sku,
              }
            : undefined,
          user: user
            ? {
                _id: user._id,
                name: user.name,
              }
            : undefined,
        }
      })
    )

    return enrichedTransactions
  },
})

/**
 * Get transactions involving a specific compartment
 * (either as source or destination)
 */
export const getByCompartment = query({
  args: {
    authContext: authContextSchema,
    compartmentId: v.id('compartments'),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('transactions'),
      _creationTime: v.number(),
      actionType: v.union(
        v.literal('Add'),
        v.literal('Remove'),
        v.literal('Move'),
        v.literal('Adjust')
      ),
      quantityDelta: v.number(),
      sourceCompartmentId: v.optional(v.id('compartments')),
      destCompartmentId: v.optional(v.id('compartments')),
      partId: v.id('parts'),
      userId: v.id('users'),
      timestamp: v.number(),
      notes: v.optional(v.string()),
      orgId: v.id('organizations'),
      part: v.optional(
        v.object({
          _id: v.id('parts'),
          name: v.string(),
          sku: v.string(),
        })
      ),
      user: v.optional(
        v.object({
          _id: v.id('users'),
          name: v.string(),
        })
      ),
      otherCompartment: v.optional(
        v.object({
          _id: v.id('compartments'),
          label: v.optional(v.string()),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      throw new Error('Unauthorized')
    }

    // Verify compartment exists and belongs to org
    const compartment = await ctx.db.get(args.compartmentId)
    if (!compartment) {
      throw new Error('Compartment not found')
    }

    const drawer = await ctx.db.get(compartment.drawerId)
    if (!drawer) {
      throw new Error('Drawer not found')
    }

    const blueprint = await ctx.db.get(drawer.blueprintId)
    if (!blueprint || blueprint.orgId !== userContext.user.orgId) {
      throw new Error('Access denied to this compartment')
    }

    const limit = args.limit ?? 50

    // Get transactions where this compartment is source
    const sourceTransactions = await ctx.db
      .query('transactions')
      .withIndex('by_sourceCompartmentId', (q) =>
        q.eq('sourceCompartmentId', args.compartmentId)
      )
      .take(limit)

    // Get transactions where this compartment is destination
    const destTransactions = await ctx.db
      .query('transactions')
      .withIndex('by_destCompartmentId', (q) =>
        q.eq('destCompartmentId', args.compartmentId)
      )
      .take(limit)

    // Combine and sort by timestamp
    const allTransactions = [...sourceTransactions, ...destTransactions]
      .filter((t) => t.orgId === userContext.user.orgId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)

    // Enrich with part and user data
    const enrichedTransactions = await Promise.all(
      allTransactions.map(async (transaction) => {
        const [part, user, otherCompartment] = await Promise.all([
          ctx.db.get(transaction.partId),
          ctx.db.get(transaction.userId),
          // For moves, show the other compartment
          transaction.sourceCompartmentId === args.compartmentId &&
          transaction.destCompartmentId
            ? ctx.db.get(transaction.destCompartmentId)
            : transaction.destCompartmentId === args.compartmentId &&
                transaction.sourceCompartmentId
              ? ctx.db.get(transaction.sourceCompartmentId)
              : Promise.resolve(null),
        ])

        return {
          ...transaction,
          part: part
            ? {
                _id: part._id,
                name: part.name,
                sku: part.sku,
              }
            : undefined,
          user: user
            ? {
                _id: user._id,
                name: user.name,
              }
            : undefined,
          otherCompartment: otherCompartment
            ? {
                _id: otherCompartment._id,
                label: otherCompartment.label,
              }
            : undefined,
        }
      })
    )

    return enrichedTransactions
  },
})

/**
 * Get transaction statistics for the organization
 */
export const getStats = query({
  args: {
    authContext: authContextSchema,
  },
  returns: v.object({
    totalTransactions: v.number(),
    transactionsToday: v.number(),
    transactionsThisWeek: v.number(),
    transactionsThisMonth: v.number(),
    transactionsByType: v.object({
      Add: v.number(),
      Remove: v.number(),
      Move: v.number(),
      Adjust: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect()

    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000
    const oneWeekMs = 7 * oneDayMs
    const oneMonthMs = 30 * oneDayMs

    const startOfDay = now - oneDayMs
    const startOfWeek = now - oneWeekMs
    const startOfMonth = now - oneMonthMs

    return {
      totalTransactions: transactions.length,
      transactionsToday: transactions.filter((t) => t.timestamp >= startOfDay).length,
      transactionsThisWeek: transactions.filter((t) => t.timestamp >= startOfWeek).length,
      transactionsThisMonth: transactions.filter((t) => t.timestamp >= startOfMonth).length,
      transactionsByType: {
        Add: transactions.filter((t) => t.actionType === 'Add').length,
        Remove: transactions.filter((t) => t.actionType === 'Remove').length,
        Move: transactions.filter((t) => t.actionType === 'Move').length,
        Adjust: transactions.filter((t) => t.actionType === 'Adjust').length,
      },
    }
  },
})
