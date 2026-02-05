import { useHandleSignInCallback, useLogto } from "@logto/react";
import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { LogtoTokenClaims, LogtoUserInfo } from "../lib/auth";
import {
	AUTH_UPDATED_EVENT,
	dispatchAuthUpdatedEvent,
	getAuthContext,
	getConvexUser,
	setAuthContext,
	setConvexUser,
	setTokenExpiresAt,
	verifyLogtoToken,
} from "../lib/auth";

// API resource must match LogtoAuthProvider config to get JWT access tokens
const apiResource =
	import.meta.env.VITE_LOGTO_API_RESOURCE || "urn:inventory-tracker:api";

export const Route = createFileRoute("/callback")({
	component: CallbackPage,
});

function CallbackPage() {
	const { isLoading, error } = useHandleSignInCallback();
	const navigate = useNavigate();
	const search = useSearch({ from: "/callback" });
	const [status, setStatus] = useState<"processing" | "success" | "error">(
		"processing",
	);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const {
		getAccessToken,
		getIdTokenClaims,
		fetchUserInfo,
		isAuthenticated: logtoAuthenticated,
	} = useLogto();

	useEffect(() => {
		const handleCallback = async () => {
			const waitForAuthProviderHydration = async () => {
				if (typeof window === "undefined") {
					dispatchAuthUpdatedEvent();
					return;
				}

				await new Promise<void>((resolve) => {
					let resolved = false;

					const cleanup = () => {
						if (resolved) return;
						resolved = true;
						window.removeEventListener(AUTH_UPDATED_EVENT, handleAuthUpdated);
						window.clearTimeout(timeoutId);
						resolve();
					};

					const handleAuthUpdated = () => {
						cleanup();
					};

					window.addEventListener(AUTH_UPDATED_EVENT, handleAuthUpdated, {
						once: true,
					});

					const timeoutId = window.setTimeout(() => {
						cleanup();
					}, 1500);

					dispatchAuthUpdatedEvent();
				});
			};

			try {
				// Check for errors from Logto
				if (error) {
					setStatus("error");
					setErrorMessage(error.message || "Authentication failed");
					setTimeout(() => navigate({ to: "/login" }), 3000);
					return;
				}

				// If Logto callback is done, verify token with our backend
				if (!isLoading && logtoAuthenticated) {
					const accessToken = await getAccessToken(apiResource);
					const idTokenClaims = await getIdTokenClaims();
					const userInfo = await fetchUserInfo();

					if (!accessToken || !idTokenClaims) {
						setStatus("error");
						setErrorMessage("Failed to retrieve authentication tokens");
						setTimeout(() => navigate({ to: "/login" }), 3000);
						return;
					}

					// Verify token with Convex backend and sync user
					const result = await verifyLogtoToken(
						accessToken,
						idTokenClaims as unknown as LogtoTokenClaims,
						userInfo as LogtoUserInfo,
					);

					console.log("[callback] verifyLogtoToken SUCCESS:", {
						hasUser: !!result.user,
						hasAuthContext: !!result.authContext,
						tokenExpiresAt: result.tokenExpiresAt,
					});

					if (result.success && result.user && result.authContext) {
						// Store the user in local storage
						setConvexUser(result.user);
						console.log(
							"[callback] Wrote user to localStorage:",
							result.user._id,
						);

						// Store auth context to trigger immediate state refresh
						setAuthContext(result.authContext);
						console.log(
							"[callback] Wrote authContext to localStorage:",
							result.authContext.userId,
						);

						// Store token expiration time
						if (result.tokenExpiresAt) {
							setTokenExpiresAt(result.tokenExpiresAt);
							console.log("[callback] Wrote tokenExpiresAt to localStorage");
						}

						// Verify localStorage was written correctly
						const verifyUser = getConvexUser();
						const verifyAuthContext = getAuthContext();
						console.log("[callback] Verified localStorage contents:", {
							user: verifyUser
								? { _id: verifyUser._id, role: verifyUser.role }
								: undefined,
							authContext: verifyAuthContext,
						});

						setStatus("success");

						// Redirect to the original destination or dashboard
						const redirectTo =
							(search as { redirect?: string }).redirect || "/dashboard";
						await waitForAuthProviderHydration();
						navigate({ to: redirectTo });
					} else {
						setStatus("error");
						setErrorMessage(
							result.error || "Failed to authenticate with backend",
						);
						setTimeout(() => navigate({ to: "/login" }), 3000);
					}
				}
			} catch (err) {
				setStatus("error");
				setErrorMessage(
					err instanceof Error ? err.message : "An unexpected error occurred",
				);
				setTimeout(() => navigate({ to: "/login" }), 3000);
			}
		};

		handleCallback();
	}, [
		isLoading,
		error,
		logtoAuthenticated,
		navigate,
		search,
		getAccessToken,
		getIdTokenClaims,
		fetchUserInfo,
	]);

	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-md w-full">
				{status === "processing" && (
					<div className="text-center">
						<Loader2 className="h-16 w-16 animate-spin text-cyan-600 mx-auto mb-4" />
						<h2 className="text-2xl font-bold text-gray-900 mb-2">
							Signing you in...
						</h2>
						<p className="text-gray-600">
							Please wait while we verify your account
						</p>
					</div>
				)}

				{status === "success" && (
					<div className="text-center">
						<CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
						<h2 className="text-2xl font-bold text-gray-900 mb-2">
							Successfully signed in!
						</h2>
						<p className="text-gray-600">Redirecting you to the dashboard...</p>
					</div>
				)}

				{status === "error" && (
					<div className="text-center">
						<AlertCircle className="h-16 w-16 text-red-600 mx-auto mb-4" />
						<h2 className="text-2xl font-bold text-gray-900 mb-2">
							Authentication failed
						</h2>
						{errorMessage && (
							<p className="text-red-600 mb-4">{errorMessage}</p>
						)}
						<p className="text-gray-600">Redirecting you back to login...</p>
					</div>
				)}
			</div>
		</div>
	);
}
