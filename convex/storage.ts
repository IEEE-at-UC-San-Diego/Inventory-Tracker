import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { Id } from './_generated/dataModel'
import { requirePermission } from './permissions'
import { getCurrentUser } from './auth_helpers'
import { authContextSchema } from './types/auth'

/**
 * Generate a unique storage key for part images
 * Format: parts/{orgId}/{partId}/{timestamp}-{random}
 */
function generatePartImageKey(
  orgId: Id<'organizations'>,
  partId: Id<'parts'>,
  fileName: string
): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const extension = fileName.split('.').pop() || 'jpg'
  return `parts/${orgId}/${partId}/${timestamp}-${random}.${extension}`
}

/**
 * Generic mutation to generate an upload URL
 * Used when creating a new part (before partId exists)
 * Client uploads image first, then creates part with imageId
 */
export const generateUploadUrl = mutation({
  args: {
    authContext: authContextSchema,
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requirePermission(ctx, args.authContext, 'storage:upload')

    // Generate a generic upload URL (valid for 1 hour)
    const uploadUrl = await ctx.storage.generateUploadUrl()

    return uploadUrl
  },
})

/**
 * Mutation to generate an upload URL for a part image
 * Returns a URL that the client can use to upload the image directly
 */
export const generatePartImageUploadUrl = mutation({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
    fileName: v.string(),
    contentType: v.string(),
  },
  returns: v.object({
    uploadUrl: v.string(),
    storageKey: v.string(),
  }),
  handler: async (ctx, args) => {
    const { user } = await requirePermission(ctx, args.authContext, 'storage:upload')

    // Verify part exists
    const part = await ctx.db.get(args.partId)
    if (!part) {
      throw new Error('Part not found')
    }

    // Generate storage key
    const storageKey = generatePartImageKey(user.orgId!, args.partId, args.fileName)

    // Generate upload URL (valid for 1 hour)
    const uploadUrl = await ctx.storage.generateUploadUrl()

    return { uploadUrl, storageKey }
  },
})

/**
 * Mutation to confirm image upload and associate with part
 * Call this after successfully uploading the image
 */
export const confirmPartImageUpload = mutation({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
    storageId: v.id('_storage'),
    storageKey: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await requirePermission(ctx, args.authContext, 'storage:upload')

    // Verify part exists
    const part = await ctx.db.get(args.partId)
    if (!part) {
      throw new Error('Part not found')
    }

    // Delete old image if exists
    if (part.imageId) {
      try {
        await ctx.storage.delete(part.imageId)
      } catch {
        // Ignore errors if old image doesn't exist
      }
    }

    // Update part with new image ID
    await ctx.db.patch(args.partId, {
      imageId: args.storageId,
      updatedAt: Date.now(),
    })

    return true
  },
})

/**
 * Query to get the URL for a stored image
 * Returns a URL that can be used to display the image
 */
export const getImageUrl = query({
  args: {
    authContext: authContextSchema,
    storageId: v.id('_storage'),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) {
      return null
    }

    try {
      const url = await ctx.storage.getUrl(args.storageId)
      return url
    } catch {
      return null
    }
  },
})

export const getImageUrls = query({
  args: {
    authContext: authContextSchema,
    storageIds: v.array(v.id('_storage')),
  },
  returns: v.array(
    v.object({
      storageId: v.id('_storage'),
      url: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const userContext = await getCurrentUser(ctx, args.authContext)
    if (!userContext) return []

    const unique = Array.from(new Set(args.storageIds))
    const results: { storageId: Id<'_storage'>; url?: string }[] = []
    for (const storageId of unique) {
      try {
        const url = await ctx.storage.getUrl(storageId)
        results.push({ storageId, url: url ?? undefined })
      } catch {
        results.push({ storageId, url: undefined })
      }
    }
    return results
  },
})

/**
 * Mutation to delete a part image
 */
export const deletePartImage = mutation({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await requirePermission(ctx, args.authContext, 'storage:delete')

    // Verify part exists
    const part = await ctx.db.get(args.partId)
    if (!part) {
      throw new Error('Part not found')
    }

    // Delete the image from storage
    if (part.imageId) {
      try {
        await ctx.storage.delete(part.imageId)
      } catch {
        // Ignore errors if image doesn't exist
      }
    }

    // Update part to remove image reference
    await ctx.db.patch(args.partId, {
      imageId: undefined,
      updatedAt: Date.now(),
    })

    return true
  },
})

/**
 * Validate file type for part images
 * Returns true if the content type is an acceptable image format
 */
export function validateImageContentType(contentType: string): boolean {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ]
  return allowedTypes.includes(contentType.toLowerCase())
}

/**
 * Validate file size (max 5MB)
 */
export function validateImageFileSize(sizeInBytes: number): boolean {
  const maxSize = 5 * 1024 * 1024 // 5MB
  return sizeInBytes <= maxSize
}

/**
 * Generate a unique storage key for blueprint background images
 * Format: blueprints/{orgId}/{blueprintId}/{timestamp}-{random}
 */
function generateBlueprintBackgroundKey(
  orgId: Id<'organizations'>,
  blueprintId: Id<'blueprints'>,
  fileName: string
): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const extension = fileName.split('.').pop() || 'jpg'
  return `blueprints/${orgId}/${blueprintId}/background/${timestamp}-${random}.${extension}`
}

function generateDrawerBackgroundKey(
  orgId: Id<'organizations'>,
  blueprintId: Id<'blueprints'>,
  drawerId: Id<'drawers'>,
  fileName: string
): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const extension = fileName.split('.').pop() || 'jpg'
  return `blueprints/${orgId}/${blueprintId}/drawers/${drawerId}/${timestamp}-${random}.${extension}`
}

