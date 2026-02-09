import { v } from 'convex/values'
import { mutation } from '../_generated/server'
import type { MutationCtx } from '../_generated/server'
import { Doc, Id } from '../_generated/dataModel'
import { requirePermission } from '../permissions'
import { verifyBlueprintLock } from '../blueprints/mutations'
import { authContextSchema } from '../types/auth'

async function relayoutDrawerGridCompartments(
  ctx: MutationCtx,
  drawerId: Id<'drawers'>,
  rows: number,
  cols: number
) {
  if (rows <= 0 || cols <= 0) return
  const drawer = await ctx.db.get(drawerId)
  if (!drawer) return
  const compartments = await ctx.db
    .query('compartments')
    .withIndex('by_drawerId_and_zIndex', (q) => q.eq('drawerId', drawerId))
    .collect()
  if (compartments.length === 0) return
  if (compartments.length !== rows * cols) return

  const cellW = drawer.width / cols
  const cellH = drawer.height / rows
  const now = Date.now()
  for (let i = 0; i < compartments.length; i++) {
    const r = Math.floor(i / cols)
    const c = i % cols
    const x = -drawer.width / 2 + cellW / 2 + c * cellW
    const y = -drawer.height / 2 + cellH / 2 + r * cellH
    await ctx.db.patch(compartments[i]._id, {
      x,
      y,
      width: cellW,
      height: cellH,
      rotation: 0,
      zIndex: i,
      updatedAt: now,
    })
  }
}

/**
 * Create a new drawer in a blueprint
 * Requires General Officers role and active lock on the blueprint
 */
export const create = mutation({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
    rotation: v.optional(v.number()),
    zIndex: v.optional(v.number()),
    gridRows: v.optional(v.number()),
    gridCols: v.optional(v.number()),
    label: v.optional(v.string()),
  },
  returns: v.id('drawers'),
  handler: async (ctx, args): Promise<Id<'drawers'>> => {
    const userContext = await requirePermission(ctx, args.authContext, 'drawers:create')

    // Verify user holds the lock on this blueprint
    await verifyBlueprintLock(ctx, args.blueprintId, userContext.user._id)

    const now = Date.now()

    // Calculate zIndex if not provided (find max + 1)
    let zIndex = args.zIndex ?? 0
    if (args.zIndex === undefined) {
      const existingDrawers = await ctx.db
        .query('drawers')
        .withIndex('by_blueprintId', (q) => q.eq('blueprintId', args.blueprintId))
        .collect()

      const maxZIndex = existingDrawers.reduce(
        (max, drawer) => Math.max(max, drawer.zIndex),
        -1
      )
      zIndex = maxZIndex + 1
    }

    const drawerId = await ctx.db.insert('drawers', {
      blueprintId: args.blueprintId,
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
      // Drawer rotation editing is intentionally disabled in the editor.
      rotation: 0,
      zIndex,
      gridRows: args.gridRows,
      gridCols: args.gridCols,
      label: args.label,
      createdAt: now,
      updatedAt: now,
    })

    // Update blueprint's updatedAt timestamp
    await ctx.db.patch(args.blueprintId, {
      updatedAt: now,
    })

    return drawerId
  },
})

/**
 * Update drawer properties
 * Requires General Officers role and active lock on the blueprint
 */
export const update = mutation({
  args: {
    authContext: authContextSchema,
    drawerId: v.id('drawers'),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    rotation: v.optional(v.number()),
    gridRows: v.optional(v.number()),
    gridCols: v.optional(v.number()),
    label: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const userContext = await requirePermission(ctx, args.authContext, 'drawers:update')

    const drawer = await ctx.db.get(args.drawerId)
    if (!drawer) {
      // Treat delete as idempotent to make undo/redo and repeated deletes reliable.
      return true
    }

    // Verify user holds the lock on this blueprint
    await verifyBlueprintLock(ctx, drawer.blueprintId, userContext.user._id)

    const updates: Partial<Doc<'drawers'>> = {
      updatedAt: Date.now(),
    }

    if (args.x !== undefined) updates.x = args.x
    if (args.y !== undefined) updates.y = args.y
    if (args.width !== undefined) updates.width = args.width
    if (args.height !== undefined) updates.height = args.height
    // Drawer rotation editing is intentionally disabled in the editor.
    if (args.rotation !== undefined) updates.rotation = 0
    if (args.gridRows !== undefined) updates.gridRows = Math.max(1, Math.floor(args.gridRows))
    if (args.gridCols !== undefined) updates.gridCols = Math.max(1, Math.floor(args.gridCols))
    if (args.label !== undefined) updates.label = args.label

    await ctx.db.patch(args.drawerId, updates)

    const nextRows = updates.gridRows ?? drawer.gridRows
    const nextCols = updates.gridCols ?? drawer.gridCols
    if (
      nextRows &&
      nextCols &&
      (args.width !== undefined ||
        args.height !== undefined ||
        args.gridRows !== undefined ||
        args.gridCols !== undefined)
    ) {
      await relayoutDrawerGridCompartments(ctx, args.drawerId, nextRows, nextCols)
    }

    // Update blueprint's updatedAt timestamp
    await ctx.db.patch(drawer.blueprintId, {
      updatedAt: Date.now(),
    })

    return true
  },
})

