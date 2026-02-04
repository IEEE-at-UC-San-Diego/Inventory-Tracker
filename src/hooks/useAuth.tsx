import { useState, useEffect, useCallback, useMemo, useContext, useRef } from 'react'
import { useLogto, LogtoProvider, LogtoRequestError } from '@logto/react'
import type { User, UserRole } from '@/types'
import { hasMinimumRole } from '@/types'
import type { AuthContext as AuthContextType } from '@/types/auth'
import {
  AuthReactContext,
  type AuthContextValue,
  type LogtoUserInfo,
  type LogtoTokenClaims,
  logtoAuthConfig,
  getConvexUser,
  setConvexUser,
  clearConvexUser,
  getAuthContext,
  setAuthContext,
  clearAuthContext,
  verifyLogtoToken,
  getTokenExpiresAt,
  setTokenExpiresAt,
  clearTokenExpiresAt,
  AUTH_UPDATED_EVENT,
} from '../lib/auth'

/**
 * Logto Auth Provider
 * Wraps the LogtoProvider and provides our own AuthContext
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [logtoUser, setLogtoUser] = useState<LogtoUserInfo | null>(null)
  const [authContext, setAuthContextState] = useState<AuthContextType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasAuthFailed, setHasAuthFailed] = useState(false)

  const AUTH_CONTEXT_REFRESH_THRESHOLD_MINUTES = 5

  // Define the API resource identifier (must match LogtoAuthProvider config)
  const apiResource = import.meta.env.VITE_LOGTO_API_RESOURCE || 'urn:inventory-tracker:api'

  // Role mapping for legacy role names during transition
  const normalizeRole = useCallback((role: string | null | undefined): UserRole => {
    if (!role) return 'Member'
    
    // Map legacy roles to new roles
    const roleMap: Record<string, UserRole> = {
      'Admin': 'Administrator',
      'Editor': 'Executive Officers',
      'Viewer': 'Member',
      // Note: Member is already a valid new role, no mapping needed
    }
    
    // Return mapped role or original if it's already a new role
    return roleMap[role] || role as UserRole
  }, [])

  const {
    isAuthenticated: logtoAuthenticated,
    isLoading: logtoLoading,
    getAccessToken,
    getIdTokenClaims,
    fetchUserInfo,
    signOut,
  } = useLogto()

  const hasInitializedRef = useRef(false)
  const hasHydratedFromLogtoRef = useRef(false)
  const logtoFunctionsRef = useRef({ getAccessToken, getIdTokenClaims, fetchUserInfo, signOut })
  logtoFunctionsRef.current = { getAccessToken, getIdTokenClaims, fetchUserInfo, signOut }

  const forceLogoutDueToInvalidContext = useCallback(
    async (message: string) => {
      console.log('[useAuth]', message)
      setHasAuthFailed(true)
      setError('Session expired. Please sign in again.')
      clearConvexUser()
      clearAuthContext()
      clearTokenExpiresAt()
      setUser(null)
      setLogtoUser(null)
      setAuthContextState(null)
      await logtoFunctionsRef.current.signOut()
    },
    []
  )

  /**
   * Verify and refresh auth context if stale
   * Returns fresh auth context from the API
   */
  const verifyAndRefreshAuthContext = useCallback(
    async (accessToken: string, currentLogtoUser: LogtoUserInfo | null): Promise<{ success: boolean; authContext?: AuthContextType; error?: string }> => {
      console.log('[useAuth] verifyAndRefreshAuthContext called with accessToken length:', accessToken?.length)

      try {
        console.log('[useAuth] Calling verifyLogtoToken API...')
        const result = await verifyLogtoToken(accessToken, {} as LogtoTokenClaims, currentLogtoUser || ({} as LogtoUserInfo))

        console.log('[useAuth] Token verification result:', {
          success: result.success,
          hasAuthContext: !!result.authContext,
          hasUser: !!result.user,
          hasTokenExpiresAt: !!result.tokenExpiresAt,
          authContext: result.authContext ? { ...result.authContext, role: result.authContext.role } : null,
          user: result.user ? { ...result.user, role: result.user.role } : null,
          tokenExpiresAt: result.tokenExpiresAt,
        })

        if (result.success && result.authContext) {
          console.log('[useAuth] ✓ Token verification SUCCESS! Setting auth context from result')
          setAuthContextState(result.authContext)
          setAuthContext(result.authContext)

          if (result.tokenExpiresAt) {
            console.log('[useAuth] Setting token expiration from result')
            setTokenExpiresAt(result.tokenExpiresAt)
          }

          if (result.user) {
            console.log('[useAuth] Setting user from token verification:', result.user)
            setUser(result.user)
            setConvexUser(result.user)
          } else {
            console.log('[useAuth] No user data in token verification result')
          }

          return { success: true, authContext: result.authContext }
        } else {
          console.log('[useAuth] Token verification failed or missing data:', {
            success: result.success,
            hasAuthContext: !!result.authContext,
            hasUser: !!result.user,
            hasTokenExpiresAt: !!result.tokenExpiresAt,
            error: result.error,
          })
          return { success: false, error: result.error || 'Failed to refresh auth context' }
        }
      } catch (err) {
        console.error('[useAuth] Error in verifyAndRefreshAuthContext:', err)
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        setError(errorMsg)
        return { success: false, error: errorMsg }
      }
    },
    []
  )

  /**
   * Get current auth context, refreshing if stale
   */
  const getFreshAuthContext = useCallback(
    async (): Promise<AuthContextType | null> => {
      // If not authenticated, no auth context
      if (!logtoAuthenticated) return null

      // Try to get fresh access token from Logto (passing resource to get JWT)
      try {
        const accessToken = await logtoFunctionsRef.current.getAccessToken(apiResource)
        if (!accessToken) return null

        // Verify and refresh auth context
        const result = await verifyAndRefreshAuthContext(accessToken, logtoUser)
        return result.authContext || null
      } catch {
        return null
      }
    },
    [logtoAuthenticated, apiResource, logtoUser, verifyAndRefreshAuthContext]
  )

  // Initialize auth state from storage on first mount
  useEffect(() => {
    if (hasInitializedRef.current) return

    const initAuthFromStorage = async () => {
      try {
        const storedUser = getConvexUser()
        if (storedUser) {
          setUser(storedUser)
        }

        const storedAuthContext = getAuthContext()
        if (storedAuthContext) {
          const ageMinutes = (Date.now() - storedAuthContext.timestamp) / 60000
          console.log('[useAuth] Restoring auth context:', {
            userId: storedAuthContext.userId,
            timestamp: new Date(storedAuthContext.timestamp).toISOString(),
            age: `${Math.round(ageMinutes)} minutes old`,
          })
          setAuthContextState(storedAuthContext)
        } else {
          console.log('[useAuth] No valid auth context found (expired or missing)')
          setAuthContextState(null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize auth')
      } finally {
        hasInitializedRef.current = true
        setIsLoading(false)
      }
    }

    initAuthFromStorage()
  }, [])

  // Hydrate from Logto whenever authentication becomes available
  useEffect(() => {
    if (!logtoAuthenticated) {
      hasHydratedFromLogtoRef.current = false
      return
    }

    if (logtoLoading || hasAuthFailed) {
      return
    }

    if (hasHydratedFromLogtoRef.current) {
      return
    }

    let cancelled = false

    const hydrateFromLogto = async () => {
      console.log('[useAuth] hydrateFromLogto STARTING. hasHydratedFromLogtoRef:', hasHydratedFromLogtoRef.current)
      setIsLoading(true)

      try {
        const storedUser = getConvexUser()
        console.log('[useAuth] hydrateFromLogto - storedUser from localStorage:', storedUser ? { _id: storedUser._id, role: storedUser.role } : null)
        if (storedUser && !cancelled) {
          setUser(storedUser)
        }

        const storedAuthContext = getAuthContext()
        console.log('[useAuth] hydrateFromLogto - storedAuthContext from localStorage:', storedAuthContext)
        if (storedAuthContext && !cancelled) {
          const ageMinutes = (Date.now() - storedAuthContext.timestamp) / 60000
          console.log('[useAuth] Local auth context age:', {
            minutes: ageMinutes.toFixed(2),
            refreshThreshold: AUTH_CONTEXT_REFRESH_THRESHOLD_MINUTES,
          })
          setAuthContextState(storedAuthContext)
        }

        let userInfo: LogtoUserInfo | null = null
        try {
          userInfo = (await logtoFunctionsRef.current.fetchUserInfo()) as LogtoUserInfo
          if (!cancelled) {
            setLogtoUser(userInfo)
          }
        } catch (err) {
          if (err instanceof LogtoRequestError) {
            console.log('[useAuth] Invalid user info token, clearing stale session:', err.message)
            if (typeof window !== 'undefined') {
              Object.keys(localStorage).forEach((key) => {
                if (key.startsWith('logto:')) {
                  localStorage.removeItem(key)
                }
              })
            }
            await forceLogoutDueToInvalidContext('[useAuth] Cleared stale session after invalid user info token')
            return
          }
          throw err
        }

        let accessToken: string | undefined
        try {
          accessToken = await logtoFunctionsRef.current.getAccessToken(apiResource)
        } catch (err) {
          if (err instanceof LogtoRequestError) {
            console.log('[useAuth] Invalid access token, clearing stale session:', err.message)
            if (typeof window !== 'undefined') {
              Object.keys(localStorage).forEach((key) => {
                if (key.startsWith('logto:')) {
                  localStorage.removeItem(key)
                }
              })
            }
            await forceLogoutDueToInvalidContext('[useAuth] Cleared stale session after invalid access token')
            return
          }
          throw err
        }

        if (!accessToken) {
          console.log('[useAuth] hydrateFromLogto - Missing access token, calling forceLogout')
          await forceLogoutDueToInvalidContext('[useAuth] Missing access token after Logto auth - signing out')
          return
        }

        console.log('[useAuth] hydrateFromLogto - Calling verifyAndRefreshAuthContext with accessToken...')
        const result = await verifyAndRefreshAuthContext(accessToken, userInfo)
        console.log('[useAuth] hydrateFromLogto - verifyAndRefreshAuthContext result:', { success: result.success, error: result.error })
        if (!result.success) {
          console.log('[useAuth] hydrateFromLogto - verifyAndRefreshAuthContext FAILED, calling forceLogout')
          await forceLogoutDueToInvalidContext(
            `[useAuth] ${result.error || 'Failed to refresh auth context'} - signing out`
          )
        } else {
          console.log('[useAuth] hydrateFromLogto - verifyAndRefreshAuthContext SUCCEEDED')
        }
      } catch (err) {
        console.log('[useAuth] hydrateFromLogto - EXCEPTION:', err)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to hydrate auth')
        }
      } finally {
        if (!cancelled) {
          console.log('[useAuth] hydrateFromLogto - FINALLY block. hasHydratedFromLogtoRef was:', hasHydratedFromLogtoRef.current)
          setIsLoading(false)
          hasHydratedFromLogtoRef.current = true
          console.log('[useAuth] hydrateFromLogto - COMPLETED. hasHydratedFromLogtoRef is now:', hasHydratedFromLogtoRef.current)
        }
      }
    }

    hydrateFromLogto()

    return () => {
      cancelled = true
    }
  }, [
    logtoAuthenticated,
    logtoLoading,
    hasAuthFailed,
    apiResource,
    forceLogoutDueToInvalidContext,
    // remove verifyAndRefreshAuthContext from deps - it has empty deps and stays stable
  ])

  /**
   * Reset auth failed flag when Logto auth state changes to authenticated
   * This allows retry after successful re-login
   */
  useEffect(() => {
    if (logtoAuthenticated && hasAuthFailed) {
      setHasAuthFailed(false)
    }
  }, [logtoAuthenticated, hasAuthFailed])

  /**
   * Check token expiration and auto sign-out if expired
   */
  useEffect(() => {
    // Only check if authenticated and not loading
    if (!logtoAuthenticated || logtoLoading) {
      return
    }

    const checkTokenExpiration = () => {
      const tokenExpiresAt = getTokenExpiresAt()
      if (!tokenExpiresAt) {
        // No expiration time stored, skip check
        return
      }

      const now = Date.now()
      const isExpired = now >= tokenExpiresAt

      console.log('[useAuth] Token expiration check:', {
        tokenExpiresAt: new Date(tokenExpiresAt).toISOString(),
        now: new Date(now).toISOString(),
        isExpired,
        expiresInMs: tokenExpiresAt - now,
      })

      if (isExpired) {
        console.log('[useAuth] Token expired, signing out...')
        forceLogoutDueToInvalidContext('[useAuth] Token expired - signing out')
      }
    }

    // Check immediately on mount
    checkTokenExpiration()

    // Set up periodic check every minute
    const intervalId = setInterval(() => {
      checkTokenExpiration()
    }, 60 * 1000) // Check every minute

    return () => clearInterval(intervalId)
  }, [logtoAuthenticated, logtoLoading, forceLogoutDueToInvalidContext])

  /**
   * Listen for auth context update events and re-read localStorage
   * This fixes the race condition where callback writes to localStorage
   * but AuthProvider doesn't re-read it due to hasInitializedRef guard
   */
  useEffect(() => {
    const handleAuthUpdated = () => {
      console.log('[useAuth] AUTH_UPDATED_EVENT fired! hasHydratedFromLogtoRef:', hasHydratedFromLogtoRef.current)
      console.log('[useAuth] Re-reading localStorage...')
      const storedUser = getConvexUser()
      const storedAuthContext = getAuthContext()

      console.log('[useAuth] Re-read from localStorage:', {
        user: storedUser ? { _id: storedUser._id, role: storedUser.role } : null,
        authContext: storedAuthContext,
      })

      if (storedUser) {
        console.log('[useAuth] Setting user from event listener:', storedUser._id)
        setUser(storedUser)
      }
      if (storedAuthContext) {
        console.log('[useAuth] Setting authContext from event listener:', storedAuthContext.userId)
        setAuthContextState(storedAuthContext)
      }
    }

    window.addEventListener(AUTH_UPDATED_EVENT, handleAuthUpdated)

    return () => {
      window.removeEventListener(AUTH_UPDATED_EVENT, handleAuthUpdated)
    }
  }, [])

  /**
   * Check if user has at least the specified role
   */
  const hasRole = useCallback(
    (role: UserRole): boolean => {
      if (!user) {
        console.log('[useAuth] hasRole: user is null, returning false')
        return false
      }
      const normalizedUserRole = normalizeRole(user.role)
      console.log('[useAuth] hasRole:', { userRole: user.role, normalizedUserRole, requiredRole: role })
      return hasMinimumRole(normalizedUserRole, role)
    },
    [user, normalizeRole]
  )

  /**
   * Check if user has the specified permission (scope)
   */
  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user || !user.scopes) {
        console.log('[useAuth] hasPermission: no scopes available, returning false')
        return false
      }
      
      const hasScope = user.scopes.includes(permission)
      console.log('[useAuth] hasPermission:', { permission, hasScope, availableScopes: user.scopes })
      return hasScope
    },
    [user]
  )

  /**
   * Sign out from both Logto and our app
   */
  const signOutWithCleanup = useCallback(async () => {
    try {
      // Clear our local storage
      clearConvexUser()
      clearAuthContext()
      clearTokenExpiresAt()
      setUser(null)
      setLogtoUser(null)
      setAuthContextState(null)
      setError(null)

      // Sign out from Logto
      await signOut()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign out failed')
    }
  }, [signOut])

  /**
   * Force refresh auth context by clearing cache and re-verifying token
   */
  const forceRefreshAuthContext = useCallback(async (): Promise<void> => {
    console.log('[useAuth] Forcing auth context refresh...')

    // Clear cached auth context, user, and token expiration
    clearAuthContext()
    clearConvexUser()
    clearTokenExpiresAt()
    setAuthContextState(null)
    setUser(null)

    // If authenticated, re-verify token to get fresh context
    if (logtoAuthenticated && !logtoLoading) {
      const { getAccessToken, getIdTokenClaims } = logtoFunctionsRef.current
      try {
        const accessToken = await getAccessToken(apiResource)
        const idTokenClaims = await getIdTokenClaims()

        if (accessToken && idTokenClaims && logtoUser) {
          const result = await verifyLogtoToken(
            accessToken,
            idTokenClaims as unknown as LogtoTokenClaims,
            logtoUser
          )

          if (result.success && result.authContext && result.user) {
            console.log('[useAuth] Auth context refreshed successfully')
            setAuthContextState(result.authContext)
            setUser(result.user)

            // Store token expiration if provided
            if (result.tokenExpiresAt) {
              setTokenExpiresAt(result.tokenExpiresAt)
            }
          }
        }
      } catch (error) {
        console.error('[useAuth] Failed to refresh auth context:', error)
        setError(error instanceof Error ? error.message : 'Failed to refresh auth context')
      }
    }
  }, [logtoAuthenticated, logtoLoading, logtoUser, apiResource])

  const value = useMemo(() => {
    const appIsAuthenticated = Boolean(user && authContext)
    const combinedLoading = isLoading || (logtoLoading && !appIsAuthenticated)

    console.log('[useAuth] Auth context state:', {
      user: user ? { ...user, role: user.role } : null,
      authContext,
      isAuthenticated: appIsAuthenticated,
      logtoAuthenticated,
      isLoading: combinedLoading,
    })

    return {
      user,
      logtoUser,
      authContext,
      isAuthenticated: appIsAuthenticated,
      isLoading: combinedLoading,
      error,
      hasRole,
      hasPermission,
      signOut: signOutWithCleanup,
      getFreshAuthContext,
      forceRefreshAuthContext,
    }
  }, [
    user,
    logtoUser,
    authContext,
    logtoAuthenticated,
    isLoading,
    logtoLoading,
    error,
    hasRole,
    signOutWithCleanup,
    getFreshAuthContext,
  ])

  return <AuthReactContext.Provider value={value}>{children}</AuthReactContext.Provider>
}