/**
 * Mutation to generate an upload URL for a blueprint background image
 * Returns a URL that the client can use to upload the image directly
 */
export const generateBlueprintBackgroundUploadUrl = mutation({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
    fileName: v.string(),
    contentType: v.string(),
  },
  returns: v.object({
    uploadUrl: v.string(),
    storageKey: v.string(),
  }),
  handler: async (ctx, args) => {
    const { user } = await requirePermission(ctx, args.authContext, 'storage:upload')

    // Verify blueprint exists
    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint) {
      throw new Error('Blueprint not found')
    }

    // Generate storage key
    const storageKey = generateBlueprintBackgroundKey(user.orgId!, args.blueprintId, args.fileName)

    // Generate upload URL (valid for 1 hour)
    const uploadUrl = await ctx.storage.generateUploadUrl()

    return { uploadUrl, storageKey }
  },
})

/**
 * Mutation to confirm background image upload and associate with blueprint
 * Call this after successfully uploading the image
 */
export const confirmBlueprintBackgroundUpload = mutation({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
    storageId: v.id('_storage'),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await requirePermission(ctx, args.authContext, 'storage:upload')

    // Verify blueprint exists
    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint) {
      throw new Error('Blueprint not found')
    }

    // Delete old background image if exists
    if (blueprint.backgroundImageId) {
      try {
        await ctx.storage.delete(blueprint.backgroundImageId)
      } catch {
        // Ignore errors if old image doesn't exist
      }
    }

    // Update blueprint with new background image ID
    await ctx.db.patch(args.blueprintId, {
      backgroundImageId: args.storageId,
      updatedAt: Date.now(),
    })

    return true
  },
})

/**
 * Mutation to delete a blueprint background image
 */
export const deleteBlueprintBackgroundImage = mutation({
  args: {
    authContext: authContextSchema,
    blueprintId: v.id('blueprints'),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await requirePermission(ctx, args.authContext, 'storage:delete')

    // Verify blueprint exists
    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint) {
      throw new Error('Blueprint not found')
    }

    // Delete the background image from storage
    if (blueprint.backgroundImageId) {
      try {
        await ctx.storage.delete(blueprint.backgroundImageId)
      } catch {
        // Ignore errors if image doesn't exist
      }
    }

    // Update blueprint to remove background image reference
    await ctx.db.patch(args.blueprintId, {
      backgroundImageId: undefined,
      updatedAt: Date.now(),
    })

    return true
  },
})

export const generateDrawerBackgroundUploadUrl = mutation({
  args: {
    authContext: authContextSchema,
    drawerId: v.id('drawers'),
    fileName: v.string(),
    contentType: v.string(),
  },
  returns: v.object({
    uploadUrl: v.string(),
    storageKey: v.string(),
  }),
  handler: async (ctx, args) => {
    const { user } = await requirePermission(ctx, args.authContext, 'storage:upload')

    const drawer = await ctx.db.get(args.drawerId)
    if (!drawer) throw new Error('Drawer not found')
    const blueprint = await ctx.db.get(drawer.blueprintId)
    if (!blueprint) {
      throw new Error('Blueprint not found')
    }

    const storageKey = generateDrawerBackgroundKey(user.orgId!, blueprint._id, args.drawerId, args.fileName)
    const uploadUrl = await ctx.storage.generateUploadUrl()
    return { uploadUrl, storageKey }
  },
})

export const confirmDrawerBackgroundUpload = mutation({
  args: {
    authContext: authContextSchema,
    drawerId: v.id('drawers'),
    storageId: v.id('_storage'),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    snapToGrid: v.optional(v.boolean()),
  },
  returns: v.id('drawerBackgroundImages'),
  handler: async (ctx, args) => {
    const { user } = await requirePermission(ctx, args.authContext, 'storage:upload')

    const drawer = await ctx.db.get(args.drawerId)
    if (!drawer) throw new Error('Drawer not found')
    const blueprint = await ctx.db.get(drawer.blueprintId)
    if (!blueprint) {
      throw new Error('Blueprint not found')
    }

    const now = Date.now()
    const existing = await ctx.db
      .query('drawerBackgroundImages')
      .withIndex('by_drawerId', (q) => q.eq('drawerId', args.drawerId))
      .collect()
    const maxZ = existing.reduce((m, i) => Math.max(m, i.zIndex), -1)

    // Respect blueprint lock for editor consistency.
    if (
      blueprint.lockedBy &&
      blueprint.lockTimestamp &&
      Date.now() - blueprint.lockTimestamp < 5 * 60 * 1000 &&
      blueprint.lockedBy !== user._id
    ) {
      throw new Error('Blueprint is locked by another user')
    }

    const imageId = await ctx.db.insert('drawerBackgroundImages', {
      drawerId: args.drawerId,
      storageId: args.storageId,
      x: args.x ?? 0,
      y: args.y ?? 0,
      width: args.width ?? 200,
      height: args.height ?? 150,
      zIndex: maxZ + 1,
      locked: false,
      snapToGrid: args.snapToGrid ?? false,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(drawer._id, { updatedAt: now })
    await ctx.db.patch(blueprint._id, { updatedAt: now })
    return imageId
  },
})

/**
 * Helper function to sanitize file names
 */
export function sanitizeFileName(fileName: string): string {
  // Remove path components and special characters
  return fileName
    .replace(/^.*[\\/]/, '') // Remove path
    .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
    .substring(0, 100) // Limit length
}
