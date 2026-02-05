import { createFileRoute } from "@tanstack/react-router";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import type { AuthContext, UserRole, VerifyTokenResponse } from "@/types/auth";

/**
 * Logto Token Verification API Route
 *
 * Verifies Logto JWT access tokens, syncs user to Convex, and returns auth context.
 *
 * Implementation per architecture:
 * - TanStack Router file-based route with server-side handler
 * - JWT verification using jose library with JWKS
 * - User sync to Convex via internal mutation (ConvexHttpClient)
 * - Returns auth context for frontend storage
 */

/**
 * Helper to normalize URLs (remove trailing slash)
 */
function normalizeUrl(value: string | undefined, fallback: string): string {
	if (!value || value.trim().length === 0) return fallback;
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

const getEnv = (key: string): string | undefined => {
	if (process?.env?.[key]) {
		return process.env[key];
	}
	if (typeof import.meta !== "undefined") {
		const metaEnv = (import.meta as unknown as { env?: Record<string, string> })
			.env;
		if (metaEnv?.[key]) {
			return metaEnv[key];
		}
	}
	return undefined;
};

// Environment variables - support both process.env and import.meta.env
const LOGTO_ENDPOINT = normalizeUrl(
	getEnv("VITE_LOGTO_ENDPOINT") || getEnv("LOGTO_ENDPOINT"),
	"https://your-logto-endpoint.logto.app",
);
const LOGTO_ISSUER = `${LOGTO_ENDPOINT}/oidc`;
const JWKS_URL = `${LOGTO_ISSUER}/jwks`;
const API_RESOURCE =
	getEnv("LOGTO_API_RESOURCE") ||
	getEnv("VITE_LOGTO_API_RESOURCE") ||
	"urn:inventory-tracker:api";

const DEBUG_AUTH =
	getEnv("VITE_DEBUG_AUTH") === "true" || getEnv("DEBUG_AUTH") === "true";

// Convex URL for user sync - required
const CONVEX_URL =
	getEnv("CONVEX_SELF_HOSTED_URL") || getEnv("VITE_CONVEX_URL");

// Create JWKS for Logto key rotation
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

/**
 * Helper to get allowed origins for CORS
 */
function getAllowedOrigins(): string[] {
	const allowedOrigins =
		process.env.ALLOWED_ORIGINS?.split(",") ||
		[
			"http://localhost:3000",
			process.env.VITE_APP_URL || "https://yourdomain.com",
		].filter(Boolean);
	return allowedOrigins;
}

/**
 * Set CORS headers on response
 */
function setCORSHeaders(response: Response, origin: string | null): Response {
	const allowedOrigins = getAllowedOrigins();
	const allowedOrigin =
		origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

	response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
	response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
	response.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization",
	);
	response.headers.set("Vary", "Origin");

	return response;
}

/**
 * Helper to sync user to Convex via internal mutation
 */
async function syncUserToConvex(
	logtoUserId: string,
	email: string,
	name: string,
	_orgIdClaim: string | undefined,
	role: UserRole,
): Promise<{
	_id: string;
	logtoUserId: string;
	name: string;
	email: string;
	orgId: string;
	role: UserRole;
	createdAt: number;
}> {
	if (!CONVEX_URL) {
		throw new Error("Convex URL not configured");
	}

	// Call Convex HTTP endpoint directly for user sync
	const response = await fetch(`${CONVEX_URL}/http/auth/syncUser`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			idTokenClaims: {
				sub: logtoUserId,
				email,
				name,
				roles: [role], // Include role in idTokenClaims
			},
			userInfo: {
				sub: logtoUserId,
				email,
				name,
				updated_at: Math.floor(Date.now() / 1000),
			},
	}),
	});
	if (DEBUG_AUTH) {
		console.log("[verify-token] syncUserToConvex called with role:", role);
	}

	if (!response.ok) {
		throw new Error(`Convex sync failed: ${response.status}`);
	}

	const result = (await response.json()) as {
		user: {
			_id: string;
			logtoUserId: string;
			name: string;
			email: string;
			orgId: string;
			role: UserRole;
			createdAt: number;
		};
		isNewUser: boolean;
		needsOrgCreation: boolean;
	};
	return result.user;
}

