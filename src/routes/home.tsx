import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Activity,
	AlertTriangle,
	ArrowLeftRight,
	ArrowRight,
	Map as BlueprintMap,
	CheckCircle2,
	Clock4,
	History,
	Minus,
	Package,
	Plus,
	Wrench,
} from "lucide-react";
import { type ReactNode, useMemo } from "react";
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
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

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
	const { isEditor } = useRole();
	const canWrite = isEditor();

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
			enabled: !!authContext && !isLoading && canWrite,
		},
	);
	const transactionStats = useQuery(
		api.transactions.queries.getStats,
		authContext ? { authContext } : undefined,
		{
			enabled: !!authContext && !isLoading && canWrite,
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
	const recentTransactions = transactionsResult?.items?.slice(0, 10) || [];
	const blueprints = blueprintsResult || [];
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
		const totals = transactionStats?.transactionsByType;

		return {
			total: transactionStats?.transactionsToday ?? 0,
			adds: totals?.Add ?? 0,
			removes: totals?.Remove ?? 0,
			moves: totals?.Move ?? 0,
			adjusts: totals?.Adjust ?? 0,
		};
	}, [transactionStats]);

	return (
		<div className="bg-gradient-to-b from-surface via-background to-surface">
			<div className="page-shell page-enter space-y-6">
				<Card className="border-border/80 bg-gradient-to-r from-surface-elevated via-surface-elevated to-surface-brand shadow-[0_24px_60px_-48px_rgba(37,99,235,0.35)]">
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
							<span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-elevated px-2.5 py-1.5 text-xs text-muted-foreground">
								<Clock4 className="h-3.5 w-3.5" />
								{new Date().toLocaleTimeString(undefined, {
									hour: "numeric",
									minute: "2-digit",
								})}
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
						value={stats?.totalBlueprints ?? blueprints.length}
						description={`${lockedBlueprints.length} locked`}
						icon={<BlueprintMap className="h-4 w-4" />}
					/>
					<StatCard
						title="Transactions Today"
						value={todayStats.total}
						description={canWrite ? "Past 24 hours" : "General Officer+"}
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
							{canWrite && (
								<>
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
								</>
							)}
							{canWrite && (
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
							{canWrite && (
								<Button asChild variant="outline" size="sm">
									<Link to="/transactions">
										View all
										<ArrowRight className="h-4 w-4" />
									</Link>
								</Button>
							)}
						</CardHeader>
						<CardContent>
							{!canWrite ? (
								<EmptyState
									icon={<History className="h-10 w-10" />}
									title="Access restricted"
									description="Recent activity requires General Officer role or higher."
								/>
							) : recentTransactions.length > 0 ? (
								<div className="space-y-2">
									{recentTransactions.slice(0, 6).map((transaction) => (
										<div
											key={transaction._id}
											className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated px-3 py-2.5"
										>
											<div className="flex items-center gap-3">
												<TransactionBadge
													actionType={transaction.actionType}
													showLabel={false}
													size="sm"
												/>
												<div>
													<p className="text-sm font-medium text-foreground">
														{transaction.part?.name || "Unknown Part"}
													</p>
													<p className="text-xs text-muted-foreground">
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
										className="flex items-center justify-between rounded-lg border border-warning/25 bg-surface-warning px-3 py-2"
									>
										<div className="flex items-center gap-2">
											<Package className="h-4 w-4 text-warning-foreground" />
											<span className="text-sm font-medium text-foreground">
												{item.part?.name || "Unknown Part"}
											</span>
										</div>
										<span className="text-sm font-semibold text-warning-foreground">
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
							<CardTitle className="text-lg">Blueprint Lock Status</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2">
							{lockedBlueprints.length > 0 ? (
								lockedBlueprints.slice(0, 3).map((bp) => (
									<div
										key={bp._id}
										className="flex items-center justify-between rounded-lg border border-info/20 bg-surface-info px-3 py-2"
									>
										<span className="text-sm font-medium text-foreground">
											{bp.name}
										</span>
										<span className="text-xs text-info-foreground">
											{bp.lockedByUser?.name || "Unknown"}
										</span>
									</div>
								))
							) : (
								<EmptyState
									icon={<CheckCircle2 className="h-8 w-8 text-emerald-500" />}
									title="No locked blueprints"
									description="All blueprints are currently available."
								/>
							)}
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
		green: "border-success/20 bg-surface-success text-success-foreground",
		red: "border-destructive/20 bg-surface-danger text-destructive",
		blue: "border-info/20 bg-surface-info text-info-foreground",
		amber: "border-warning/25 bg-surface-warning text-warning-foreground",
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
					<div className="rounded-md bg-surface-subtle p-2 text-primary">
						{icon}
					</div>
					<div className="text-left">
						<p className="text-sm font-semibold text-foreground">{title}</p>
						<p className="text-xs text-muted-foreground">{description}</p>
					</div>
				</div>
				<ArrowRight className="h-4 w-4 text-muted-foreground" />
			</Link>
		</Button>
	);
}

function LiveIndicator() {
	return (
		<div className="inline-flex items-center gap-2 rounded-md border border-success/20 bg-surface-success px-2.5 py-1.5 text-xs font-medium text-success-foreground">
			<span className="h-2 w-2 rounded-full bg-success" />
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
			<div className="mb-3 text-muted-foreground/50">{icon}</div>
			<p className="font-medium text-foreground">{title}</p>
			<p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
