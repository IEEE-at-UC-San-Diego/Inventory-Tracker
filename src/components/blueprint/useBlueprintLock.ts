import { useCallback, useEffect, useState, useRef } from 'react'
import { useQuery, useMutation } from '@/integrations/convex/react-query'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { LockStatus } from '@/types'
import { useAuth } from '@/hooks/useAuth'

interface UseBlueprintLockOptions {
  blueprintId: Id<'blueprints'>
  canEdit: () => boolean
  onLockAcquired?: () => void
  onLockReleased?: () => void
  onLockLost?: () => void
}

interface UseBlueprintLockReturn {
  lockStatus: LockStatus | undefined
  isLocked: boolean
  isLockedByMe: boolean
  canAcquireLock: boolean
  acquireLock: () => Promise<void>
  releaseLock: () => Promise<void>
  forceReleaseLock: () => Promise<void>
  isLoading: boolean
}

// Lock expiration time in milliseconds (5 minutes)
const LOCK_EXPIRATION_MS = 5 * 60 * 1000
// Refresh interval to extend lock while editing (1 minute)
const LOCK_REFRESH_INTERVAL_MS = 60 * 1000

export function useBlueprintLock({
  blueprintId,
  canEdit,
  onLockAcquired,
  onLockReleased,
  onLockLost,
}: UseBlueprintLockOptions): UseBlueprintLockReturn {
  const { user, authContext, getFreshAuthContext } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  // Use a ref to avoid re-creating the interval when authContext changes
  const authContextRef = useRef(authContext)
  authContextRef.current = authContext

  // Subscribe to lock status
  const lockStatus = useQuery(api.blueprints.queries.getLockStatus, {
    authContext,
    blueprintId,
  })

  // Mutations
  const acquireLockMutation = useMutation(api.blueprints.mutations.acquireLock)
  const releaseLockMutation = useMutation(api.blueprints.mutations.releaseLock)
  const forceReleaseLockMutation = useMutation(api.blueprints.mutations.forceReleaseLock)

  const isLocked = lockStatus?.isLocked ?? false
  const isLockedByMe = isLocked && lockStatus?.lockedBy === user?._id
  const canAcquireLock = canEdit() && (!isLocked || isLockedByMe)

  // Auto-extend lock while editing
  useEffect(() => {
    if (!isLockedByMe) return

    const interval = setInterval(async () => {
      try {
        const context = await getFreshAuthContext() || authContextRef.current
        await acquireLockMutation({ authContext: context, blueprintId })
      } catch {
        // Lock lost - notify user
        onLockLost?.()
      }
    }, LOCK_REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [isLockedByMe, blueprintId, acquireLockMutation, onLockLost, getFreshAuthContext])

  // Watch for lock loss
  useEffect(() => {
    if (isLocked && !isLockedByMe && lockStatus?.lockedBy !== user?._id) {
      // Lock was taken by someone else or we lost it
      onLockLost?.()
    }
  }, [isLocked, isLockedByMe, lockStatus?.lockedBy, user?._id, onLockLost])

  const acquireLock = useCallback(async () => {
    if (!canEdit()) {
      throw new Error('You do not have permission to edit blueprints')
    }

    const context = await getFreshAuthContext() || authContextRef.current
    setIsLoading(true)
    try {
      const result = await acquireLockMutation({ authContext: context, blueprintId })
      if (result.success) {
        onLockAcquired?.()
      } else {
        throw new Error(result.message)
      }
    } finally {
      setIsLoading(false)
    }
  }, [canEdit, acquireLockMutation, blueprintId, onLockAcquired, getFreshAuthContext])

  const releaseLock = useCallback(async () => {
    const context = await getFreshAuthContext() || authContextRef.current
    setIsLoading(true)
    try {
      const result = await releaseLockMutation({ authContext: context, blueprintId })
      if (result.success) {
        onLockReleased?.()
      }
    } finally {
      setIsLoading(false)
    }
  }, [releaseLockMutation, blueprintId, onLockReleased, getFreshAuthContext])

  const forceReleaseLock = useCallback(async () => {
    const context = await getFreshAuthContext() || authContextRef.current
    setIsLoading(true)
    try {
      const result = await forceReleaseLockMutation({ authContext: context, blueprintId })
      if (result.success) {
        onLockReleased?.()
      }
    } finally {
      setIsLoading(false)
    }
  }, [forceReleaseLockMutation, blueprintId, onLockReleased, getFreshAuthContext])

  return {
    lockStatus,
    isLocked,
    isLockedByMe,
    canAcquireLock,
    acquireLock,
    releaseLock,
    forceReleaseLock,
    isLoading,
  }
}

/**
 * Format time remaining for display
 */
export function formatLockTimeRemaining(ms: number | undefined): string {
  if (ms === undefined) return ''
  if (ms <= 0) return 'Expired'

  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)

  if (minutes > 0) {
    return `${minutes}m ${seconds}s remaining`
  }
  return `${seconds}s remaining`
}
