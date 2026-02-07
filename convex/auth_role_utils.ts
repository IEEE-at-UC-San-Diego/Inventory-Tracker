export const ROLE_VALUES = [
	"Administrator",
	"Executive Officers",
	"General Officers",
	"Member",
] as const;

export type UserRole = (typeof ROLE_VALUES)[number];

export const ROLE_HIERARCHY: Record<UserRole, number> = {
	Member: 1,
	"General Officers": 2,
	"Executive Officers": 3,
	Administrator: 4,
};

const LEGACY_ROLE_MAP: Record<string, UserRole> = {
	Admin: "Administrator",
	Editor: "Executive Officers",
	Member: "General Officers",
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
