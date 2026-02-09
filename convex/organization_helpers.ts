import { v } from 'convex/values'
import { query, mutation } from './_generated/server'
import { Doc, Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import {
  getCurrentUser,
  validateOrgAccess,
  requireOrgRole,
  UserRole,
  UserContext,
} from './auth_helpers'
import { authContextSchema, type AuthContext } from './types/auth'

/**
 * Organization-scoped query helper
 * Automatically filters results by the user's organization
 * Usage: Use this pattern in your queries to ensure multi-tenant isolation
 */
export async function withOrgScope<T extends Doc<any>>(
  ctx: QueryCtx,
  authContext: AuthContext,
  table: 'users' | 'parts' | 'blueprints' | 'inventory' | 'transactions',
  _indexName: string
): Promise<{ items: T[]; userContext: UserContext }> {
  const userContext = await getCurrentUser(ctx, authContext)

  if (!userContext) {
    throw new Error('Unauthorized: User not authenticated')
  }

  // Org scoping removed — return all items globally
  const items = await ctx.db.query(table).collect()

  return { items: items as T[], userContext }
}

/**
 * Get the current user's organization ID
 * Throws if user is not authenticated
 */
export async function getCurrentOrgId(
  ctx: QueryCtx | MutationCtx,
  authContext: AuthContext
): Promise<Id<'organizations'>> {
  const userContext = await getCurrentUser(ctx, authContext)

  if (!userContext) {
    throw new Error('Unauthorized: User not authenticated')
  }

  return userContext.user.orgId
}

/**
 * Query to get all users in the current organization
 * Only Admins and Editors can see all users
 */
export const getOrgUsers = query({
  args: {
    authContext: authContextSchema,
  },
  returns: v.array(
    v.object({
      _id: v.id('users'),
      _creationTime: v.number(),
      logtoUserId: v.string(),
      name: v.string(),
      email: v.string(),
      orgId: v.id('organizations'),
      role: v.union(
        v.literal('Administrator'),
        v.literal('Executive Officers'),
        v.literal('General Officers'),
        v.literal('Member')
      ),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)

    if (!userContext) {
      throw new Error('Unauthorized')
    }

    // Viewers and Members can only see themselves
    if (userContext.role === 'Member' || userContext.role === 'General Officers') {
      return [userContext.user]
    }

    // Return all users globally
    const users = await ctx.db
      .query('users')
      .collect()

    return users
  },
})

/**
 * Mutation to invite a user to the organization
 * Only Admins can invite users
 */
export const inviteUser = mutation({
  args: {
    authContext: authContextSchema,
    email: v.string(),
    name: v.string(),
    role: v.union(
      v.literal('Administrator'),
      v.literal('Executive Officers'),
      v.literal('General Officers'),
      v.literal('Member')
    ),
  },
  returns: v.id('users'),
  handler: async (ctx, args) => {
    const userContext = await requireOrgRole(
      ctx,
      args.authContext,
      await getCurrentOrgId(ctx, args.authContext),
      'Administrator'
    )

    const now = Date.now()

    // Check if user already exists
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .unique()

    if (existingUser) {
      throw new Error('User already exists')
    }

    // Create the user with a placeholder logtoUserId
    // The real ID will be set when they first log in
    const userId = await ctx.db.insert('users', {
      logtoUserId: `pending-${args.email}-${now}`,
      name: args.name,
      email: args.email,
      orgId: userContext.user.orgId,
      role: args.role,
      createdAt: now,
    })

    // TODO: Send invitation email via Stack Auth or email service

    return userId
  },
})

/**
 * Mutation to update a user's role
 * Only Admins can change roles, and they cannot demote the last Admin
 */
export const updateUserRole = mutation({
  args: {
    authContext: authContextSchema,
    userId: v.id('users'),
    newRole: v.union(
      v.literal('Administrator'),
      v.literal('Executive Officers'),
      v.literal('General Officers'),
      v.literal('Member')
    ),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userContext = await requireOrgRole(
      ctx,
      args.authContext,
      await getCurrentOrgId(ctx, args.authContext),
      'Administrator'
    )

    // Get the target user
    const targetUser = await ctx.db.get('users', args.userId)
    if (!targetUser) {
      throw new Error('User not found')
    }

    // Prevent changing your own role (use a different endpoint for self-changes)
    if (targetUser._id === userContext.user._id) {
      throw new Error('Cannot change your own role')
    }

    // If demoting from Admin, check that this isn't the last Admin
    if (targetUser.role === 'Administrator' && args.newRole !== 'Administrator') {
      const admins = await ctx.db
        .query('users')
        .filter((q) => q.eq(q.field('role'), 'Administrator'))
        .collect()

      if (admins.length <= 1) {
        throw new Error('Cannot demote the last Admin')
      }
    }

    await ctx.db.patch(args.userId, { role: args.newRole })
    return true
  },
})

/**
 * Mutation to remove a user from the organization
 * Only Admins can remove users
 */
export const removeUser = mutation({
  args: {
    authContext: authContextSchema,
    userId: v.id('users'),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userContext = await requireOrgRole(
      ctx,
      args.authContext,
      await getCurrentOrgId(ctx, args.authContext),
      'Administrator'
    )

    // Cannot remove yourself
    if (args.userId === userContext.user._id) {
      throw new Error('Cannot remove yourself from the organization')
    }

    // Get the target user
    const targetUser = await ctx.db.get('users', args.userId)
    if (!targetUser) {
      throw new Error('User not found')
    }

    // Cannot remove the last Admin
    if (targetUser.role === 'Administrator') {
      const admins = await ctx.db
        .query('users')
        .filter((q) => q.eq(q.field('role'), 'Administrator'))
        .collect()

      if (admins.length <= 1) {
        throw new Error('Cannot remove the last Admin')
      }
    }

    await ctx.db.delete(args.userId)
    return true
  },
})

/**
 * Query to get organization stats
 * Returns counts of parts, blueprints, inventory items
 */
export const getOrgStats = query({
  args: {
    authContext: authContextSchema,
  },
  returns: v.object({
    totalParts: v.number(),
    totalBlueprints: v.number(),
    totalInventory: v.number(),
    totalTransactions: v.number(),
  }),
  handler: async (ctx, args) => {
    await getCurrentOrgId(ctx, args.authContext)

    const [parts, blueprints, inventory, transactions] = await Promise.all([
      ctx.db.query('parts').collect(),
      ctx.db.query('blueprints').collect(),
      ctx.db.query('inventory').collect(),
      ctx.db.query('transactions').collect(),
    ])

    return {
      totalParts: parts.length,
      totalBlueprints: blueprints.length,
      totalInventory: inventory.reduce((sum, item) => sum + item.quantity, 0),
      totalTransactions: transactions.length,
    }
  },
})

// Re-export commonly used helpers for convenience
export { getCurrentUser, validateOrgAccess, requireOrgRole, requireOrgRole as requireRole }
export type { UserContext, UserRole }
