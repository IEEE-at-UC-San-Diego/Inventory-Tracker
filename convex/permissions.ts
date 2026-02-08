import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { AuthContext } from "./types/auth";
import { getCurrentUser, type UserContext } from "./auth_helpers";
import { getCurrentOrgId } from "./organization_helpers";
import {
	ROLE_VALUES,
	ROLE_HIERARCHY,
	normalizeRole,
	type UserRole,
} from "./auth_role_utils";

// Re-export role utilities so consumers only need one import
export { ROLE_VALUES, ROLE_HIERARCHY, normalizeRole, type UserRole };

// ============================================
// Permission Definitions
// ============================================

/**
 * All permissions in the system.
 * Format: "resource:action"
 *
 * To change who can do what, edit ROLE_PERMISSIONS below.
 */
export const PERMISSIONS = {
	// ---- Blueprints ----
	"blueprints:view": "blueprints:view",
	"blueprints:create": "blueprints:create",
	"blueprints:update": "blueprints:update",
	"blueprints:delete": "blueprints:delete",
	"blueprints:lock": "blueprints:lock",
	"blueprints:unlock": "blueprints:unlock",

	// ---- Drawers ----
	"drawers:view": "drawers:view",
	"drawers:create": "drawers:create",
	"drawers:update": "drawers:update",
	"drawers:delete": "drawers:delete",

	// ---- Compartments ----
	"compartments:view": "compartments:view",
	"compartments:create": "compartments:create",
	"compartments:update": "compartments:update",
	"compartments:delete": "compartments:delete",

	// ---- Dividers ----
	"dividers:view": "dividers:view",
	"dividers:create": "dividers:create",
	"dividers:update": "dividers:update",
	"dividers:delete": "dividers:delete",

	// ---- Drawer Background Images ----
	"drawerBackgroundImages:view": "drawerBackgroundImages:view",
	"drawerBackgroundImages:create": "drawerBackgroundImages:create",
	"drawerBackgroundImages:update": "drawerBackgroundImages:update",
	"drawerBackgroundImages:delete": "drawerBackgroundImages:delete",

	// ---- Parts ----
	"parts:view": "parts:view",
	"parts:create": "parts:create",
	"parts:update": "parts:update",
	"parts:delete": "parts:delete",
	"parts:archive": "parts:archive",
	"parts:unarchive": "parts:unarchive",
	"parts:import": "parts:import",

	// ---- Inventory ----
	"inventory:view": "inventory:view",
	"inventory:add": "inventory:add",
	"inventory:remove": "inventory:remove",
	"inventory:move": "inventory:move",
	"inventory:adjust": "inventory:adjust",

	// ---- Transactions ----
	"transactions:view": "transactions:view",

	// ---- Blueprint Revisions ----
	"revisions:view": "revisions:view",
	"revisions:create": "revisions:create",
	"revisions:restore": "revisions:restore",

	// ---- Storage / File Uploads ----
	"storage:view": "storage:view",
	"storage:upload": "storage:upload",
	"storage:delete": "storage:delete",

	// ---- Organizations ----
	"organizations:view": "organizations:view",
	"organizations:update": "organizations:update",

	// ---- Users / Role Management ----
	"users:view": "users:view",
	"users:updateRole": "users:updateRole",
	"users:remove": "users:remove",

	// ---- UI-Level Permissions ----
	"ui:sidebar:admin": "ui:sidebar:admin",
	"ui:sidebar:navigation": "ui:sidebar:navigation",
	"ui:dashboard:stats": "ui:dashboard:stats",
	"ui:dashboard:recentActivity": "ui:dashboard:recentActivity",
	"ui:parts:editButton": "ui:parts:editButton",
	"ui:parts:deleteButton": "ui:parts:deleteButton",
	"ui:parts:importButton": "ui:parts:importButton",
	"ui:parts:exportButton": "ui:parts:exportButton",
	"ui:blueprints:editButton": "ui:blueprints:editButton",
	"ui:blueprints:deleteButton": "ui:blueprints:deleteButton",
	"ui:blueprints:createButton": "ui:blueprints:createButton",
	"ui:inventory:adjustButton": "ui:inventory:adjustButton",
	"ui:inventory:addButton": "ui:inventory:addButton",
	"ui:inventory:removeButton": "ui:inventory:removeButton",
	"ui:inventory:moveButton": "ui:inventory:moveButton",
	"ui:users:managePanel": "ui:users:managePanel",
	"ui:users:roleDropdown": "ui:users:roleDropdown",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ============================================
// Role → Permission Mapping
// ============================================

/**
 * Central mapping of which roles have which permissions.
 *
 * To change access for an entire role, edit the arrays below.
 * Roles inherit from lower roles via the helper — you only need to
 * list permissions explicitly granted at each level.
 */

const MEMBER_PERMISSIONS: Permission[] = [
	// View everything
	"blueprints:view",
	"drawers:view",
	"compartments:view",
	"dividers:view",
	"drawerBackgroundImages:view",
	"parts:view",
	"inventory:view",
	"transactions:view",
	"revisions:view",
	"storage:view",
	"organizations:view",
	"users:view",

	// UI: view-only access
	"ui:sidebar:navigation",
	"ui:dashboard:stats",
	"ui:dashboard:recentActivity",
	"ui:parts:exportButton",
];

const GENERAL_OFFICER_PERMISSIONS: Permission[] = [
	...MEMBER_PERMISSIONS,

	// Create / edit / delete content
	"blueprints:create",
	"blueprints:update",
	"blueprints:delete",
	"blueprints:lock",
	"blueprints:unlock",

	"drawers:create",
	"drawers:update",
	"drawers:delete",

	"compartments:create",
	"compartments:update",
	"compartments:delete",

	"dividers:create",
	"dividers:update",
	"dividers:delete",

	"drawerBackgroundImages:create",
	"drawerBackgroundImages:update",
	"drawerBackgroundImages:delete",

	"parts:create",
	"parts:update",
	"parts:delete",
	"parts:archive",
	"parts:unarchive",
	"parts:import",

	"inventory:add",
	"inventory:remove",
	"inventory:move",
	"inventory:adjust",

	"revisions:create",
	"revisions:restore",

	"storage:upload",
	"storage:delete",

	// UI: edit access
	"ui:parts:editButton",
	"ui:parts:deleteButton",
	"ui:parts:importButton",
	"ui:blueprints:editButton",
	"ui:blueprints:deleteButton",
	"ui:blueprints:createButton",
	"ui:inventory:adjustButton",
	"ui:inventory:addButton",
	"ui:inventory:removeButton",
	"ui:inventory:moveButton",
];

const EXECUTIVE_OFFICER_PERMISSIONS: Permission[] = [
	...GENERAL_OFFICER_PERMISSIONS,

	// Organization management
	"organizations:update",
];

const ADMINISTRATOR_PERMISSIONS: Permission[] = [
	...EXECUTIVE_OFFICER_PERMISSIONS,

	// User / role management
	"users:updateRole",
	"users:remove",

	// UI: admin panels
	"ui:sidebar:admin",
	"ui:users:managePanel",
	"ui:users:roleDropdown",
];

/**
 * Frozen permission sets per role.
 * Use `roleHasPermission()` or `requirePermission()` to check.
 */
export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
	Member: new Set(MEMBER_PERMISSIONS),
	"General Officers": new Set(GENERAL_OFFICER_PERMISSIONS),
	"Executive Officers": new Set(EXECUTIVE_OFFICER_PERMISSIONS),
	Administrator: new Set(ADMINISTRATOR_PERMISSIONS),
};

