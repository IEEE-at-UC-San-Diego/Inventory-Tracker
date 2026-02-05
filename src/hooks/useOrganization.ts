import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@/integrations/convex/react-query";
import type { Organization } from "@/types";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useAuth } from "./useAuth";

/**
 * Hook to manage organization context
 * Provides current organization and organization switching
 */
export function useOrganization() {
	const {
		user,
		isAuthenticated,
		authContext,
		isLoading: isAuthLoading,
	} = useAuth();
	const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);

	// Fetch organization details if we have a user
	const orgId = user?.orgId;
	const orgData = useQuery(
		api.organizations.queries.get,
		authContext && orgId
			? { authContext, id: orgId as Id<"organizations"> }
			: undefined,
		{ enabled: !!authContext && !!orgId },
	);

	const isLoading = isAuthLoading || (orgId && orgData === undefined);

	// Update current org when data changes
	useEffect(() => {
		if (orgData) {
			setCurrentOrg({
				_id: orgData._id,
				name: orgData.name,
				slug: orgData.slug,
				createdAt: orgData._creationTime,
			});
		} else if (!orgId) {
			setCurrentOrg(null);
		}
	}, [orgData, orgId]);

	/**
	 * Switch to a different organization
	 * Note: In production, this would involve updating the user's org in Better Auth
	 * and re-syncing with Convex
	 */
	const switchOrganization = useCallback(
		async (
			_newOrgId: string,
		): Promise<{ success: boolean; error?: string }> => {
			if (!isAuthenticated) {
				return { success: false, error: "Not authenticated" };
			}

			try {
				// In a real implementation, this would:
				// 1. Call an API to update the user's organization
				// 2. Re-verify with Better Auth
				// 3. Refresh the auth context

				// For now, we'll just update local state
				// This would require a page reload or auth refresh in production
				window.location.reload();
				return { success: true };
			} catch (err) {
				return {
					success: false,
					error:
						err instanceof Error
							? err.message
							: "Failed to switch organization",
				};
			}
		},
		[isAuthenticated],
	);

	return {
		organization: currentOrg,
		orgId,
		isLoading,
		isAuthenticated,
		switchOrganization,
	};
}

/**
 * Hook to list all organizations the user belongs to
 */
export function useOrganizations() {
	const { user, isAuthenticated, authContext } = useAuth();

	// In a real implementation, this would fetch all orgs the user belongs to
	// For now, we just return the current org
	const currentOrg = useQuery(
		api.organizations.queries.get,
		authContext && user?.orgId
			? { authContext, id: user.orgId as Id<"organizations"> }
			: undefined,
		{ enabled: !!authContext && !!user?.orgId },
	);

	const organizations = currentOrg ? [currentOrg] : [];
	const isLoading = isAuthenticated && currentOrg === undefined;

	return {
		organizations,
		isLoading,
		currentOrgId: user?.orgId,
	};
}
