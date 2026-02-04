/**
 * Shared TypeScript types for Inventory Tracker
 */

// Export auth types from auth.ts
export * from './auth'

// ============================================
// User & Role Types
// ============================================

export type UserRole = 'Administrator' | 'Executive Officers' | 'General Officers' | 'Member'

export interface User {
  _id: string
  logtoUserId: string
  name: string
  email: string
  orgId: string
  role: UserRole
  createdAt: number
  // Custom JWT claims from Logto
  uid?: string
  roles?: string[]
  scopes?: string[]
  organizations?: Array<{ id: string; name: string }>
}

export interface Organization {
  _id: string
  name: string
  slug: string
  createdAt: number
}

// Role hierarchy for permission checking
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  Administrator: 4,
  'Executive Officers': 3,
  'General Officers': 2,
  Member: 1,
}

/**
 * Check if a role meets the minimum required role
 */
export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

// ============================================
// Part & Category Types
// ============================================

export interface Part {
  _id: string
  name: string
  sku: string
  category: string
  description?: string
  imageId?: string
  imageUrl?: string
  archived: boolean
  orgId: string
  createdAt: number
  updatedAt: number
}

export interface PartInput {
  name: string
  sku: string
  category: string
  description?: string
  imageId?: string
}

// ============================================
// Blueprint, Drawer, Compartment Types
// ============================================

export interface Blueprint {
  _id: string
  name: string
  orgId: string
  lockedBy?: string
  lockedByUser?: User
  lockTimestamp?: number
  createdAt: number
  updatedAt: number
}

export interface Drawer {
  _id: string
  blueprintId: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  label?: string
  createdAt: number
  updatedAt: number
}

export interface Compartment {
  _id: string
  drawerId: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  label?: string
  createdAt: number
  updatedAt: number
}

// ============================================
// Geometry Types
// ============================================

export interface Position {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rotation {
  degrees: number
}

export interface Transform {
  position: Position
  size: Size
  rotation: Rotation
}

// ============================================
// Inventory & Transaction Types
// ============================================

export type ActionType = 'Add' | 'Remove' | 'Move' | 'Adjust'

export interface Inventory {
  _id: string
  partId: string
  part?: Part
  compartmentId: string
  compartment?: Compartment & { drawer?: Drawer }
  quantity: number
  orgId: string
  createdAt: number
  updatedAt: number
}

export interface Transaction {
  _id: string
  actionType: ActionType
  quantityDelta: number
  sourceCompartmentId?: string
  sourceCompartment?: Compartment & { drawer?: Drawer }
  destCompartmentId?: string
  destCompartment?: Compartment & { drawer?: Drawer }
  partId: string
  part?: Part
  userId: string
  user?: User
  timestamp: number
  notes?: string
  orgId: string
}

export interface TransactionInput {
  actionType: ActionType
  quantityDelta: number
  sourceCompartmentId?: string
  destCompartmentId?: string
  partId: string
  notes?: string
}

// ============================================
// Inventory Summary Types
// ============================================

export interface InventorySummary {
  totalParts: number
  totalQuantity: number
  lowStockItems: LowStockItem[]
  recentTransactions: Transaction[]
}

export interface LowStockItem {
  part: Part
  totalQuantity: number
  locations: number
}

// ============================================
// Storage Types
// ============================================

export type StorageId = string

export interface StorageLocation {
  type: 'compartment' | 'drawer' | 'blueprint'
  id: string
  name: string
  path: string[] // e.g., ["Blueprint Name", "Drawer A", "Compartment 1"]
}

export interface StorageAllocation {
  location: StorageLocation
  items: Inventory[]
}

// ============================================
// API Response Types
// ============================================

export interface ApiError {
  error: string
  code?: string
  details?: Record<string, unknown>
}

export interface PaginatedResult<T> {
  items: T[]
  nextCursor?: string
  hasMore: boolean
}

// ============================================
// UI State Types
// ============================================

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
}

export interface FilterState {
  search: string
  category?: string
  archived?: boolean
  sortBy: 'name' | 'sku' | 'updatedAt' | 'createdAt'
  sortOrder: 'asc' | 'desc'
}

// ============================================
// Blueprint Canvas Types
// ============================================

