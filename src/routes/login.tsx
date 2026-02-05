import { useLogto } from "@logto/react";
import { createFileRoute, Navigate, useSearch } from "@tanstack/react-router";
import { AlertCircle, Boxes } from "lucide-react";
import { useState } from "react";
import type { User, UserRole } from "@/types";
import { useAuth } from "../hooks/useAuth";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const { isAuthenticated, isLoading } = useAuth();
	const search = useSearch({ from: "/login" });
	const [error, setError] = useState<string | null>(null);

	// Get Logto methods
	const { signIn } = useLogto();

	// If already authenticated, redirect to dashboard
	if (isAuthenticated && !isLoading) {
		const redirectTo =
			(search as { redirect?: string }).redirect || "/dashboard";
		return <Navigate to={redirectTo} />;
	}

	const handleLogin = async () => {
		setError(null);
		try {
			const redirectUri = `${window.location.origin}/callback`;
			await signIn(redirectUri);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Login failed";
			setError(errorMessage);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-md w-full space-y-8">
				{/* Logo */}
				<div className="text-center">
					<div className="mx-auto h-16 w-16 bg-cyan-600 rounded-xl flex items-center justify-center">
						<Boxes className="h-10 w-10 text-white" />
					</div>
					<h2 className="mt-6 text-3xl font-extrabold text-gray-900">
						Inventory Tracker
					</h2>
					<p className="mt-2 text-sm text-gray-600">
						Sign in to manage your inventory
					</p>
				</div>

				{/* Error display */}
				{error && (
					<div className="rounded-md bg-red-50 p-4">
						<div className="flex">
							<AlertCircle className="h-5 w-5 text-red-400" />
							<div className="ml-3">
								<h3 className="text-sm font-medium text-red-800">
									Authentication Error
								</h3>
								<p className="text-sm text-red-700 mt-1">{error}</p>
							</div>
						</div>
					</div>
				)}

				{/* Loading state */}
				{isLoading && (
					<div className="flex flex-col items-center justify-center py-8">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
						<p className="mt-2 text-sm text-gray-600">Loading...</p>
					</div>
				)}

				{/* Login options */}
				{!isLoading && (
					<div className="space-y-6">
						{/* Logto Login */}
						<div>
							<button
								onClick={handleLogin}
								className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-colors"
							>
								Sign in with Logto
							</button>
						</div>

						{/* Divider */}
						<div className="relative">
							<div className="absolute inset-0 flex items-center">
								<div className="w-full border-t border-gray-300" />
							</div>
							<div className="relative flex justify-center text-sm">
								<span className="px-2 bg-gray-50 text-gray-500">
									Development Mode
								</span>
							</div>
						</div>

						{/* Dev login options */}
						<div className="grid grid-cols-4 gap-3">
							<DevLoginButton role="Member" label="Read-only" />
							<DevLoginButton role="General Officers" label="Check in/out" />
							<DevLoginButton role="Executive Officers" label="Can edit" />
							<DevLoginButton role="Administrator" label="Full access" />
						</div>

						<p className="text-xs text-center text-gray-500">
							Development login allows testing different user roles without
							Logto configuration.
						</p>
					</div>
				)}

				{/* Footer */}
				<div className="text-center">
					<p className="text-xs text-gray-400">
						By signing in, you agree to our Terms of Service and Privacy Policy.
					</p>
				</div>
			</div>
		</div>
	);
}

// Development login component for testing purposes
function DevLoginButton({ role, label }: { role: UserRole; label: string }) {
	const handleDevLogin = async () => {
		// Store dev user info for development testing
		const devUser: User = {
			_id: `dev-convex-id-${Date.now()}`,
			logtoUserId: `dev-user-${role.toLowerCase()}`,
			name: `Dev ${role}`,
			email: `${role.toLowerCase()}@dev.example.com`,
			orgId: "dev-org-id",
			role,
			createdAt: Date.now(),
		};

		// Store in local storage (note: this bypasses Logto and is for dev only)
		localStorage.setItem(
			"inventory_tracker_convex_user",
			JSON.stringify(devUser),
		);

		// Reload to trigger auth state refresh
		window.location.href = "/dashboard";
	};

	return (
		<button
			onClick={handleDevLogin}
			className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
		>
			<span className="text-sm font-medium text-gray-900">{role}</span>
			<span className="text-xs text-gray-500 mt-1">{label}</span>
		</button>
	);
}
