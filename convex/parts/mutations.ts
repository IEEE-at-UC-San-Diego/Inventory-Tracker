import { v } from 'convex/values'
import { mutation } from '../_generated/server'
import { Doc, Id } from '../_generated/dataModel'
import { requireOrgRole } from '../auth_helpers'
import { getCurrentOrgId } from '../organization_helpers'
import { authContextSchema } from '../types/auth'

/**
 * Create a new part
 * Requires General Officers role or higher
 * Validates unique SKU within organization
 */
export const create = mutation({
  args: {
    authContext: authContextSchema,
    name: v.string(),
    sku: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
    imageId: v.optional(v.id('_storage')),
    unit: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.id('parts'),
  handler: async (ctx, args): Promise<Id<'parts'>> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require General Officers or higher role
    await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    const trimmedSku = args.sku.trim()
    if (!trimmedSku) {
      throw new Error('SKU is required')
    }

    // Check for duplicate SKU in this organization
    const existingPart = await ctx.db
      .query('parts')
      .withIndex('by_orgId_and_sku', (q) =>
        q.eq('orgId', orgId).eq('sku', trimmedSku)
      )
      .unique()

    if (existingPart) {
      throw new Error(
        `Part with SKU "${trimmedSku}" already exists in this organization`
      )
    }

    const now = Date.now()

    const partId = await ctx.db.insert('parts', {
      name: args.name,
      sku: trimmedSku,
      category: args.category,
      description: args.description,
      imageId: args.imageId,
      archived: false,
      orgId,
      unit: args.unit,
      tags: args.tags ?? [],
      createdAt: now,
      updatedAt: now,
    })

    return partId
  },
})

/**
 * Update part details
 * Requires General Officers role or higher
 */
export const update = mutation({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
    name: v.optional(v.string()),
    sku: v.optional(v.string()),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    imageId: v.optional(v.id('_storage')),
    unit: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require General Officers or higher role
    await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    const part = await ctx.db.get(args.partId)
    if (!part || part.orgId !== orgId) {
      throw new Error('Part not found or access denied')
    }

    // If updating SKU, check for uniqueness
    if (args.sku !== undefined && args.sku !== part.sku) {
      const trimmedSku = args.sku.trim()
      if (!trimmedSku) {
        throw new Error('SKU cannot be empty')
      }

      const existingPart = await ctx.db
        .query('parts')
        .withIndex('by_orgId_and_sku', (q) =>
          q.eq('orgId', orgId).eq('sku', trimmedSku)
        )
        .unique()

      if (existingPart && existingPart._id !== args.partId) {
        throw new Error(
          `Part with SKU "${trimmedSku}" already exists in this organization`
        )
      }
    }

    const updates: Partial<Doc<'parts'>> = {
      updatedAt: Date.now(),
    }

    if (args.name !== undefined) updates.name = args.name
    if (args.sku !== undefined) updates.sku = args.sku.trim()
    if (args.category !== undefined) updates.category = args.category
    if (args.description !== undefined) updates.description = args.description
    if (args.imageId !== undefined) updates.imageId = args.imageId
    if (args.unit !== undefined) updates.unit = args.unit
    if (args.tags !== undefined) updates.tags = args.tags

    await ctx.db.patch(args.partId, updates)
    return true
  },
})

/**
 * Archive a part (soft delete)
 * Requires General Officers role or higher
 * Checks that no active inventory exists for the part
 */
export const archive = mutation({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require General Officers or higher role
    await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    const part = await ctx.db.get(args.partId)
    if (!part || part.orgId !== orgId) {
      throw new Error('Part not found or access denied')
    }

    if (part.archived) {
      throw new Error('Part is already archived')
    }

    // Check for active inventory
    const inventoryItems = await ctx.db
      .query('inventory')
      .withIndex('by_partId', (q) => q.eq('partId', args.partId))
      .collect()

    const hasActiveInventory = inventoryItems.some((item) => item.quantity > 0)
    if (hasActiveInventory) {
      throw new Error(
        'Cannot archive part with active inventory. Please remove all quantities first.'
      )
    }

    await ctx.db.patch(args.partId, {
      archived: true,
      updatedAt: Date.now(),
    })

    return true
  },
})

/**
 * Restore an archived part
 * Requires General Officers role or higher
 */
export const unarchive = mutation({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require General Officers or higher role
    await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    const part = await ctx.db.get(args.partId)
    if (!part || part.orgId !== orgId) {
      throw new Error('Part not found or access denied')
    }

    if (!part.archived) {
      throw new Error('Part is not archived')
    }

    await ctx.db.patch(args.partId, {
      archived: false,
      updatedAt: Date.now(),
    })

    return true
  },
})

/**
 * Hard delete a part
 * Requires General Officers role or higher
 * Checks that no transactions exist for the part
 */
export const remove = mutation({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require General Officers or higher role
    await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    const part = await ctx.db.get(args.partId)
    if (!part || part.orgId !== orgId) {
      throw new Error('Part not found or access denied')
    }

    // Check for any transactions referencing this part
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_partId', (q) => q.eq('partId', args.partId))
      .take(1)

    if (transactions.length > 0) {
      throw new Error(
        'Cannot delete part with transaction history. Archive it instead.'
      )
    }

    // Delete the part image if exists
    if (part.imageId) {
      await ctx.storage.delete(part.imageId)
    }

    await ctx.db.delete(args.partId)
    return true
  },
})

/**
 * Update part image
 * Stores image using Convex storage
 * Requires General Officers role or higher
 */
export const updateImage = mutation({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
    storageId: v.optional(v.id('_storage')),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require General Officers or higher role
    await requireOrgRole(ctx, args.authContext, orgId, 'General Officers')

    const part = await ctx.db.get(args.partId)
    if (!part || part.orgId !== orgId) {
      throw new Error('Part not found or access denied')
    }

    // Delete old image if exists
    if (part.imageId) {
      await ctx.storage.delete(part.imageId)
    }

    await ctx.db.patch(args.partId, {
      imageId: args.storageId,
      updatedAt: Date.now(),
    })

    return true
  },
})