/**
 * Logto-only Provider Wrapper
 * This should be used at the root of the app
 */
export function LogtoAuthProvider({ children }: { children: React.ReactNode }) {
  // Use consistent redirect URI from env var to avoid invalid_grant errors during token refresh
  // The redirect_uri must match exactly between sign-in and refresh token requests
  const callbackUrl = `${import.meta.env.VITE_SITE_URL || 'http://localhost:3000'}/callback`

  // Define the API resource identifier for JWT access tokens
  // This must match a resource configured in your Logto Console
  const apiResource = import.meta.env.VITE_LOGTO_API_RESOURCE || 'urn:inventory-tracker:api'

  // DEBUG: Log the redirect URI being sent
  console.log('[LogtoAuth] Redirect URI:', callbackUrl)
  console.log('[LogtoAuth] VITE_SITE_URL:', import.meta.env.VITE_SITE_URL)
  console.log('[LogtoAuth] API Resource:', apiResource)

  const config = {
    ...logtoAuthConfig,
    redirectUri: callbackUrl,
    scopes: import.meta.env.VITE_LOGTO_SCOPES?.split(',') || [
      'openid',
      'profile',
      'email',
      'offline_access',
    ],
    resources: [apiResource], // Configure API resource for JWT access tokens
  }

  return <LogtoProvider config={config}>{children}</LogtoProvider>
}

/**
 * Hook to access auth context
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthReactContext)

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}

// Re-export types
export type { AuthContextValue, LogtoUserInfo, LogtoTokenClaims }
