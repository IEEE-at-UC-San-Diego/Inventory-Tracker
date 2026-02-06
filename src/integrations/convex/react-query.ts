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

	// If args are missing, we must not execute the query because Convex will treat it
	// as `{}` and required args (like `authContext`) will fail validation.
	// Callers that truly have a no-args query should pass `{}` explicitly.
	if (!isEnabled || args === undefined) {
		return useConvexQuery(
			functionRef,
			...(["skip"] as OptionalRestArgsOrSkip<ConvexQueryReference>),
		);
	}

	return useConvexQuery(
		functionRef,
		...([args] as OptionalRestArgsOrSkip<ConvexQueryReference>),
	);
}

// Re-export remaining helpers for convenience
export const useMutation = useConvexMutation;
export const useQueries = useConvexQueries;
export const usePaginatedQuery = useConvexPaginatedQuery;
export const useAction = useConvexAction;
