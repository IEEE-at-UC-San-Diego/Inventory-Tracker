import type { LogtoConfig } from "@logto/react";
import { createContext, useContext } from "react";
import type { User, UserRole } from "@/types";
import type { AuthContext } from "@/types/auth";

/**
 * Logto Authentication Configuration
 * Using Logto as the primary authentication provider
 */

// Logto configuration from environment variables
const LOGTO_ENDPOINT =
	import.meta.env.VITE_LOGTO_ENDPOINT ||
	"https://your-logto-endpoint.logto.app";
const LOGTO_APP_ID = import.meta.env.VITE_LOGTO_APP_ID || "your-app-id";

export interface LogtoAuthConfig extends LogtoConfig {
	endpoint: string;
	appId: string;
}

export const logtoAuthConfig: LogtoAuthConfig = {
	endpoint: LOGTO_ENDPOINT,
	appId: LOGTO_APP_ID,
	// Redirect URI will be set dynamically based on the callback route
	// resource: import.meta.env.VITE_LOGTO_RESOURCE, // Optional: API resource identifier
};

/**
 * Logto user info structure
 * Based on OpenID Connect UserInfo response
 */
export interface LogtoUserInfo {
	sub: string; // Subject (unique user ID from Logto)
	email?: string;
	name?: string;
	picture?: string;
	email_verified?: boolean;
	roles?: string[]; // Custom claims for roles
	organization_id?: string; // Custom claim for organization ID
	username?: string;
	given_name?: string;
	family_name?: string;
	middle_name?: string;
	nickname?: string;
	preferred_username?: string;
	profile?: string;
	website?: string;
	gender?: string;
	birthdate?: string;
	zoneinfo?: string;
	locale?: string;
	updated_at?: number;
	phone_number?: string;
	phone_number_verified?: boolean;
	address?: {
		formatted?: string;
		street_address?: string;
		locality?: string;
		region?: string;
		postal_code?: string;
		country?: string;
	};
}

/**
 * Logto token claims structure
 */
export interface LogtoTokenClaims {
	sub: string; // Subject (Logto user ID)
	aud: string; // Audience
	iss: string; // Issuer
	exp: number; // Expiration time
	iat: number; // Issued at time
	scope?: string; // Granted scopes
	roles?: string[]; // Custom role claims
	organization_id?: string; // Custom organization claim
	client_id: string;
}

// ============================================
// Auth Context Types
// ============================================

export interface AuthContextValue {
	user: User | null;
	logtoUser: LogtoUserInfo | null;
	authContext: AuthContext | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	error: string | null;
	hasRole: (role: UserRole) => boolean;
	hasPermission: (permission: string) => boolean;
	getFreshAuthContext: () => Promise<AuthContext | null>;
	forceRefreshAuthContext: () => Promise<void>;
}

export const AuthReactContext = createContext<AuthContextValue | undefined>(
	undefined,
);

export function useAuthContext(): AuthContextValue {
	const context = useContext(AuthReactContext);
	if (context === undefined) {
		throw new Error("useAuthContext must be used within an AuthProvider");
	}
	return context;
}

// ============================================
// Storage Keys
// ============================================

export const AUTH_STORAGE_KEYS = {
	CONVEX_USER: "inventory_tracker_convex_user",
	AUTH_CONTEXT: "inventory_tracker_auth_context",
	TOKEN_EXPIRES_AT: "inventory_tracker_token_expires_at",
} as const;

export const AUTH_UPDATED_EVENT = "auth-context-updated";

export function dispatchAuthUpdatedEvent(): void {
	if (typeof window !== "undefined") {
		window.dispatchEvent(new CustomEvent(AUTH_UPDATED_EVENT));
	}
}

// ============================================
// Storage Helpers
// ============================================

export function getConvexUser(): User | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const convexUserStr = localStorage.getItem(AUTH_STORAGE_KEYS.CONVEX_USER);
		return convexUserStr ? JSON.parse(convexUserStr) : null;
	} catch {
		return null;
	}
}

export function setConvexUser(user: User): void {
	if (typeof window === "undefined") return;

	try {
		localStorage.setItem(AUTH_STORAGE_KEYS.CONVEX_USER, JSON.stringify(user));
	} catch {
		// Storage might be full or unavailable
	}
}

export function clearConvexUser(): void {
	if (typeof window === "undefined") return;

	try {
		localStorage.removeItem(AUTH_STORAGE_KEYS.CONVEX_USER);
	} catch {
		// Ignore errors
	}
}

const AUTH_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

