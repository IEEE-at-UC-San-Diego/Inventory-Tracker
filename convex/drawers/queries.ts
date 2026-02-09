import { v } from 'convex/values'
import { query } from '../_generated/server'
import { getCurrentUser } from '../auth_helpers'
import { authContextSchema } from '../types/auth'

/**
 * Get all drawers for a blueprint
 * Includes compartments if requested
 */
export const listByBlueprint = query({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
    includeCompartments: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      _id: v.id('drawers'),
      _creationTime: v.number(),
      blueprintId: v.id('blueprints'),
      x: v.number(),
      y: v.number(),
      width: v.number(),
      height: v.number(),
      rotation: v.number(),
      zIndex: v.number(),
      gridRows: v.optional(v.number()),
      gridCols: v.optional(v.number()),
      label: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
      backgroundImages: v.optional(
        v.array(
          v.object({
            _id: v.id('drawerBackgroundImages'),
            _creationTime: v.number(),
            drawerId: v.id('drawers'),
            storageId: v.id('_storage'),
            x: v.number(),
            y: v.number(),
            width: v.number(),
            height: v.number(),
            zIndex: v.number(),
            locked: v.boolean(),
            snapToGrid: v.boolean(),
            createdAt: v.number(),
            updatedAt: v.number(),
          })
        )
      ),
      compartments: v.optional(
        v.array(
          v.object({
            _id: v.id('compartments'),
            _creationTime: v.number(),
            drawerId: v.id('drawers'),
            x: v.number(),
            y: v.number(),
            width: v.number(),
            height: v.number(),
            rotation: v.number(),
            zIndex: v.number(),
            label: v.optional(v.string()),
            createdAt: v.number(),
            updatedAt: v.number(),
          })
        )
      ),
    })
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      throw new Error('Unauthorized')
    }

    // Verify blueprint exists
    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint) {
      throw new Error('Blueprint not found')
    }

    // Get all drawers for this blueprint, ordered by zIndex
    const drawers = await ctx.db
      .query('drawers')
      .withIndex('by_blueprintId_and_zIndex', (q) =>
        q.eq('blueprintId', args.blueprintId)
      )
      .collect()

    if (!args.includeCompartments) {
      return drawers
    }

    // Include compartments for each drawer
    const drawersWithCompartments = await Promise.all(
      drawers.map(async (drawer) => {
        const compartments = await ctx.db
          .query('compartments')
          .withIndex('by_drawerId_and_zIndex', (q) => q.eq('drawerId', drawer._id))
          .collect()
        const backgroundImages = await ctx.db
          .query('drawerBackgroundImages')
          .withIndex('by_drawerId_and_zIndex', (q) => q.eq('drawerId', drawer._id))
          .collect()

        return {
          ...drawer,
          backgroundImages,
          compartments,
        }
      })
    )

    return drawersWithCompartments
  },
})

/**
 * Get a single drawer with its compartments
 */
export const get = query({
  args: {
    authContext: authContextSchema,
    drawerId: v.id('drawers'),
  },
  returns: v.union(
    v.object({
      _id: v.id('drawers'),
      _creationTime: v.number(),
      blueprintId: v.id('blueprints'),
      x: v.number(),
      y: v.number(),
      width: v.number(),
      height: v.number(),
      rotation: v.number(),
      zIndex: v.number(),
      gridRows: v.optional(v.number()),
      gridCols: v.optional(v.number()),
      label: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
      backgroundImages: v.array(
        v.object({
          _id: v.id('drawerBackgroundImages'),
          _creationTime: v.number(),
          drawerId: v.id('drawers'),
          storageId: v.id('_storage'),
          x: v.number(),
          y: v.number(),
          width: v.number(),
          height: v.number(),
          zIndex: v.number(),
          locked: v.boolean(),
          snapToGrid: v.boolean(),
          createdAt: v.number(),
          updatedAt: v.number(),
        })
      ),
      compartments: v.array(
        v.object({
          _id: v.id('compartments'),
          _creationTime: v.number(),
          drawerId: v.id('drawers'),
          x: v.number(),
          y: v.number(),
          width: v.number(),
          height: v.number(),
          rotation: v.number(),
          zIndex: v.number(),
          label: v.optional(v.string()),
          createdAt: v.number(),
          updatedAt: v.number(),
        })
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      return null
    }

    const drawer = await ctx.db.get(args.drawerId)
    if (!drawer) {
      return null
    }

    // Verify blueprint exists
    const blueprint = await ctx.db.get(drawer.blueprintId)
    if (!blueprint) {
      return null
    }

    // Get compartments for this drawer
    const compartments = await ctx.db
      .query('compartments')
      .withIndex('by_drawerId_and_zIndex', (q) => q.eq('drawerId', args.drawerId))
      .collect()
    const backgroundImages = await ctx.db
      .query('drawerBackgroundImages')
      .withIndex('by_drawerId_and_zIndex', (q) => q.eq('drawerId', args.drawerId))
      .collect()

    return {
      ...drawer,
      backgroundImages,
      compartments,
    }
  },
})
