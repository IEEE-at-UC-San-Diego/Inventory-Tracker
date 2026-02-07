import { useCallback } from "react";
import { useAuthContext } from "../lib/auth";
import type { UserRole } from "../types";
import { hasMinimumRole } from "../types";

/**
 * Hook to check user role permissions
 * Provides convenient methods for role-based and permission-based access control
 */
export function useRole() {
	const { user, isAuthenticated, hasPermission } = useAuthContext();

	/**
	 * Check if the current user has at least the specified role
	 */
	const hasRole = useCallback(
		(requiredRole: UserRole): boolean => {
			if (!isAuthenticated || !user) {
				return false;
			}
			return hasMinimumRole(user.role, requiredRole);
		},
		[isAuthenticated, user],
	);

	/**
	 * Check if user is an Administrator
	 */
	const isAdmin = useCallback((): boolean => {
		return hasRole("Administrator");
	}, [hasRole]);

	/**
	 * Check if user is at least a General Officer (Editor equivalent)
	 */
	const isEditor = useCallback((): boolean => {
		return hasRole("General Officers");
	}, [hasRole]);

	/**
	 * Check if user is a General Officer (or higher)
	 */
	const isMember = useCallback((): boolean => {
		return hasRole("General Officers");
	}, [hasRole]);

	/**
	 * Check if user is a Member (or higher)
	 */
	const isViewer = useCallback((): boolean => {
		return hasRole("Member");
	}, [hasRole]);

	/**
	 * Check if user can read inventory (has read:inventory permission)
	 */
	const canReadInventory = useCallback((): boolean => {
		return hasPermission("read:inventory");
	}, [hasPermission]);

	/**
	 * Check if user can write inventory (has write:inventory permission)
	 */
	const canWriteInventory = useCallback((): boolean => {
		return hasPermission("write:inventory");
	}, [hasPermission]);

	/**
	 * Check if user can edit content (General Officers or higher, or write:inventory permission)
	 */
	const canEdit = useCallback((): boolean => {
		return hasRole("General Officers") || hasPermission("write:inventory");
	}, [hasRole, hasPermission]);

	/**
	 * Check if user can manage users/settings (Administrator only)
	 */
	const canManage = useCallback((): boolean => {
		return hasRole("Administrator");
	}, [hasRole]);

	/**
	 * Get the current user's role
	 */
	const currentRole: UserRole | undefined = user?.role;

	return {
		hasRole,
		isAdmin,
		isEditor,
		isMember,
		isViewer,
		canReadInventory,
		canWriteInventory,
		canEdit,
		canManage,
		currentRole,
		isAuthenticated,
		user,
	};
}
