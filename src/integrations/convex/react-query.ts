import {
  ConvexQueryClient,
  useConvexQuery,
  useConvexMutation,
  useConvexQueries,
  useConvexPaginatedQuery,
  useConvexAction,
  useConvex,
  useConvexAuth,
} from '@convex-dev/react-query'
import type { FunctionArgs, FunctionReference } from 'convex/server'

/** Convenience helper mirroring {@link useConvex} naming */
export const useConvexClient = () => useConvex()

export {
  ConvexQueryClient,
  useConvexQuery,
  useConvexMutation,
  useConvexQueries,
  useConvexPaginatedQuery,
  useConvexAction,
  useConvex,
  useConvexAuth,
}

type UseQueryOptions = {
  enabled?: boolean
}

export function useQuery<ConvexQueryReference extends FunctionReference<'query'>>(
  functionRef: ConvexQueryReference,
  args?: FunctionArgs<ConvexQueryReference>,
  options?: UseQueryOptions,
) {
  const isEnabled = options?.enabled ?? true

  if (!isEnabled) {
    return useConvexQuery(functionRef, 'skip' as 'skip')
  }

  if (args === undefined) {
    return useConvexQuery(functionRef)
  }

  return useConvexQuery(functionRef, args)
}

// Re-export remaining helpers for convenience
export const useMutation = useConvexMutation
export const useQueries = useConvexQueries
export const usePaginatedQuery = useConvexPaginatedQuery
export const useAction = useConvexAction