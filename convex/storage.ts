import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { Id } from './_generated/dataModel'
import { getCurrentOrgId } from './organization_helpers'
import { requireOrgRole } from './auth_helpers'
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
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require Executive Officers or Administrator role
    await requireOrgRole(ctx, args.authContext, orgId, 'Executive Officers')

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
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require Executive Officers or Administrator role
    await requireOrgRole(ctx, args.authContext, orgId, 'Executive Officers')

    // Verify part belongs to this org
    const part = await ctx.db.get(args.partId)
    if (!part || part.orgId !== orgId) {
      throw new Error('Part not found or access denied')
    }

    // Generate storage key
    const storageKey = generatePartImageKey(orgId, args.partId, args.fileName)

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
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require Executive Officers or Administrator role
    await requireOrgRole(ctx, args.authContext, orgId, 'Executive Officers')

    // Verify part belongs to this org
    const part = await ctx.db.get(args.partId)
    if (!part || part.orgId !== orgId) {
      throw new Error('Part not found or access denied')
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
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require Executive Officers or Administrator role
    await requireOrgRole(ctx, args.authContext, orgId, 'Executive Officers')

    // Verify part belongs to this org
    const part = await ctx.db.get(args.partId)
    if (!part || part.orgId !== orgId) {
      throw new Error('Part not found or access denied')
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
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require Executive Officers or Administrator role
    await requireOrgRole(ctx, args.authContext, orgId, 'Executive Officers')

    // Verify blueprint belongs to this org
    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint || blueprint.orgId !== orgId) {
      throw new Error('Blueprint not found or access denied')
    }

    // Generate storage key
    const storageKey = generateBlueprintBackgroundKey(orgId, args.blueprintId, args.fileName)

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
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require Editor or Admin role
    await requireOrgRole(ctx, args.authContext, orgId, 'Executive Officers')

    // Verify blueprint belongs to this org
    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint || blueprint.orgId !== orgId) {
      throw new Error('Blueprint not found or access denied')
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
    const orgId = await getCurrentOrgId(ctx, args.authContext)

    // Require Editor or Admin role
    await requireOrgRole(ctx, args.authContext, orgId, 'Executive Officers')

    // Verify blueprint belongs to this org
    const blueprint = await ctx.db.get(args.blueprintId)
    if (!blueprint || blueprint.orgId !== orgId) {
      throw new Error('Blueprint not found or access denied')
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
