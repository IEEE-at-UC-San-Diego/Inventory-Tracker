import { v } from 'convex/values'
import { mutation } from './_generated/server'
import { Id } from './_generated/dataModel'

/**
 * Development seed data generator
 * Run these mutations to populate your database with test data
 *
 * IMPORTANT: These should only be used in development!
 * Add .env check to prevent accidental use in production.
 */

// Sample data for seeding
const sampleParts = [
  { name: 'Resistor 10kΩ', sku: 'RES-10K-5', category: 'Passive Components' },
  { name: 'Resistor 1kΩ', sku: 'RES-1K-5', category: 'Passive Components' },
  { name: 'Capacitor 100µF', sku: 'CAP-100UF-25V', category: 'Passive Components' },
  { name: 'Capacitor 10µF', sku: 'CAP-10UF-25V', category: 'Passive Components' },
  { name: 'Arduino Uno R3', sku: 'ARD-UNO-R3', category: 'Microcontrollers' },
  { name: 'ESP32 DevKit', sku: 'ESP32-DEVKIT', category: 'Microcontrollers' },
  { name: 'Raspberry Pi 4', sku: 'RPI-4-4GB', category: 'Single Board Computers' },
  { name: 'Jumper Wires (M-M)', sku: 'WIRE-MM-40', category: 'Cables & Wires' },
  { name: 'Jumper Wires (M-F)', sku: 'WIRE-MF-40', category: 'Cables & Wires' },
  { name: 'Breadboard 830', sku: 'BB-830', category: 'Prototyping' },
  { name: 'LED Red 5mm', sku: 'LED-RED-5MM', category: 'Optoelectronics' },
  { name: 'LED Green 5mm', sku: 'LED-GRN-5MM', category: 'Optoelectronics' },
  { name: 'LED Blue 5mm', sku: 'LED-BLU-5MM', category: 'Optoelectronics' },
  { name: 'Push Button', sku: 'BTN-12MM', category: 'Switches' },
  { name: 'Potentiometer 10kΩ', sku: 'POT-10K-LIN', category: 'Passive Components' },
]

const sampleUsers = [
  { name: 'Alice Admin', email: 'alice@example.com', role: 'Admin' as const },
  { name: 'Bob Editor', email: 'bob@example.com', role: 'Editor' as const },
  { name: 'Charlie Viewer', email: 'charlie@example.com', role: 'Viewer' as const },
]

/**
 * Seed parts data
 */
export const seedParts = mutation({
  args: {
    count: v.optional(v.number()),
  },
  returns: v.object({
    created: v.number(),
    partIds: v.array(v.id('parts')),
  }),
  handler: async (ctx, args) => {
    // Seed doesn't require auth - get first org directly
    const firstOrg = await ctx.db.query('organizations').first()
    if (!firstOrg) {
      throw new Error('No organization found. Create one first.')
    }

    const count = Math.min(args.count || 10, sampleParts.length)
    const partIds: Id<'parts'>[] = []
    const now = Date.now()

    for (let i = 0; i < count; i++) {
      const partData = sampleParts[i]
      const partId = await ctx.db.insert('parts', {
        name: partData.name,
        sku: `${partData.sku}-${now}-${i}`,
        category: partData.category,
        description: `Sample ${partData.category.toLowerCase()} for testing`,
        archived: false,
        orgId: firstOrg._id,
        createdAt: now,
        updatedAt: now,
      })
      partIds.push(partId)
    }

    return { created: partIds.length, partIds }
  },
})

/**
 * Seed a blueprint with drawers and compartments
 */
