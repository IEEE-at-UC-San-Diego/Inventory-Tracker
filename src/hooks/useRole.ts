import { useCallback } from 'react'
import type { UserRole } from '@/types'
import { hasMinimumRole } from '@/types'
import { useAuth } from './useAuth'

/**
 * Hook for role-based permission checking
 * Provides utilities for checking user roles and permissions
 */
export function useRole() {
  const { user, hasRole: authHasRole, isAuthenticated } = useAuth()

  /**
   * Check if current user has at least the specified role
   */
  const hasRole = useCallback(
    (role: UserRole): boolean => {
      return authHasRole(role)
    },
    [authHasRole]
  )

  /**
   * Check if user is an Administrator
   */
  const isAdmin = useCallback((): boolean => {
    return hasRole('Administrator')
  }, [hasRole])

  /**
   * Check if user is at least an Executive Officer
   */
  const isEditor = useCallback((): boolean => {
    return hasRole('Executive Officers')
  }, [hasRole])

  /**
   * Check if user is a General Officer (or higher)
   * General Officers can check in/out and view inventory
   */
  const isMember = useCallback((): boolean => {
    return hasRole('General Officers')
  }, [hasRole])

  /**
   * Check if user is a Member (or higher)
   * This is essentially a logged-in check
   */
  const isViewer = useCallback((): boolean => {
    return hasRole('Member')
  }, [hasRole])

  /**
   * Check if user can check items in/out (General Officers or higher)
   */
  const canCheckInOut = useCallback((): boolean => {
    return hasRole('General Officers')
  }, [hasRole])

  /**
   * Check if user can edit content (Executive Officers or higher)
   */
  const canEdit = useCallback((): boolean => {
    return hasRole('Executive Officers')
  }, [hasRole])

  /**
   * Check if user can manage users/settings (Administrator only)
   */
  const canManage = useCallback((): boolean => {
    return hasRole('Administrator')
  }, [hasRole])

  /**
   * Check if user can view content (all authenticated users)
   */
  const canView = useCallback((): boolean => {
    return isAuthenticated
  }, [isAuthenticated])

  /**
   * Get the current user's role
   */
  const getCurrentRole = useCallback((): UserRole | null => {
    return user?.role || null
  }, [user])

  /**
   * Compare two roles
   * Returns true if userRole >= requiredRole
   */
  const compareRoles = useCallback(
    (userRole: UserRole, requiredRole: UserRole): boolean => {
      return hasMinimumRole(userRole, requiredRole)
    },
    []
  )

  return {
    userRole: user?.role || null,
    isAuthenticated,
    hasRole,
    isAdmin,
    isEditor,
    isMember,
    isViewer,
    canCheckInOut,
    canEdit,
    canManage,
    canView,
    getCurrentRole,
    compareRoles,
  }
}

/**
 * Hook that returns a function to conditionally render based on role
 * Usage: const showIfAdmin = useRoleConditional(); return showIfAdmin(() => <AdminButton />)
 */
export function useRoleConditional() {
  const { hasRole } = useRole()

  return useCallback(
    <T,>(renderFn: () => T, requiredRole: UserRole = 'Member'): T | null => {
      if (hasRole(requiredRole)) {
        return renderFn()
      }
      return null
    },
    [hasRole]
  )
}

/**
 * Higher-order hook for protecting component rendering
 * Returns the children only if the user has the required role
 */
export function useProtectedRender(requiredRole: UserRole = 'Member') {
  const { hasRole } = useRole()

  return useCallback(
    (children: React.ReactNode): React.ReactNode | null => {
      return hasRole(requiredRole) ? children : null
    },
    [hasRole, requiredRole]
  )
}
