import { v } from 'convex/values'
import { query } from '../_generated/server'
import { Doc } from '../_generated/dataModel'
import { getCurrentUser } from '../auth_helpers'
import { getCurrentOrgId } from '../organization_helpers'
import { authContextSchema } from '../types/auth'

/**
 * Get all parts for the current user's organization
 * Optionally filter by archived status
 */
export const list = query({
  args: {
    authContext: authContextSchema,
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      _id: v.id('parts'),
      _creationTime: v.number(),
      name: v.string(),
      sku: v.string(),
      category: v.string(),
      description: v.optional(v.string()),
      imageId: v.optional(v.id('_storage')),
      archived: v.boolean(),
      orgId: v.id('organizations'),
      unit: v.string(),
      tags: v.array(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    let parts: Doc<'parts'>[]

    if (args.includeArchived === true) {
      // Return all parts including archived
      parts = await ctx.db
        .query('parts')
        .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
        .collect()
    } else {
      // Default: only return non-archived parts
      parts = await ctx.db
        .query('parts')
        .withIndex('by_orgId_and_archived', (q) =>
          q.eq('orgId', orgId).eq('archived', false)
        )
        .collect()
    }

    return parts
  },
})

/**
 * Get a single part by ID
 * Verifies the user has access to the part's organization
 */
export const get = query({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
  },
  returns: v.union(
    v.object({
      _id: v.id('parts'),
      _creationTime: v.number(),
      name: v.string(),
      sku: v.string(),
      category: v.string(),
      description: v.optional(v.string()),
      imageId: v.optional(v.id('_storage')),
      archived: v.boolean(),
      orgId: v.id('organizations'),
      unit: v.string(),
      tags: v.array(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      return null
    }

    const part = await ctx.db.get(args.partId)
    if (!part || part.orgId !== userContext.user.orgId) {
      return null
    }

    return part
  },
})

/**
 * Search parts by name, SKU, or category with pagination
 */
export const search = query({
  args: {
    authContext: authContextSchema,
    query: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    items: v.array(
      v.object({
        _id: v.id('parts'),
        _creationTime: v.number(),
        name: v.string(),
        sku: v.string(),
        category: v.string(),
        description: v.optional(v.string()),
        imageId: v.optional(v.id('_storage')),
        archived: v.boolean(),
        orgId: v.id('organizations'),
        unit: v.string(),
        tags: v.array(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
      })
    ),
    nextCursor: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)
    const limit = args.limit ?? 20
    const searchQuery = args.query.toLowerCase().trim()

    // Get all parts for the org (filtered client-side for complex search)
    // For production, consider using a search index or full-text search service
    const allParts = await ctx.db
      .query('parts')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect()

    const filteredParts = allParts.filter((part) => {
      const matchesName = part.name.toLowerCase().includes(searchQuery)
      const matchesSku = part.sku.toLowerCase().includes(searchQuery)
      const matchesCategory = part.category.toLowerCase().includes(searchQuery)
      return matchesName || matchesSku || matchesCategory
    })

    // Simple pagination based on array index
    const startIndex = args.cursor ? parseInt(args.cursor, 10) : 0
    const items = filteredParts.slice(startIndex, startIndex + limit)
    const nextCursor =
      startIndex + limit < filteredParts.length
        ? String(startIndex + limit)
        : undefined

    return { items, nextCursor }
  },
})

/**
 * Get parts filtered by category
 */
export const getByCategory = query({
  args: {
    authContext: authContextSchema,
    category: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id('parts'),
      _creationTime: v.number(),
      name: v.string(),
      sku: v.string(),
      category: v.string(),
      description: v.optional(v.string()),
      imageId: v.optional(v.id('_storage')),
      archived: v.boolean(),
      orgId: v.id('organizations'),
      unit: v.string(),
      tags: v.array(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    const parts = await ctx.db
      .query('parts')
      .withIndex('by_orgId_and_category', (q) =>
        q.eq('orgId', orgId).eq('category', args.category)
      )
      .collect()

    return parts
  },
})

/**
 * Get part with all its storage locations and quantities
 * Returns the part with an array of inventory items showing where it's stored
 */
export const getWithInventory = query({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
  },
  returns: v.union(
    v.object({
      part: v.object({
        _id: v.id('parts'),
        _creationTime: v.number(),
        name: v.string(),
        sku: v.string(),
        category: v.string(),
        description: v.optional(v.string()),
        imageId: v.optional(v.id('_storage')),
        archived: v.boolean(),
        orgId: v.id('organizations'),
        unit: v.string(),
        tags: v.array(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
      }),
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
      totalQuantity: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      return null
    }

    const part = await ctx.db.get(args.partId)
    if (!part || part.orgId !== userContext.user.orgId) {
      return null
    }

    // Get inventory items for this part
    const inventoryItems = await ctx.db
      .query('inventory')
      .withIndex('by_partId', (q) => q.eq('partId', args.partId))
      .collect()

    // Enrich inventory items with compartment, drawer, and blueprint info
    const enrichedInventory = await Promise.all(
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

    const totalQuantity = inventoryItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    )

    return {
      part,
      inventory: enrichedInventory,
      totalQuantity,
    }
  },
})
