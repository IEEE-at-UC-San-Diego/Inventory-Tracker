import type { User, UserRole } from "@/types";
import { hasMinimumRole } from "@/types";

const LEGACY_ROLE_MAP: Record<string, UserRole> = {
	Admin: "Administrator",
	Editor: "Executive Officers",
	Viewer: "Member",
};

export function normalizeRole(role: string | null | undefined): UserRole {
	if (!role) return "Member";
	return LEGACY_ROLE_MAP[role] || (role as UserRole);
}

export function isLogtoRequestErrorLike(err: unknown): boolean {
	if (!err || typeof err !== "object") return false;

	const record = err as Record<string, unknown>;
	const name = typeof record.name === "string" ? record.name : undefined;
	const code = typeof record.code === "string" ? record.code : undefined;
	const error = typeof record.error === "string" ? record.error : undefined;

	return (
		name === "LogtoRequestError" ||
		code?.startsWith("oidc.") === true ||
		error === "invalid_grant"
	);
}

export function clearLogtoStorage(): void {
	if (typeof window === "undefined") return;

	Object.keys(localStorage).forEach((key) => {
		if (key.startsWith("logto:")) {
			localStorage.removeItem(key);
		}
	});
}

export function hasRoleForUser(user: User | null, role: UserRole): boolean {
	if (!user) {
		return false;
	}
	const normalizedUserRole = normalizeRole(user.role);
	console.log("[useAuth] hasRole:", {
		userRole: user.role,
		normalizedUserRole,
		requiredRole: role,
	});
	return hasMinimumRole(normalizedUserRole, role);
}

export function hasPermissionForUser(
	user: User | null,
	permission: string,
): boolean {
	if (!user || !user.scopes) {
		console.log(
			"[useAuth] hasPermission: no scopes available, returning false",
		);
		return false;
	}

	const hasScope = user.scopes.includes(permission);
	console.log("[useAuth] hasPermission:", {
		permission,
		hasScope,
		availableScopes: user.scopes,
	});
	return hasScope;
}
