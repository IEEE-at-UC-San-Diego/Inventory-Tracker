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
    drawerId: v.optional(v.id('drawers')),
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

    const fromDrawer = await ctx.db.get(compartment.drawerId)
    if (!fromDrawer) {
      throw new Error('Drawer not found')
    }

    const toDrawerId = args.drawerId && args.drawerId !== compartment.drawerId ? args.drawerId : null
    const toDrawer = toDrawerId ? await ctx.db.get(toDrawerId) : fromDrawer
    if (!toDrawer) {
      throw new Error('Target drawer not found')
    }

    if (toDrawerId && toDrawer.blueprintId !== fromDrawer.blueprintId) {
      throw new Error('Cannot move compartment between different blueprints')
    }

    // Verify user holds the lock on this blueprint
    await verifyBlueprintLock(ctx, toDrawer.blueprintId, userContext.user._id, orgId)

    const updates: Partial<Doc<'compartments'>> = {
      updatedAt: Date.now(),
    }

    if (toDrawerId) updates.drawerId = toDrawerId
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
    if (toDrawerId) {
      await ctx.db.patch(toDrawerId, { updatedAt: now })
    }
    await ctx.db.patch(toDrawer.blueprintId, { updatedAt: now })

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
 * Swap two compartments' positions and sizes.
 * Supports swapping across drawers within the same blueprint.
 */
export const swap = mutation({
  args: {
    authContext: authContextSchema,
    aCompartmentId: v.id('compartments'),
    bCompartmentId: v.id('compartments'),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    if (args.aCompartmentId === args.bCompartmentId) {
      return true
    }

    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require Editor or Admin role
    const userContext = await requireOrgRole(ctx, args.authContext, orgId, 'Executive Officers')

    const [a, b] = await Promise.all([
      ctx.db.get(args.aCompartmentId),
      ctx.db.get(args.bCompartmentId),
    ])

    if (!a || !b) {
      throw new Error('Compartment not found')
    }

    const [aDrawer, bDrawer] = await Promise.all([
      ctx.db.get(a.drawerId),
      ctx.db.get(b.drawerId),
    ])

    if (!aDrawer || !bDrawer) {
      throw new Error('Drawer not found')
    }

    if (aDrawer.blueprintId !== bDrawer.blueprintId) {
      throw new Error('Cannot swap compartments across different blueprints')
    }

    // Verify user holds the lock on this blueprint
    await verifyBlueprintLock(ctx, aDrawer.blueprintId, userContext.user._id, orgId)

    const now = Date.now()

    await ctx.db.patch(a._id, {
      drawerId: b.drawerId,
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      rotation: b.rotation,
      updatedAt: now,
    })

    await ctx.db.patch(b._id, {
      drawerId: a.drawerId,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
      rotation: a.rotation,
      updatedAt: now,
    })

    await ctx.db.patch(a.drawerId, { updatedAt: now })
    if (b.drawerId !== a.drawerId) {
      await ctx.db.patch(b.drawerId, { updatedAt: now })
    }
    await ctx.db.patch(aDrawer.blueprintId, { updatedAt: now })

    return true
  },
})

/**
 * Rebuild (or expand/shrink) a drawer's compartments into a rows x cols grid.
 * When expanding, existing compartments are kept and snapped into their nearest cells.
 * When shrinking, compartments that would be removed are deleted (but we refuse if they contain inventory).
 *
 * Note: This assumes drawer.rotation === 0 (grid math is axis-aligned).
 */
