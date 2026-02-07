import { v } from 'convex/values'
import { mutation } from '../_generated/server'
import { Id } from '../_generated/dataModel'
import { requireOrgRole } from '../auth_helpers'
import { getCurrentOrgId } from '../organization_helpers'
import { authContextSchema } from '../types/auth'

// Maximum number of revisions to keep per blueprint
const MAX_REVISIONS = 50

/**
 * Create a new revision snapshot for a blueprint
 * Should be called after a blueprint is saved with changes
 * Requires General Officers role or higher
 */
export const createRevision = mutation({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
    state: v.object({
      drawers: v.array(
        v.object({
          _id: v.id('drawers'),
          x: v.number(),
          y: v.number(),
          width: v.number(),
          height: v.number(),
          rotation: v.number(),
          zIndex: v.number(),
          label: v.optional(v.string()),
        })
      ),
      compartments: v.array(
        v.object({
          _id: v.id('compartments'),
          drawerId: v.id('drawers'),
          x: v.number(),
          y: v.number(),
          width: v.number(),
          height: v.number(),
          rotation: v.number(),
          zIndex: v.number(),
          label: v.optional(v.string()),
        })
      ),
    }),
    description: v.optional(v.string()),
  },
  returns: v.id('blueprintRevisions'),
  handler: async (ctx, args): Promise<Id<'blueprintRevisions'>> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)
    const userContext = await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    // Verify blueprint exists and belongs to org
    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint || blueprint.orgId !== orgId) {
      throw new Error('Blueprint not found or access denied')
    }

    // Get the latest version number for this blueprint
    const existingRevisions = await ctx.db
      .query('blueprintRevisions')
      .withIndex('by_blueprintId', (q) => q.eq('blueprintId', args.blueprintId))
      .collect()

    const maxVersion = existingRevisions.reduce((max, rev) => Math.max(max, rev.version), 0)
    const newVersion = maxVersion + 1

    // Create the new revision
    const revisionId = await ctx.db.insert('blueprintRevisions', {
      blueprintId: args.blueprintId,
      version: newVersion,
      state: args.state,
      description: args.description,
      createdBy: userContext.user._id,
      createdAt: Date.now(),
      orgId,
    })

    // Clean up old revisions if we exceed the limit
    if (existingRevisions.length >= MAX_REVISIONS - 1) {
      // Get all revisions sorted by version, find oldest to delete
      const revisionsToDelete = existingRevisions
        .sort((a, b) => a.version - b.version)
        .slice(0, existingRevisions.length - (MAX_REVISIONS - 1))

      for (const oldRevision of revisionsToDelete) {
        await ctx.db.delete(oldRevision._id)
      }
    }

    return revisionId
  },
})

/**
 * Restore a blueprint to a specific revision state
 * Requires General Officers role or higher
 * This will create a new revision capturing the current state before restoring
 */