export interface CanvasPoint {
  x: number
  y: number
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export type ZoomLevel = number

export interface CanvasBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type SelectedElement =
  | { type: 'drawer'; id: string; data: Drawer }
  | { type: 'compartment'; id: string; data: Compartment; drawerId: string }
  | null

export type CanvasMode = 'view' | 'edit'

export interface HighlightConfig {
  partId?: string
  compartmentIds?: string[]
  drawerIds?: string[]
  color?: string
  animate?: boolean
}

export interface LockStatus {
  isLocked: boolean
  lockedBy?: string
  lockedByName?: string
  lockTimestamp?: number
  timeRemainingMs?: number
  isExpired?: boolean
}

// Drawer with compartments for hierarchy
export interface DrawerWithCompartments extends Drawer {
  compartments: Compartment[]
}

// Blueprint with full hierarchy
export interface BlueprintWithHierarchy extends Blueprint {
  drawers: DrawerWithCompartments[]
}

// ============================================
// Canvas Event Types
// ============================================

export interface CanvasDragEvent {
  target: CanvasPoint
  delta: CanvasPoint
  isDragging: boolean
}

export interface CanvasClickEvent {
  point: CanvasPoint
  target: 'drawer' | 'compartment' | 'canvas' | null
  targetId?: string
}

// ============================================
// Transform & Geometry Helpers
// ============================================

/**
 * Transform a point from screen coordinates to blueprint coordinates
 */
export function screenToBlueprint(
  screenPoint: CanvasPoint,
  viewport: Viewport
): CanvasPoint {
  return {
    x: (screenPoint.x - viewport.x) / viewport.zoom,
    y: (screenPoint.y - viewport.y) / viewport.zoom,
  }
}

/**
 * Transform a point from blueprint coordinates to screen coordinates
 */
export function blueprintToScreen(
  blueprintPoint: CanvasPoint,
  viewport: Viewport
): CanvasPoint {
  return {
    x: blueprintPoint.x * viewport.zoom + viewport.x,
    y: blueprintPoint.y * viewport.zoom + viewport.y,
  }
}

/**
 * Get default viewport (centered, 100% zoom)
 */
export function getDefaultViewport(
  canvasWidth: number,
  canvasHeight: number,
  blueprintWidth: number = 1000,
  blueprintHeight: number = 1000
): Viewport {
  const zoom = Math.min(
    canvasWidth / blueprintWidth,
    canvasHeight / blueprintHeight,
    1
  ) * 0.9 // 90% fill with padding

  const scaledWidth = blueprintWidth * zoom
  const scaledHeight = blueprintHeight * zoom

  return {
    x: (canvasWidth - scaledWidth) / 2,
    y: (canvasHeight - scaledHeight) / 2,
    zoom,
  }
}

/**
 * Clamp zoom level to valid range
 */
export function clampZoom(zoom: number, min = 0.1, max = 5): number {
  return Math.max(min, Math.min(max, zoom))
}

/**
 * Zoom at a specific point (maintains that point's position)
 */
export function zoomAtPoint(
  viewport: Viewport,
  point: CanvasPoint,
  newZoom: number
): Viewport {
  const clampedZoom = clampZoom(newZoom)
  const zoomRatio = clampedZoom / viewport.zoom

  // Calculate new position to keep the point stable
  const newX = point.x - (point.x - viewport.x) * zoomRatio
  const newY = point.y - (point.y - viewport.y) * zoomRatio

  return {
    x: newX,
    y: newY,
    zoom: clampedZoom,
  }
}

/**
 * Check if a point is inside a rotated rectangle
 */
export function pointInRotatedRect(
  point: CanvasPoint,
  rect: { x: number; y: number; width: number; height: number; rotation: number }
): boolean {
  // Translate point to rectangle's local space
  const dx = point.x - rect.x
  const dy = point.y - rect.y

  // Rotate point by negative rotation angle
  const rad = (-rect.rotation * Math.PI) / 180
  const localX = dx * Math.cos(rad) - dy * Math.sin(rad)
  const localY = dx * Math.sin(rad) + dy * Math.cos(rad)

  // Check if point is within rectangle bounds
  const halfWidth = rect.width / 2
  const halfHeight = rect.height / 2

  return (
    localX >= -halfWidth &&
    localX <= halfWidth &&
    localY >= -halfHeight &&
    localY <= halfHeight
  )
}

/**
 * Get rectangle corners in world space
 */
export function getRotatedRectCorners(
  rect: { x: number; y: number; width: number; height: number; rotation: number }
): CanvasPoint[] {
  const halfWidth = rect.width / 2
  const halfHeight = rect.height / 2
  const rad = (rect.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ]

  return corners.map((corner) => ({
    x: rect.x + corner.x * cos - corner.y * sin,
    y: rect.y + corner.x * sin + corner.y * cos,
  }))
}

/**
 * Check if compartment is fully inside drawer bounds
 */
export function isCompartmentInDrawer(
  compartment: Omit<Compartment, '_id' | 'drawerId' | 'createdAt' | 'updatedAt' | 'zIndex'>,
  drawer: { width: number; height: number }
): boolean {
  const halfCompW = compartment.width / 2
  const halfCompH = compartment.height / 2
  const halfDrawW = drawer.width / 2
  const halfDrawH = drawer.height / 2

  // Simple AABB check (compartment centered at x,y in drawer's local space)
  return (
    compartment.x - halfCompW >= -halfDrawW &&
    compartment.x + halfCompW <= halfDrawW &&
    compartment.y - halfCompH >= -halfDrawH &&
    compartment.y + halfCompH <= halfDrawH
  )
}

/**
 * Get bounds that encompass all elements
 */
export function getElementsBounds(
  drawers: Drawer[],
  padding: number = 50
): CanvasBounds {
  if (drawers.length === 0) {
    return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const drawer of drawers) {
    const corners = getRotatedRectCorners(drawer)
    for (const corner of corners) {
      minX = Math.min(minX, corner.x)
      minY = Math.min(minY, corner.y)
      maxX = Math.max(maxX, corner.x)
      maxY = Math.max(maxY, corner.y)
    }
  }

  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  }
}
