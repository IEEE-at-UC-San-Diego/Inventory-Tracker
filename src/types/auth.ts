/**
 * Authentication context passed to Convex queries/mutations
 */
export interface AuthContext {
	userId: string;
	logtoUserId: string;
	orgId: string;
	role: UserRole;
	timestamp: number;
}

export interface AuthContextWithTimestamp extends AuthContext {
	timestamp: number;
}

export type UserRole =
	| "Administrator"
	| "Executive Officers"
	| "General Officers"
	| "Member";

// ============================================
// API Request/Response Types
// ============================================

export interface VerifyTokenRequest {
	accessToken: string;
}

export interface VerifyTokenResponse {
	success: boolean;
	authContext?: AuthContext;
	tokenExpiresAt?: number; // Frontend-only for auto sign-out, not sent to Convex
	user?: AuthenticatedUser;
	error?: string;
}

export interface AuthenticatedUser {
	_id: string;
	logtoUserId: string;
	name: string;
	email: string;
	orgId: string;
	orgName: string;
	role: UserRole;
	createdAt: number;
	// Custom JWT claims from Logto
	uid?: string;
	roles?: string[];
	scopes?: string[];
	organizations?: Array<{ id: string; name: string }>;
}

export interface TokenVerificationError {
	code: "INVALID_TOKEN" | "EXPIRED_TOKEN" | "MALFORMED_TOKEN" | "SERVER_ERROR";
	message: string;
}
