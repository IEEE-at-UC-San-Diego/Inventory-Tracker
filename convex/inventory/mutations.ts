import { v } from 'convex/values'
import { mutation } from '../_generated/server'
import { Doc, Id } from '../_generated/dataModel'
import { requirePermission } from '../permissions'
import { authContextSchema } from '../types/auth'

/**
 * Helper function to create a transaction record
 * All inventory mutations must call this to maintain audit trail
 */
async function createTransaction(
  ctx: {
    db: any
  },
  args: {
    actionType: 'Add' | 'Remove' | 'Move' | 'Adjust'
    quantityDelta: number
    sourceCompartmentId?: Id<'compartments'>
    destCompartmentId?: Id<'compartments'>
    partId: Id<'parts'>
    userId: Id<'users'>
    orgId: Id<'organizations'>
    notes?: string
  }
): Promise<Id<'transactions'>> {
  const transactionId = await ctx.db.insert('transactions', {
    actionType: args.actionType as any,
    quantityDelta: args.quantityDelta,
    sourceCompartmentId: args.sourceCompartmentId,
    destCompartmentId: args.destCompartmentId,
    partId: args.partId,
    userId: args.userId,
    timestamp: Date.now(),
    notes: args.notes,
    orgId: args.orgId,
  })

  return transactionId
}

/**
 * Helper to verify compartment exists
 */
async function verifyCompartmentAccess(
  ctx: {
    db: {
      get: (id: Id<'compartments'>) => Promise<Doc<'compartments'> | null>
    }
  },
  compartmentId: Id<'compartments'>,
  _orgId?: Id<'organizations'>
): Promise<Doc<'compartments'>> {
  const compartment = await ctx.db.get(compartmentId)
  if (!compartment) {
    throw new Error('Compartment not found')
  }

  return compartment
}

/**
 * Helper to verify part exists
 */
async function verifyPartAccess(
  ctx: {
    db: {
      get: (id: Id<'parts'>) => Promise<Doc<'parts'> | null>
    }
  },
  partId: Id<'parts'>,
  _orgId?: Id<'organizations'>
): Promise<Doc<'parts'>> {
  const part = await ctx.db.get(partId)
  if (!part) {
    throw new Error('Part not found')
  }

  if (part.archived) {
    throw new Error('Cannot modify inventory for archived part')
  }

  return part
}

/**
 * Check in inventory to a compartment
 * Adds quantity to existing inventory or creates new inventory record
 * Requires General Officers role or higher
 */
export const checkIn = mutation({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
    compartmentId: v.id('compartments'),
    quantity: v.number(),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    inventoryId: v.id('inventory'),
    transactionId: v.id('transactions'),
    newQuantity: v.number(),
  }),
  handler: async (ctx, args) => {
    const userContext = await requirePermission(ctx, args.authContext, 'inventory:add')
    const orgId = userContext.user.orgId

    // Validate quantity
    if (args.quantity <= 0) {
      throw new Error('Quantity must be positive')
    }

    // Verify part and compartment exist
    await verifyPartAccess(ctx, args.partId)
    await verifyCompartmentAccess(ctx, args.compartmentId)

    // Check for existing inventory record
    const existingInventory = await ctx.db
      .query('inventory')
      .withIndex('by_partId_and_compartmentId', (q) =>
        q.eq('partId', args.partId).eq('compartmentId', args.compartmentId)
      )
      .unique()

    const now = Date.now()
    let inventoryId: Id<'inventory'>
    let newQuantity: number

    if (existingInventory) {
      // Update existing inventory
      newQuantity = existingInventory.quantity + args.quantity
      await ctx.db.patch(existingInventory._id, {
        quantity: newQuantity,
        updatedAt: now,
      })
      inventoryId = existingInventory._id
    } else {
      // Create new inventory record
      newQuantity = args.quantity
      inventoryId = await ctx.db.insert('inventory', {
        partId: args.partId,
        compartmentId: args.compartmentId,
        quantity: newQuantity,
        orgId,
        createdAt: now,
        updatedAt: now,
      })
    }

    // Create transaction record
    const transactionId = await createTransaction(ctx, {
      actionType: 'Add',
      quantityDelta: args.quantity,
      destCompartmentId: args.compartmentId,
      partId: args.partId,
      userId: userContext.user._id,
      orgId,
      notes: args.notes,
    })

    return { inventoryId, transactionId, newQuantity }
  },
})

/**
 * Check out inventory from a compartment
 * Removes quantity from inventory
 * Requires General Officers role or higher
 */
