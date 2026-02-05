import { Link } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
	label: string;
	to?: string;
	icon?: React.ReactNode;
}

interface BreadcrumbsProps {
	items: BreadcrumbItem[];
	className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
	return (
		<nav className={cn("flex items-center text-sm text-gray-500", className)}>
			<ol className="flex items-center flex-wrap gap-1">
				{/* Home link */}
				<li>
					<Link
						to="/dashboard"
						className="flex items-center gap-1 hover:text-cyan-600 transition-colors"
					>
						<Home className="w-4 h-4" />
						<span className="sr-only">Dashboard</span>
					</Link>
				</li>

				{items.map((item, index) => (
					<li key={index} className="flex items-center gap-1">
						<ChevronRight className="w-4 h-4 text-gray-400" />
						{item.to ? (
							<Link
								to={item.to}
								className="flex items-center gap-1 hover:text-cyan-600 transition-colors"
							>
								{item.icon && <span className="w-4 h-4">{item.icon}</span>}
								<span
									className={cn(
										index === items.length - 1 && "text-gray-900 font-medium",
									)}
								>
									{item.label}
								</span>
							</Link>
						) : (
							<span className="flex items-center gap-1 text-gray-900 font-medium">
								{item.icon && <span className="w-4 h-4">{item.icon}</span>}
								{item.label}
							</span>
						)}
					</li>
				))}
			</ol>
		</nav>
	);
}

// Predefined breadcrumb presets for common routes
export const breadcrumbPresets = {
	parts: (partName?: string): BreadcrumbItem[] => [
		{ label: "Parts", to: "/parts" },
		...(partName ? [{ label: partName }] : []),
	],
	blueprints: (blueprintName?: string): BreadcrumbItem[] => [
		{ label: "Blueprints", to: "/blueprints" },
		...(blueprintName ? [{ label: blueprintName }] : []),
	],
	inventory: (compartmentLabel?: string): BreadcrumbItem[] => [
		{ label: "Inventory", to: "/inventory" },
		...(compartmentLabel ? [{ label: compartmentLabel }] : []),
	],
	transactions: (): BreadcrumbItem[] => [
		{ label: "Transactions", to: "/transactions" },
	],
	settings: (): BreadcrumbItem[] => [{ label: "Settings", to: "/settings" }],
	users: (): BreadcrumbItem[] => [{ label: "Users", to: "/users" }],
};
