import { v } from 'convex/values'
import { mutation } from '../_generated/server'
import { Doc, Id } from '../_generated/dataModel'
import { requireOrgRole } from '../auth_helpers'
import { getCurrentOrgId } from '../organization_helpers'
import { verifyBlueprintLock } from '../blueprints/mutations'
import { authContextSchema } from '../types/auth'

const GRID_SIZE = 50

const snap = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE

export const create = mutation({
  args: {
    authContext: authContextSchema,
    drawerId: v.id('drawers'),
    storageId: v.id('_storage'),
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
    locked: v.optional(v.boolean()),
    snapToGrid: v.optional(v.boolean()),
  },
  returns: v.id('drawerBackgroundImages'),
  handler: async (ctx, args) => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)
    const userContext = await requireOrgRole(
      ctx,
      args.authContext,
      orgId,
      'Executive Officers'
    )

    const drawer = await ctx.db.get(args.drawerId)
    if (!drawer) throw new Error('Drawer not found')

    await verifyBlueprintLock(ctx, drawer.blueprintId, userContext.user._id, orgId)

    const current = await ctx.db
      .query('drawerBackgroundImages')
      .withIndex('by_drawerId', (q) => q.eq('drawerId', args.drawerId))
      .collect()

    const maxZ = current.reduce((m, i) => Math.max(m, i.zIndex), -1)
    const now = Date.now()
    const snapToGrid = args.snapToGrid ?? false
    const width = Math.max(GRID_SIZE, snapToGrid ? snap(args.width) : args.width)
    const height = Math.max(GRID_SIZE, snapToGrid ? snap(args.height) : args.height)

    const imageId = await ctx.db.insert('drawerBackgroundImages', {
      drawerId: args.drawerId,
      storageId: args.storageId,
      x: snapToGrid ? snap(args.x) : args.x,
      y: snapToGrid ? snap(args.y) : args.y,
      width,
      height,
      zIndex: maxZ + 1,
      locked: args.locked ?? false,
      snapToGrid,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(drawer.blueprintId, { updatedAt: now })
    await ctx.db.patch(args.drawerId, { updatedAt: now })
    return imageId
  },
})

export const update = mutation({
  args: {
    authContext: authContextSchema,
    imageId: v.id('drawerBackgroundImages'),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    zIndex: v.optional(v.number()),
    locked: v.optional(v.boolean()),
    snapToGrid: v.optional(v.boolean()),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)
    const userContext = await requireOrgRole(
      ctx,
      args.authContext,
      orgId,
      'Executive Officers'
    )

    const image = await ctx.db.get(args.imageId)
    if (!image) throw new Error('Drawer background image not found')
    const drawer = await ctx.db.get(image.drawerId)
    if (!drawer) throw new Error('Drawer not found')

    await verifyBlueprintLock(ctx, drawer.blueprintId, userContext.user._id, orgId)

    const nextSnap = args.snapToGrid ?? image.snapToGrid
    const updates: Partial<Doc<'drawerBackgroundImages'>> = {
      updatedAt: Date.now(),
    }
    if (args.locked !== undefined) updates.locked = args.locked
    if (args.snapToGrid !== undefined) updates.snapToGrid = args.snapToGrid
    if (args.zIndex !== undefined) updates.zIndex = args.zIndex
    if (args.x !== undefined) updates.x = nextSnap ? snap(args.x) : args.x
    if (args.y !== undefined) updates.y = nextSnap ? snap(args.y) : args.y
    if (args.width !== undefined) {
      const w = Math.max(GRID_SIZE, args.width)
      updates.width = nextSnap ? snap(w) : w
    }
    if (args.height !== undefined) {
      const h = Math.max(GRID_SIZE, args.height)
      updates.height = nextSnap ? snap(h) : h
    }

    await ctx.db.patch(args.imageId, updates)
    await ctx.db.patch(drawer.blueprintId, { updatedAt: Date.now() })
    await ctx.db.patch(drawer._id, { updatedAt: Date.now() })
    return true
  },
})

export const deleteImage = mutation({
  args: {
    authContext: authContextSchema,
    imageId: v.id('drawerBackgroundImages'),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)
    const userContext = await requireOrgRole(
      ctx,
      args.authContext,
      orgId,
      'Executive Officers'
    )

    const image = await ctx.db.get(args.imageId)
    if (!image) throw new Error('Drawer background image not found')
    const drawer = await ctx.db.get(image.drawerId)
    if (!drawer) throw new Error('Drawer not found')
    await verifyBlueprintLock(ctx, drawer.blueprintId, userContext.user._id, orgId)

    try {
      await ctx.storage.delete(image.storageId)
    } catch {
      // Ignore stale storage references.
    }

    await ctx.db.delete(args.imageId)
    await ctx.db.patch(drawer.blueprintId, { updatedAt: Date.now() })
    await ctx.db.patch(drawer._id, { updatedAt: Date.now() })
    return true
  },
})
