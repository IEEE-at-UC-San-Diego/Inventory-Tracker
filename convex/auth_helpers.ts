import { v } from 'convex/values'
import { query, mutation, internalMutation } from './_generated/server'
import { internal } from './_generated/api'
import { Doc, Id } from './_generated/dataModel'
import type { QueryCtx, MutationCtx } from './_generated/server'
import { AuthContext, AuthValidationOptions } from './types/auth'
import {
  normalizeRole,
  ROLE_HIERARCHY,
  type UserRole,
} from './auth_role_utils'
export type { UserRole } from './auth_role_utils'

/**
 * Auth helper functions for user synchronization and authorization
 *
 * AUTH CONTEXT FLOW:
 * - Frontend authenticates via Logto SDK
 * - Token verification at /api/verify-token creates auth context
 * - Auth context (userId, logtoUserId, orgId, role, timestamp) passed to Convex
 * - These functions validate auth context and provide user/organization data
 *
 * WEBHOOK AUTHENTICATION:
 * - The syncCurrentUser() and syncUserInternal() functions use ctx.auth.getUserIdentity()
 * - This is ONLY used when called from Logto webhooks (logtoWebhook endpoint in auth.ts)
 * - Convex auth is NOT used for general client authentication in the new architecture
 */

/**
 * Validates an auth context passed from the frontend
 * Checks freshness and database consistency
 */
async function validateAuthContext(
  ctx: QueryCtx | MutationCtx,
  authContext: AuthContext,
  options?: AuthValidationOptions
): Promise<Doc<'users'>> {
  const maxAge = options?.maxAge || 24 * 60 * 60 * 1000 // Default: 24 hours

  // Check existence
  if (!authContext) {
    throw new Error('Auth context required')
  }

  // Check timestamp (staleness check)
  const now = Date.now()
  if (now - authContext.timestamp > maxAge) {
    throw new Error('Auth context expired')
  }

  // Get user from database
  const user = await ctx.db.get(authContext.userId as Id<'users'>)
  if (!user) {
    throw new Error('User not found')
  }

  // Normalize role in auth context to handle legacy values
  authContext.role = normalizeRole(authContext.role)

  // Verify logtoUserId matches
  if (user.logtoUserId !== authContext.logtoUserId) {
    throw new Error('Invalid auth context')
  }

  // Verify orgId matches
  if (user.orgId !== authContext.orgId) {
    throw new Error('Auth context mismatch: organization ID')
  }

  // Verify role matches
  if (user.role !== authContext.role) {
    throw new Error('Auth context mismatch: role')
  }

  return user
}

/**
 * User context returned by getCurrentUser
 */
export interface UserContext {
  user: Doc<'users'>
  org: Doc<'organizations'>
  role: UserRole
  roleLevel: number
}

/**
 * Gets the current user from the provided auth context
 * Returns user with their organization context
 * Validates auth context against database
 */
export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx,
  authContext: AuthContext,
  options?: AuthValidationOptions
): Promise<UserContext> {
  const user = await validateAuthContext(ctx, authContext, options)

  // Get the user's organization
  const org = await ctx.db.get('organizations', user.orgId)
  if (!org) {
    throw new Error('Organization not found')
  }

  const role = normalizeRole(user.role)
  const roleLevel = ROLE_HIERARCHY[role] || 1

  return {
    user,
    org,
    role,
    roleLevel,
  }
}

/**
 * Validates that the current user has access to the specified organization
 * Throws an error if the user doesn't belong to the org
 */
export async function validateOrgAccess(
  ctx: QueryCtx | MutationCtx,
  authContext: AuthContext,
  orgId: string,
  options?: AuthValidationOptions
): Promise<UserContext> {
  const userContext = await getCurrentUser(ctx, authContext, options)

  if (userContext.user.orgId !== orgId) {
    throw new Error(
      `Forbidden: User does not have access to organization ${orgId}`
    )
  }

  return userContext
}

