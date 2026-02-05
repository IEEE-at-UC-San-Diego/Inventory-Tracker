import { v } from 'convex/values'
import { query } from '../_generated/server'
import { getCurrentUser } from '../auth_helpers'
import { authContextSchema } from '../types/auth'

/**
 * Get organization by ID
 * All roles can view organization details
 */
export const get = query({
  args: {
    authContext: authContextSchema,
    id: v.id('organizations'),
  },
  returns: v.object({
    _id: v.id('organizations'),
    name: v.string(),
    slug: v.string(),
    _creationTime: v.number(),
  }),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      throw new Error('Unauthorized')
    }

    const org = await ctx.db.get(args.id)

    // Only return if user belongs to this org
    if (!org || org._id !== userContext.user.orgId) {
      throw new Error('Organization not found or access denied')
    }

    return {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      _creationTime: org._creationTime,
    }
  },
})

/**
 * List organizations the user is a member of
 * Currently single-org, but prepared for multi-tenant
 */
export const list = query({
  args: {
    authContext: authContextSchema,
  },
  returns: v.array(
    v.object({
      _id: v.id('organizations'),
      name: v.string(),
      slug: v.string(),
      _creationTime: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      throw new Error('Unauthorized')
    }

    const org = await ctx.db.get(userContext.user.orgId)

    if (!org) {
      return []
    }

    return [
      {
        _id: org._id,
        name: org.name,
        slug: org.slug,
        _creationTime: org._creationTime,
      },
    ]
  },
})

/**
 * Get organization by slug
 * Used for routing and validation
 */
export const getBySlug = query({
  args: {
    authContext: authContextSchema,
    slug: v.string(),
  },
  returns: v.nullable(
    v.object({
      _id: v.id('organizations'),
      name: v.string(),
      slug: v.string(),
      _creationTime: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      throw new Error('Unauthorized')
    }

    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    // Only return if user belongs to this org
    if (!org || org._id !== userContext.user.orgId) {
      return null
    }

    return {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      _creationTime: org._creationTime,
    }
  },
})

/**
 * Get organization members with their roles
 * All members can view other members
 */
export const getOrgMembers = query({
  args: {
    authContext: authContextSchema,
    organizationId: v.id('organizations'),
  },
  returns: v.array(
    v.object({
      _id: v.id('users'),
      name: v.string(),
      email: v.string(),
      role: v.union(v.literal('Administrator'), v.literal('Executive Officers'), v.literal('General Officers'), v.literal('Member')),
      logtoUserId: v.string(),
      orgId: v.union(v.id('organizations'), v.string()),
      createdAt: v.number(),
      _creationTime: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      throw new Error('Unauthorized')
    }

    // Check user is a member of this org
    if (args.organizationId !== userContext.user.orgId) {
      throw new Error('Access denied')
    }

    const users = await ctx.db
      .query('users')
      .withIndex('by_orgId', (q) => q.eq('orgId', args.organizationId))
      .collect()

    return users
      .filter((user) => !!user.role)
      .map((user) => ({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role as
          | 'Administrator'
          | 'Executive Officers'
          | 'General Officers'
          | 'Member',
        logtoUserId: user.logtoUserId,
        orgId: user.orgId,
        createdAt: user.createdAt,
        _creationTime: user._creationTime,
      }))
  },
})

/**
 * Get user's own role in organization
 */
export const getMyRole = query({
  args: {
    authContext: authContextSchema,
    organizationId: v.id('organizations'),
  },
  returns: v.union(
    v.literal('Administrator'),
    v.literal('Executive Officers'),
    v.literal('General Officers'),
    v.literal('Member')
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      throw new Error('Unauthorized')
    }

    if (args.organizationId !== userContext.user.orgId) {
      throw new Error('Access denied')
    }

    return userContext.role
  },
})
