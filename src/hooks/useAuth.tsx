import { useLogto } from "@logto/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User, UserRole } from "@/types";
import type { AuthContext as AuthContextType } from "@/types/auth";
import {
	AUTH_UPDATED_EVENT,
	type AuthContextValue,
	AuthReactContext,
	clearAuthContext,
	clearConvexUser,
	clearTokenExpiresAt,
	getAuthContext,
	getConvexUser,
	getTokenExpiresAt,
	type LogtoTokenClaims,
	type LogtoUserInfo,
	setAuthContext,
	setConvexUser,
	setTokenExpiresAt,
	verifyLogtoToken,
} from "../lib/auth";
import {
	clearLogtoStorage,
	hasPermissionForUser,
	hasRoleForUser,
	isLogtoRequestErrorLike,
} from "./useAuth.helpers";

export { LogtoAuthProvider, useAuth } from "./useAuthPublic";

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [logtoUser, setLogtoUser] = useState<LogtoUserInfo | null>(null);
	const [authContext, setAuthContextState] = useState<AuthContextType | null>(
		null,
	);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [hasAuthFailed, setHasAuthFailed] = useState(false);

	const AUTH_CONTEXT_REFRESH_THRESHOLD_MINUTES = 5;

	// Define the API resource identifier (must match LogtoAuthProvider config)
	const apiResource =
		import.meta.env.VITE_LOGTO_API_RESOURCE || "urn:inventory-tracker:api";

	const {
		isAuthenticated: logtoAuthenticated,
		isLoading: logtoLoading,
		getAccessToken,
		getIdTokenClaims,
		fetchUserInfo,
		signOut,
	} = useLogto();

	const hasInitializedRef = useRef(false);
	const hasHydratedFromLogtoRef = useRef(false);
	const hydrateInFlightRef = useRef<Promise<void> | null>(null);
	// Avoid stampeding refresh calls when multiple components ask for a "fresh" auth context.
	const refreshInFlightRef = useRef<Promise<AuthContextType | null> | null>(
		null,
	);
	const logtoFunctionsRef = useRef({
		getAccessToken,
		getIdTokenClaims,
		fetchUserInfo,
		signOut,
	});
	logtoFunctionsRef.current = {
		getAccessToken,
		getIdTokenClaims,
		fetchUserInfo,
		signOut,
	};

	const clearAllBrowserStorage = useCallback(() => {
		if (typeof window === "undefined") {
			return;
		}

		try {
			window.localStorage.clear();
		} catch {
			// Ignore storage errors
		}

		try {
			window.sessionStorage.clear();
		} catch {
			// Ignore storage errors
		}
	}, []);

	const forceLogoutDueToInvalidContext = useCallback(
		async (message: string) => {
			console.log("[useAuth]", message);
			setHasAuthFailed(true);
			setError("Session expired. Please sign in again.");
			clearAllBrowserStorage();
			clearConvexUser();
			clearAuthContext();
			clearTokenExpiresAt();
			setUser(null);
			setLogtoUser(null);
			setAuthContextState(null);
			await logtoFunctionsRef.current.signOut();
		},
		[clearAllBrowserStorage],
	);

	const verifyAndRefreshAuthContext = useCallback(
		async (
			accessToken: string,
			currentLogtoUser: LogtoUserInfo | null,
		): Promise<{
			success: boolean;
			authContext?: AuthContextType;
			error?: string;
		}> => {
			console.log(
				"[useAuth] verifyAndRefreshAuthContext called with accessToken length:",
				accessToken?.length,
			);

			try {
				console.log("[useAuth] Calling verifyLogtoToken API...");
				const result = await verifyLogtoToken(
					accessToken,
					{} as LogtoTokenClaims,
					currentLogtoUser || ({} as LogtoUserInfo),
				);

				console.log("[useAuth] Token verification result:", {
					success: result.success,
					hasAuthContext: !!result.authContext,
					hasUser: !!result.user,
					hasTokenExpiresAt: !!result.tokenExpiresAt,
					authContext: result.authContext
						? { ...result.authContext, role: result.authContext.role }
						: null,
					user: result.user ? { ...result.user, role: result.user.role } : null,
					tokenExpiresAt: result.tokenExpiresAt,
				});

				if (result.success && result.authContext) {
					console.log(
						"[useAuth] ✓ Token verification SUCCESS! Setting auth context from result",
					);
					setAuthContextState(result.authContext);
					setAuthContext(result.authContext);

					if (result.tokenExpiresAt) {
						console.log("[useAuth] Setting token expiration from result");
						setTokenExpiresAt(result.tokenExpiresAt);
					}

					if (result.user) {
						console.log(
							"[useAuth] Setting user from token verification:",
							result.user,
						);
						setUser(result.user);
						setConvexUser(result.user);
					} else {
						console.log("[useAuth] No user data in token verification result");
					}

					return { success: true, authContext: result.authContext };
				} else {
					console.log("[useAuth] Token verification failed or missing data:", {
						success: result.success,
						hasAuthContext: !!result.authContext,
						hasUser: !!result.user,
						hasTokenExpiresAt: !!result.tokenExpiresAt,
						error: result.error,
					});
					return {
						success: false,
						error: result.error || "Failed to refresh auth context",
					};
				}
			} catch (err) {
				console.error("[useAuth] Error in verifyAndRefreshAuthContext:", err);
				const errorMsg = err instanceof Error ? err.message : "Unknown error";
				setError(errorMsg);
				return { success: false, error: errorMsg };
			}
		},
		[],
	);

	const getFreshAuthContext =
		useCallback(async (): Promise<AuthContextType | null> => {
			// If not authenticated, no auth context
			if (!logtoAuthenticated) return null;

			// If we already have a recent authContext, don't hit /api/verify-token again.
			const now = Date.now();
			const localContext = authContext ?? getAuthContext();
			if (localContext) {
				const ageMinutes = (now - localContext.timestamp) / 60000;
				if (ageMinutes < AUTH_CONTEXT_REFRESH_THRESHOLD_MINUTES) {
					return localContext;
				}
			}

			if (refreshInFlightRef.current) {
				return refreshInFlightRef.current;
			}

			// Try to get fresh access token from Logto (passing resource to get JWT)
			const refreshPromise = (async (): Promise<AuthContextType | null> => {
				try {
					const accessToken =
						await logtoFunctionsRef.current.getAccessToken(apiResource);
					if (!accessToken) return localContext ?? null;

					// Verify and refresh auth context
					const result = await verifyAndRefreshAuthContext(
						accessToken,
						logtoUser,
					);
					return result.authContext || localContext || null;
				} catch (err) {
					if (isLogtoRequestErrorLike(err)) {
						clearLogtoStorage();
						await forceLogoutDueToInvalidContext(
							"[useAuth] Logto session invalid while refreshing auth context",
						);
						return null;
					}
					return localContext ?? null;
				} finally {
					refreshInFlightRef.current = null;
				}
			})();

			refreshInFlightRef.current = refreshPromise;
			return refreshPromise;
		}, [
			logtoAuthenticated,
			logtoUser,
			verifyAndRefreshAuthContext,
			authContext,
			forceLogoutDueToInvalidContext,
		]);

	// Initialize auth state from storage on first mount
	useEffect(() => {
		if (hasInitializedRef.current) return;

		const initAuthFromStorage = async () => {
			try {
				const storedUser = getConvexUser();
				if (storedUser) {
					setUser(storedUser);
				}

				const storedAuthContext = getAuthContext();
				if (storedAuthContext) {
					const ageMinutes = (Date.now() - storedAuthContext.timestamp) / 60000;
					console.log("[useAuth] Restoring auth context:", {
						userId: storedAuthContext.userId,
						timestamp: new Date(storedAuthContext.timestamp).toISOString(),
						age: `${Math.round(ageMinutes)} minutes old`,
					});
					setAuthContextState(storedAuthContext);
				} else {
					console.log(
						"[useAuth] No valid auth context found (expired or missing)",
					);
					setAuthContextState(null);
				}
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to initialize auth",
				);
			} finally {
				hasInitializedRef.current = true;
				setIsLoading(false);
			}
		};

		initAuthFromStorage();
	}, []);

	// Hydrate from Logto whenever authentication becomes available
	useEffect(() => {
		if (!logtoAuthenticated) {
			hasHydratedFromLogtoRef.current = false;
			hydrateInFlightRef.current = null;
			return;
		}

		if (logtoLoading || hasAuthFailed) {
			return;
		}

		if (hasHydratedFromLogtoRef.current) {
			return;
		}

		if (hydrateInFlightRef.current) {
			return;
		}

		let cancelled = false;
		// Claim hydration immediately so auth-state updates during hydration don't
		// trigger a second concurrent hydration cycle.
		hasHydratedFromLogtoRef.current = true;

		const hydrateFromLogto = async () => {
			console.log(
				"[useAuth] hydrateFromLogto STARTING. hasHydratedFromLogtoRef:",
				hasHydratedFromLogtoRef.current,
			);
			setIsLoading(true);

			try {
				const storedUser = getConvexUser();
				console.log(
					"[useAuth] hydrateFromLogto - storedUser from localStorage:",
					storedUser ? { _id: storedUser._id, role: storedUser.role } : null,
				);
				if (storedUser && !cancelled) {
					setUser(storedUser);
				}

				const storedAuthContext = getAuthContext();
				console.log(
					"[useAuth] hydrateFromLogto - storedAuthContext from localStorage:",
					storedAuthContext,
				);
				if (storedAuthContext && !cancelled) {
					const ageMinutes = (Date.now() - storedAuthContext.timestamp) / 60000;
					console.log("[useAuth] Local auth context age:", {
						minutes: ageMinutes.toFixed(2),
						refreshThreshold: AUTH_CONTEXT_REFRESH_THRESHOLD_MINUTES,
					});
					setAuthContextState(storedAuthContext);
				}

				let userInfo: LogtoUserInfo | null = null;
				try {
					userInfo =
						(await logtoFunctionsRef.current.fetchUserInfo()) as LogtoUserInfo;
					if (!cancelled) {
						setLogtoUser(userInfo);
					}
				} catch (err) {
					if (isLogtoRequestErrorLike(err)) {
						console.log(
							"[useAuth] Invalid user info token, clearing stale session:",
							err instanceof Error ? err.message : String(err),
						);
						clearLogtoStorage();
						await forceLogoutDueToInvalidContext(
							"[useAuth] Cleared stale session after invalid user info token",
						);
						return;
					}
					throw err;
				}

				let accessToken: string | undefined;
				try {
					accessToken =
						await logtoFunctionsRef.current.getAccessToken(apiResource);
				} catch (err) {
					if (isLogtoRequestErrorLike(err)) {
						console.log(
							"[useAuth] Invalid access token, clearing stale session:",
							err instanceof Error ? err.message : String(err),
						);
						clearLogtoStorage();
						await forceLogoutDueToInvalidContext(
							"[useAuth] Cleared stale session after invalid access token",
						);
						return;
					}
					throw err;
				}

				if (!accessToken) {
					console.log(
						"[useAuth] hydrateFromLogto - Missing access token, calling forceLogout",
					);
					await forceLogoutDueToInvalidContext(
						"[useAuth] Missing access token after Logto auth - signing out",
					);
					return;
				}

				console.log(
					"[useAuth] hydrateFromLogto - Calling verifyAndRefreshAuthContext with accessToken...",
				);
				const result = await verifyAndRefreshAuthContext(accessToken, userInfo);
				console.log(
					"[useAuth] hydrateFromLogto - verifyAndRefreshAuthContext result:",
					{ success: result.success, error: result.error },
				);
				if (!result.success) {
					console.log(
						"[useAuth] hydrateFromLogto - verifyAndRefreshAuthContext FAILED, calling forceLogout",
					);
					await forceLogoutDueToInvalidContext(
						`[useAuth] ${result.error || "Failed to refresh auth context"} - signing out`,
					);
				} else {
					console.log(
						"[useAuth] hydrateFromLogto - verifyAndRefreshAuthContext SUCCEEDED",
					);
				}
			} catch (err) {
				console.log("[useAuth] hydrateFromLogto - EXCEPTION:", err);
				if (!cancelled) {
					setError(
						err instanceof Error ? err.message : "Failed to hydrate auth",
					);
					// Allow retry if hydration failed unexpectedly.
					hasHydratedFromLogtoRef.current = false;
				}
			} finally {
				if (!cancelled) {
					console.log(
						"[useAuth] hydrateFromLogto - FINALLY block. hasHydratedFromLogtoRef was:",
						hasHydratedFromLogtoRef.current,
					);
					setIsLoading(false);
					console.log(
						"[useAuth] hydrateFromLogto - COMPLETED. hasHydratedFromLogtoRef is now:",
						hasHydratedFromLogtoRef.current,
					);
				}
			}
		};

		const promise = hydrateFromLogto();
		hydrateInFlightRef.current = promise;
		void promise.finally(() => {
			if (hydrateInFlightRef.current === promise) {
				hydrateInFlightRef.current = null;
			}
		});

		return () => {
			cancelled = true;
		};
	}, [
		logtoAuthenticated,
		logtoLoading,
		hasAuthFailed,
		forceLogoutDueToInvalidContext,
		verifyAndRefreshAuthContext,
	]);

	useEffect(() => {
		if (logtoAuthenticated && hasAuthFailed) {
			setHasAuthFailed(false);
		}
	}, [logtoAuthenticated, hasAuthFailed]);

	useEffect(() => {
		// Only check if authenticated and not loading
		if (!logtoAuthenticated || logtoLoading) {
			return;
		}

		const checkTokenExpiration = () => {
			const tokenExpiresAt = getTokenExpiresAt();
			if (!tokenExpiresAt) {
				// No expiration time stored, skip check
				return;
			}

			const now = Date.now();
			const isExpired = now >= tokenExpiresAt;

			console.log("[useAuth] Token expiration check:", {
				tokenExpiresAt: new Date(tokenExpiresAt).toISOString(),
				now: new Date(now).toISOString(),
				isExpired,
				expiresInMs: tokenExpiresAt - now,
			});

			if (isExpired) {
				console.log("[useAuth] Token expired, signing out...");
				forceLogoutDueToInvalidContext("[useAuth] Token expired - signing out");
			}
		};

		// Check immediately on mount
		checkTokenExpiration();

		// Set up periodic check every minute
		const intervalId = setInterval(() => {
			checkTokenExpiration();
		}, 60 * 1000); // Check every minute

		return () => clearInterval(intervalId);
	}, [logtoAuthenticated, logtoLoading, forceLogoutDueToInvalidContext]);

	useEffect(() => {
		const handleAuthUpdated = () => {
			console.log(
				"[useAuth] AUTH_UPDATED_EVENT fired! hasHydratedFromLogtoRef:",
				hasHydratedFromLogtoRef.current,
			);
			console.log("[useAuth] Re-reading localStorage...");
			const storedUser = getConvexUser();
			const storedAuthContext = getAuthContext();

			console.log("[useAuth] Re-read from localStorage:", {
				user: storedUser
					? { _id: storedUser._id, role: storedUser.role }
					: null,
				authContext: storedAuthContext,
			});

			if (storedUser) {
				console.log(
					"[useAuth] Setting user from event listener:",
					storedUser._id,
				);
				setUser(storedUser);
			}
			if (storedAuthContext) {
				console.log(
					"[useAuth] Setting authContext from event listener:",
					storedAuthContext.userId,
				);
				setAuthContextState(storedAuthContext);
			}
		};

		window.addEventListener(AUTH_UPDATED_EVENT, handleAuthUpdated);

		return () => {
			window.removeEventListener(AUTH_UPDATED_EVENT, handleAuthUpdated);
		};
	}, []);

	const hasRole = useCallback(
		(role: UserRole): boolean => hasRoleForUser(user, role),
		[user],
	);

	const hasPermission = useCallback(
		(permission: string): boolean => hasPermissionForUser(user, permission),
		[user],
	);

	const signOutWithCleanup = useCallback(async () => {
		try {
			// Clear all local/session storage for this origin on sign out.
			// This ensures we don't keep stale Logto tokens or any cached app state.
			clearAllBrowserStorage();

			// Also clear via helpers (in case storage.clear() is blocked).
			clearConvexUser();
			clearAuthContext();
			clearTokenExpiresAt();
			setUser(null);
			setLogtoUser(null);
			setAuthContextState(null);
			setError(null);

			// Sign out from Logto
			await signOut();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Sign out failed");
		}
	}, [signOut, clearAllBrowserStorage]);

	const forceRefreshAuthContext = useCallback(async (): Promise<void> => {
		console.log("[useAuth] Forcing auth context refresh...");

		// Clear cached auth context, user, and token expiration
		clearAuthContext();
		clearConvexUser();
		clearTokenExpiresAt();
		setAuthContextState(null);
		setUser(null);

		// If authenticated, re-verify token to get fresh context
		if (logtoAuthenticated && !logtoLoading) {
			const { getAccessToken, getIdTokenClaims } = logtoFunctionsRef.current;
			try {
				const accessToken = await getAccessToken(apiResource);
				const idTokenClaims = await getIdTokenClaims();

				if (accessToken && idTokenClaims && logtoUser) {
					const result = await verifyLogtoToken(
						accessToken,
						idTokenClaims as unknown as LogtoTokenClaims,
						logtoUser,
					);

					if (result.success && result.authContext && result.user) {
						console.log("[useAuth] Auth context refreshed successfully");
						setAuthContextState(result.authContext);
						setUser(result.user);

						// Store token expiration if provided
						if (result.tokenExpiresAt) {
							setTokenExpiresAt(result.tokenExpiresAt);
						}
					}
				}
			} catch (error) {
				if (isLogtoRequestErrorLike(error)) {
					clearLogtoStorage();
					await forceLogoutDueToInvalidContext(
						"[useAuth] Logto session invalid during forced refresh",
					);
					return;
				}
				console.error("[useAuth] Failed to refresh auth context:", error);
				setError(
					error instanceof Error
						? error.message
						: "Failed to refresh auth context",
				);
			}
		}
	}, [
		logtoAuthenticated,
		logtoLoading,
		logtoUser,
		forceLogoutDueToInvalidContext,
	]);

	const value = useMemo(() => {
		const appIsAuthenticated = Boolean(user && authContext);
		// Don't block the whole app on Logto's loading flag; our internal `isLoading`
		// already models "we're actively hydrating/refreshing auth". If Logto gets
		// stuck in a loading state, we still want to show the login screen instead
		// of an infinite spinner. Also, once app auth state is ready, keep auth
		// refreshes in the background instead of blocking navigation with a spinner.
		const combinedLoading = isLoading && !appIsAuthenticated;

		return {
			user,
			logtoUser,
			authContext,
			isAuthenticated: appIsAuthenticated,
			isLoading: combinedLoading,
			error,
			hasRole,
			hasPermission,
			signOut: signOutWithCleanup,
			getFreshAuthContext,
			forceRefreshAuthContext,
		};
	}, [
		user,
		logtoUser,
		authContext,
		isLoading,
		error,
		hasRole,
		hasPermission,
		signOutWithCleanup,
		getFreshAuthContext,
		forceRefreshAuthContext,
	]);

	// Debug: Log auth state changes (only when the value changes)
	useEffect(() => {
		const appIsAuthenticated = Boolean(user && authContext);
		console.log("[useAuth] Auth context state changed:", {
			isAuthenticated: appIsAuthenticated,
			userId: user?._id,
			logtoAuthenticated,
		});
	}, [user, authContext, logtoAuthenticated]);

	return (
		<AuthReactContext.Provider value={value}>
			{children}
		</AuthReactContext.Provider>
	);
}

// Re-export types
export type { AuthContextValue, LogtoUserInfo, LogtoTokenClaims };
