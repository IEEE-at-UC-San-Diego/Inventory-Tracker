import { Link } from "@tanstack/react-router";
import {
	Map as BlueprintMap,
	History,
	Home,
	LogOut,
	Menu,
	Package,
	UserCircle2,
	X,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";

export default function Header() {
	const [isOpen, setIsOpen] = useState(false);
	const { isAuthenticated, user } = useAuth();
	const { hasRole } = useRole();

	const navLinkClass =
		"mb-2 flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-gray-800";
	const activeNavLinkClass =
		"mb-2 flex items-center gap-3 rounded-lg bg-cyan-600 p-3 transition-colors hover:bg-cyan-700";

	return (
		<>
			<header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-3 text-white shadow-lg">
				<div className="flex items-center gap-3">
					{isAuthenticated && (
						<button
							type="button"
							onClick={() => setIsOpen(true)}
							className="rounded-lg p-2 transition-colors hover:bg-gray-700"
							aria-label="Open menu"
						>
							<Menu className="h-6 w-6" />
						</button>
					)}
					<Link to="/home">
						<img src="/White_Logo_IEEE.png" alt="IEEE Logo" className="h-10" />
					</Link>
				</div>

				{isAuthenticated && (
					<div className="flex items-center gap-3">
						<div className="hidden items-center gap-2 rounded-md border border-gray-600 bg-gray-700/60 px-2.5 py-1.5 sm:flex">
							<UserCircle2 className="h-4 w-4 text-cyan-300" />
							<div className="min-w-0 text-right">
								<p className="truncate text-xs font-medium text-white">
									{user?.name || "User"}
								</p>
								<p className="truncate text-[11px] text-gray-300">
									{user?.role || "Member"}
								</p>
							</div>
						</div>
						<Link
							to="/logout"
							className="inline-flex items-center gap-1.5 rounded-md border border-gray-600 px-2.5 py-1.5 text-xs font-medium text-gray-100 transition-colors hover:bg-gray-700"
						>
							<LogOut className="h-3.5 w-3.5" />
							<span className="hidden sm:inline">Sign Out</span>
						</Link>
					</div>
				)}
			</header>

			{isAuthenticated && (
				<>
					{isOpen && (
						<div
							className="fixed inset-0 z-40 bg-black/50"
							onClick={() => setIsOpen(false)}
							aria-hidden="true"
						/>
					)}
					<aside
						className={`fixed left-0 top-0 z-50 flex h-full w-80 transform flex-col bg-gray-900 text-white shadow-2xl transition-transform duration-300 ease-in-out ${
							isOpen ? "translate-x-0" : "-translate-x-full"
						}`}
					>
						<div className="flex items-center justify-between border-b border-gray-700 p-4">
							<h2 className="text-xl font-bold">Navigation</h2>
							<button
								type="button"
								onClick={() => setIsOpen(false)}
								className="rounded-lg p-2 transition-colors hover:bg-gray-800"
								aria-label="Close menu"
							>
								<X className="h-6 w-6" />
							</button>
						</div>

						<nav className="flex-1 overflow-y-auto p-4">
							<Link
								to="/home"
								onClick={() => setIsOpen(false)}
								className={navLinkClass}
								activeProps={{ className: activeNavLinkClass }}
							>
								<span className="flex h-5 w-5 items-center justify-center text-gray-300">
									<Home className="h-5 w-5" />
								</span>
								<span className="font-medium">Dashboard</span>
							</Link>

							<Link
								to="/parts"
								onClick={() => setIsOpen(false)}
								className={navLinkClass}
								activeProps={{ className: activeNavLinkClass }}
							>
								<span className="flex h-5 w-5 items-center justify-center text-gray-300">
									<Package className="h-5 w-5" />
								</span>
								<span className="font-medium">Inventory</span>
							</Link>

							<Link
								to="/blueprints"
								onClick={() => setIsOpen(false)}
								className={navLinkClass}
								activeProps={{ className: activeNavLinkClass }}
							>
								<span className="flex h-5 w-5 items-center justify-center text-gray-300">
									<BlueprintMap className="h-5 w-5" />
								</span>
								<span className="font-medium">Blueprints</span>
							</Link>

							{hasRole("General Officer") && (
								<Link
									to="/transactions"
									onClick={() => setIsOpen(false)}
									className={navLinkClass}
									activeProps={{ className: activeNavLinkClass }}
								>
									<span className="flex h-5 w-5 items-center justify-center text-gray-300">
										<History className="h-5 w-5" />
									</span>
									<span className="font-medium">Transactions</span>
								</Link>
							)}
						</nav>

						<div className="space-y-3 border-t border-gray-700 bg-gray-800 p-4">
							<div className="rounded-md border border-gray-700 bg-gray-900/60 p-3">
								<p className="truncate text-sm font-medium text-white">
									{user?.name || "User"}
								</p>
								<p className="truncate text-xs text-gray-300">
									{user?.email || "No email"}
								</p>
								<p className="mt-1 text-xs text-cyan-300">
									{user?.role || "Member"}
								</p>
							</div>
							<Link
								to="/logout"
								onClick={() => setIsOpen(false)}
								className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-600 px-3 py-2 text-sm font-medium text-gray-100 transition-colors hover:bg-gray-700"
							>
								<LogOut className="h-4 w-4" />
								Sign Out
							</Link>
						</div>
					</aside>
				</>
			)}
		</>
	);
}
