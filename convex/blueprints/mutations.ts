import { v } from 'convex/values'
import { mutation } from '../_generated/server'
import { Doc, Id } from '../_generated/dataModel'
import { requireOrgRole } from '../auth_helpers'
import { getCurrentOrgId } from '../organization_helpers'
import { authContextSchema } from '../types/auth'

// Lock expiration time in milliseconds (5 minutes)
const LOCK_EXPIRATION_MS = 5 * 60 * 1000

/**
 * Helper to verify blueprint exists and belongs to the org
 */
async function verifyBlueprintAccess(
  ctx: {
    db: {
      get: (table: 'blueprints', id: Id<'blueprints'>) => Promise<Doc<'blueprints'> | null>
    }
  },
  blueprintId: Id<'blueprints'>,
  orgId: Id<'organizations'>
): Promise<Doc<'blueprints'>> {
  const blueprint = await ctx.db.get('blueprints', blueprintId)
  if (!blueprint || blueprint.orgId !== orgId) {
    throw new Error('Blueprint not found or access denied')
  }
  return blueprint
}

/**
 * Check if lock is currently valid (not expired)
 */
function isLockValid(blueprint: Doc<'blueprints'>): boolean {
  if (!blueprint.lockedBy || !blueprint.lockTimestamp) {
    return false
  }
  const now = Date.now()
  return now - blueprint.lockTimestamp < LOCK_EXPIRATION_MS
}

/**
 * Create a new blueprint
 * Requires General Officers role or higher
 */
export const create = mutation({
  args: {
    authContext: authContextSchema,
    name: v.string(),
  },
  returns: v.id('blueprints'),
  handler: async (ctx, args): Promise<Id<'blueprints'>> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require General Officers or higher role
    await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    const now = Date.now()

    const blueprintId = await ctx.db.insert('blueprints', {
      name: args.name,
      orgId,
      lockedBy: undefined,
      lockTimestamp: undefined,
      createdAt: now,
      updatedAt: now,
    })

    return blueprintId
  },
})

/**
 * Update blueprint name
 * Requires General Officers role or higher
 */
export const update = mutation({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
    name: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
	const orgId = await getCurrentOrgId(ctx, args.authContext)

	// Require General Officers or higher role
	await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    await ctx.db.patch(args.blueprintId, {
      name: args.name,
      updatedAt: Date.now(),
    })

    return true
  },
})

/**
 * Delete a blueprint and all its drawers and compartments
 * Requires General Officers role or higher
 */
export const deleteBlueprint = mutation({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require General Officers or higher role
    await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    const blueprint = await verifyBlueprintAccess(ctx, args.blueprintId, orgId)

    // Get all drawers for this blueprint
    const drawers = await ctx.db
      .query('drawers')
      .withIndex('by_blueprintId', (q) => q.eq('blueprintId', args.blueprintId))
      .collect()

    // Delete all compartments for each drawer
    for (const drawer of drawers) {
      const compartments = await ctx.db
        .query('compartments')
        .withIndex('by_drawerId', (q) => q.eq('drawerId', drawer._id))
        .collect()

      for (const compartment of compartments) {
        // Check for inventory in compartment
        const inventory = await ctx.db
          .query('inventory')
          .withIndex('by_compartmentId', (q) => q.eq('compartmentId', compartment._id))
          .take(1)

        if (inventory.length > 0) {
          throw new Error(
            `Cannot delete blueprint: compartment "${compartment.label || compartment._id}" contains inventory. Remove inventory first.`
          )
        }

        await ctx.db.delete(compartment._id)
      }

      await ctx.db.delete(drawer._id)
    }

    // Delete the background image from storage if it exists
    if (blueprint.backgroundImageId) {
      try {
        await ctx.storage.delete(blueprint.backgroundImageId)
      } catch {
        // Ignore errors if image doesn't exist
      }
    }

    // Delete the blueprint
    await ctx.db.delete(args.blueprintId)

    return true
  },
})

