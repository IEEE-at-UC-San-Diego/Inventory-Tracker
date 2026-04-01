import { useLogto } from "@logto/react";
import { createFileRoute, Navigate, useSearch } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, Package2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

const highlights = [
	{
		label: "Stock",
		text: "Live counts and movement history in one place.",
	},
	{
		label: "Blueprints",
		text: "Shared edits stay scoped to your organization.",
	},
	{
		label: "Audit",
		text: "Activity you can trace when something changes.",
	},
];

function LoginPage() {
	const { isAuthenticated, isLoading } = useAuth();
	const search = useSearch({ from: "/login" });
	const [error, setError] = useState<string | null>(null);

	const { signIn } = useLogto();

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

	/* Fill space below sticky header (~56–64px); avoid page scroll */
	return (
		<div className="relative h-[calc(100dvh-4.5rem)] max-h-[calc(100dvh-4.5rem)] overflow-hidden overscroll-none bg-background">
			{/* Atmosphere: soft washes + fine grid (no heavy purple gradients) */}
			<div className="pointer-events-none absolute inset-0" aria-hidden>
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-8%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_55%)]" />
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_100%_100%,color-mix(in_oklch,var(--surface-brand)_85%,transparent),transparent_70%)]" />
				<div
					className="absolute inset-0 opacity-[0.35]"
					style={{
						backgroundImage: `linear-gradient(color-mix(in oklch, var(--border) 55%, transparent) 1px, transparent 1px),
              linear-gradient(90deg, color-mix(in oklch, var(--border) 55%, transparent) 1px, transparent 1px)`,
						backgroundSize: "48px 48px",
					}}
				/>
			</div>

			<div className="page-enter relative z-10 mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col justify-center px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5">
				<div className="grid min-h-0 w-full items-center gap-4 lg:grid-cols-[1.05fr_minmax(0,420px)] lg:gap-8 xl:gap-10">
					{/* Hero — desktop */}
					<section className="hidden min-h-0 flex-col justify-center lg:flex">
						<p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-primary">
							IEEE at UCSD
						</p>
						<h1 className="font-display mt-3 max-w-[20ch] text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-foreground">
							Inventory that stays readable, current, and team-safe.
						</h1>
						<p className="mt-3 max-w-md text-[14px] leading-snug text-muted-foreground">
							Track stock movement, coordinate blueprint work, and keep
							organization-scoped data reliable from one workspace.
						</p>
						<ul className="mt-5 space-y-3 border-l-2 border-primary/25 pl-5">
							{highlights.map((item) => (
								<li key={item.label}>
									<p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
										{item.label}
									</p>
									<p className="mt-1 text-sm leading-snug text-foreground/90">
										{item.text}
									</p>
								</li>
							))}
						</ul>
					</section>

					{/* Hero — mobile */}
					<section className="rounded-xl border border-border/60 bg-surface-elevated/80 px-4 py-3 shadow-sm backdrop-blur-sm lg:hidden">
						<p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-primary">
							IEEE at UCSD
						</p>
						<h1 className="font-display mt-1 text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground">
							Inventory Tracker
						</h1>
						<p className="mt-1 text-xs leading-snug text-muted-foreground">
							Sign in to manage parts, storage, and activity for your org.
						</p>
					</section>

					{/* Sign-in card */}
					<div className="flex min-h-0 flex-col">
						<div className="flex min-h-0 flex-col rounded-2xl border border-border/70 bg-surface-elevated p-5 shadow-[0_1px_0_0_color-mix(in_oklch,var(--border)_80%,transparent),0_24px_56px_-32px_color-mix(in_oklch,var(--foreground)_18%,transparent)] sm:p-7">
							<div className="flex flex-col items-center text-center">
								<div className="relative">
									<div className="absolute -inset-2 rounded-2xl bg-gradient-to-b from-primary/8 to-transparent blur-sm" />
									<img
										src="/Blue_Logo.png"
										alt=""
										className="relative h-12 w-auto sm:h-14"
									/>
								</div>
								<p className="mt-4 font-mono text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
									Sign in
								</p>
								<h2 className="font-display mt-1 text-xl font-semibold tracking-[-0.02em] text-foreground sm:text-[1.4rem]">
									Welcome back
								</h2>
								<p className="mt-2 max-w-[28ch] text-xs leading-snug text-muted-foreground sm:text-sm">
									Use your IEEE at UCSD account to continue.
								</p>
							</div>

							<div className="mt-5 flex flex-col gap-4">
								{error && (
									<div
										className="rounded-xl border border-destructive/25 bg-surface-danger/80 px-4 py-3 text-left"
										role="alert"
										aria-live="assertive"
									>
										<div className="flex gap-3">
											<AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
											<div>
												<p className="text-sm font-medium text-destructive">
													Sign-in failed
												</p>
												<p className="mt-1 text-sm text-destructive/90">
													{error}
												</p>
											</div>
										</div>
									</div>
								)}

								{isLoading ? (
									<div className="flex flex-col items-center justify-center gap-2 py-6">
										<div
											className="h-9 w-9 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
											aria-hidden
										/>
										<p className="text-sm text-muted-foreground">
											Checking session…
										</p>
									</div>
								) : (
									<button
										type="button"
										onClick={handleLogin}
										className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_1px_0_0_color-mix(in_oklch,white_22%,transparent)_inset] transition-[background-color,box-shadow,transform] duration-[var(--duration-fast)] hover:bg-primary/92 hover:shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
									>
										<Package2 className="h-4 w-4 opacity-90" aria-hidden />
										Sign in with IEEE at UCSD
										<ArrowRight className="h-4 w-4 transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5" />
									</button>
								)}
							</div>

							<p className="mt-4 text-center text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
								By signing in, you agree to the Terms of Service and Privacy
								Policy.
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