export const seedBlueprint = mutation({
  args: {
    name: v.optional(v.string()),
    drawerCount: v.optional(v.number()),
    compartmentsPerDrawer: v.optional(v.number()),
  },
  returns: v.object({
    blueprintId: v.id('blueprints'),
    drawerIds: v.array(v.id('drawers')),
    compartmentIds: v.array(v.id('compartments')),
  }),
  handler: async (ctx, args) => {
    // Seed doesn't require auth - get first org directly
    const firstOrg = await ctx.db.query('organizations').first()
    if (!firstOrg) {
      throw new Error('No organization found. Create one first.')
    }

    const now = Date.now()
    const drawerCount = Math.min(args.drawerCount || 3, 6)
    const compartmentsPerDrawer = Math.min(args.compartmentsPerDrawer || 4, 8)

    // Create blueprint
    const blueprintId = await ctx.db.insert('blueprints', {
      name: args.name || `Test Blueprint ${now}`,
      orgId: firstOrg._id,
      createdAt: now,
      updatedAt: now,
    })

    const drawerIds: string[] = []
    const compartmentIds: string[] = []

    // Create drawers
    for (let i = 0; i < drawerCount; i++) {
      const drawerId = await ctx.db.insert('drawers', {
        blueprintId,
        x: 100 + (i % 3) * 220,
        y: 100 + Math.floor(i / 3) * 170,
        width: 200,
        height: 150,
        rotation: 0,
        zIndex: i,
        label: `Drawer ${String.fromCharCode(65 + i)}`,
        createdAt: now,
        updatedAt: now,
      })
      drawerIds.push(drawerId)

      // Create compartments for this drawer
      for (let j = 0; j < compartmentsPerDrawer; j++) {
        const cols = 2
        const col = j % cols
        const row = Math.floor(j / cols)

        const compartmentId = await ctx.db.insert('compartments', {
          drawerId,
          x: -75 + col * 80,
          y: -50 + row * 55,
          width: 70,
          height: 50,
          rotation: 0,
          zIndex: j,
          label: `${String.fromCharCode(65 + i)}${j + 1}`,
          createdAt: now,
          updatedAt: now,
        })
        compartmentIds.push(compartmentId)
      }
    }

    return { blueprintId, drawerIds: drawerIds as Id<'drawers'>[], compartmentIds: compartmentIds as Id<'compartments'>[] }
  },
})

/**
 * Seed inventory items (links parts to compartments)
 */
export const seedInventory = mutation({
  args: {
    partIds: v.array(v.id('parts')),
    compartmentIds: v.array(v.id('compartments')),
    itemsPerCompartment: v.optional(v.number()),
  },
  returns: v.object({
    created: v.number(),
    inventoryIds: v.array(v.id('inventory')),
  }),
  handler: async (ctx, args) => {
    // Seed doesn't require auth - get first org directly
    const firstOrg = await ctx.db.query('organizations').first()
    if (!firstOrg) {
      throw new Error('No organization found. Create one first.')
    }

    const inventoryIds: string[] = []
    const now = Date.now()
    const itemsPerCompartment = Math.min(args.itemsPerCompartment || 2, 5)

    // Create inventory entries
    for (const compartmentId of args.compartmentIds.slice(0, 10)) {
      // Pick random parts for this compartment
      const partsForCompartment = args.partIds
        .sort(() => Math.random() - 0.5)
        .slice(0, itemsPerCompartment)

      for (const partId of partsForCompartment) {
        const inventoryId = await ctx.db.insert('inventory', {
          partId,
          compartmentId,
          quantity: Math.floor(Math.random() * 50) + 5,
          orgId: firstOrg._id,
          createdAt: now,
          updatedAt: now,
        })
        inventoryIds.push(inventoryId)
      }
    }

    return { created: inventoryIds.length, inventoryIds: inventoryIds as Id<'inventory'>[] }
  },
})

/**
 * Seed sample transactions
 */
