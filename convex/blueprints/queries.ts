import { v } from 'convex/values'
import { query } from '../_generated/server'
import { Doc, Id } from '../_generated/dataModel'
import { getCurrentUser, requireOrgRole } from '../auth_helpers'
import { authContextSchema } from '../types/auth'

// Lock expiration time in milliseconds (5 minutes)
const LOCK_EXPIRATION_MS = 5 * 60 * 1000

/**
 * List all blueprints for the current user's organization
 */
export const list = query({
  args: {
    authContext: authContextSchema,
  },
  returns: v.array(
    v.object({
      _id: v.id('blueprints'),
      _creationTime: v.number(),
      name: v.string(),
      orgId: v.id('organizations'),
      lockedBy: v.optional(v.id('users')),
      lockTimestamp: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
      isLocked: v.optional(v.boolean()),
      lockedByUser: v.optional(
        v.object({
          _id: v.id('users'),
          name: v.string(),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)

    const blueprints = await ctx.db
      .query('blueprints')
      .withIndex('by_orgId', (q) => q.eq('orgId', userContext.user.orgId))
      .collect()

    // Enrich with lock status and user info
    const enrichedBlueprints = await Promise.all(
      blueprints.map(async (blueprint) => {
        const now = Date.now()
        const isLocked = !!(
          blueprint.lockedBy &&
          blueprint.lockTimestamp &&
          now - blueprint.lockTimestamp < LOCK_EXPIRATION_MS
        )

        let lockedByUser: { _id: Id<'users'>; name: string } | undefined = undefined
        if (isLocked && blueprint.lockedBy) {
          const user = await ctx.db.get(blueprint.lockedBy)
          if (user) {
            lockedByUser = {
              _id: user._id,
              name: user.name,
            }
          }
        }

        return {
          ...blueprint,
          isLocked,
          lockedByUser,
        }
      })
    )

    return enrichedBlueprints
  },
})

/**
 * Get a single blueprint by ID with all its drawers
 */
export const get = query({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
  },
  returns: v.union(
    v.object({
      _id: v.id('blueprints'),
      _creationTime: v.number(),
      name: v.string(),
      orgId: v.id('organizations'),
      lockedBy: v.optional(v.id('users')),
      lockTimestamp: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
      drawers: v.array(
        v.object({
          _id: v.id('drawers'),
          _creationTime: v.number(),
          blueprintId: v.id('blueprints'),
          x: v.number(),
          y: v.number(),
          width: v.number(),
          height: v.number(),
          rotation: v.number(),
          zIndex: v.number(),
          label: v.optional(v.string()),
          createdAt: v.number(),
          updatedAt: v.number(),
        })
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      return null
    }

    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint || blueprint.orgId !== userContext.user.orgId) {
      return null
    }

    // Get all drawers for this blueprint
    const drawers = await ctx.db
      .query('drawers')
      .withIndex('by_blueprintId', (q) => q.eq('blueprintId', args.blueprintId))
      .collect()

    return {
      ...blueprint,
      drawers,
    }
  },
})

/**
 * Get blueprint with full nested hierarchy:
 * blueprint -> drawers -> compartments
 */
export const getWithHierarchy = query({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
  },
  returns: v.union(
    v.object({
      _id: v.id('blueprints'),
      _creationTime: v.number(),
      name: v.string(),
      orgId: v.id('organizations'),
      lockedBy: v.optional(v.id('users')),
      lockTimestamp: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
      drawers: v.array(
        v.object({
          _id: v.id('drawers'),
          _creationTime: v.number(),
          blueprintId: v.id('blueprints'),
          x: v.number(),
          y: v.number(),
          width: v.number(),
          height: v.number(),
          rotation: v.number(),
          zIndex: v.number(),
          label: v.optional(v.string()),
          createdAt: v.number(),
          updatedAt: v.number(),
          compartments: v.array(
            v.object({
              _id: v.id('compartments'),
              _creationTime: v.number(),
              drawerId: v.id('drawers'),
              x: v.number(),
              y: v.number(),
              width: v.number(),
              height: v.number(),
              rotation: v.number(),
              zIndex: v.number(),
              label: v.optional(v.string()),
              createdAt: v.number(),
              updatedAt: v.number(),
            })
          ),
        })
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      return null
    }

    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint || blueprint.orgId !== userContext.user.orgId) {
      return null
    }

    // Get all drawers for this blueprint
    const drawers = await ctx.db
      .query('drawers')
      .withIndex('by_blueprintId', (q) => q.eq('blueprintId', args.blueprintId))
      .collect()

    // Get compartments for each drawer
    const drawersWithCompartments = await Promise.all(
      drawers.map(async (drawer) => {
        const compartments = await ctx.db
          .query('compartments')
          .withIndex('by_drawerId', (q) => q.eq('drawerId', drawer._id))
          .collect()

        return {
          ...drawer,
          compartments,
        }
      })
    )

    return {
      ...blueprint,
      drawers: drawersWithCompartments,
    }
  },
})

/**
 * Get current lock status for real-time display
 * Includes whether lock is expired and who holds it
 */
export const getLockStatus = query({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
  },
  returns: v.union(
    v.object({
      isLocked: v.boolean(),
      lockedBy: v.optional(v.id('users')),
      lockedByName: v.optional(v.string()),
      lockTimestamp: v.optional(v.number()),
      timeRemainingMs: v.optional(v.number()),
      isExpired: v.optional(v.boolean()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      return null
    }

    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint || blueprint.orgId !== userContext.user.orgId) {
      return null
    }

    const now = Date.now()

    // Check if lock exists and is not expired
    const isExpired =
      blueprint.lockTimestamp &&
      now - blueprint.lockTimestamp >= LOCK_EXPIRATION_MS

    const isLocked = !!(blueprint.lockedBy && !isExpired)

    let lockedByName: string | undefined
    if (blueprint.lockedBy) {
      const user = await ctx.db.get(blueprint.lockedBy)
      if (user) {
        lockedByName = user.name
      }
    }

    const timeRemainingMs =
      blueprint.lockTimestamp && !isExpired
        ? LOCK_EXPIRATION_MS - (now - blueprint.lockTimestamp)
        : undefined

    return {
      isLocked: !!isLocked,
      lockedBy: blueprint.lockedBy ?? undefined,
      lockedByName,
      lockTimestamp: blueprint.lockTimestamp ?? undefined,
      timeRemainingMs,
      isExpired: isExpired !== undefined ? !!isExpired : undefined,
    }
  },
})
