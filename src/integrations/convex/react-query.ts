import {
	ConvexQueryClient,
	useConvex,
	useConvexAction,
	useConvexAuth,
	useConvexMutation,
	useConvexPaginatedQuery,
	useConvexQueries,
	useConvexQuery,
} from "@convex-dev/react-query";
import type { FunctionArgs, FunctionReference } from "convex/server";
import type { OptionalRestArgsOrSkip } from "convex/react";

/** Convenience helper mirroring {@link useConvex} naming */
export const useConvexClient = () => useConvex();

export {
	ConvexQueryClient,
	useConvexQuery,
	useConvexMutation,
	useConvexQueries,
	useConvexPaginatedQuery,
	useConvexAction,
	useConvex,
	useConvexAuth,
};

type UseQueryOptions = {
	enabled?: boolean;
};

export function useQuery<
	ConvexQueryReference extends FunctionReference<"query">,
>(
	functionRef: ConvexQueryReference,
	args?: FunctionArgs<ConvexQueryReference>,
	options?: UseQueryOptions,
) {
	const isEnabled = options?.enabled ?? true;
	const queryArgs = (!isEnabled || args === undefined
		? ["skip"]
		: [args]) as OptionalRestArgsOrSkip<ConvexQueryReference>;

	return useConvexQuery(functionRef, ...queryArgs);
}

// Re-export remaining helpers for convenience
export const useMutation = useConvexMutation;
export const useQueries = useConvexQueries;
export const usePaginatedQuery = useConvexPaginatedQuery;
export const useAction = useConvexAction;
