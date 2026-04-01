import { Link } from "@tanstack/react-router";
import {
	Map as BlueprintMap,
	History,
	Home,
	LogOut,
	Menu,
	Package,
	UserCircle2,
} from "lucide-react";
import { useId, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";

export default function Header() {
	const [isOpen, setIsOpen] = useState(false);
	const mobileNavId = useId();
	const { isAuthenticated, user } = useAuth();
	const { hasRole } = useRole();

	const navLinkClass =
		"mb-2 flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-foreground/85 transition-colors duration-[var(--duration-fast)] hover:bg-accent hover:text-accent-foreground";
	const activeNavLinkClass =
		"mb-2 flex min-h-11 items-center gap-3 rounded-lg bg-primary px-3 py-2.5 text-primary-foreground shadow-sm transition-colors duration-[var(--duration-fast)] hover:bg-primary/90";

	const activeLinkProps = {
		className: activeNavLinkClass,
		"aria-current": "page" as const,
	};

	return (
		<>
			<header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/80 bg-header px-3 py-2.5 text-header-foreground shadow-[var(--shadow-sm)] backdrop-blur sm:px-4 sm:py-3">
				<div className="flex items-center gap-3">
					{isAuthenticated && (
						<button
							type="button"
							onClick={() => setIsOpen(true)}
							className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
							aria-label="Open menu"
							aria-expanded={isOpen}
							aria-controls={mobileNavId}
						>
							<Menu className="h-6 w-6 shrink-0" aria-hidden />
						</button>
					)}
					<Link to="/home" className="flex items-center gap-3">
						<img src="/Blue_Logo.png" alt="IEEE Logo" className="h-10 w-auto" />
						<div className="hidden md:block">
							<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
								IEEE at UCSD
							</p>
							<p className="text-sm font-semibold text-foreground">
								Inventory Tracker
							</p>
						</div>
					</Link>
				</div>

				{isAuthenticated && (
					<div className="flex items-center gap-3">
						<div className="hidden items-center gap-2 rounded-md border border-border bg-surface-subtle/90 px-2.5 py-1.5 sm:flex">
							<UserCircle2 className="h-4 w-4 text-primary" />
							<div className="min-w-0 text-right">
								<p className="truncate text-xs font-medium text-foreground">
									{user?.name || "User"}
								</p>
								<p className="truncate text-[11px] text-muted-foreground">
									{user?.role || "Member"}
								</p>
							</div>
						</div>
						<Link
							to="/logout"
							className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
						>
							<LogOut className="h-3.5 w-3.5" />
							<span className="hidden sm:inline">Sign Out</span>
						</Link>
					</div>
				)}
			</header>

			{isAuthenticated && (
				<Sheet open={isOpen} onOpenChange={setIsOpen}>
					<SheetContent
						id={mobileNavId}
						side="left"
						className="flex h-full w-80 flex-col border-r border-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-[20rem]"
					>
						<div className="border-b border-border bg-surface p-4">
							<SheetTitle className="text-xl font-bold text-foreground">
								Navigation
							</SheetTitle>
						</div>
						<nav
							aria-label="Main navigation"
							className="flex-1 overflow-y-auto p-4"
						>
							<Link
								to="/home"
								onClick={() => setIsOpen(false)}
								className={navLinkClass}
								activeProps={activeLinkProps}
							>
								<span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
									<Home className="h-5 w-5" aria-hidden />
								</span>
								<span className="font-medium">Dashboard</span>
							</Link>

							<Link
								to="/parts"
								onClick={() => setIsOpen(false)}
								className={navLinkClass}
								activeProps={activeLinkProps}
							>
								<span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
									<Package className="h-5 w-5" aria-hidden />
								</span>
								<span className="font-medium">Inventory</span>
							</Link>

							<Link
								to="/blueprints"
								onClick={() => setIsOpen(false)}
								className={navLinkClass}
								activeProps={activeLinkProps}
							>
								<span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
									<BlueprintMap className="h-5 w-5" aria-hidden />
								</span>
								<span className="font-medium">Blueprints</span>
							</Link>

							{hasRole("General Officer") && (
								<Link
									to="/transactions"
									onClick={() => setIsOpen(false)}
									className={navLinkClass}
									activeProps={activeLinkProps}
								>
									<span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
										<History className="h-5 w-5" aria-hidden />
									</span>
									<span className="font-medium">Transactions</span>
								</Link>
							)}
						</nav>

						<div className="space-y-3 border-t border-border bg-surface p-4">
							<div className="rounded-md border border-border bg-surface-elevated p-3">
								<p className="truncate text-sm font-medium text-foreground">
									{user?.name || "User"}
								</p>
								<p className="truncate text-xs text-muted-foreground">
									{user?.email || "No email"}
								</p>
								<p className="mt-1 text-xs text-primary">
									{user?.role || "Member"}
								</p>
							</div>
							<Link
								to="/logout"
								onClick={() => setIsOpen(false)}
								className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm font-medium text-foreground transition-colors duration-[var(--duration-fast)] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
							>
								<LogOut className="h-4 w-4" />
								Sign Out
							</Link>
						</div>
					</SheetContent>
				</Sheet>
			)}
		</>
	);
}