export function getAuthContext(): import("@/types/auth").AuthContext | null {
	if (typeof window === "undefined") return null;

	try {
		const stored = localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_CONTEXT);
		if (!stored) return null;

		const context = JSON.parse(stored) as import("@/types/auth").AuthContext;

		// Check if auth context is expired
		const now = Date.now();
		if (now - context.timestamp > AUTH_MAX_AGE) {
			console.log("[getAuthContext] Stored auth context expired, clearing");
			localStorage.removeItem(AUTH_STORAGE_KEYS.AUTH_CONTEXT);
			return null;
		}

		// Strip tokenExpiresAt from context (old data may contain it, but it shouldn't be sent to Convex)
		const { tokenExpiresAt, ...cleanContext } = context as any;
		return cleanContext;
	} catch {
		return null;
	}
}

export function setAuthContext(
	context: import("@/types/auth").AuthContext,
): void {
	if (typeof window === "undefined") return;

	try {
		localStorage.setItem(
			AUTH_STORAGE_KEYS.AUTH_CONTEXT,
			JSON.stringify(context),
		);
	} catch {
		// Storage might be full
	}
}

export function clearAuthContext(): void {
	if (typeof window === "undefined") return;

	try {
		localStorage.removeItem(AUTH_STORAGE_KEYS.AUTH_CONTEXT);
	} catch {
		// Ignore errors
	}
}

export function getTokenExpiresAt(): number | null {
	if (typeof window === "undefined") return null;

	try {
		const stored = localStorage.getItem(AUTH_STORAGE_KEYS.TOKEN_EXPIRES_AT);
		return stored ? parseInt(stored, 10) : null;
	} catch {
		return null;
	}
}

export function setTokenExpiresAt(expiresAt: number): void {
	if (typeof window === "undefined") return;

	try {
		localStorage.setItem(AUTH_STORAGE_KEYS.TOKEN_EXPIRES_AT, String(expiresAt));
	} catch {
		// Storage might be full
	}
}

export function clearTokenExpiresAt(): void {
	if (typeof window === "undefined") return;

	try {
		localStorage.removeItem(AUTH_STORAGE_KEYS.TOKEN_EXPIRES_AT);
	} catch {
		// Ignore errors
	}
}

// ============================================
// API Helpers
// ============================================

/**
 * Verify Logto token with server-side API route
 * This route validates the Logto JWT using jose and syncs the user to Convex
 * Returns auth context for passing to Convex queries/mutations
 */
export async function verifyLogtoToken(
	_accessToken: string,
	_idTokenClaims: LogtoTokenClaims,
	_userInfo: LogtoUserInfo,
): Promise<{
	success: boolean;
	user?: User;
	authContext?: AuthContext;
	tokenExpiresAt?: number;
	error?: string;
}> {
	try {
		const controller = new AbortController();
		const timeoutId = window.setTimeout(() => controller.abort(), 15_000);

		const response = await fetch("/api/verify-token", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				accessToken: _accessToken,
			}),
			signal: controller.signal,
		});
		window.clearTimeout(timeoutId);

		if (!response.ok) {
			// Parse JSON safely
			let errorData: { error?: string } = {};
			try {
				errorData = (await response.json()) as { error?: string };
			} catch {
				// If JSON parsing fails, return a generic error
				return {
					success: false,
					error: `Token verification failed: ${response.status} ${response.statusText}`,
				};
			}
			console.error("[verifyLogtoToken] API error:", {
				status: response.status,
				error: errorData.error,
			});
			return {
				success: false,
				error: errorData.error || "Token verification failed",
			};
		}

		const data = (await response.json()) as {
			success: boolean;
			user?: User;
			authContext?: AuthContext;
			tokenExpiresAt?: number;
			error?: string;
		};

		return {
			success: data.success,
			user: data.user,
			authContext: data.authContext,
			tokenExpiresAt: data.tokenExpiresAt,
			error: data.error,
		};
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return { success: false, error: "Token verification timed out" };
		}
		console.error("[verifyLogtoToken] Network error:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Network error during token verification",
		};
	}
}

/**
 * Logout from Convex backend session
 * Also clears auth context from localStorage
 */
export async function logoutFromConvex(): Promise<{
	success: boolean;
	error?: string;
}> {
	const convexUrl = import.meta.env.VITE_CONVEX_URL;
	if (!convexUrl) {
		// Clear auth context and token expiration even if no Convex URL
		clearAuthContext();
		clearTokenExpiresAt();
		return { success: true };
	}

	try {
		const response = await fetch(`${convexUrl}/http/auth/logout`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
		});

		// Parse response safely
		let data: { error?: string } = {};
		try {
			data = (await response.json()) as { error?: string };
		} catch {
			// If JSON parsing fails, treat as success since logout is optional
			clearAuthContext();
			clearTokenExpiresAt();
			return { success: true };
		}

		if (!response.ok) {
			return {
				success: false,
				error: data.error || "Logout failed",
			};
		}

		// Clear auth context and token expiration on successful logout
		clearAuthContext();
		clearTokenExpiresAt();
		return { success: true };
	} catch {
		// Clear auth context and token expiration even on network error
		clearAuthContext();
		clearTokenExpiresAt();
		return { success: true };
	}
}
