import type { User, UserRole } from "@/types";
import { hasMinimumRole } from "@/types";

const VALID_USER_ROLES: readonly UserRole[] = [
	"Administrator",
	"Member",
	"General Officer",
	"Executive Officer",
];

const LEGACY_ROLE_MAP: Record<string, UserRole> = {
	Admin: "Administrator",
	Editor: "Executive Officer",
	Viewer: "Member",
};

export function normalizeRole(role: string | null | undefined): UserRole {
	if (!role) return "Member";
	if (VALID_USER_ROLES.includes(role as UserRole)) {
		return role as UserRole;
	}
	return LEGACY_ROLE_MAP[role] || "Member";
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
	return hasMinimumRole(normalizedUserRole, role);
}

export function hasPermissionForUser(
	user: User | null,
	permission: string,
): boolean {
	if (!user || !user.scopes) {
		return false;
	}

	return user.scopes.includes(permission);
}