// ============================================
// Permission Check Helpers
// ============================================

/**
 * Check if a role has a specific permission.
 */
export function roleHasPermission(
	role: UserRole,
	permission: Permission,
): boolean {
	const perms = ROLE_PERMISSIONS[role];
	return perms ? perms.has(permission) : false;
}

/**
 * Get the minimum role required for a given permission.
 * Returns undefined if no role grants the permission.
 */
export function getRequiredRole(permission: Permission): UserRole | undefined {
	for (const roleName of ROLE_VALUES) {
		if (ROLE_PERMISSIONS[roleName].has(permission)) {
			return roleName;
		}
	}
	return undefined;
}

/**
 * Get all permissions for a role.
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
	const perms = ROLE_PERMISSIONS[role];
	return perms ? Array.from(perms) : [];
}

// ============================================
// Convex Mutation/Query Guards
// ============================================

/**
 * Require that the authenticated user has a specific permission.
 * Throws if the user lacks the permission.
 *
 * Usage in a Convex mutation/query:
 * ```ts
 * const userContext = await requirePermission(ctx, args.authContext, "blueprints:create")
 * ```
 */
export async function requirePermission(
	ctx: QueryCtx | MutationCtx,
	authContext: AuthContext,
	permission: Permission,
): Promise<UserContext> {
	const orgId = await getCurrentOrgId(ctx, authContext);
	const userContext = await getCurrentUser(ctx, authContext);

	if (userContext.user.orgId !== orgId) {
		throw new Error(
			`Forbidden: User does not have access to organization ${orgId}`,
		);
	}

	const role = normalizeRole(userContext.role);
	if (!roleHasPermission(role, permission)) {
		const requiredRole = getRequiredRole(permission);
		throw new Error(
			`Forbidden: Permission "${permission}" requires ${requiredRole || "unknown"} role or higher. Current role: ${role}`,
		);
	}

	return userContext;
}
