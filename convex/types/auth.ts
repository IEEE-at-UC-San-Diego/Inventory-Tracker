import { v } from 'convex/values'

/**
 * Authentication context passed to Convex queries/mutations
 * Created on frontend after Logto token verification
 */
export interface AuthContext {
  userId: string
  logtoUserId: string
  orgId?: string // Made optional since org support is removed
  role: UserRole
  timestamp: number
}

/**
 * Convex value schema for auth context
 * Used in query/mutation args
 */
export const authContextSchema = v.object({
  userId: v.string(),
  logtoUserId: v.string(),
  orgId: v.optional(v.string()), // Made optional since org support is removed
  role: v.union(v.literal('Administrator'), v.literal('Executive Officers'), v.literal('General Officers'), v.literal('Member')),
  timestamp: v.number(),
})

/**
 * Options for auth context validation
 */
export interface AuthValidationOptions {
  maxAge?: number // Maximum age of auth context in milliseconds (default: 5 minutes)
}

/**
 * User role types for permissions
 * Includes legacy roles for migration period
 */
export type UserRole = 'Administrator' | 'Executive Officers' | 'General Officers' | 'Member'
