import { v } from 'convex/values'
import { mutation } from '../_generated/server'
import { Id } from '../_generated/dataModel'
import { requireOrgRole } from '../auth_helpers'
import { getCurrentOrgId } from '../organization_helpers'
import { verifyBlueprintLock } from '../blueprints/mutations'
import { authContextSchema } from '../types/auth'

/**
 * Create a new cosmetic divider line on a blueprint
 * Requires General Officers role and active lock on the blueprint
 */
export const create = mutation({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
    x1: v.number(),
    y1: v.number(),
    x2: v.number(),
    y2: v.number(),
    thickness: v.optional(v.number()),
  },
  returns: v.id('dividers'),
  handler: async (ctx, args): Promise<Id<'dividers'>> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)
    const userContext = await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')
    await verifyBlueprintLock(ctx, args.blueprintId, userContext.user._id, orgId)

    const now = Date.now()

    const dividerId = await ctx.db.insert('dividers', {
      blueprintId: args.blueprintId,
      x1: args.x1,
      y1: args.y1,
      x2: args.x2,
      y2: args.y2,
      thickness: args.thickness ?? 4,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(args.blueprintId, { updatedAt: now })

    return dividerId
  },
})

/**
 * Update a divider's position or thickness
 * Requires General Officers role and active lock on the blueprint
 */
export const update = mutation({
  args: {
    authContext: authContextSchema,
    dividerId: v.id('dividers'),
    x1: v.optional(v.number()),
    y1: v.optional(v.number()),
    x2: v.optional(v.number()),
    y2: v.optional(v.number()),
    thickness: v.optional(v.number()),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)
    const userContext = await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    const divider = await ctx.db.get(args.dividerId)
    if (!divider) return true

    await verifyBlueprintLock(ctx, divider.blueprintId, userContext.user._id, orgId)

    const now = Date.now()
    const updates: Record<string, number> = { updatedAt: now }

    if (args.x1 !== undefined) updates.x1 = args.x1
    if (args.y1 !== undefined) updates.y1 = args.y1
    if (args.x2 !== undefined) updates.x2 = args.x2
    if (args.y2 !== undefined) updates.y2 = args.y2
    if (args.thickness !== undefined) updates.thickness = args.thickness

    await ctx.db.patch(args.dividerId, updates)
    await ctx.db.patch(divider.blueprintId, { updatedAt: now })

    return true
  },
})

/**
 * Delete a divider
 * Requires General Officers role and active lock on the blueprint
 */
export const deleteDivider = mutation({
  args: {
    authContext: authContextSchema,
    dividerId: v.id('dividers'),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)
    const userContext = await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    const divider = await ctx.db.get(args.dividerId)
    if (!divider) {
      throw new Error('Divider not found')
    }

    await verifyBlueprintLock(ctx, divider.blueprintId, userContext.user._id, orgId)

    const now = Date.now()
    await ctx.db.delete(args.dividerId)
    await ctx.db.patch(divider.blueprintId, { updatedAt: now })

    return true
  },
})