export const restoreRevision = mutation({
  args: {
    authContext: authContextSchema,
    revisionId: v.id('blueprintRevisions'),
    description: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    newRevisionId: v.optional(v.id('blueprintRevisions')),
  }),
  handler: async (ctx, args) => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)
    const userContext = await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    // Get the revision to restore
    const revision = await ctx.db.get(args.revisionId)
    if (!revision || revision.orgId !== orgId) {
      return {
        success: false,
        message: 'Revision not found or access denied',
      }
    }

    // Get the blueprint
    const blueprint = await ctx.db.get(revision.blueprintId)
    if (!blueprint) {
      return {
        success: false,
        message: 'Blueprint not found',
      }
    }

    // First, create a revision of the current state before restoring
    // Get all current drawers and compartments
    const currentDrawers = await ctx.db
      .query('drawers')
      .withIndex('by_blueprintId', (q) => q.eq('blueprintId', revision.blueprintId))
      .collect()

    const currentState = {
      drawers: currentDrawers.map((drawer) => ({
        _id: drawer._id,
        x: drawer.x,
        y: drawer.y,
        width: drawer.width,
        height: drawer.height,
        rotation: drawer.rotation,
        zIndex: drawer.zIndex,
        label: drawer.label,
      })),
      compartments: [] as Array<{
        _id: Id<'compartments'>
        drawerId: Id<'drawers'>
        x: number
        y: number
        width: number
        height: number
        rotation: number
        zIndex: number
        label?: string
      }>,
    }

    // Get compartments for each drawer
    for (const drawer of currentDrawers) {
      const compartments = await ctx.db
        .query('compartments')
        .withIndex('by_drawerId', (q) => q.eq('drawerId', drawer._id))
        .collect()

      currentState.compartments.push(
        ...compartments.map((comp) => ({
          _id: comp._id,
          drawerId: comp.drawerId,
          x: comp.x,
          y: comp.y,
          width: comp.width,
          height: comp.height,
          rotation: comp.rotation,
          zIndex: comp.zIndex,
          label: comp.label,
        }))
      )
    }

    // Create revision of current state
    const existingRevisions = await ctx.db
      .query('blueprintRevisions')
      .withIndex('by_blueprintId', (q) => q.eq('blueprintId', revision.blueprintId))
      .collect()

    const maxVersion = existingRevisions.reduce((max, rev) => Math.max(max, rev.version), 0)
    const backupVersion = maxVersion + 1

    await ctx.db.insert('blueprintRevisions', {
      blueprintId: revision.blueprintId,
      version: backupVersion,
      state: currentState,
      description: `Auto-backup before restoring to v${revision.version}`,
      createdBy: userContext.user._id,
      createdAt: Date.now(),
      orgId,
    })

    // Now, restore the revision by applying the saved state
    // Delete all current drawers and compartments
    for (const drawer of currentDrawers) {
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
          return {
            success: false,
            message: `Cannot restore: compartment "${compartment.label || compartment._id}" contains inventory. Remove inventory first.`,
          }
        }

        await ctx.db.delete(compartment._id)
      }

      await ctx.db.delete(drawer._id)
    }

    // Recreate drawers and compartments from revision state
    const now = Date.now()
    const drawerIdMap = new Map<Id<'drawers'>, Id<'drawers'>>()

    for (const savedDrawer of revision.state.drawers) {
      const newDrawerId = await ctx.db.insert('drawers', {
        blueprintId: revision.blueprintId,
        x: savedDrawer.x,
        y: savedDrawer.y,
        width: savedDrawer.width,
        height: savedDrawer.height,
        rotation: savedDrawer.rotation,
        zIndex: savedDrawer.zIndex,
        label: savedDrawer.label,
        createdAt: now,
        updatedAt: now,
      })
      drawerIdMap.set(savedDrawer._id, newDrawerId)
    }

    for (const savedCompartment of revision.state.compartments) {
      const newDrawerId = drawerIdMap.get(savedCompartment.drawerId)
      if (!newDrawerId) {
        continue
      }

      await ctx.db.insert('compartments', {
        drawerId: newDrawerId,
        x: savedCompartment.x,
        y: savedCompartment.y,
        width: savedCompartment.width,
        height: savedCompartment.height,
        rotation: savedCompartment.rotation,
        zIndex: savedCompartment.zIndex,
        label: savedCompartment.label,
        createdAt: now,
        updatedAt: now,
      })
    }

    // Update blueprint timestamp
    await ctx.db.patch(revision.blueprintId, {
      updatedAt: now,
    })

    // Create a revision documenting the restore
    const newRevisionId = await ctx.db.insert('blueprintRevisions', {
      blueprintId: revision.blueprintId,
      version: backupVersion + 1,
      state: revision.state,
      description: args.description || `Restored to version ${revision.version}`,
      createdBy: userContext.user._id,
      createdAt: Date.now(),
      orgId,
    })

    return {
      success: true,
      message: `Successfully restored to version ${revision.version}`,
      newRevisionId,
    }
  },
})

/**
 * Delete a specific revision
 * Requires General Officers role or higher
 */
export const deleteRevision = mutation({
  args: {
    authContext: authContextSchema,
    revisionId: v.id('blueprintRevisions'),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)
    await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    const revision = await ctx.db.get(args.revisionId)
    if (!revision || revision.orgId !== orgId) {
      throw new Error('Revision not found or access denied')
    }

    await ctx.db.delete(args.revisionId)
    return true
  },
})

/**
 * Delete all revisions for a blueprint
 * Requires Admin role
 */
export const deleteAllRevisions = mutation({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
  },
  returns: v.object({
    success: v.boolean(),
    deletedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)
    await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    // Verify blueprint belongs to org
    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint || blueprint.orgId !== orgId) {
      throw new Error('Blueprint not found or access denied')
    }

    // Get all revisions
    const revisions = await ctx.db
      .query('blueprintRevisions')
      .withIndex('by_blueprintId', (q) => q.eq('blueprintId', args.blueprintId))
      .collect()

    // Delete all revisions
    for (const revision of revisions) {
      await ctx.db.delete(revision._id)
    }

    return {
      success: true,
      deletedCount: revisions.length,
    }
  },
})