export const seedTransactions = mutation({
  args: {
    partIds: v.array(v.id('parts')),
    compartmentIds: v.array(v.id('compartments')),
    userIds: v.array(v.id('users')),
    count: v.optional(v.number()),
  },
  returns: v.object({
    created: v.number(),
  }),
  handler: async (ctx, args) => {
    // Seed doesn't require auth - get first org and user directly
    const firstOrg = await ctx.db.query('organizations').first()
    if (!firstOrg) {
      throw new Error('No organization found. Create one first.')
    }

    const firstUser = await ctx.db.query('users').first()
    if (!firstUser) {
      throw new Error('No user found. Create one first.')
    }

    const count = Math.min(args.count || 20, 50)
    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000

    const actionTypes = ['Add', 'Remove', 'Move', 'Adjust'] as const

    for (let i = 0; i < count; i++) {
      const actionType = actionTypes[Math.floor(Math.random() * actionTypes.length)]
      const timestamp = now - Math.floor(Math.random() * 7 * oneDayMs) // Last 7 days
      const partId = args.partIds[Math.floor(Math.random() * args.partIds.length)]
      const userId = args.userIds[Math.floor(Math.random() * args.userIds.length)] || firstUser._id

      let sourceCompartmentId
      let destCompartmentId = args.compartmentIds[Math.floor(Math.random() * args.compartmentIds.length)]
      let quantityDelta = Math.floor(Math.random() * 20) + 1

      if (actionType === 'Remove') {
        quantityDelta = -quantityDelta
      } else if (actionType === 'Move') {
        sourceCompartmentId = destCompartmentId
        destCompartmentId = args.compartmentIds[Math.floor(Math.random() * args.compartmentIds.length)]
        // Ensure different compartments
        if (sourceCompartmentId === destCompartmentId) {
          destCompartmentId = args.compartmentIds[0]
        }
      } else if (actionType === 'Adjust') {
        quantityDelta = Math.floor(Math.random() * 10) - 5
      }

      await ctx.db.insert('transactions', {
        actionType,
        quantityDelta,
        sourceCompartmentId,
        destCompartmentId,
        partId,
        userId,
        timestamp,
        notes: `Sample transaction ${i + 1}`,
        orgId: firstOrg._id,
      })
    }

    return { created: count }
  },
})

/**
 * Complete seed - creates parts, blueprint with compartments, inventory, and transactions
 */
export const seedAll = mutation({
  args: {},
  returns: v.object({
    parts: v.number(),
    blueprintId: v.id('blueprints'),
    drawers: v.number(),
    compartments: v.number(),
    inventory: v.number(),
    transactions: v.number(),
  }),
  handler: async (ctx) => {
    // Seed doesn't require auth - get first org and user directly
    const firstOrg = await ctx.db.query('organizations').first()
    if (!firstOrg) {
      throw new Error('No organization found. Create one first.')
    }

    const firstUser = await ctx.db.query('users').first()
    if (!firstUser) {
      throw new Error('No user found. Create one first.')
    }

    const now = Date.now()

    // 1. Create parts
    const partIds: string[] = []
    for (const partData of sampleParts.slice(0, 10)) {
      const partId = await ctx.db.insert('parts', {
        name: partData.name,
        sku: `${partData.sku}-${now}`,
        category: partData.category,
        description: `Sample ${partData.category.toLowerCase()}`,
        archived: false,
        orgId: firstOrg._id,
        createdAt: now,
        updatedAt: now,
      })
      partIds.push(partId)
    }

    // 2. Create blueprint with drawers and compartments
    const blueprintId = await ctx.db.insert('blueprints', {
      name: 'Workshop Storage Cabinet',
      orgId: firstOrg._id,
      createdAt: now,
      updatedAt: now,
    })

    const drawerIds: string[] = []
    const compartmentIds: string[] = []

    for (let i = 0; i < 4; i++) {
      const drawerId = await ctx.db.insert('drawers', {
        blueprintId,
        x: 100 + (i % 2) * 300,
        y: 100 + Math.floor(i / 2) * 200,
        width: 250,
        height: 180,
        rotation: 0,
        zIndex: i,
        label: `Drawer ${String.fromCharCode(65 + i)}`,
        createdAt: now,
        updatedAt: now,
      })
      drawerIds.push(drawerId)

      // 4 compartments per drawer
      for (let j = 0; j < 4; j++) {
        const col = j % 2
        const row = Math.floor(j / 2)
        const compartmentId = await ctx.db.insert('compartments', {
          drawerId,
          x: -90 + col * 100,
          y: -60 + row * 80,
          width: 90,
          height: 70,
          rotation: 0,
          zIndex: j,
          label: `${String.fromCharCode(65 + i)}${j + 1}`,
          createdAt: now,
          updatedAt: now,
        })
        compartmentIds.push(compartmentId)
      }
    }

    // 3. Create inventory entries
    const inventoryIds: string[] = []
    for (const compartmentId of compartmentIds) {
      const randomParts = partIds.sort(() => Math.random() - 0.5).slice(0, 2)
      for (const partId of randomParts) {
        const inventoryId = await ctx.db.insert('inventory', {
          partId: partId as Id<'parts'>,
          compartmentId: compartmentId as Id<'compartments'>,
          quantity: Math.floor(Math.random() * 30) + 10,
          orgId: firstOrg._id,
          createdAt: now,
          updatedAt: now,
        })
        inventoryIds.push(inventoryId)
      }
    }

    // 4. Create transactions
    const actionTypes = ['Add', 'Remove', 'Move', 'Adjust'] as const
    for (let i = 0; i < 25; i++) {
      const actionType = actionTypes[Math.floor(Math.random() * actionTypes.length)]
      const timestamp = now - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)
      const partId = partIds[Math.floor(Math.random() * partIds.length)]

      let sourceCompartmentId
      let destCompartmentId = compartmentIds[Math.floor(Math.random() * compartmentIds.length)]
      let quantityDelta = Math.floor(Math.random() * 15) + 1

      if (actionType === 'Remove') {
        quantityDelta = -quantityDelta
      } else if (actionType === 'Move') {
        sourceCompartmentId = destCompartmentId
        destCompartmentId = compartmentIds[Math.floor(Math.random() * compartmentIds.length)]
      } else if (actionType === 'Adjust') {
        quantityDelta = Math.floor(Math.random() * 10) - 5
      }

      await ctx.db.insert('transactions', {
        actionType,
        quantityDelta,
        sourceCompartmentId: sourceCompartmentId as Id<'compartments'> | undefined,
        destCompartmentId: destCompartmentId as Id<'compartments'>,
        partId: partId as Id<'parts'>,
        userId: firstUser._id,
        timestamp,
        notes: `Auto-generated transaction`,
        orgId: firstOrg._id,
      })
    }

    return {
      parts: partIds.length,
      blueprintId,
      drawers: drawerIds.length,
      compartments: compartmentIds.length,
      inventory: inventoryIds.length,
      transactions: 25,
    }
  },
})

