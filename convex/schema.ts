import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Role hierarchy for organization members
 * Admin > Editor > Member > Viewer
 */
export const UserRole = {
  Administrator: 'Administrator',
  'Executive Officers': 'Executive Officers',
  'General Officers': 'General Officers',
  Member: 'Member',
} as const

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole]

/**
 * Transaction action types for inventory tracking
 */
export const ActionType = {
  Add: 'Add',
  Remove: 'Remove',
  Move: 'Move',
  Adjust: 'Adjust',
} as const

export type ActionTypeValue = (typeof ActionType)[keyof typeof ActionType]

/**
 * Database schema for multi-tenant inventory tracker
 * All org-scoped tables include orgId for tenant isolation
 */
export default defineSchema({
  /**
   * Organizations - top-level tenant container
   */
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    createdAt: v.number(), // Unix timestamp
  })
    .index('by_slug', ['slug'])
    .index('by_createdAt', ['createdAt']),

  /**
   * Users - linked to Logto, scoped to organization
   */
  users: defineTable({
    logtoUserId: v.string(), // Reference to Logto user (subject from JWT)
    name: v.string(),
    email: v.string(),
    orgId: v.id('organizations'),
    role: v.union(v.literal('Administrator'), v.literal('Executive Officers'), v.literal('General Officers'), v.literal('Member')),
    createdAt: v.number(),
  })
    .index('by_logtoUserId', ['logtoUserId'])
    .index('by_orgId', ['orgId'])
    .index('by_email', ['email'])
    .index('by_orgId_and_logtoUserId', ['orgId', 'logtoUserId']),

  /**
   * Parts - inventory items that can be stored
   */
  parts: defineTable({
    name: v.string(),
    sku: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
    imageId: v.optional(v.id('_storage')), // Reference to stored image
    archived: v.boolean(),
    orgId: v.id('organizations'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_orgId', ['orgId'])
    .index('by_sku', ['sku'])
    .index('by_orgId_and_sku', ['orgId', 'sku'])
    .index('by_orgId_and_archived', ['orgId', 'archived'])
    .index('by_orgId_and_category', ['orgId', 'category'])
    .index('by_updatedAt', ['updatedAt']),

  /**
   * Blueprints - visual storage layout definitions
   */
  blueprints: defineTable({
    name: v.string(),
    orgId: v.id('organizations'),
    backgroundImageId: v.optional(v.id('_storage')), // Optional background image for tracing
    lockedBy: v.optional(v.id('users')), // User currently editing
    lockTimestamp: v.optional(v.number()), // When lock was acquired
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_orgId', ['orgId'])
    .index('by_orgId_and_name', ['orgId', 'name'])
    .index('by_lockedBy', ['lockedBy'])
    .index('by_updatedAt', ['updatedAt']),

  /**
   * Drawers - containers within blueprints (e.g., cabinet drawers)
   */
  drawers: defineTable({
    blueprintId: v.id('blueprints'),
    x: v.number(), // Position in blueprint
    y: v.number(),
    width: v.number(),
    height: v.number(),
    rotation: v.number(), // Degrees
    zIndex: v.number(), // Stacking order
    label: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_blueprintId', ['blueprintId'])
    .index('by_blueprintId_and_zIndex', ['blueprintId', 'zIndex'])
    .index('by_updatedAt', ['updatedAt']),

  /**
   * Compartments - subdivisions within drawers
   */
  compartments: defineTable({
    drawerId: v.id('drawers'),
    x: v.number(), // Position within drawer
    y: v.number(),
    width: v.number(),
    height: v.number(),
    rotation: v.number(),
    zIndex: v.number(),
    label: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_drawerId', ['drawerId'])
    .index('by_drawerId_and_zIndex', ['drawerId', 'zIndex'])
    .index('by_updatedAt', ['updatedAt']),

  /**
   * Inventory - links parts to storage locations with quantities
   */
  inventory: defineTable({
    partId: v.id('parts'),
    compartmentId: v.id('compartments'),
    quantity: v.number(),
    orgId: v.id('organizations'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_orgId', ['orgId'])
    .index('by_partId', ['partId'])
    .index('by_compartmentId', ['compartmentId'])
    .index('by_partId_and_compartmentId', ['partId', 'compartmentId'])
    .index('by_orgId_and_partId', ['orgId', 'partId'])
    .index('by_updatedAt', ['updatedAt']),

  /**
   * Transactions - audit log for all inventory changes
   */
  transactions: defineTable({
    actionType: v.union(
      v.literal('Add'),
      v.literal('Remove'),
      v.literal('Move'),
      v.literal('Adjust')
    ),
    quantityDelta: v.number(), // Positive or negative change
    sourceCompartmentId: v.optional(v.id('compartments')), // For moves
    destCompartmentId: v.optional(v.id('compartments')), // Target location
    partId: v.id('parts'),
    userId: v.id('users'),
    timestamp: v.number(),
    notes: v.optional(v.string()),
    orgId: v.id('organizations'),
  })
    .index('by_orgId', ['orgId'])
    .index('by_userId', ['userId'])
    .index('by_partId', ['partId'])
    .index('by_orgId_and_timestamp', ['orgId', 'timestamp'])
    .index('by_destCompartmentId', ['destCompartmentId'])
    .index('by_sourceCompartmentId', ['sourceCompartmentId'])
    .index('by_timestamp', ['timestamp']),

  /**
   * Blueprint Revisions - version history for undo/rollback
   */
  blueprintRevisions: defineTable({
    blueprintId: v.id('blueprints'),
    version: v.number(), // Incrementing version number
    state: v.object({
      // Full snapshot of blueprint state
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
    description: v.optional(v.string()), // Optional description of changes
    createdBy: v.id('users'),
    createdAt: v.number(),
    orgId: v.id('organizations'),
  })
    .index('by_blueprintId', ['blueprintId'])
    .index('by_blueprintId_and_version', ['blueprintId', 'version'])
    .index('by_orgId', ['orgId'])
    .index('by_createdAt', ['createdAt']),

  /**
   * Role Sync Queue - background retry queue for failed Logto role syncs
   * When role sync fails, items are queued here for retry with exponential backoff
   */
  roleSyncQueue: defineTable({
    userId: v.id('users'),
    targetRole: v.union(v.literal('Administrator'), v.literal('Executive Officers'), v.literal('General Officers'), v.literal('Member')),
    attempts: v.number(), // Number of retry attempts made
    lastAttemptAt: v.optional(v.number()), // Unix timestamp of last attempt
    nextAttemptAt: v.number(), // Unix timestamp of next scheduled retry
    status: v.union(v.literal('pending'), v.literal('retry'), v.literal('failed')),
    errorMessage: v.optional(v.string()), // Error message from last attempt
  })
    .index('by_status', ['status'])
    .index('by_nextAttemptAt', ['nextAttemptAt'])
    .index('by_userId', ['userId']),
})
