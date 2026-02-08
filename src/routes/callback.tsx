import { useHandleSignInCallback, useLogto } from "@logto/react";
import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LogtoTokenClaims, LogtoUserInfo } from "../lib/auth";
import {
	dispatchAuthUpdatedEvent,
	setAuthContext,
	setConvexUser,
	setTokenExpiresAt,
	verifyLogtoToken,
} from "../lib/auth";
import { authLog } from "../lib/authLogger";

// API resource must match LogtoAuthProvider config to get JWT access tokens
const apiResource =
	import.meta.env.VITE_LOGTO_API_RESOURCE || "urn:inventory-tracker:api";

export const Route = createFileRoute("/callback")({
	component: CallbackPage,
});

function CallbackPage() {
	const { isLoading: callbackLoading, error: callbackError } =
		useHandleSignInCallback();
	const navigate = useNavigate();
	const search = useSearch({ from: "/callback" });
	const [status, setStatus] = useState<"processing" | "success" | "error">(
		"processing",
	);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const verifyStartedRef = useRef(false);

	const {
		getAccessToken,
		getIdTokenClaims,
		fetchUserInfo,
		isAuthenticated: logtoAuthenticated,
	} = useLogto();

	// Handle Logto callback errors
	useEffect(() => {
		if (callbackError) {
			setStatus("error");
			setErrorMessage(callbackError.message || "Authentication failed");
			const id = window.setTimeout(() => navigate({ to: "/login" }), 3000);
			return () => window.clearTimeout(id);
		}
	}, [callbackError, navigate]);

	// Once Logto callback completes and user is authenticated, verify with backend
	useEffect(() => {
		// Wait for Logto SDK to finish processing the callback
		if (callbackLoading || callbackError || !logtoAuthenticated) return;
		// Only run once
		if (verifyStartedRef.current) return;
		verifyStartedRef.current = true;

		const verifyAndRedirect = async () => {
			try {
				const accessToken = await getAccessToken(apiResource);
				const idTokenClaims = await getIdTokenClaims();
				const userInfo = await fetchUserInfo();

				if (!accessToken || !idTokenClaims) {
					setStatus("error");
					setErrorMessage("Failed to retrieve authentication tokens");
					setTimeout(() => navigate({ to: "/login" }), 3000);
					return;
				}

				// Verify token with our backend and sync user to Convex
				const result = await verifyLogtoToken(
					accessToken,
					idTokenClaims as unknown as LogtoTokenClaims,
					userInfo as LogtoUserInfo,
				);

				authLog.debug("callback verifyLogtoToken result:", {
					success: result.success,
					hasUser: !!result.user,
				});

				if (result.success && result.user && result.authContext) {
					// Persist auth state to localStorage
					setConvexUser(result.user);
					setAuthContext(result.authContext);
					if (result.tokenExpiresAt) {
						setTokenExpiresAt(result.tokenExpiresAt);
					}

					// Notify AuthProvider to pick up the new state
					dispatchAuthUpdatedEvent();

					setStatus("success");

					// Small delay to let AuthProvider hydrate before navigating
					await new Promise((r) => setTimeout(r, 100));

					const redirectTo =
						(search as { redirect?: string }).redirect || "/home";
					navigate({ to: redirectTo });
				} else {
					setStatus("error");
					setErrorMessage(
						result.error || "Failed to authenticate with backend",
					);
					setTimeout(() => navigate({ to: "/login" }), 3000);
				}
			} catch (err) {
				authLog.error("callback verification error:", err);
				setStatus("error");
				setErrorMessage(
					err instanceof Error ? err.message : "An unexpected error occurred",
				);
				setTimeout(() => navigate({ to: "/login" }), 3000);
			}
		};

		verifyAndRedirect();
	}, [
		callbackLoading,
		callbackError,
		logtoAuthenticated,
		navigate,
		search,
		getAccessToken,
		getIdTokenClaims,
		fetchUserInfo,
	]);

	// Callback finished but user is still unauthenticated after Logto completed
	useEffect(() => {
		if (!callbackLoading && !callbackError && !logtoAuthenticated) {
			setStatus("error");
			setErrorMessage("Sign-in was not completed. Please try again.");
			const id = window.setTimeout(() => navigate({ to: "/login" }), 3000);
			return () => window.clearTimeout(id);
		}
	}, [callbackLoading, callbackError, logtoAuthenticated, navigate]);

	// Safety timeout
	useEffect(() => {
		if (status !== "processing") return;

		const timeoutId = window.setTimeout(() => {
			setStatus("error");
			setErrorMessage("Authentication timed out. Please sign in again.");
			navigate({ to: "/login" });
		}, 20_000);

		return () => window.clearTimeout(timeoutId);
	}, [status, navigate]);

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
