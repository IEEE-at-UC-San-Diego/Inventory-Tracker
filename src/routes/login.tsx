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
		<div className="min-h-screen bg-surface px-4 py-12 sm:px-6 lg:px-8">
			<div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-5xl items-center">
				<div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
					<div className="hidden rounded-[2rem] border border-border/70 bg-surface-brand p-10 shadow-[0_32px_120px_-64px_rgba(37,99,235,0.4)] lg:block">
						<p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
							IEEE at UCSD
						</p>
						<h1 className="mt-4 max-w-sm text-4xl font-semibold leading-tight text-foreground">
							Inventory that stays readable, current, and team-safe.
						</h1>
						<p className="mt-4 max-w-md text-base text-muted-foreground">
							Track stock movement, coordinate blueprint editing, and keep
							organization-scoped inventory data reliable from one light-first
							workspace.
						</p>
					</div>

					<div className="rounded-[2rem] border border-border/70 bg-surface-elevated p-8 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.42)] sm:p-10">
				{/* Logo */}
						<div className="text-center">
							<div className="mx-auto flex h-16 items-center justify-center">
								<img src="/Blue_Logo.png" alt="IEEE Logo" className="h-16 w-auto" />
							</div>
							<p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
								Sign In
							</p>
							<h2 className="mt-3 text-3xl font-extrabold text-foreground">
								Inventory Tracker
							</h2>
							<p className="mt-2 text-sm text-muted-foreground">
								Sign in to manage inventory, storage layouts, and activity logs.
							</p>
						</div>

				{/* Error display */}
				{error && (
					<div className="rounded-xl border border-destructive/20 bg-surface-danger p-4" role="alert" aria-live="assertive">
						<div className="flex">
							<AlertCircle className="h-5 w-5 text-destructive" />
							<div className="ml-3">
								<h3 className="text-sm font-medium text-destructive">
									Authentication Error
								</h3>
								<p className="mt-1 text-sm text-destructive/85">{error}</p>
							</div>
						</div>
					</div>
				)}

				{/* Loading state */}
				{isLoading && (
					<div className="flex flex-col items-center justify-center py-8">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
						<p className="mt-2 text-sm text-muted-foreground">Loading...</p>
					</div>
				)}

				{/* Login options */}
				{!isLoading && (
					<div>
						{/* Logto Login */}
						<div>
							<button
								type="button"
								onClick={handleLogin}
								className="group relative flex w-full justify-center rounded-xl border border-transparent bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:ring-offset-2"
							>
								Sign in with IEEE at UCSD
							</button>
						</div>
					</div>
				)}

				{/* Footer */}
				<div className="text-center">
					<p className="text-xs text-muted-foreground">
						By signing in, you agree to our Terms of Service and Privacy Policy.
					</p>
				</div>
					</div>
				</div>
			</div>
		</div>
	);
}