/**
 * Acquire lock for editing a blueprint
 * Requires General Officers role or higher
 * Fails if blueprint is already locked by another user
 */
export const acquireLock = mutation({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    lockedBy: v.optional(v.id('users')),
  }),
  handler: async (ctx, args) => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require General Officers or higher role
    const userContext = await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    const blueprint = await verifyBlueprintAccess(ctx, args.blueprintId, orgId)

    const now = Date.now()

    // Check if already locked
    if (isLockValid(blueprint)) {
      // Check if locked by current user (re-entrant lock)
      if (blueprint.lockedBy === userContext.user._id) {
        // Extend the lock
        await ctx.db.patch(args.blueprintId, {
          lockTimestamp: now,
          updatedAt: now,
        })
        return {
          success: true,
          message: 'Lock extended',
          lockedBy: userContext.user._id,
        }
      }

      // Locked by someone else
      return {
        success: false,
        message: 'Blueprint is locked by another user',
        lockedBy: blueprint.lockedBy,
      }
    }

    // Acquire the lock
    await ctx.db.patch(args.blueprintId, {
      lockedBy: userContext.user._id,
      lockTimestamp: now,
      updatedAt: now,
    })

    return {
      success: true,
      message: 'Lock acquired',
      lockedBy: userContext.user._id,
    }
  },
})

/**
 * Release lock on a blueprint
 * Can only be done by the lock holder
 * Auto-timeout handled via lockTimestamp check
 */
export const releaseLock = mutation({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require General Officers or higher role
    const userContext = await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    const blueprint = await verifyBlueprintAccess(ctx, args.blueprintId, orgId)

    // Check if there's an active lock
    if (!isLockValid(blueprint)) {
      return {
        success: true,
        message: 'Lock was already expired or not held',
      }
    }

    // Only the lock holder can release
    if (blueprint.lockedBy !== userContext.user._id) {
      return {
        success: false,
        message: 'Only the lock holder can release the lock',
      }
    }

    // Release the lock
    await ctx.db.patch(args.blueprintId, {
      lockedBy: undefined,
      lockTimestamp: undefined,
      updatedAt: Date.now(),
    })

    return {
      success: true,
      message: 'Lock released successfully',
    }
  },
})

/**
 * Force release a lock (General Officers override)
 * For stuck locks or when user can't release properly
 */
export const forceReleaseLock = mutation({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    previousHolder: v.optional(v.id('users')),
  }),
  handler: async (ctx, args) => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

	// Require General Officers or higher role
    await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    const blueprint = await verifyBlueprintAccess(ctx, args.blueprintId, orgId)

    const previousHolder = blueprint.lockedBy

    // Clear the lock regardless of who holds it
    await ctx.db.patch(args.blueprintId, {
      lockedBy: undefined,
      lockTimestamp: undefined,
      updatedAt: Date.now(),
    })

    return {
      success: true,
      message: 'Lock force-released by authorized user',
      previousHolder,
    }
  },
})

/**
 * Helper function to verify user holds the lock for a blueprint
 * Used by drawers and compartments mutations
 */
export async function verifyBlueprintLock(
  ctx: {
    db: {
      get: (table: 'blueprints', id: Id<'blueprints'>) => Promise<Doc<'blueprints'> | null>
    }
  },
  blueprintId: Id<'blueprints'>,
  userId: Id<'users'>,
  orgId: Id<'organizations'>
): Promise<Doc<'blueprints'>> {
  const blueprint = await verifyBlueprintAccess(ctx, blueprintId, orgId)

  if (!isLockValid(blueprint)) {
    throw new Error('Blueprint is not locked. Acquire lock before editing.')
  }

  if (blueprint.lockedBy !== userId) {
    throw new Error('Blueprint is locked by another user. Cannot edit.')
  }

  return blueprint
}

// Re-export for use in other modules
export { LOCK_EXPIRATION_MS, isLockValid, verifyBlueprintAccess }
