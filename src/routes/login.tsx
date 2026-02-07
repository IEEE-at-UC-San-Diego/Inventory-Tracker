import { useLogto } from "@logto/react";
import { createFileRoute, Navigate, useSearch } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
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
		const redirectTo = (search as { redirect?: string }).redirect || "/home";
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
					<div className="mx-auto h-16 flex items-center justify-center">
						<img src="/Blue_Logo.png" alt="IEEE Logo" className="h-16 w-auto" />
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
					<div>
						{/* Logto Login */}
						<div>
							<button
								onClick={handleLogin}
								className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-colors"
							>
								Sign in with IEEE at UCSD
							</button>
						</div>
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