export const setGridForDrawer = mutation({
  args: {
    authContext: authContextSchema,
    drawerId: v.id('drawers'),
    rows: v.number(),
    cols: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const rows = Math.floor(args.rows)
    const cols = Math.floor(args.cols)
    if (rows <= 0 || cols <= 0) {
      throw new Error('Rows and columns must be positive')
    }

    const orgId = await getCurrentOrgId(ctx, args.authContext)
    const userContext = await requireOrgRole(
      ctx,
      args.authContext,
      orgId,
      'Executive Officers'
    )

    const drawer = await ctx.db.get(args.drawerId)
    if (!drawer) {
      throw new Error('Drawer not found')
    }
    if (drawer.rotation !== 0) {
      throw new Error("Can't grid-layout a rotated drawer yet")
    }

    await verifyBlueprintLock(ctx, drawer.blueprintId, userContext.user._id, orgId)

    const compartments = await ctx.db
      .query('compartments')
      .withIndex('by_drawerId', (q) => q.eq('drawerId', args.drawerId))
      .collect()

    const prevRows = drawer.gridRows ? Math.max(1, Math.floor(drawer.gridRows)) : null
    const prevCols = drawer.gridCols ? Math.max(1, Math.floor(drawer.gridCols)) : null
    // Calculate cell size from previous grid, or from current drawer size divided by requested grid
    const prevCellW = prevRows && prevCols ? drawer.width / prevCols : Math.max(50, drawer.width / cols)
    const prevCellH = prevRows && prevCols ? drawer.height / prevRows : Math.max(50, drawer.height / rows)
    // Ensure drawer never shrinks below its current size when adding rows/cols
    const nextDrawerWidth = Math.max(drawer.width, prevCellW * cols)
    const nextDrawerHeight = Math.max(drawer.height, prevCellH * rows)
    const cellW = nextDrawerWidth / cols
    const cellH = nextDrawerHeight / rows

    // Determine which existing compartments have inventory.
    const hasInventory = new Map<string, boolean>()
    for (const comp of compartments) {
      const inv = await ctx.db
        .query('inventory')
        .withIndex('by_compartmentId', (q) => q.eq('compartmentId', comp._id))
        .take(1)
      hasInventory.set(comp._id, inv.length > 0)
    }

    const newCells = rows * cols

    const cellId = (r: number, c: number) => `${r}:${c}`
    const allCells: { r: number; c: number; id: string }[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        allCells.push({ r, c, id: cellId(r, c) })
      }
    }

    // Prefer to keep compartments with inventory, then stable order by zIndex.
    const sortedCompartments = [...compartments].sort((a, b) => {
      const aInv = hasInventory.get(a._id) ? 1 : 0
      const bInv = hasInventory.get(b._id) ? 1 : 0
      if (aInv !== bInv) return bInv - aInv
      return a.zIndex - b.zIndex
    })

    const preferredCellFor = (comp: Doc<'compartments'>) => {
      const relX = comp.x + nextDrawerWidth / 2
      const relY = comp.y + nextDrawerHeight / 2
      const c = Math.min(cols - 1, Math.max(0, Math.floor(relX / cellW)))
      const r = Math.min(rows - 1, Math.max(0, Math.floor(relY / cellH)))
      return { r, c }
    }

    const used = new Set<string>()
    const assignments = new Map<string, Doc<'compartments'>>() // cellId -> compartment
    const toDelete: Doc<'compartments'>[] = []

    for (const comp of sortedCompartments) {
      // If we're shrinking, we can only keep up to newCells compartments.
      if (assignments.size >= newCells) {
        toDelete.push(comp)
        continue
      }

      const pref = preferredCellFor(comp)
      let best: { id: string; dist: number } | null = null

      for (const cell of allCells) {
        if (used.has(cell.id)) continue
        const dist = Math.abs(cell.r - pref.r) + Math.abs(cell.c - pref.c)
        if (!best || dist < best.dist) {
          best = { id: cell.id, dist }
          if (dist === 0) break
        }
      }

      if (!best) {
        // Should only happen if newCells === 0 (blocked earlier) or logic error.
        toDelete.push(comp)
        continue
      }

      used.add(best.id)
      assignments.set(best.id, comp)
    }

    // Refuse deletion if anything to delete contains inventory.
    for (const comp of toDelete) {
      if (hasInventory.get(comp._id)) {
        throw new Error('Cannot reduce grid: some compartments to be removed contain inventory.')
      }
    }

    const now = Date.now()

    // Patch assigned compartments into their exact grid cells (preserves IDs/labels/inventory).
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = cellId(r, c)
        const comp = assignments.get(key)
        const x = -nextDrawerWidth / 2 + cellW / 2 + c * cellW
        const y = -nextDrawerHeight / 2 + cellH / 2 + r * cellH

        if (comp) {
          await ctx.db.patch(comp._id, {
            x,
            y,
            width: cellW,
            height: cellH,
            rotation: 0,
            zIndex: r * cols + c,
            updatedAt: now,
          })
        } else {
          await ctx.db.insert('compartments', {
            drawerId: args.drawerId,
            x,
            y,
            width: cellW,
            height: cellH,
            rotation: 0,
            zIndex: r * cols + c,
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }

    // Delete removed compartments (only happens when shrinking).
    for (const comp of toDelete) {
      await ctx.db.delete(comp._id)
    }

    await ctx.db.patch(args.drawerId, {
      width: nextDrawerWidth,
      height: nextDrawerHeight,
      rotation: 0,
      gridRows: rows,
      gridCols: cols,
      updatedAt: now,
    })
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