/**
 * Requires the current user to have at least the specified role level
 * Throws an error if the user's role is insufficient
 */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  authContext: AuthContext,
  requiredRole: UserRole,
  options?: AuthValidationOptions
): Promise<UserContext> {
  const userContext = await getCurrentUser(ctx, authContext, options)

  const requiredLevel = ROLE_HIERARCHY[requiredRole]
  if (userContext.roleLevel < requiredLevel) {
    throw new Error(
      `Forbidden: User requires ${requiredRole} role or higher. Current role: ${userContext.role}`
    )
  }

  return userContext
}

/**
 * Requires the current user to have at least the specified role within a specific org
 * Combines org access validation with role checking
 */
export async function requireOrgRole(
  ctx: QueryCtx | MutationCtx,
  authContext: AuthContext,
  orgId: string,
  requiredRole: UserRole,
  options?: AuthValidationOptions
): Promise<UserContext> {
  const userContext = await validateOrgAccess(
    ctx,
    authContext,
    orgId,
    options
  )

  const requiredLevel = ROLE_HIERARCHY[requiredRole]
  if (userContext.roleLevel < requiredLevel) {
    throw new Error(
      `Forbidden: User requires ${requiredRole} role or higher in this organization. Current role: ${userContext.role}`
    )
  }

  return userContext
}

/**
 * Internal mutation to sync a user from Logto to our database
 *
 * NOTE: This function uses ctx.auth.getUserIdentity() internally and is ONLY intended
 * for use by Logto webhooks (logtoWebhook endpoint in convex/auth.ts).
 * For regular authentication, use the auth context flow via /api/verify-token.
 */
export const syncUserInternal = internalMutation({
  args: {
    logtoUserId: v.string(),
    email: v.string(),
    name: v.string(),
    orgId: v.optional(v.id('organizations')),
    role: v.optional(v.string()),
  },
  returns: v.object({
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
  }),
  handler: async (ctx, args) => {
    const now = Date.now()

    // Check if user already exists
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_logtoUserId', (q) => q.eq('logtoUserId', args.logtoUserId))
      .unique()

    if (existingUser) {
      const normalizedRole = normalizeRole(existingUser.role)
      // Update existing user
      // Note: We only update name/email, not org/role which are managed separately
      await ctx.db.patch(existingUser._id, {
        name: args.name,
        email: args.email,
      })
      return { ...existingUser, name: args.name, email: args.email, role: normalizedRole }
    }

    // For new users, we need an org. If none provided, create a default one.
    let orgId = args.orgId
    if (!orgId) {
      // Create a personal organization for the user
      const slug = `org-${args.logtoUserId.slice(0, 8)}-${now.toString(36)}`
      orgId = await ctx.db.insert('organizations', {
        name: `${args.name}'s Organization`,
        slug,
        createdAt: now,
      })
    }

    // Create the user
    const userId = await ctx.db.insert('users', {
      logtoUserId: args.logtoUserId,
      name: args.name,
      email: args.email,
      orgId,
      role: normalizeRole(args.role || null),
      createdAt: now,
    })

    // Return the created user
    const user = await ctx.db.get('users', userId)
    if (!user) {
      throw new Error('Failed to create user')
    }

    return { ...user, role: normalizeRole(user.role) }
  },
})

/**
 * Public mutation to sync the current user (can be called from client)
 *
 * NOTE: This function uses ctx.auth.getUserIdentity() and is ONLY used by Logto
 * webhooks to sync user data when events are received. For regular authentication,
 * use the auth context flow via /api/verify-token.
 */
export const syncCurrentUser = mutation({
  args: {
    name: v.optional(v.string()),
  },
  returns: v.union(
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
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return null
    }

    // Get user info from the identity token
    // Logto embeds user info in the JWT
    const tokenData = identity.tokenIdentifier
      ? JSON.parse(atob(identity.tokenIdentifier.split('.')[1] || '{}'))
      : {}

    const logtoUserId = identity.subject
    const email = tokenData.email || ''
    const name = args.name || tokenData.name || email

    // Check if user already exists
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_logtoUserId', (q) => q.eq('logtoUserId', logtoUserId))
      .unique()

    if (existingUser) {
      // Update name if provided
      if (args.name) {
        await ctx.db.patch(existingUser._id, { name: args.name })
        return { ...existingUser, name: args.name, role: normalizeRole(existingUser.role) }
      }
      return { ...existingUser, role: normalizeRole(existingUser.role) }
    }

    // Create new user with default org
    const now = Date.now()
    const slug = `org-${logtoUserId.slice(0, 8)}-${now.toString(36)}`

    const orgId = await ctx.db.insert('organizations', {
      name: `${name}'s Organization`,
      slug,
      createdAt: now,
    })

    const userId = await ctx.db.insert('users', {
      logtoUserId,
      name,
      email,
      orgId,
      role: 'Administrator',
      createdAt: now,
    })

    const user = await ctx.db.get('users', userId)
    return user ? { ...user, role: normalizeRole(user.role) } : null
  },
})