/**
 * Delete a drawer and all its compartments
 * Requires General Officers role and active lock on the blueprint
 * When force=true, deletes inventory records in compartments first.
 * Otherwise fails if any compartment contains inventory.
 */
export const deleteDrawer = mutation({
  args: {
    authContext: authContextSchema,
    drawerId: v.id('drawers'),
    force: v.optional(v.boolean()),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const userContext = await requirePermission(ctx, args.authContext, 'drawers:delete')

    const drawer = await ctx.db.get(args.drawerId)
    if (!drawer) {
      throw new Error('Drawer not found')
    }

    // Verify user holds the lock on this blueprint
    await verifyBlueprintLock(ctx, drawer.blueprintId, userContext.user._id)

    // Get all compartments for this drawer
    const compartments = await ctx.db
      .query('compartments')
      .withIndex('by_drawerId', (q) => q.eq('drawerId', args.drawerId))
      .collect()

    // Check for inventory in any compartment
    for (const compartment of compartments) {
      const inventory = await ctx.db
        .query('inventory')
        .withIndex('by_compartmentId', (q) => q.eq('compartmentId', compartment._id))
        .collect()

      if (inventory.length > 0) {
        if (args.force) {
          for (const inv of inventory) {
            await ctx.db.delete(inv._id)
          }
        } else {
          throw new Error(
            `Cannot delete drawer: compartment "${compartment.label || compartment._id}" contains inventory. Remove inventory first.`
          )
        }
      }
    }

    // Delete all compartments
    for (const compartment of compartments) {
      await ctx.db.delete(compartment._id)
    }

    const now = Date.now()

    // Delete the drawer
    await ctx.db.delete(args.drawerId)

    // Update blueprint's updatedAt timestamp
    await ctx.db.patch(drawer.blueprintId, {
      updatedAt: now,
    })

    return true
  },
})

/**
 * Reorder drawers by changing z-index
 * Requires General Officers role and active lock on the blueprint
 */
export const reorderZIndex = mutation({
  args: {
    authContext: authContextSchema,
    drawerId: v.id('drawers'),
    newZIndex: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const userContext = await requirePermission(ctx, args.authContext, 'drawers:update')

    const drawer = await ctx.db.get(args.drawerId)
    if (!drawer) {
      throw new Error('Drawer not found')
    }

    // Verify user holds the lock on this blueprint
    await verifyBlueprintLock(ctx, drawer.blueprintId, userContext.user._id)

    const now = Date.now()

    // Update the drawer's z-index
    await ctx.db.patch(args.drawerId, {
      zIndex: args.newZIndex,
      updatedAt: now,
    })

    // Update blueprint's updatedAt timestamp
    await ctx.db.patch(drawer.blueprintId, {
      updatedAt: now,
    })

    return true
  },
})

/**
 * Reorder multiple drawers' z-indices at once
 * Useful for drag-and-drop reordering
 */
export const reorderMultiple = mutation({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
    drawerOrders: v.array(
      v.object({
        drawerId: v.id('drawers'),
        zIndex: v.number(),
      })
    ),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const userContext = await requirePermission(ctx, args.authContext, 'drawers:update')

    // Verify user holds the lock on this blueprint
    await verifyBlueprintLock(ctx, args.blueprintId, userContext.user._id)

    const now = Date.now()

    // Update all drawers
    for (const { drawerId, zIndex } of args.drawerOrders) {
      const drawer = await ctx.db.get(drawerId)
      if (drawer && drawer.blueprintId === args.blueprintId) {
        await ctx.db.patch(drawerId, {
          zIndex,
          updatedAt: now,
        })
      }
    }

    // Update blueprint's updatedAt timestamp
    await ctx.db.patch(args.blueprintId, {
      updatedAt: now,
    })

    return true
  },
})