export const Route = createFileRoute("/api/verify-token")({
	server: {
		handlers: {
			POST: async ({ request }): Promise<Response> => {
				const origin = request.headers.get("origin");

				try {
					// Parse request body
					const body = (await request.json()) as { accessToken?: string };

					const { accessToken } = body;

					// Validate required fields
					if (!accessToken) {
						const response = new Response(
							JSON.stringify({
								success: false,
								error: "Missing required field: accessToken",
							} satisfies VerifyTokenResponse),
							{
								status: 400,
								headers: { "Content-Type": "application/json" },
							},
						);
						return setCORSHeaders(response, origin);
					}

					// Trim whitespace and strip "Bearer " prefix (case-insensitive)
					let cleanToken = accessToken.trim();
					const bearerMatch = cleanToken.match(/^bearer\s+/i);
					if (bearerMatch) {
						cleanToken = cleanToken.slice(bearerMatch[0].length);
					}
					cleanToken = cleanToken.trim();

					// Validate token format - must have exactly 3 segments (header.payload.signature)
					const segments = cleanToken.split(".");
					if (segments.length !== 3) {
						console.error(
							"[verify-token] Invalid token format: expected 3 segments, got",
							segments.length,
						);
						const response = new Response(
							JSON.stringify({
								success: false,
								error: `Invalid token format: expected 3 segments, got ${segments.length}`,
							} satisfies VerifyTokenResponse),
							{
								status: 400,
								headers: { "Content-Type": "application/json" },
							},
						);
						return setCORSHeaders(response, origin);
					}

					if (DEBUG_AUTH) {
						console.log("[verify-token] accessToken length:", cleanToken.length);
					}

					// Verify JWT signature using Logto's JWKS
					let payload: Record<string, unknown>;
					try {
						const { payload: verifiedPayload } = await jwtVerify(
							cleanToken,
							jwks,
							{
								issuer: LOGTO_ISSUER,
								audience: API_RESOURCE,
							},
						);
						payload = verifiedPayload;
					} catch (error) {
						console.error("[verify-token] JWT verification failed:", error);

						// Return specific error codes based on error type
						if (error instanceof errors.JWTExpired) {
							const response = new Response(
								JSON.stringify({
									success: false,
									error: "Token expired",
								} satisfies VerifyTokenResponse),
								{
									status: 401,
									headers: { "Content-Type": "application/json" },
								},
							);
							return setCORSHeaders(response, origin);
						}

						if (error instanceof errors.JWSSignatureVerificationFailed) {
							const response = new Response(
								JSON.stringify({
									success: false,
									error: "Invalid token signature",
								} satisfies VerifyTokenResponse),
								{
									status: 401,
									headers: { "Content-Type": "application/json" },
								},
							);
							return setCORSHeaders(response, origin);
						}

						if (error instanceof errors.JWTClaimValidationFailed) {
							const response = new Response(
								JSON.stringify({
									success: false,
									error: "Token claim validation failed",
								} satisfies VerifyTokenResponse),
								{
									status: 401,
									headers: { "Content-Type": "application/json" },
								},
							);
							return setCORSHeaders(response, origin);
						}

						// Handle JWSInvalid error - compact JWS format validation failed
						if (error instanceof errors.JWSInvalid) {
							const response = new Response(
								JSON.stringify({
									success: false,
									error: "Invalid token format",
								} satisfies VerifyTokenResponse),
								{
									status: 400,
									headers: { "Content-Type": "application/json" },
								},
							);
							return setCORSHeaders(response, origin);
						}

						const response = new Response(
							JSON.stringify({
								success: false,
								error: "Token verification failed",
							} satisfies VerifyTokenResponse),
							{
								status: 401,
								headers: { "Content-Type": "application/json" },
							},
						);
						return setCORSHeaders(response, origin);
					}

					// Extract user information from verified token payload
					const logtoUserId = payload.sub as string;
					const email = (payload.email as string) || "";
					const name =
						(payload.name as string) ||
						(email ? email.split("@")[0] : "Unknown");

					// Debug: Log the full payload to understand the structure
					if (DEBUG_AUTH) {
						console.log("[verify-token] JWT payload:", payload);
					}

					// Extract custom JWT claims for user object
					// uid is the same as sub in Logto
					const uid = logtoUserId;

					// Extract all roles from different possible formats
					let extractedRoles: string[] = [];
					if (Array.isArray(payload.roles)) {
						// Could be string[] or objects with name property
						extractedRoles = payload.roles
							.map((r: unknown) =>
								typeof r === "string" ? r : (r as { name: string })?.name || "",
							)
							.filter(Boolean);
					}

					if (DEBUG_AUTH) {
						console.log("[verify-token] Extracted roles:", extractedRoles);
					}

					// Extract scopes from nested role objects
					let extractedScopes: string[] = [];
					if (payload.user && typeof payload.user === "object") {
						const userObj = payload.user as {
							roles?: Array<{ scopes?: Array<{ name: string }> }>;
						};
						if (userObj.roles && Array.isArray(userObj.roles)) {
							extractedScopes = userObj.roles
								.flatMap(
									(role) => role.scopes?.map((scope) => scope.name) || [],
								)
								.filter(Boolean);
						}
					}

					if (DEBUG_AUTH) {
						console.log("[verify-token] Extracted scopes:", extractedScopes);
					}

					// Extract organizations from user claim
					let extractedOrganizations: Array<{ id: string; name: string }> = [];
					if (payload.user && typeof payload.user === "object") {
						const userObj = payload.user as {
							organizations?: Array<{ id: string; name: string }>;
						};
						if (userObj.organizations && Array.isArray(userObj.organizations)) {
							extractedOrganizations = userObj.organizations
								.map((org) => ({ id: String(org.id), name: String(org.name) }))
								.filter((org) => Boolean(org.id && org.name));
						}
					}

					if (DEBUG_AUTH) {
						console.log(
							"[verify-token] Extracted organizations:",
							extractedOrganizations,
						);
					}

					const orgIdClaim = payload.organization_id as string | undefined;

					// Determine user role from custom claims
					// Role should be one of: Administrator, Executive Officers, General Officers, Member
					const roleClaim = extractedRoles[0] || "Member";
					const validRoles = [
						"Administrator",
						"Executive Officers",
						"General Officers",
						"Member",
					];
					const role: UserRole = validRoles.includes(roleClaim)
						? (roleClaim as UserRole)
						: "Member";

					if (DEBUG_AUTH) {
						console.log(
							"[verify-token] Determined role:",
							role,
							"from roleClaim:",
							roleClaim,
						);
					}

					// Sync user to Convex database
					let user: {
						_id: string;
						logtoUserId: string;
						name: string;
						email: string;
						orgId: string;
						role: UserRole;
						createdAt: number;
					};
					try {
						user = await syncUserToConvex(
							logtoUserId,
							email,
							name,
							orgIdClaim,
							role,
						);
					} catch (error) {
						console.error(
							"[verify-token] Failed to sync user to Convex:",
							error,
						);
						const response = new Response(
							JSON.stringify({
								success: false,
								error: "Failed to sync user",
							} satisfies VerifyTokenResponse),
							{
								status: 500,
								headers: { "Content-Type": "application/json" },
							},
						);
						return setCORSHeaders(response, origin);
					}

					// Get organization name (query Convex for org details)
					let orgName = "Unknown Organization";
					try {
						const orgResponse = await fetch(
							`${CONVEX_URL}/http/api/organizations/${user.orgId}`,
							{
								method: "GET",
								headers: {
									"Content-Type": "application/json",
								},
							},
						);
						if (orgResponse.ok) {
							const orgData = (await orgResponse.json()) as { name?: string };
							if (orgData.name) {
								orgName = orgData.name;
							}
						}
					} catch {
						// Org name fetch is optional, ignore errors
					}

					// Create auth context (tokenExpiresAt is frontend-only, not sent to Convex)
					const tokenExp = (payload.exp as number) * 1000; // Convert to milliseconds
					const authContext: AuthContext = {
						userId: user._id,
						logtoUserId: user.logtoUserId,
						orgId: user.orgId,
						role: user.role,
						timestamp: Date.now(),
					};

					// Return success response with custom JWT claims and token expiration separately
					const response = new Response(
						JSON.stringify({
							success: true,
							authContext,
							tokenExpiresAt: tokenExp, // Frontend-only for auto sign-out
							user: {
								_id: user._id,
								logtoUserId: user.logtoUserId,
								name: user.name,
								email: user.email,
								orgId: user.orgId,
								orgName,
								role: user.role,
								createdAt: user.createdAt,
								// Custom JWT claims
								uid,
								roles: extractedRoles,
								scopes: extractedScopes,
								organizations: extractedOrganizations,
							},
						} satisfies VerifyTokenResponse),
						{
							status: 200,
							headers: { "Content-Type": "application/json" },
						},
					);

					return setCORSHeaders(response, origin);
				} catch (error) {
					console.error("[verify-token] Unexpected error:", error);

					const response = new Response(
						JSON.stringify({
							success: false,
							error: "Internal server error",
						} satisfies VerifyTokenResponse),
						{
							status: 500,
							headers: { "Content-Type": "application/json" },
						},
					);

					return setCORSHeaders(response, origin);
				}
			},

			// Handle OPTIONS preflight requests for CORS
			OPTIONS: ({ request }): Response => {
				const origin = request.headers.get("origin");
				const response = new Response(null, { status: 204 });
				return setCORSHeaders(response, origin);
			},
		},
	},
});