/**
 * Clear all data for the current organization (use with caution!)
 */
export const clearAllData = mutation({
  args: {
    confirm: v.literal('DELETE ALL DATA'),
  },
  returns: v.object({
    deleted: v.object({
      parts: v.number(),
      blueprints: v.number(),
      drawers: v.number(),
      compartments: v.number(),
      inventory: v.number(),
      transactions: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    if (args.confirm !== 'DELETE ALL DATA') {
      throw new Error('Confirmation phrase required')
    }

    // Seed doesn't require auth - get first org directly
    const firstOrg = await ctx.db.query('organizations').first()
    if (!firstOrg) {
      throw new Error('No organization found. Create one first.')
    }

    const orgId = firstOrg._id

    // Delete in order (children first)
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect()
    for (const item of transactions) {
      await ctx.db.delete(item._id)
    }

    const inventory = await ctx.db
      .query('inventory')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect()
    for (const item of inventory) {
      await ctx.db.delete(item._id)
    }

    const parts = await ctx.db
      .query('parts')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect()
    for (const item of parts) {
      await ctx.db.delete(item._id)
    }

    // Get blueprints and their children
    const blueprints = await ctx.db
      .query('blueprints')
      .withIndex('by_orgId', (q) => q.eq('orgId', orgId))
      .collect()

    let drawerCount = 0
    let compartmentCount = 0

    for (const blueprint of blueprints) {
      const drawers = await ctx.db
        .query('drawers')
        .withIndex('by_blueprintId', (q) => q.eq('blueprintId', blueprint._id))
        .collect()

      for (const drawer of drawers) {
        const compartments = await ctx.db
          .query('compartments')
          .withIndex('by_drawerId', (q) => q.eq('drawerId', drawer._id))
          .collect()

        for (const compartment of compartments) {
          await ctx.db.delete(compartment._id)
          compartmentCount++
        }

        await ctx.db.delete(drawer._id)
        drawerCount++
      }

      await ctx.db.delete(blueprint._id)
    }

    return {
      deleted: {
        parts: parts.length,
        blueprints: blueprints.length,
        drawers: drawerCount,
        compartments: compartmentCount,
        inventory: inventory.length,
        transactions: transactions.length,
      },
    }
  },
})
