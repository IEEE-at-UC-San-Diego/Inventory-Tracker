import { Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import type { UserRole } from "@/types";

interface ProtectedRouteProps {
	children: React.ReactNode;
	requiredRole?: UserRole;
	requiredPermission?: string;
	fallback?: React.ReactNode;
	redirectTo?: string;
}

/**
 * Protected Route Component
 * Wraps routes to require authentication and optionally specific roles or permissions
 *
 * Usage:
 * <ProtectedRoute>
 *   <DashboardContent />
 * </ProtectedRoute>
 *
 * <ProtectedRoute requiredRole="General Officers">
 *   <EditorOnlyContent />
 * </ProtectedRoute>
 *
 * <ProtectedRoute requiredPermission="write:inventory">
 *   <WriteOnlyContent />
 * </ProtectedRoute>
 */
export function ProtectedRoute({
	children,
	requiredRole,
	requiredPermission,
	fallback,
	redirectTo = "/login",
}: ProtectedRouteProps) {
	const { isAuthenticated, isLoading, user, hasPermission } = useAuth();
	const { hasRole } = useRole();

	// Show loading state
	if (isLoading) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	// Not authenticated - redirect to login
	if (!isAuthenticated) {
		if (fallback) {
			return <>{fallback}</>;
		}
		return <Navigate to={redirectTo} />;
	}

	// Check role requirements (if specified)
	if (requiredRole && !hasRole(requiredRole)) {
		return (
			<div className="flex h-screen flex-col items-center justify-center p-4">
				<div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
					<h1 className="mb-2 text-2xl font-bold text-destructive">
						Access Denied
					</h1>
					<p className="mb-4 text-muted-foreground">
						You don't have permission to access this page. This area requires{" "}
						<strong>{requiredRole}</strong> privileges.
					</p>
					<p className="text-sm text-muted-foreground">
						Your current role: <strong>{user?.role || "Unknown"}</strong>
					</p>
					<div className="mt-6">
						<a
							href="/home"
							className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
						>
							Go to Dashboard
						</a>
					</div>
				</div>
			</div>
		);
	}

	// Check permission requirements (if specified)
	if (requiredPermission && !hasPermission(requiredPermission)) {
		return (
			<div className="flex h-screen flex-col items-center justify-center p-4">
				<div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
					<h1 className="mb-2 text-2xl font-bold text-destructive">
						Access Denied
					</h1>
					<p className="mb-4 text-muted-foreground">
						You don't have permission to access this page. This area requires{" "}
						<strong>{requiredPermission}</strong> permission.
					</p>
					<p className="text-sm text-muted-foreground">
						Your current permissions:{" "}
						<strong>{user?.scopes?.join(", ") || "None"}</strong>
					</p>
					<div className="mt-6">
						<a
							href="/home"
							className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
						>
							Go to Dashboard
						</a>
					</div>
				</div>
			</div>
		);
	}

	// All checks passed - render children
	return <>{children}</>;
}

/**
 * Permission-based component wrapper
 * Only renders children if user has the required permission
 */
interface PermissionGuardProps {
	children: React.ReactNode;
	requiredPermission: string;
	fallback?: React.ReactNode;
}

export function PermissionGuard({
	children,
	requiredPermission,
	fallback = null,
}: PermissionGuardProps) {
	const { hasPermission, isAuthenticated } = useAuth();

	if (!isAuthenticated || !hasPermission(requiredPermission)) {
		return <>{fallback}</>;
	}

	return <>{children}</>;
}

/**
 * Read permission guard (requires read:inventory scope)
 */
interface ReadPermissionProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

export function ReadPermission({
	children,
	fallback = null,
}: ReadPermissionProps) {
	return (
		<PermissionGuard requiredPermission="read:inventory" fallback={fallback}>
			{children}
		</PermissionGuard>
	);
}

/**
 * Write permission guard (requires write:inventory scope)
 */
interface WritePermissionProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

export function WritePermission({
	children,
	fallback = null,
}: WritePermissionProps) {
	return (
		<PermissionGuard requiredPermission="write:inventory" fallback={fallback}>
			{children}
		</PermissionGuard>
	);
}
interface RoleGuardProps {
	children: React.ReactNode;
	requiredRole: UserRole;
	fallback?: React.ReactNode;
}

export function RoleGuard({
	children,
	requiredRole,
	fallback = null,
}: RoleGuardProps) {
	const { hasRole, isAuthenticated } = useRole();

	if (!isAuthenticated || !hasRole(requiredRole)) {
		return <>{fallback}</>;
	}

	return <>{children}</>;
}

/**
 * Admin-only component wrapper
 */
interface AdminOnlyProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

export function AdminOnly({ children, fallback = null }: AdminOnlyProps) {
	return (
		<RoleGuard requiredRole="Administrator" fallback={fallback}>
			{children}
		</RoleGuard>
	);
}

/**
 * Editor-or-higher component wrapper
 */
interface EditorOnlyProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

export function EditorOnly({ children, fallback = null }: EditorOnlyProps) {
	return (
		<RoleGuard requiredRole="General Officers" fallback={fallback}>
			{children}
		</RoleGuard>
	);
}

/**
 * Member-or-higher component wrapper
 */
interface MemberOnlyProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

export function MemberOnly({ children, fallback = null }: MemberOnlyProps) {
	return (
		<RoleGuard requiredRole="Member" fallback={fallback}>
			{children}
		</RoleGuard>
	);
}

/**
 * Hook to check if current route should be accessible
 * Returns { canAccess, reason } where reason explains why access is denied
 */
export function useRouteProtection(requiredRole: UserRole = "Member"): {
	canAccess: boolean;
	reason: "loading" | "unauthenticated" | "unauthorized" | "ok";
	isLoading: boolean;
} {
	const { isAuthenticated, isLoading } = useAuth();
	const { hasRole } = useRole();

	if (isLoading) {
		return { canAccess: false, reason: "loading", isLoading: true };
	}

	if (!isAuthenticated) {
		return { canAccess: false, reason: "unauthenticated", isLoading: false };
	}

	if (!hasRole(requiredRole)) {
		return { canAccess: false, reason: "unauthorized", isLoading: false };
	}

	return { canAccess: true, reason: "ok", isLoading: false };
}
