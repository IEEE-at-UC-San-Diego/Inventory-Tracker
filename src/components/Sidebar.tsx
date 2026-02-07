import { Link } from "@tanstack/react-router";
import {
	Boxes,
	History,
	Home,
	Map as MapIcon,
	Package,
	Users,
	X,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useRole } from "../hooks/useRole";
import { cn } from "../lib/utils";
import type { UserRole } from "../types";

interface SidebarProps {
	isOpen: boolean;
	onClose: () => void;
}

interface NavItem {
	to: string;
	label: string;
	icon: React.ReactNode;
	requiredRole?: UserRole;
	badge?: React.ReactNode;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
	const { isAuthenticated } = useAuth();
	const { hasRole } = useRole();

	const navItems: NavItem[] = [
		{
			to: "/home",
			label: "Home",
			icon: <Home size={20} />,
			requiredRole: "Member",
		},
		{
			to: "/parts",
			label: "Inventory",
			icon: <Package size={20} />,
			requiredRole: "Member",
		},
		{
			to: "/blueprints",
			label: "Blueprints",
			icon: <MapIcon size={20} />,
			requiredRole: "Member",
		},
		{
			to: "/transactions",
			label: "Transactions",
			icon: <History size={20} />,
			requiredRole: "General Officers",
		},
	];

	// Filter nav items based on user role
	const visibleNavItems = navItems.filter(
		(item) => !item.requiredRole || hasRole(item.requiredRole),
	);

	return (
		<>
			{/* Mobile overlay */}
			{isOpen && (
				<div
					className="fixed inset-0 bg-black/50 z-40 lg:hidden"
					onClick={onClose}
					aria-hidden="true"
				/>
			)}

			{/* Sidebar */}
			<aside
				className={cn(
					"fixed top-0 left-0 h-full w-72 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col",
					isOpen ? "translate-x-0" : "-translate-x-full",
					"lg:translate-x-0 lg:static lg:h-screen", // Always visible on desktop
				)}
			>
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-gray-700">
					<div className="flex items-center gap-2">
						<Boxes className="w-6 h-6 text-cyan-400" />
						<h2 className="text-xl font-bold">Inventory Tracker</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-2 hover:bg-gray-800 rounded-lg transition-colors lg:hidden"
						aria-label="Close menu"
					>
						<X size={24} />
					</button>
				</div>

				{/* Navigation */}
				<nav className="flex-1 p-4 overflow-y-auto">
					{!isAuthenticated ? (
						<div className="text-center py-8">
							<p className="text-gray-400 text-sm">
								Please sign in to access the inventory system
							</p>
							<Link
								to="/login"
								onClick={onClose}
								className="mt-4 inline-flex items-center justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 transition-colors"
							>
								Sign In
							</Link>
						</div>
					) : (
						<ul className="space-y-1">
							{visibleNavItems.map((item) => (
								<li key={item.to}>
									<Link
										to={item.to}
										onClick={() => {
											// Close sidebar on mobile after navigation
											if (window.innerWidth < 1024) {
												onClose();
											}
										}}
										className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors"
										activeProps={{
											className:
												"flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors",
										}}
									>
										<span className="text-gray-400">{item.icon}</span>
										<span className="font-medium">{item.label}</span>
									</Link>
								</li>
							))}
						</ul>
					)}
				</nav>

				{/* Footer */}
				<div className="p-4 border-t border-gray-700 bg-gray-800">
					<div className="text-sm text-gray-400">
						<p>Multi-tenant Inventory Management</p>
						<p className="text-xs mt-1">v1.0.0</p>
					</div>
				</div>
			</aside>
		</>
	);
}

// Simple sidebar for unauthenticated pages
export function SimpleSidebar({ isOpen, onClose }: SidebarProps) {
	return (
		<>
			{isOpen && (
				<div
					className="fixed inset-0 bg-black/50 z-40 lg:hidden"
					onClick={onClose}
					aria-hidden="true"
				/>
			)}
			<aside
				className={cn(
					"fixed top-0 left-0 h-full w-72 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col",
					isOpen ? "translate-x-0" : "-translate-x-full",
					"lg:translate-x-0 lg:static",
				)}
			>
				<div className="flex items-center justify-between p-4 border-b border-gray-700">
					<div className="flex items-center gap-2">
						<Boxes className="w-6 h-6 text-cyan-400" />
						<h2 className="text-xl font-bold">Inventory Tracker</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-2 hover:bg-gray-800 rounded-lg transition-colors lg:hidden"
						aria-label="Close menu"
					>
						<X size={24} />
					</button>
				</div>

				<nav className="flex-1 p-4">
					<Link
						to="/"
						onClick={onClose}
						className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors"
					>
						<Home size={20} />
						<span className="font-medium">Home</span>
					</Link>
					<Link
						to="/login"
						onClick={onClose}
						className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mt-2"
					>
						<Users size={20} />
						<span className="font-medium">Sign In</span>
					</Link>
				</nav>

				<div className="p-4 border-t border-gray-700 bg-gray-800">
					<p className="text-sm text-gray-400">
						Multi-tenant Inventory Management
					</p>
				</div>
			</aside>
		</>
	);
}
