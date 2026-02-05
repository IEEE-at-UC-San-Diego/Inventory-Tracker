import { v } from 'convex/values'
import { mutation } from '../_generated/server'
import { Doc, Id } from '../_generated/dataModel'
import { requireOrgRole } from '../auth_helpers'
import { getCurrentOrgId } from '../organization_helpers'
import { verifyBlueprintLock } from '../blueprints/mutations'
import { authContextSchema } from '../types/auth'

/**
 * Create a new compartment in a drawer
 * Requires Editor role and active lock on the blueprint
 */
export const create = mutation({
  args: {
    authContext: authContextSchema,
    drawerId: v.id('drawers'),
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
    rotation: v.optional(v.number()),
    zIndex: v.optional(v.number()),
    label: v.optional(v.string()),
  },
  returns: v.id('compartments'),
  handler: async (ctx, args): Promise<Id<'compartments'>> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require Editor or Admin role
    const userContext = await requireOrgRole(ctx, args.authContext, orgId, 'Executive Officers')

    const drawer = await ctx.db.get(args.drawerId)
    if (!drawer) {
      throw new Error('Drawer not found')
    }

    // Verify user holds the lock on this blueprint
    await verifyBlueprintLock(ctx, drawer.blueprintId, userContext.user._id, orgId)

    const now = Date.now()

    // Calculate zIndex if not provided (find max + 1)
    let zIndex = args.zIndex ?? 0
    if (args.zIndex === undefined) {
      const existingCompartments = await ctx.db
        .query('compartments')
        .withIndex('by_drawerId', (q) => q.eq('drawerId', args.drawerId))
        .collect()

      const maxZIndex = existingCompartments.reduce(
        (max, compartment) => Math.max(max, compartment.zIndex),
        -1
      )
      zIndex = maxZIndex + 1
    }

    const compartmentId = await ctx.db.insert('compartments', {
      drawerId: args.drawerId,
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
      rotation: args.rotation ?? 0,
      zIndex,
      label: args.label,
      createdAt: now,
      updatedAt: now,
    })

    // Update drawer and blueprint timestamps
    await ctx.db.patch(args.drawerId, { updatedAt: now })
    await ctx.db.patch(drawer.blueprintId, { updatedAt: now })

    return compartmentId
  },
})

/**
 * Update compartment properties
 * Requires Editor role and active lock on the blueprint
 */
export const update = mutation({
  args: {
    authContext: authContextSchema,
    compartmentId: v.id('compartments'),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    rotation: v.optional(v.number()),
    label: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require Editor or Admin role
    const userContext = await requireOrgRole(ctx, args.authContext, orgId, 'Executive Officers')

    const compartment = await ctx.db.get(args.compartmentId)
    if (!compartment) {
      throw new Error('Compartment not found')
    }

    const drawer = await ctx.db.get(compartment.drawerId)
    if (!drawer) {
      throw new Error('Drawer not found')
    }

    // Verify user holds the lock on this blueprint
    await verifyBlueprintLock(ctx, drawer.blueprintId, userContext.user._id, orgId)

    const updates: Partial<Doc<'compartments'>> = {
      updatedAt: Date.now(),
    }

    if (args.x !== undefined) updates.x = args.x
    if (args.y !== undefined) updates.y = args.y
    if (args.width !== undefined) updates.width = args.width
    if (args.height !== undefined) updates.height = args.height
    if (args.rotation !== undefined) updates.rotation = args.rotation
    if (args.label !== undefined) updates.label = args.label

    await ctx.db.patch(args.compartmentId, updates)

    // Update drawer and blueprint timestamps
    const now = Date.now()
    await ctx.db.patch(compartment.drawerId, { updatedAt: now })
    await ctx.db.patch(drawer.blueprintId, { updatedAt: now })

    return true
  },
})

/**
 * Delete a compartment
 * Requires Editor role and active lock on the blueprint
 * Fails if compartment contains inventory
 */
export const deleteCompartment = mutation({
  args: {
    authContext: authContextSchema,
    compartmentId: v.id('compartments'),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require Editor or Admin role
    const userContext = await requireOrgRole(ctx, args.authContext, orgId, 'Executive Officers')

    const compartment = await ctx.db.get(args.compartmentId)
    if (!compartment) {
      throw new Error('Compartment not found')
    }

    const drawer = await ctx.db.get(compartment.drawerId)
    if (!drawer) {
      throw new Error('Drawer not found')
    }

    // Verify user holds the lock on this blueprint
    await verifyBlueprintLock(ctx, drawer.blueprintId, userContext.user._id, orgId)

    // Check for inventory in compartment
    const inventory = await ctx.db
      .query('inventory')
      .withIndex('by_compartmentId', (q) => q.eq('compartmentId', args.compartmentId))
      .take(1)

    if (inventory.length > 0) {
      throw new Error(
        'Cannot delete compartment containing inventory. Remove inventory first.'
      )
    }

    const now = Date.now()

    // Delete the compartment
    await ctx.db.delete(args.compartmentId)

    // Update drawer and blueprint timestamps
    await ctx.db.patch(compartment.drawerId, { updatedAt: now })
    await ctx.db.patch(drawer.blueprintId, { updatedAt: now })

    return true
  },
})

/**
 * Reorder compartment z-index
 * Requires Editor role and active lock on the blueprint
 */
export const reorderZIndex = mutation({
  args: {
    authContext: authContextSchema,
    compartmentId: v.id('compartments'),
    newZIndex: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require Editor or Admin role
    const userContext = await requireOrgRole(ctx, args.authContext, orgId, 'Executive Officers')

    const compartment = await ctx.db.get(args.compartmentId)
    if (!compartment) {
      throw new Error('Compartment not found')
    }

    const drawer = await ctx.db.get(compartment.drawerId)
    if (!drawer) {
      throw new Error('Drawer not found')
    }

    // Verify user holds the lock on this blueprint
    await verifyBlueprintLock(ctx, drawer.blueprintId, userContext.user._id, orgId)

    const now = Date.now()

    await ctx.db.patch(args.compartmentId, {
      zIndex: args.newZIndex,
      updatedAt: now,
    })

    // Update drawer and blueprint timestamps
    await ctx.db.patch(compartment.drawerId, { updatedAt: now })
    await ctx.db.patch(drawer.blueprintId, { updatedAt: now })

    return true
  },
})

/**
 * Reorder multiple compartments' z-indices at once
 * Useful for drag-and-drop reordering
 */
export const reorderMultiple = mutation({
  args: {
    authContext: authContextSchema,
    drawerId: v.id('drawers'),
    compartmentOrders: v.array(
      v.object({
        compartmentId: v.id('compartments'),
        zIndex: v.number(),
      })
    ),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require Editor or Admin role
    const userContext = await requireOrgRole(ctx, args.authContext, orgId, 'Executive Officers')

    const drawer = await ctx.db.get(args.drawerId)
    if (!drawer) {
      throw new Error('Drawer not found')
    }

    // Verify user holds the lock on this blueprint
    await verifyBlueprintLock(ctx, drawer.blueprintId, userContext.user._id, orgId)

    const now = Date.now()

    // Update all compartments
    for (const { compartmentId, zIndex } of args.compartmentOrders) {
      const compartment = await ctx.db.get(compartmentId)
      if (compartment && compartment.drawerId === args.drawerId) {
        await ctx.db.patch(compartmentId, {
          zIndex,
          updatedAt: now,
        })
      }
    }

    // Update drawer and blueprint timestamps
    await ctx.db.patch(args.drawerId, { updatedAt: now })
    await ctx.db.patch(drawer.blueprintId, { updatedAt: now })

    return true
  },
})
