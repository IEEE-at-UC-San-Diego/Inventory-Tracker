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
import { authLog } from "../lib/authLogger";
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

	const clearAuthStorage = useCallback(() => {
		clearConvexUser();
		clearAuthContext();
		clearTokenExpiresAt();
		clearLogtoStorage();
	}, []);

	const forceLogoutDueToInvalidContext = useCallback(
		async (message: string) => {
			authLog.warn(message);
			setHasAuthFailed(true);
			setError("Session expired. Please sign in again.");
			clearAuthStorage();
			setUser(null);
			setLogtoUser(null);
			setAuthContextState(null);
			try {
				await logtoFunctionsRef.current.signOut();
			} catch {
				// signOut may fail if session is already invalid
			}
		},
		[clearAuthStorage],
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
			authLog.debug("verifyAndRefreshAuthContext called");

			try {
				const result = await verifyLogtoToken(
					accessToken,
					{} as LogtoTokenClaims,
					currentLogtoUser || ({} as LogtoUserInfo),
				);

				if (result.success && result.authContext) {
					authLog.debug("token verification succeeded");
					setAuthContextState(result.authContext);
					setAuthContext(result.authContext);

					if (result.tokenExpiresAt) {
						setTokenExpiresAt(result.tokenExpiresAt);
					}

					if (result.user) {
						setUser(result.user);
						setConvexUser(result.user);
					}

					return { success: true, authContext: result.authContext };
				}

				authLog.debug("token verification failed", result.error);
				return {
					success: false,
					error: result.error || "Failed to refresh auth context",
				};
			} catch (err) {
				authLog.error("verifyAndRefreshAuthContext error:", err);
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

		const initAuthFromStorage = () => {
			try {
				const storedUser = getConvexUser();
				if (storedUser) {
					setUser(storedUser);
				}

				const storedAuthContext = getAuthContext();
				if (storedAuthContext) {
					authLog.debug("restoring auth context from storage");
					setAuthContextState(storedAuthContext);
				} else {
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
			authLog.debug("hydrateFromLogto starting");

			// If the callback page already stored a fresh auth context, skip
			// the expensive re-verification round-trip.
			const storedUser = getConvexUser();
			const storedAuthContext = getAuthContext();

			if (storedUser && storedAuthContext) {
				const ageMinutes = (Date.now() - storedAuthContext.timestamp) / 60000;
				if (ageMinutes < AUTH_CONTEXT_REFRESH_THRESHOLD_MINUTES) {
					authLog.debug(
						"skipping re-verification, fresh context from callback",
					);
					if (!cancelled) {
						setUser(storedUser);
						setAuthContextState(storedAuthContext);
						setIsLoading(false);
					}

					// Still fetch Logto user info in the background for profile data
					try {
						const userInfo =
							(await logtoFunctionsRef.current.fetchUserInfo()) as LogtoUserInfo;
						if (!cancelled) {
							setLogtoUser(userInfo);
						}
					} catch {
						// Non-critical, ignore
					}
					return;
				}
			}

			setIsLoading(true);

			try {
				if (storedUser && !cancelled) {
					setUser(storedUser);
				}
				if (storedAuthContext && !cancelled) {
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
						authLog.warn("invalid user info token, clearing stale session");
						await forceLogoutDueToInvalidContext(
							"Cleared stale session after invalid user info token",
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
						authLog.warn("invalid access token, clearing stale session");
						await forceLogoutDueToInvalidContext(
							"Cleared stale session after invalid access token",
						);
						return;
					}
					throw err;
				}

				if (!accessToken) {
					await forceLogoutDueToInvalidContext(
						"Missing access token after Logto auth",
					);
					return;
				}

				const result = await verifyAndRefreshAuthContext(accessToken, userInfo);
				if (!result.success) {
					await forceLogoutDueToInvalidContext(
						result.error || "Failed to refresh auth context",
					);
				} else {
					authLog.debug("hydration succeeded");
				}
			} catch (err) {
				authLog.error("hydrateFromLogto error:", err);
				if (!cancelled) {
					setError(
						err instanceof Error ? err.message : "Failed to hydrate auth",
					);
					// Allow retry if hydration failed unexpectedly.
					hasHydratedFromLogtoRef.current = false;
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
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
		if (!logtoAuthenticated || logtoLoading) {
			return;
		}

		const checkTokenExpiration = () => {
			const tokenExpiresAt = getTokenExpiresAt();
			if (!tokenExpiresAt) return;

			if (Date.now() >= tokenExpiresAt) {
				authLog.warn("token expired, signing out");
				forceLogoutDueToInvalidContext("Token expired");
			}
		};

		checkTokenExpiration();

		const intervalId = setInterval(checkTokenExpiration, 60 * 1000);
		return () => clearInterval(intervalId);
	}, [logtoAuthenticated, logtoLoading, forceLogoutDueToInvalidContext]);

	useEffect(() => {
		const handleAuthUpdated = () => {
			authLog.debug("AUTH_UPDATED_EVENT received");
			const storedUser = getConvexUser();
			const storedAuthContext = getAuthContext();

			if (storedUser) {
				setUser(storedUser);
			}
			if (storedAuthContext) {
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
			clearAuthStorage();
			setUser(null);
			setLogtoUser(null);
			setAuthContextState(null);
			setError(null);

			// Sign out from Logto
			await signOut();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Sign out failed");
		}
	}, [signOut, clearAuthStorage]);

	const forceRefreshAuthContext = useCallback(async (): Promise<void> => {
		authLog.debug("forcing auth context refresh");

		clearAuthContext();
		clearConvexUser();
		clearTokenExpiresAt();
		setAuthContextState(null);
		setUser(null);

		if (logtoAuthenticated && !logtoLoading) {
			try {
				const accessToken =
					await logtoFunctionsRef.current.getAccessToken(apiResource);
				const idTokenClaims =
					await logtoFunctionsRef.current.getIdTokenClaims();

				if (accessToken && idTokenClaims && logtoUser) {
					const result = await verifyLogtoToken(
						accessToken,
						idTokenClaims as unknown as LogtoTokenClaims,
						logtoUser,
					);

					if (result.success && result.authContext && result.user) {
						authLog.debug("auth context refreshed successfully");
						setAuthContextState(result.authContext);
						setUser(result.user);

						if (result.tokenExpiresAt) {
							setTokenExpiresAt(result.tokenExpiresAt);
						}
					}
				}
			} catch (error) {
				if (isLogtoRequestErrorLike(error)) {
					await forceLogoutDueToInvalidContext(
						"Logto session invalid during forced refresh",
					);
					return;
				}
				authLog.error("failed to refresh auth context:", error);
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

	useEffect(() => {
		authLog.debug("auth state changed:", {
			isAuthenticated: Boolean(user && authContext),
			userId: user?._id,
		});
	}, [user, authContext]);

	return (
		<AuthReactContext.Provider value={value}>
			{children}
		</AuthReactContext.Provider>
	);
}

// Re-export types
export type { AuthContextValue, LogtoUserInfo, LogtoTokenClaims };