// ============================================
// Profile & Role Queries
// ============================================

export const getMyProfile = query({
  args: {
    authContext: v.object({
      userId: v.string(),
      logtoUserId: v.string(),
      orgId: v.string(),
      role: v.union(
        v.literal('Administrator'),
        v.literal('Executive Officers'),
        v.literal('General Officers'),
        v.literal('Member')
      ),
      timestamp: v.number(),
    }),
  },
  returns: v.union(
    v.object({
      user: v.object({
        _id: v.id('users'),
        _creationTime: v.number(),
        logtoUserId: v.string(),
        name: v.string(),
        email: v.string(),
        orgId: v.union(v.id('organizations'), v.string()),
        role: v.union(
          v.literal('Administrator'),
          v.literal('Executive Officers'),
          v.literal('General Officers'),
          v.literal('Member'),
          // Legacy roles for migration
          v.literal('Admin'),
          v.literal('Editor'),
          v.literal('Viewer')
        ),
        createdAt: v.number(),
      }),
      org: v.object({
        _id: v.id('organizations'),
        _creationTime: v.number(),
        name: v.string(),
        slug: v.string(),
        createdAt: v.number(),
      }),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)

    return {
      user: userContext.user,
      org: userContext.org,
    }
  },
})

/**
 * Internal mutation to sync user role specifically
 * Returns success status and enqueues retry on failure
 */
export const syncUserRoleInternal = internalMutation({
  args: {
    logtoUserId: v.string(),
    targetRole: v.union(
      v.literal('Administrator'),
      v.literal('Executive Officers'),
      v.literal('General Officers'),
      v.literal('Member')
    ),
  },
  returns: v.object({
    success: v.boolean(),
    queued: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      // Find the user
      const user = await ctx.db
        .query('users')
        .withIndex('by_logtoUserId', (q) => q.eq('logtoUserId', args.logtoUserId))
        .unique()

      if (!user) {
        return {
          success: false,
          queued: false,
          message: 'User not found in database',
        }
      }

      // Update the user's role
      await ctx.db.patch(user._id, {
        role: args.targetRole,
      })

      return {
        success: true,
        queued: false,
        message: 'Role synced successfully',
      }
    } catch (error) {
      // On error, enqueue for retry with exponential backoff
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Find user for queue item
      const user = await ctx.db
        .query('users')
        .withIndex('by_logtoUserId', (q) => q.eq('logtoUserId', args.logtoUserId))
        .unique()

      if (user) {
        // Check if there's already a pending/retry queue item for this user
        const existingQueueItem = await ctx.db
          .query('roleSyncQueue')
          .withIndex('by_userId', (q) => q.eq('userId', user._id))
          .filter((q) =>
            q.or(q.eq(q.field('status'), 'pending'), q.eq(q.field('status'), 'retry'))
          )
          .first()

        if (existingQueueItem) {
          // Update existing queue item with new target role
          await ctx.db.patch(existingQueueItem._id, {
            targetRole: args.targetRole,
            errorMessage,
            lastAttemptAt: Date.now(),
          })
        } else {
          // Create new queue item
          await ctx.runMutation(internal.role_sync_queue.mutations.enqueueRoleSync, {
            userId: user._id,
            targetRole: args.targetRole,
            errorMessage,
          })
        }

        return {
          success: false,
          queued: true,
          message: `Role sync failed, queued for retry: ${errorMessage}`,
        }
      }

      return {
        success: false,
        queued: false,
        message: `Role sync failed and user not found: ${errorMessage}`,
      }
    }
  },
})

/**
 * Internal mutation to sync a user from Logto token data
 *
 * This is called from the /api/verify-token route after JWT verification.
 * It extracts user info from the idTokenClaims and userInfo and syncs to the database.
 *
 * Returns the synced user data along with flags for new user and org creation needs.
 */
export const syncUserFromLogtoToken = internalMutation({
  args: {
    idTokenClaims: v.object({
      sub: v.string(),
      email: v.optional(v.string()),
      name: v.optional(v.string()),
      roles: v.optional(v.array(v.string())),
      organization_id: v.optional(v.string()),
    }),
    userInfo: v.object({
      sub: v.string(),
      email: v.string(),
      name: v.optional(v.string()),
      phone_number: v.optional(v.string()),
      picture: v.optional(v.string()),
      updated_at: v.number(),
    }),
  },
  returns: v.object({
    user: v.object({
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
    }),
    isNewUser: v.boolean(),
    needsOrgCreation: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now()

    // Extract user information from the verified token
    const logtoUserId = args.idTokenClaims.sub
    const email = args.userInfo.email || args.idTokenClaims.email || ''
    const name = args.userInfo.name || args.idTokenClaims.name || (email ? email.split('@')[0] : 'Unknown')

    // Extract role from custom claims (if configured in Logto)
    // Roles can be synced using Logto's custom JWT claims feature
    const roleClaim = (args.idTokenClaims as any).roles?.[0] || 'Member'
    const role = normalizeRole(roleClaim)

    // Extract organization ID from custom claims (if configured)
    const orgIdClaim = (args.idTokenClaims as any).organization_id as Id<'organizations'> | undefined

    // Check if user already exists
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_logtoUserId', (q) => q.eq('logtoUserId', logtoUserId))
      .unique()

    let isNewUser = !existingUser
    let needsOrgCreation = false
    let user: Doc<'users'> | null
    let finalOrgId: Id<'organizations'>

    if (existingUser) {
      // Update existing user - include role update
      console.log('[syncUserFromLogtoToken] Updating existing user:', {
        userId: existingUser._id,
        oldRole: existingUser.role,
        newRole: role,
        roleChanged: existingUser.role !== role,
      })
      await ctx.db.patch(existingUser._id, {
        name,
        email,
        role, // Update role from JWT
      })
      user = await ctx.db.get('users', existingUser._id)
      finalOrgId = user!.orgId
    } else {
      // For new users, we need an org. If none provided, create a default one.
      if (!orgIdClaim) {
        needsOrgCreation = true
        const slug = `org-${logtoUserId.slice(0, 8)}-${now.toString(36)}`
        finalOrgId = await ctx.db.insert('organizations', {
          name: `${name}'s Organization`,
          slug,
          createdAt: now,
        })
      } else {
        finalOrgId = orgIdClaim
      }

      // Create the user
      const userId = await ctx.db.insert('users', {
        logtoUserId,
        name,
        email,
        orgId: finalOrgId,
        role,
        createdAt: now,
      })

      user = await ctx.db.get('users', userId)
    }

    if (!user) {
      throw new Error('Failed to sync user: user not found after operation')
    }

    return {
      user,
      isNewUser,
      needsOrgCreation,
    }
  },
})

/**
 * Internal migration to update all existing user roles from legacy names to new UserRole types
 * This should be run once before deploying the new role schema
 */
export const migrateUserRoles = internalMutation({
  args: {},
  returns: v.object({
    updated: v.number(),
    errors: v.number(),
  }),
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect()
    let updated = 0
    let errors = 0

    for (const user of users) {
      try {
        const normalizedRole = normalizeRole(user.role)
        if (normalizedRole !== user.role) {
          await ctx.db.patch(user._id, {
            role: normalizedRole,
          })
          updated++
        }
      } catch (error) {
        console.error(`Failed to migrate user ${user._id}:`, error)
        errors++
      }
    }

    return { updated, errors }
  },
})

/**
 * Debug query to check all users and their roles
 */
export const debugUsers = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect()
    return users.map(u => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      orgId: u.orgId,
      createdAt: u.createdAt
    }))
  },
})
