import { v } from 'convex/values'
import { query } from '../_generated/server'
import { getCurrentUser } from '../auth_helpers'
import { authContextSchema } from '../types/auth'

/**
 * List all revisions for a blueprint
 * Returns revisions in descending order (newest first)
 */
export const listRevisions = query({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
  },
  returns: v.array(
    v.object({
      _id: v.id('blueprintRevisions'),
      _creationTime: v.number(),
      blueprintId: v.id('blueprints'),
      version: v.number(),
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
      createdBy: v.id('users'),
      createdAt: v.number(),
      orgId: v.id('organizations'),
      createdByUser: v.object({
        _id: v.id('users'),
        name: v.string(),
        email: v.string(),
      }),
    })
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      return []
    }

    // Verify blueprint belongs to user's org
    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint || blueprint.orgId !== userContext.user.orgId) {
      return []
    }

    // Get all revisions for this blueprint
    const revisions = await ctx.db
      .query('blueprintRevisions')
      .withIndex('by_blueprintId', (q) => q.eq('blueprintId', args.blueprintId))
      .collect()

    // Enrich with user info and sort by version descending
    const enrichedRevisions = await Promise.all(
      revisions.map(async (revision) => {
        const user = await ctx.db.get(revision.createdBy)
        return {
          ...revision,
          createdByUser: user
            ? {
                _id: user._id,
                name: user.name,
                email: user.email,
              }
            : {
                _id: revision.createdBy,
                name: 'Unknown User',
                email: '',
              },
        }
      })
    )

    // Sort by version descending (newest first)
    return enrichedRevisions.sort((a, b) => b.version - a.version)
  },
})

/**
 * Get a specific revision by ID
 */
export const getRevisionById = query({
  args: {
    authContext: authContextSchema,
    revisionId: v.id('blueprintRevisions'),
  },
  returns: v.union(
    v.object({
      _id: v.id('blueprintRevisions'),
      _creationTime: v.number(),
      blueprintId: v.id('blueprints'),
      version: v.number(),
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
      createdBy: v.id('users'),
      createdAt: v.number(),
      orgId: v.id('organizations'),
      createdByUser: v.object({
        _id: v.id('users'),
        name: v.string(),
        email: v.string(),
      }),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      return null
    }

    const revision = await ctx.db.get(args.revisionId)
    if (!revision || revision.orgId !== userContext.user.orgId) {
      return null
    }

    const user = await ctx.db.get(revision.createdBy)

    return {
      ...revision,
      createdByUser: user
        ? {
            _id: user._id,
            name: user.name,
            email: user.email,
          }
        : {
            _id: revision.createdBy,
            name: 'Unknown User',
            email: '',
          },
    }
  },
})

/**
 * Get the latest revision for a blueprint
 */
export const getLatestRevision = query({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
  },
  returns: v.union(
    v.object({
      _id: v.id('blueprintRevisions'),
      _creationTime: v.number(),
      blueprintId: v.id('blueprints'),
      version: v.number(),
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
      createdBy: v.id('users'),
      createdAt: v.number(),
      orgId: v.id('organizations'),
      createdByUser: v.object({
        _id: v.id('users'),
        name: v.string(),
        email: v.string(),
      }),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      return null
    }

    // Verify blueprint belongs to user's org
    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint || blueprint.orgId !== userContext.user.orgId) {
      return null
    }

    // Get all revisions for this blueprint
    const revisions = await ctx.db
      .query('blueprintRevisions')
      .withIndex('by_blueprintId', (q) => q.eq('blueprintId', args.blueprintId))
      .collect()

    if (revisions.length === 0) {
      return null
    }

    // Find the revision with the highest version number
    const latestRevision = revisions.reduce((latest, rev) =>
      rev.version > latest.version ? rev : latest
    )

    // Get user info
    const user = await ctx.db.get(latestRevision.createdBy)

    return {
      ...latestRevision,
      createdByUser: user
        ? {
            _id: user._id,
            name: user.name,
            email: user.email,
          }
        : {
            _id: latestRevision.createdBy,
            name: 'Unknown User',
            email: '',
          },
    }
  },
})

/**
 * Get revision count for a blueprint
 */
export const getRevisionCount = query({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
  },
  returns: v.object({
    count: v.number(),
    maxRevisions: v.number(),
    isNearLimit: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      return { count: 0, maxRevisions: 50, isNearLimit: false }
    }

    // Verify blueprint belongs to user's org
    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint || blueprint.orgId !== userContext.user.orgId) {
      return { count: 0, maxRevisions: 50, isNearLimit: false }
    }

    // Count revisions
    const revisions = await ctx.db
      .query('blueprintRevisions')
      .withIndex('by_blueprintId', (q) => q.eq('blueprintId', args.blueprintId))
      .collect()

    const count = revisions.length
    const MAX_REVISIONS = 50

    return {
      count,
      maxRevisions: MAX_REVISIONS,
      isNearLimit: count >= MAX_REVISIONS - 5,
    }
  },
})

/**
 * Preview a revision state without restoring
 * Useful for comparing revisions before rolling back
 */
export const previewRevision = query({
  args: {
    authContext: authContextSchema,
    revisionId: v.id('blueprintRevisions'),
  },
  returns: v.union(
    v.object({
      revisionId: v.id('blueprintRevisions'),
      version: v.number(),
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
      createdAt: v.number(),
      createdByUserName: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      return null
    }

    const revision = await ctx.db.get(args.revisionId)
    if (!revision || revision.orgId !== userContext.user.orgId) {
      return null
    }

    const user = await ctx.db.get(revision.createdBy)

    return {
      revisionId: revision._id,
      version: revision.version,
      state: revision.state,
      description: revision.description,
      createdAt: revision.createdAt,
      createdByUserName: user?.name || 'Unknown User',
    }
  },
})
