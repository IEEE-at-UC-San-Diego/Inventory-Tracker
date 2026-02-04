import { v } from 'convex/values'
import { query } from '../_generated/server'
import { Doc, Id } from '../_generated/dataModel'
import { getCurrentUser } from '../auth_helpers'
import { getCurrentOrgId } from '../organization_helpers'
import { authContextSchema } from '../types/auth'

/**
 * List all inventory items for the current user's organization
 * Optionally includes part and compartment details
 */
export const list = query({
  args: {
    authContext: authContextSchema,
    includeDetails: v.optional(v.boolean()),
  },
  returns: v.array(
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
      compartment: v.optional(
        v.object({
          _id: v.id('compartments'),
          label: v.optional(v.string()),
          drawerId: v.id('drawers'),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    const inventoryItems = await ctx.db
      .query('inventory')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect()

    if (!args.includeDetails) {
      return inventoryItems
    }

    // Enrich with part and compartment details
    const enrichedItems = await Promise.all(
      inventoryItems.map(async (item) => {
        const [part, compartment] = await Promise.all([
          ctx.db.get(item.partId),
          ctx.db.get(item.compartmentId),
        ])

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
          compartment: compartment
            ? {
                _id: compartment._id,
                label: compartment.label,
                drawerId: compartment.drawerId,
              }
            : undefined,
        }
      })
    )

    return enrichedItems
  },
})

/**
 * Get inventory items in a specific compartment
 */
export const getByCompartment = query({
  args: {
    authContext: authContextSchema,
    compartmentId: v.id('compartments'),
  },
  returns: v.array(
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
          description: v.optional(v.string()),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      throw new Error('Unauthorized')
    }

    // Verify compartment exists
    const compartment = await ctx.db.get(args.compartmentId)
    if (!compartment) {
      return []
    }

    // Get drawer to verify org access
    const drawer = await ctx.db.get(compartment.drawerId)
    if (!drawer) {
      return []
    }

    const blueprint = await ctx.db.get(drawer.blueprintId)
    if (!blueprint || blueprint.orgId !== userContext.user.orgId) {
      throw new Error('Access denied to this compartment')
    }

    const inventoryItems = await ctx.db
      .query('inventory')
      .withIndex('by_compartmentId', (q) => q.eq('compartmentId', args.compartmentId))
      .collect()

    // Enrich with part details
    const enrichedItems = await Promise.all(
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
                description: part.description,
              }
            : undefined,
        }
      })
    )

    return enrichedItems
  },
})

/**
 * Get all inventory locations for a specific part
 * Returns inventory items showing where the part is stored
 */
export const getByPart = query({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
  },
  returns: v.array(
    v.object({
      _id: v.id('inventory'),
      _creationTime: v.number(),
      partId: v.id('parts'),
      compartmentId: v.id('compartments'),
      quantity: v.number(),
      orgId: v.id('organizations'),
      createdAt: v.number(),
      updatedAt: v.number(),
      compartment: v.optional(
        v.object({
          _id: v.id('compartments'),
          label: v.optional(v.string()),
          drawerId: v.id('drawers'),
        })
      ),
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
    })
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      throw new Error('Unauthorized')
    }

    // Verify part exists and belongs to org
    const part = await ctx.db.get(args.partId)
    if (!part || part.orgId !== userContext.user.orgId) {
      throw new Error('Part not found or access denied')
    }

    const inventoryItems = await ctx.db
      .query('inventory')
      .withIndex('by_partId', (q) => q.eq('partId', args.partId))
      .collect()

    // Enrich with location details
    const enrichedItems = await Promise.all(
      inventoryItems.map(async (item) => {
        const compartment = await ctx.db.get(item.compartmentId)
        let drawer = null
        let blueprint = null

        if (compartment) {
          drawer = await ctx.db.get(compartment.drawerId)
          if (drawer) {
            blueprint = await ctx.db.get(drawer.blueprintId)
          }
        }

        return {
          ...item,
          compartment: compartment
            ? {
                _id: compartment._id,
                label: compartment.label,
                drawerId: compartment.drawerId,
              }
            : undefined,
          drawer: drawer
            ? {
                _id: drawer._id,
                label: drawer.label,
                blueprintId: drawer.blueprintId,
              }
            : undefined,
          blueprint: blueprint
            ? {
                _id: blueprint._id,
                name: blueprint.name,
              }
            : undefined,
        }
      })
    )

    return enrichedItems
  },
})

/**
 * Get inventory items with quantity below a threshold
 * This query requires a threshold field on parts, which would need to be added to schema
 * For now, we'll return items with quantity <= 5 as low stock
 */
export const getLowStock = query({
  args: {
    authContext: authContextSchema,
    threshold: v.optional(v.number()),
  },
  returns: v.array(
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
  handler: async (ctx, args) => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)
    const threshold = args.threshold ?? 5

    // Get all inventory items for org
    const inventoryItems = await ctx.db
      .query('inventory')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect()

    // Filter for low stock
    const lowStockItems = inventoryItems.filter(
      (item) => item.quantity <= threshold && item.quantity > 0
    )

    // Enrich with part details
    const enrichedItems = await Promise.all(
      lowStockItems.map(async (item) => {
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

    return enrichedItems
  },
})

/**
 * Get parts with available quantity (> 0)
 */
export const getAvailable = query({
  args: {
    authContext: authContextSchema,
    partId: v.optional(v.id('parts')),
  },
  returns: v.array(
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
      compartment: v.optional(
        v.object({
          _id: v.id('compartments'),
          label: v.optional(v.string()),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      throw new Error('Unauthorized')
    }

    let inventoryItems: Doc<'inventory'>[]

    if (args.partId) {
      // Get inventory for specific part
      const part = await ctx.db.get(args.partId)
      if (!part || part.orgId !== userContext.user.orgId) {
        throw new Error('Part not found or access denied')
      }

      inventoryItems = await ctx.db
        .query('inventory')
        .withIndex('by_partId', (q) => q.eq('partId', args.partId!))
        .collect()
    } else {
      // Get all org inventory
      inventoryItems = await ctx.db
        .query('inventory')
        .withIndex('by_orgId', (q) => q.eq('orgId', userContext.user.orgId))
        .collect()
    }

    // Filter for available items only
    const availableItems = inventoryItems.filter((item) => item.quantity > 0)

    // Enrich with details
    const enrichedItems = await Promise.all(
      availableItems.map(async (item) => {
        const [part, compartment] = await Promise.all([
          ctx.db.get(item.partId),
          ctx.db.get(item.compartmentId),
        ])

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
          compartment: compartment
            ? {
                _id: compartment._id,
                label: compartment.label,
              }
            : undefined,
        }
      })
    )

    return enrichedItems
  },
})