export const checkOut = mutation({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
    compartmentId: v.id('compartments'),
    quantity: v.number(),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    inventoryId: v.id('inventory'),
    transactionId: v.id('transactions'),
    newQuantity: v.number(),
  }),
  handler: async (ctx, args) => {
    const userContext = await requirePermission(ctx, args.authContext, 'inventory:remove')
    const orgId = userContext.user.orgId

    // Validate quantity
    if (args.quantity <= 0) {
      throw new Error('Quantity must be positive')
    }

    // Verify part and compartment exist
    await verifyPartAccess(ctx, args.partId)
    await verifyCompartmentAccess(ctx, args.compartmentId)

    // Find existing inventory record
    const existingInventory = await ctx.db
      .query('inventory')
      .withIndex('by_partId_and_compartmentId', (q) =>
        q.eq('partId', args.partId).eq('compartmentId', args.compartmentId)
      )
      .unique()

    if (!existingInventory || existingInventory.quantity < args.quantity) {
      throw new Error(
        `Insufficient inventory. Available: ${existingInventory?.quantity ?? 0}`
      )
    }

    const newQuantity = existingInventory.quantity - args.quantity
    const now = Date.now()

    // Update inventory quantity
    await ctx.db.patch(existingInventory._id, {
      quantity: newQuantity,
      updatedAt: now,
    })

    // Create transaction record
    const transactionId = await createTransaction(ctx, {
      actionType: 'Remove',
      quantityDelta: -args.quantity,
      sourceCompartmentId: args.compartmentId,
      partId: args.partId,
      userId: userContext.user._id,
      orgId,
      notes: args.notes,
    })

    return {
      inventoryId: existingInventory._id,
      transactionId,
      newQuantity,
    }
  },
})

/**
 * Move inventory between compartments
 * Reduces quantity in source, adds to destination
 * Requires General Officers role or higher
 */
export const move = mutation({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
    sourceCompartmentId: v.id('compartments'),
    destCompartmentId: v.id('compartments'),
    quantity: v.number(),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    sourceInventoryId: v.id('inventory'),
    destInventoryId: v.id('inventory'),
    transactionId: v.id('transactions'),
    sourceNewQuantity: v.number(),
    destNewQuantity: v.number(),
  }),
  handler: async (ctx, args) => {
    const userContext = await requirePermission(ctx, args.authContext, 'inventory:move')
    const orgId = userContext.user.orgId

    // Validate quantity
    if (args.quantity <= 0) {
      throw new Error('Quantity must be positive')
    }

    // Can't move to same compartment
    if (args.sourceCompartmentId === args.destCompartmentId) {
      throw new Error('Source and destination compartments must be different')
    }

    // Verify part and compartments exist
    await verifyPartAccess(ctx, args.partId)
    await verifyCompartmentAccess(ctx, args.sourceCompartmentId)
    await verifyCompartmentAccess(ctx, args.destCompartmentId)

    // Find source inventory record
    const sourceInventory = await ctx.db
      .query('inventory')
      .withIndex('by_partId_and_compartmentId', (q) =>
        q.eq('partId', args.partId).eq('compartmentId', args.sourceCompartmentId)
      )
      .unique()

    if (!sourceInventory || sourceInventory.quantity < args.quantity) {
      throw new Error(
        `Insufficient inventory in source. Available: ${sourceInventory?.quantity ?? 0}`
      )
    }

    const now = Date.now()

    // Reduce quantity in source
    const sourceNewQuantity = sourceInventory.quantity - args.quantity
    await ctx.db.patch(sourceInventory._id, {
      quantity: sourceNewQuantity,
      updatedAt: now,
    })

    // Find or create destination inventory record
    let destInventory = await ctx.db
      .query('inventory')
      .withIndex('by_partId_and_compartmentId', (q) =>
        q.eq('partId', args.partId).eq('compartmentId', args.destCompartmentId)
      )
      .unique()

    let destInventoryId: Id<'inventory'>
    let destNewQuantity: number

    if (destInventory) {
      destNewQuantity = destInventory.quantity + args.quantity
      await ctx.db.patch(destInventory._id, {
        quantity: destNewQuantity,
        updatedAt: now,
      })
      destInventoryId = destInventory._id
    } else {
      destNewQuantity = args.quantity
      destInventoryId = await ctx.db.insert('inventory', {
        partId: args.partId,
        compartmentId: args.destCompartmentId,
        quantity: destNewQuantity,
        orgId,
        createdAt: now,
        updatedAt: now,
      })
    }

    // Create transaction record
    const transactionId = await createTransaction(ctx, {
      actionType: 'Move',
      quantityDelta: args.quantity,
      sourceCompartmentId: args.sourceCompartmentId,
      destCompartmentId: args.destCompartmentId,
      partId: args.partId,
      userId: userContext.user._id,
      orgId,
      notes: args.notes,
    })

    return {
      sourceInventoryId: sourceInventory._id,
      destInventoryId,
      transactionId,
      sourceNewQuantity,
      destNewQuantity,
    }
  },
})

