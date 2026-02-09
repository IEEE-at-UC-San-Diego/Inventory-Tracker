import { v } from 'convex/values'
import { mutation } from '../_generated/server'
import { requirePermission } from '../permissions'
import { authContextSchema } from '../types/auth'

/**
 * Mutation to update organization name
 * Only Admins can update organization settings
 */
export const update = mutation({
  args: {
    authContext: authContextSchema,
    orgId: v.id('organizations'),
    name: v.string(),
  },
  returns: v.object({
    _id: v.id('organizations'),
    _creationTime: v.number(),
    name: v.string(),
    slug: v.string(),
    createdAt: v.number(),
  }),
  handler: async (ctx, args) => {
    await requirePermission(ctx, args.authContext, 'organizations:update')

    // Get the current organization
    const org = await ctx.db.get('organizations', args.orgId)
    if (!org) {
      throw new Error('Organization not found')
    }

    // Update organization name
    await ctx.db.patch(args.orgId, {
      name: args.name,
    })

    // Return updated organization
    const updated = await ctx.db.get('organizations', args.orgId)
    if (!updated) {
      throw new Error('Failed to update organization')
    }

    return updated
  },
})
