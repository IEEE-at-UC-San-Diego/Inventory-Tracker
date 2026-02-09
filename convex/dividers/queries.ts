import { v } from 'convex/values'
import { query } from '../_generated/server'
import { getCurrentUser } from '../auth_helpers'
import { authContextSchema } from '../types/auth'

/**
 * Get all dividers for a blueprint
 */
export const listByBlueprint = query({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
  },
  returns: v.array(
    v.object({
      _id: v.id('dividers'),
      _creationTime: v.number(),
      blueprintId: v.id('blueprints'),
      x1: v.number(),
      y1: v.number(),
      x2: v.number(),
      y2: v.number(),
      thickness: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    await getCurrentUser(ctx, args.authContext)

    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint) {
      throw new Error('Blueprint not found')
    }

    const dividers = await ctx.db
      .query('dividers')
      .withIndex('by_blueprintId', (q) => q.eq('blueprintId', args.blueprintId))
      .collect()

    return dividers
  },
})
