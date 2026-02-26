export const ROLE_VALUES = [
	"Administrator",
	"Executive Officer",
	"General Officer",
	"Member",
] as const;

export type UserRole = (typeof ROLE_VALUES)[number];

export const ROLE_HIERARCHY: Record<UserRole, number> = {
	Member: 1,
	"General Officer": 2,
	"Executive Officer": 3,
	Administrator: 4,
};

const LEGACY_ROLE_MAP: Record<string, UserRole> = {
	Admin: "Administrator",
	Editor: "Executive Officer",
	Member: "General Officer",
	Viewer: "Member",
};

export function normalizeRole(role?: string | null): UserRole {
	if (role && ROLE_VALUES.includes(role as UserRole)) {
		return role as UserRole;
	}
	if (role && LEGACY_ROLE_MAP[role]) {
		return LEGACY_ROLE_MAP[role];
	}
	return "Member";
}