/**
 * Adjust inventory quantity (manual correction)
 * General Officers or higher operation
 * Records the difference as the delta
 */
export const adjust = mutation({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
    compartmentId: v.id('compartments'),
    quantity: v.number(),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    inventoryId: v.id('inventory'),
    transactionId: v.id('transactions'),
    oldQuantity: v.number(),
    newQuantity: v.number(),
  }),
  handler: async (ctx, args) => {
    const userContext = await requirePermission(ctx, args.authContext, 'inventory:adjust')
    const orgId = userContext.user.orgId

    // Verify part and compartment exist
    await verifyPartAccess(ctx, args.partId)
    await verifyCompartmentAccess(ctx, args.compartmentId)

    // Find existing inventory record
    const existingInventory = await ctx.db
      .query('inventory')
      .withIndex('by_partId_and_compartmentId', (q) =>
        q.eq('partId', args.partId).eq('compartmentId', args.compartmentId)
      )
      .unique()

    const now = Date.now()
    let inventoryId: Id<'inventory'>
    let oldQuantity: number
    let newQuantity: number

    if (existingInventory) {
      oldQuantity = existingInventory.quantity
      newQuantity = args.quantity

      await ctx.db.patch(existingInventory._id, {
        quantity: newQuantity,
        updatedAt: now,
      })
      inventoryId = existingInventory._id
    } else {
      // Create new inventory record if none exists
      oldQuantity = 0
      newQuantity = args.quantity
      inventoryId = await ctx.db.insert('inventory', {
        partId: args.partId,
        compartmentId: args.compartmentId,
        quantity: newQuantity,
        orgId,
        createdAt: now,
        updatedAt: now,
      })
    }

    const quantityDelta = newQuantity - oldQuantity

    // Create transaction record
    const transactionId = await createTransaction(ctx, {
      actionType: 'Adjust',
      quantityDelta,
      destCompartmentId: args.compartmentId,
      partId: args.partId,
      userId: userContext.user._id,
      orgId,
      notes: args.notes || `Manual adjustment from ${oldQuantity} to ${newQuantity}`,
    })

    return { inventoryId, transactionId, oldQuantity, newQuantity }
  },
})

/**
 * Set exact inventory quantity (alias for adjust)
 * General Officers or higher operation
 */
export const setQuantity = mutation({
  args: {
    authContext: authContextSchema,
    partId: v.id('parts'),
    compartmentId: v.id('compartments'),
    quantity: v.number(),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    inventoryId: v.id('inventory'),
    transactionId: v.id('transactions'),
    oldQuantity: v.number(),
    newQuantity: v.number(),
  }),
  handler: async (ctx, args) => {
    const userContext = await requirePermission(ctx, args.authContext, 'inventory:adjust')
    const orgId = userContext.user.orgId

    const part = await ctx.db.get(args.partId)
    if (!part) {
      throw new Error('Part not found')
    }

    const inventory = await ctx.db
      .query('inventory')
      .withIndex('by_partId_and_compartmentId', (q) =>
        q.eq('partId', args.partId).eq('compartmentId', args.compartmentId)
      )
      .unique()

    const now = Date.now()
    let inventoryId: Id<'inventory'>
    let oldQuantity: number
    let newQuantity: number

    if (inventory) {
      oldQuantity = inventory.quantity
      newQuantity = args.quantity
      await ctx.db.patch(inventory._id, {
        quantity: newQuantity,
        updatedAt: now,
      })
      inventoryId = inventory._id
    } else {
      oldQuantity = 0
      newQuantity = args.quantity
      inventoryId = await ctx.db.insert('inventory', {
        partId: args.partId,
        compartmentId: args.compartmentId,
        quantity: newQuantity,
        orgId,
        createdAt: now,
        updatedAt: now,
      })
    }

    const quantityDelta = newQuantity - oldQuantity

    const transactionId = await createTransaction(ctx, {
      actionType: 'Adjust',
      quantityDelta,
      destCompartmentId: args.compartmentId,
      partId: args.partId,
      userId: userContext.user._id,
      orgId,
      notes: args.notes || `Manual adjustment from ${oldQuantity} to ${newQuantity}`,
    })

    return { inventoryId, transactionId, oldQuantity, newQuantity }
  },
})
