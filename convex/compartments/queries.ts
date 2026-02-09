import { v } from 'convex/values'
import { query } from '../_generated/server'
import { Doc, Id } from '../_generated/dataModel'
import { getCurrentUser } from '../auth_helpers'
import { authContextSchema } from '../types/auth'

/**
 * Get all compartments in a drawer
 */
export const listByDrawer = query({
  args: {
    authContext: authContextSchema,
    drawerId: v.id('drawers'),
  },
  returns: v.array(
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
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      throw new Error('Unauthorized')
    }

    // Verify drawer exists and belongs to user's org
    const drawer = await ctx.db.get(args.drawerId)
    if (!drawer) {
      return []
    }

    const blueprint = await ctx.db.get(drawer.blueprintId)
    if (!blueprint) {
      throw new Error('Blueprint not found')
    }

    const compartments = await ctx.db
      .query('compartments')
      .withIndex('by_drawerId_and_zIndex', (q) => q.eq('drawerId', args.drawerId))
      .collect()

    return compartments
  },
})

/**
 * Get all compartments across an entire blueprint
 * Useful for showing inventory locations
 */
export const listByBlueprint = query({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
    includeInventory: v.optional(v.boolean()),
  },
  returns: v.array(
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
      drawer: v.optional(
        v.object({
          _id: v.id('drawers'),
          label: v.optional(v.string()),
        })
      ),
      inventory: v.optional(
        v.array(
          v.object({
            _id: v.id('inventory'),
            partId: v.id('parts'),
            quantity: v.number(),
            part: v.optional(
              v.object({
                _id: v.id('parts'),
                name: v.string(),
                sku: v.string(),
              })
            ),
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

    // Get all drawers for this blueprint
    const drawers = await ctx.db
      .query('drawers')
      .withIndex('by_blueprintId', (q) => q.eq('blueprintId', args.blueprintId))
      .collect()

    // Get all compartments for all drawers
    const allCompartments: (Doc<'compartments'> & {
      drawer?: { _id: Id<'drawers'>; label?: string }
      inventory?: Array<{
        _id: Id<'inventory'>
        partId: Id<'parts'>
        quantity: number
        part?: { _id: Id<'parts'>; name: string; sku: string }
      }>
    })[] = []

    for (const drawer of drawers) {
      const compartments = await ctx.db
        .query('compartments')
        .withIndex('by_drawerId', (q) => q.eq('drawerId', drawer._id))
        .collect()

      for (const compartment of compartments) {
        const compartmentData: typeof compartment & {
          drawer?: { _id: Id<'drawers'>; label?: string }
          inventory?: Array<{
            _id: Id<'inventory'>
            partId: Id<'parts'>
            quantity: number
            part?: { _id: Id<'parts'>; name: string; sku: string }
          }>
        } = {
          ...compartment,
          drawer: {
            _id: drawer._id,
            label: drawer.label,
          },
        }

        if (args.includeInventory) {
          const inventoryItems = await ctx.db
            .query('inventory')
            .withIndex('by_compartmentId', (q) =>
              q.eq('compartmentId', compartment._id)
            )
            .collect()

          compartmentData.inventory = await Promise.all(
            inventoryItems.map(async (item) => {
              const part = await ctx.db.get(item.partId)
              return {
                _id: item._id,
                partId: item.partId,
                quantity: item.quantity,
                part: part
                  ? {
                      _id: part._id,
                      name: part.name,
                      sku: part.sku,
                    }
                  : undefined,
              }
            })
          )
        }

        allCompartments.push(compartmentData)
      }
    }

    return allCompartments
  },
})

/**
 * Get a single compartment with its inventory
 */
export const get = query({
  args: {
    authContext: authContextSchema,
    compartmentId: v.id('compartments'),
  },
  returns: v.union(
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
      drawer: v.optional(
        v.object({
          _id: v.id('drawers'),
          label: v.optional(v.string()),
          blueprintId: v.id('blueprints'),
        })
      ),
      blueprint: v.optional(
        v.object({
          _id: v.id('blueprints'),
          name: v.string(),
        })
      ),
      inventory: v.array(
        v.object({
          _id: v.id('inventory'),
          _creationTime: v.number(),
          partId: v.id('parts'),
          compartmentId: v.id('compartments'),
          quantity: v.number(),
          orgId: v.id('organizations'),
          createdAt: v.number(),
          updatedAt: v.number(),
          part: v.optional(
            v.object({
              _id: v.id('parts'),
              name: v.string(),
              sku: v.string(),
              category: v.string(),
            })
          ),
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

    const compartment = await ctx.db.get(args.compartmentId)
    if (!compartment) {
      return null
    }

    // Verify drawer belongs to user's org
    const drawer = await ctx.db.get(compartment.drawerId)
    if (!drawer) {
      return null
    }

    const blueprint = await ctx.db.get(drawer.blueprintId)
    if (!blueprint) {
      return null
    }

    // Get inventory for this compartment
    const inventoryItems = await ctx.db
      .query('inventory')
      .withIndex('by_compartmentId', (q) => q.eq('compartmentId', args.compartmentId))
      .collect()

    // Enrich with part details
    const enrichedInventory = await Promise.all(
      inventoryItems.map(async (item) => {
        const part = await ctx.db.get(item.partId)
        return {
          ...item,
          part: part
            ? {
                _id: part._id,
                name: part.name,
                sku: part.sku,
                category: part.category,
              }
            : undefined,
        }
      })
    )

    return {
      ...compartment,
      drawer: {
        _id: drawer._id,
        label: drawer.label,
        blueprintId: drawer.blueprintId,
      },
      blueprint: {
        _id: blueprint._id,
        name: blueprint.name,
      },
      inventory: enrichedInventory,
    }
  },
})

/**
 * Find compartments containing a specific part
 * Returns compartments with inventory quantity for the part
 */
export const findByPart = query({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
  },
  returns: v.array(
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
      quantity: v.number(),
      drawer: v.optional(
        v.object({
          _id: v.id('drawers'),
          label: v.optional(v.string()),
        })
      ),
      blueprint: v.optional(
        v.object({
          _id: v.id('blueprints'),
          name: v.string(),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      throw new Error('Unauthorized')
    }

    // Verify part exists
    const part = await ctx.db.get(args.partId)
    if (!part) {
      throw new Error('Part not found')
    }

    // Get inventory items for this part
    const inventoryItems = await ctx.db
      .query('inventory')
      .withIndex('by_partId', (q) => q.eq('partId', args.partId))
      .collect()

    // Get compartment details for each inventory item
    const compartmentsWithDetails = await Promise.all(
      inventoryItems
        .filter((item) => item.quantity > 0)
        .map(async (item) => {
          const compartment = await ctx.db.get(item.compartmentId)
          if (!compartment) return null

          const drawer = await ctx.db.get(compartment.drawerId)
          if (!drawer) return null

          const blueprint = await ctx.db.get(drawer.blueprintId)
          if (!blueprint) return null

          return {
            ...compartment,
            quantity: item.quantity,
            drawer: {
              _id: drawer._id,
              label: drawer.label,
            },
            blueprint: {
              _id: blueprint._id,
              name: blueprint.name,
            },
          }
        })
    )

    return compartmentsWithDetails.filter(Boolean) as NonNullable<
      (typeof compartmentsWithDetails)[number]
    >[]
  },
})
