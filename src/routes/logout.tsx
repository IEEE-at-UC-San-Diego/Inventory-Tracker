import { useLogto } from "@logto/react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/logout")({
	component: LogoutPage,
});

function LogoutPage() {
	const { signOut: logtoSignOut } = useLogto();
	// Don't use our custom signOut to avoid circular dependency
	// We'll handle the cleanup directly here

	useEffect(() => {
		const performLogout = async () => {
			try {
				// Clear local storage
				if (typeof window !== "undefined") {
					localStorage.removeItem("inventory_tracker_convex_user");
					localStorage.removeItem("inventory_tracker_auth_context");
					localStorage.removeItem("inventory_tracker_token_expires_at");

					// Also clear any Logto-specific keys
					Object.keys(localStorage).forEach((key) => {
						if (key.startsWith("logto:")) {
							localStorage.removeItem(key);
						}
					});
				}

				// Sign out from Logto and redirect to login page
				await logtoSignOut(`${window.location.origin}/login`);
			} catch (error) {
				console.error("[logout] Error during logout:", error);
				// Even if Logto logout fails, redirect to login
				window.location.href = "/login";
			}
		};

		performLogout();
	}, [logtoSignOut]);

	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-md w-full text-center">
				<Loader2 className="h-16 w-16 animate-spin text-cyan-600 mx-auto mb-4" />
				<h2 className="text-2xl font-bold text-gray-900 mb-2">
					Signing you out...
				</h2>
				<p className="text-gray-600">Please wait while we end your session</p>
			</div>
		</div>
	);
}
