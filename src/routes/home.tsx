import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Activity,
	AlertTriangle,
	ArrowLeftRight,
	ArrowRight,
	CheckCircle2,
	Clock4,
	History,
	Map as BlueprintMap,
	Minus,
	Package,
	Plus,
	Users,
	Wrench,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { QuantityDelta, TransactionBadge } from "@/components/transactions";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	StatCard,
} from "@/components/ui/card";
import { ToastProvider } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useQuery } from "@/integrations/convex/react-query";

export const Route = createFileRoute("/home")({
	component: HomePage,
});

function HomePage() {
	return (
		<ProtectedRoute>
			<ToastProvider>
				<HomeContent />
			</ToastProvider>
		</ProtectedRoute>
	);
}

function HomeContent() {
	const { user, authContext, isLoading } = useAuth();
	const { isAdmin, isEditor } = useRole();

	const stats = useQuery(
		api.organization_helpers.getOrgStats,
		authContext ? { authContext } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const transactionsResult = useQuery(
		api.transactions.queries.list,
		authContext ? { authContext, limit: 10 } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const inventoryResult = useQuery(
		api.inventory.queries.list,
		authContext ? { authContext, includeDetails: true } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const blueprintsResult = useQuery(
		api.blueprints.queries.list,
		authContext ? { authContext } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const usersResult = useQuery(
		api.organizations.queries.getOrgMembers,
		authContext
			? {
					authContext,
					organizationId: authContext.orgId as Id<"organizations">,
				}
			: undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);

	const recentTransactions = transactionsResult?.items?.slice(0, 10) || [];
	const blueprints = blueprintsResult || [];
	const orgUsers = usersResult || [];
	const inventoryItems = (inventoryResult || []) as Array<{
		_id: Id<"inventory">;
		partId: Id<"parts">;
		compartmentId: Id<"compartments">;
		quantity: number;
		part?: {
			_id: Id<"parts">;
			name: string;
			sku?: string;
			category?: string;
		};
	}>;

	const lowStockItems = useMemo(() => {
		if (inventoryItems.length === 0) return [];
		return inventoryItems
			.filter((item) => item.quantity < 10)
			.sort((a, b) => a.quantity - b.quantity)
			.slice(0, 5);
	}, [inventoryItems]);

	const lockedBlueprints = useMemo(() => {
		return blueprints.filter((bp) => bp.lockedBy);
	}, [blueprints]);

	const todayStats = useMemo(() => {
		const now = Date.now();
		const oneDayMs = 24 * 60 * 60 * 1000;
		const todayTransactions = recentTransactions.filter(
			(t) => now - t.timestamp < oneDayMs,
		);

		return {
			total: todayTransactions.length,
			adds: todayTransactions.filter((t) => t.actionType === "Add").length,
			removes: todayTransactions.filter((t) => t.actionType === "Remove")
				.length,
			moves: todayTransactions.filter((t) => t.actionType === "Move").length,
			adjusts: todayTransactions.filter((t) => t.actionType === "Adjust")
				.length,
		};
	}, [recentTransactions]);

	return (
		<div className="bg-gradient-to-b from-slate-50/80 to-background">
			<div className="mx-auto w-full max-w-[1480px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
				<Card className="border-slate-200 bg-gradient-to-r from-white via-white to-cyan-50/40 shadow-sm">
					<CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-1">
							<CardTitle className="text-2xl sm:text-3xl">
								Welcome back, {user?.name?.split(" ")[0] || "User"}
							</CardTitle>
							<CardDescription className="text-sm sm:text-base">
								Track stock movement, spot risks early, and keep storage
								organized.
							</CardDescription>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<LiveIndicator />
							<span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600">
								<Clock4 className="h-3.5 w-3.5" />
								{new Date().toLocaleTimeString()}
							</span>
						</div>
					</CardHeader>
				</Card>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
					<StatCard
						title="Total Parts"
						value={stats?.totalParts || 0}
						description="Active parts in catalog"
						icon={<Package className="h-4 w-4" />}
					/>
					<StatCard
						title="Inventory Units"
						value={stats?.totalInventory || 0}
						description="Units across all locations"
						icon={<Wrench className="h-4 w-4" />}
					/>
					<StatCard
						title="Active Blueprints"
						value={blueprints.length}
						description={`${lockedBlueprints.length} locked`}
						icon={<BlueprintMap className="h-4 w-4" />}
					/>
					<StatCard
						title="Transactions Today"
						value={todayStats.total}
						description="Past 24 hours"
						icon={<History className="h-4 w-4" />}
					/>
				</div>

				<div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
					<Card className="xl:col-span-2">
						<CardHeader>
							<CardTitle className="text-lg">Quick Actions</CardTitle>
							<CardDescription>
								Go directly to your most common tasks.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-2">
							<QuickActionButton
								to="/parts/new"
								icon={<Package className="h-4 w-4" />}
								title="Create Part"
								description="Add a new part record"
							/>
							<QuickActionButton
								to="/parts"
								icon={<Plus className="h-4 w-4" />}
								title="Check In"
								description="Receive inventory into storage"
							/>
							{(isEditor() || isAdmin()) && (
								<QuickActionButton
									to="/parts"
									icon={<Minus className="h-4 w-4" />}
									title="Check Out"
									description="Issue inventory from storage"
								/>
							)}
							<QuickActionButton
								to="/blueprints"
								icon={<BlueprintMap className="h-4 w-4" />}
								title="Open Blueprints"
								description="Review storage layout"
							/>
						</CardContent>
					</Card>

					<Card className="xl:col-span-3">
						<CardHeader className="flex-row items-start justify-between gap-4">
							<div className="space-y-1">
								<CardTitle className="text-lg">Recent Activity</CardTitle>
								<CardDescription>
									Latest inventory transactions across your team.
								</CardDescription>
							</div>
							<Button asChild variant="outline" size="sm">
								<Link to="/transactions">
									View all
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
						</CardHeader>
						<CardContent>
							{recentTransactions.length > 0 ? (
								<div className="space-y-2">
									{recentTransactions.slice(0, 6).map((transaction) => (
										<div
											key={transaction._id}
											className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5"
										>
											<div className="flex items-center gap-3">
												<TransactionBadge
													actionType={transaction.actionType}
													showLabel={false}
													size="sm"
												/>
												<div>
													<p className="text-sm font-medium text-slate-900">
														{transaction.part?.name || "Unknown Part"}
													</p>
													<p className="text-xs text-slate-500">
														{transaction.user?.name || "Unknown user"} •{" "}
														{formatRelativeTime(transaction.timestamp)}
													</p>
												</div>
											</div>
											<QuantityDelta delta={transaction.quantityDelta} />
										</div>
									))}
								</div>
							) : (
								<EmptyState
									icon={<History className="h-10 w-10" />}
									title="No recent activity"
									description="New stock movements will show here."
								/>
							)}
						</CardContent>
					</Card>
				</div>

				{todayStats.total > 0 && (
					<Card>
						<CardHeader>
							<CardTitle className="text-lg">Today’s Breakdown</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
								<ActivityStat
									label="Check In"
									value={todayStats.adds}
									icon={<Plus className="h-4 w-4" />}
									color="green"
								/>
								<ActivityStat
									label="Check Out"
									value={todayStats.removes}
									icon={<Minus className="h-4 w-4" />}
									color="red"
								/>
								<ActivityStat
									label="Moves"
									value={todayStats.moves}
									icon={<ArrowLeftRight className="h-4 w-4" />}
									color="blue"
								/>
								<ActivityStat
									label="Adjustments"
									value={todayStats.adjusts}
									icon={<Activity className="h-4 w-4" />}
									color="amber"
								/>
							</div>
						</CardContent>
					</Card>
				)}

				<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-lg">
								<AlertTriangle className="h-5 w-5 text-amber-500" />
								Low Stock Alerts
							</CardTitle>
							<CardDescription>
								Items under 10 units that may need replenishment.
							</CardDescription>
						</CardHeader>
						<CardContent>
							{lowStockItems.length > 0 ? (
								<div className="space-y-2">
									{lowStockItems.map((item) => (
										<div
											key={item._id}
											className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2"
										>
											<div className="flex items-center gap-2">
												<Package className="h-4 w-4 text-amber-700" />
												<span className="text-sm font-medium text-slate-900">
													{item.part?.name || "Unknown Part"}
												</span>
											</div>
											<span className="text-sm font-semibold text-amber-800">
												{item.quantity} units
											</span>
										</div>
									))}
								</div>
							) : (
								<EmptyState
									icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />}
									title="Stock levels look healthy"
									description="No low-stock alerts at the moment."
								/>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-lg">
								<Users className="h-5 w-5 text-cyan-600" />
								Team & Blueprint Status
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
								<span className="text-sm font-medium text-slate-700">
									Members
								</span>
								<span className="text-lg font-semibold text-slate-900">
									{orgUsers.length}
								</span>
							</div>
							<div className="space-y-2">
								{lockedBlueprints.length > 0 ? (
									lockedBlueprints.slice(0, 3).map((bp) => (
										<div
											key={bp._id}
											className="flex items-center justify-between rounded-lg border border-cyan-200 bg-cyan-50/70 px-3 py-2"
										>
											<span className="text-sm font-medium text-slate-900">
												{bp.name}
											</span>
											<span className="text-xs text-cyan-700">
												{bp.lockedByUser?.name || "Unknown"}
											</span>
										</div>
									))
								) : (
									<div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
										No blueprint locks currently active.
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}

interface ActivityStatProps {
	label: string;
	value: number;
	icon: ReactNode;
	color: "green" | "red" | "blue" | "amber";
}

function ActivityStat({ label, value, icon, color }: ActivityStatProps) {
	const colorClasses = {
		green: "border-emerald-200 bg-emerald-50 text-emerald-800",
		red: "border-rose-200 bg-rose-50 text-rose-800",
		blue: "border-blue-200 bg-blue-50 text-blue-800",
		amber: "border-amber-200 bg-amber-50 text-amber-800",
	};

	return (
		<div className={`rounded-lg border p-3 ${colorClasses[color]}`}>
			<div className="mb-1.5 flex items-center gap-2 text-xs font-medium">
				{icon}
				<span>{label}</span>
			</div>
			<p className="text-2xl font-semibold">{value}</p>
		</div>
	);
}

interface QuickActionButtonProps {
	to: string;
	icon: ReactNode;
	title: string;
	description: string;
}

function QuickActionButton({
	to,
	icon,
	title,
	description,
}: QuickActionButtonProps) {
	return (
		<Button
			asChild
			variant="outline"
			size="lg"
			className="h-auto w-full justify-between px-3 py-3"
		>
			<Link to={to}>
				<div className="flex items-center gap-3">
					<div className="rounded-md bg-slate-100 p-2 text-slate-700">
						{icon}
					</div>
					<div className="text-left">
						<p className="text-sm font-semibold text-slate-900">{title}</p>
						<p className="text-xs text-slate-500">{description}</p>
					</div>
				</div>
				<ArrowRight className="h-4 w-4 text-slate-400" />
			</Link>
		</Button>
	);
}

function LiveIndicator() {
	return (
		<div className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700">
			<span className="h-2 w-2 rounded-full bg-emerald-500" />
			Live
		</div>
	);
}

interface EmptyStateProps {
	icon: ReactNode;
	title: string;
	description: string;
}

function EmptyState({ icon, title, description }: EmptyStateProps) {
	return (
		<div className="flex flex-col items-center justify-center py-8 text-center">
			<div className="mb-3 text-slate-300">{icon}</div>
			<p className="font-medium text-slate-900">{title}</p>
			<p className="mt-1 text-sm text-slate-500">{description}</p>
		</div>
	);
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (seconds < 60) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;
	return new Date(timestamp).toLocaleDateString();
}
