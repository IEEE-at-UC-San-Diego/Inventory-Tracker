import { query } from '../_generated/server'
import { getCurrentUser as getCurrentUserHelper } from '../auth_helpers'
import { authContextSchema } from '../types/auth'
import { v } from 'convex/values'

/**
 * Get the current authenticated user with their organization info
 * Returns null if not authenticated
 */
export const getCurrentUser = query({
  args: {
    authContext: authContextSchema,
  },
  returns: v.union(
    v.object({
      _id: v.id('users'),
      _creationTime: v.number(),
      logtoUserId: v.string(),
      name: v.string(),
      email: v.string(),
      orgId: v.union(v.id('organizations'), v.string()),
      role: v.union(
        v.literal('Administrator'),
        v.literal('Executive Officers'),
        v.literal('General Officers'),
        v.literal('Member'),
        // Legacy roles for migration
        v.literal('Admin'),
        v.literal('Editor'),
        v.literal('Viewer')
      ),
      createdAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUserHelper(ctx, args.authContext)
    if (!userContext) {
      return null
    }

    const user = userContext.user
    return {
      _id: user._id,
      _creationTime: user._creationTime,
      logtoUserId: user.logtoUserId,
      name: user.name,
      email: user.email,
      orgId: user.orgId,
      role: user.role,
      createdAt: user.createdAt,
    }
  },
})
