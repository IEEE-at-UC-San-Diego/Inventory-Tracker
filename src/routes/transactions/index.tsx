import { createFileRoute } from "@tanstack/react-router";
import {
	Activity,
	ArrowDownCircle,
	ArrowLeftRight,
	ArrowUpCircle,
	Download,
	History,
	RefreshCw,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
	filterTransactions,
	type TransactionFilterState,
	TransactionFilters,
	TransactionPagination,
	TransactionTable,
} from "@/components/transactions";
import { Card, CardContent } from "@/components/ui/card";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@/integrations/convex/react-query";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/transactions/")({
	component: TransactionsPage,
});

const ITEMS_PER_PAGE = 25;

function TransactionsPage() {
	return (
		<ProtectedRoute>
			<ToastProvider>
				<TransactionsContent />
			</ToastProvider>
		</ProtectedRoute>
	);
}

function TransactionsContent() {
	const { authContext, isLoading } = useAuth();
	const { toast } = useToast();
	const [currentPage, setCurrentPage] = useState(1);
	const [filters, setFilters] = useState<TransactionFilterState>({
		searchQuery: "",
		selectedActions: [],
		dateRange: "all",
		customStartDate: undefined,
		customEndDate: undefined,
		selectedUserId: undefined,
		selectedCompartmentId: undefined,
	});

	// Fetch transactions with real-time subscription
	const transactionsResult = useQuery(
		api.transactions.queries.list,
		authContext
			? {
					authContext,
					limit: 1000, // Fetch more for client-side filtering
				}
			: undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);

	// Fetch stats
	const statsResult = useQuery(
		api.transactions.queries.getStats,
		authContext ? { authContext } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);

	// Fetch users for filter dropdown
	const orgUsers = useQuery(
		api.organizations.queries.getOrgMembers,
		authContext
			? { authContext, organizationId: authContext.orgId as Id<"organizations"> }
			: undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);

	// Fetch compartments for location filter
	const inventoryResult = useQuery(
		api.inventory.queries.list,
		authContext ? { authContext, includeDetails: true } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);

	const transactions = transactionsResult?.items || [];
	const stats = statsResult;
	const users = orgUsers || [];
	const inventoryItems = (inventoryResult ?? []) as Array<{
		_id: Id<"inventory">;
		compartmentId: Id<"compartments">;
		partId: Id<"parts">;
		quantity: number;
		compartment?: { _id: Id<"compartments">; label?: string };
	}>;
	const compartments = useMemo(() => {
		const uniqueComps = new Map<string, { _id: string; label?: string }>();
		inventoryItems.forEach((item) => {
			if (item.compartment) {
				uniqueComps.set(item.compartment._id, {
					_id: item.compartment._id,
					label: item.compartment.label,
				});
			}
		});
		return Array.from(uniqueComps.values());
	}, [inventoryItems]);

	// Filter transactions
	const filteredTransactions = useMemo(
		() => filterTransactions(transactions, filters),
		[transactions, filters],
	);

	// Pagination
	const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
	const paginatedTransactions = useMemo(() => {
		const start = (currentPage - 1) * ITEMS_PER_PAGE;
		return filteredTransactions.slice(start, start + ITEMS_PER_PAGE);
	}, [filteredTransactions, currentPage]);

	// Reset to page 1 when filters change
	useEffect(() => {
		setCurrentPage(1);
	}, []);

	// Export to CSV
	const handleExport = useCallback(() => {
		const headers = [
			"Date/Time",
			"Action",
			"Part Name",
			"Part SKU",
			"Quantity Delta",
			"Source Location",
			"Destination Location",
			"User",
			"Notes",
		];

		const rows = filteredTransactions.map((t) => [
			new Date(t.timestamp).toISOString(),
			t.actionType,
			t.part?.name || "",
			t.part?.sku || "",
			t.quantityDelta,
			t.sourceCompartment?.label || "",
			t.destCompartment?.label || "",
			t.user?.name || "",
			t.notes || "",
		]);

		const csvContent = [
			headers.join(","),
			...rows.map((row) =>
				row
					.map((cell) => {
						// Escape cells that contain commas or quotes
						const cellStr = String(cell || "");
						if (
							cellStr.includes(",") ||
							cellStr.includes('"') ||
							cellStr.includes("\n")
						) {
							return `"${cellStr.replace(/"/g, '""')}"`;
						}
						return cellStr;
					})
					.join(","),
			),
		].join("\n");

		const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
		const link = document.createElement("a");
		const url = URL.createObjectURL(blob);

		const timestamp = new Date().toISOString().split("T")[0];
		link.setAttribute("href", url);
		link.setAttribute("download", `transactions_${timestamp}.csv`);
		link.style.visibility = "hidden";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		toast.success(
			"Export Complete",
			`Downloaded ${filteredTransactions.length} transactions to CSV`,
		);
	}, [filteredTransactions, toast]);

	// Refresh handler
	const handleRefresh = useCallback(() => {
		// The query will automatically refetch due to Convex's real-time nature
		toast.info("Refreshed", "Transaction data has been updated");
	}, [toast]);

	// Calculate action stats
	const actionStats = useMemo(() => {
		const adds = transactions.filter((t) => t.actionType === "Add").length;
		const removes = transactions.filter(
			(t) => t.actionType === "Remove",
		).length;
		const moves = transactions.filter((t) => t.actionType === "Move").length;
		const adjusts = transactions.filter(
			(t) => t.actionType === "Adjust",
		).length;
		return { adds, removes, moves, adjusts };
	}, [transactions]);

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<h1 className="text-3xl font-bold text-gray-900">Transaction Log</h1>
					<p className="text-gray-600 mt-1">
						Complete audit trail of all inventory changes
					</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={handleRefresh}
						className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
					>
						<RefreshCw className="w-4 h-4" />
						Refresh
					</button>
					<button
						onClick={handleExport}
						disabled={filteredTransactions.length === 0}
						className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<Download className="w-4 h-4" />
						Export CSV
					</button>
				</div>
			</div>

			{/* Stats Cards */}
			<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
				<ActionStatCard
					title="Check In"
					value={actionStats.adds}
					icon={<ArrowUpCircle className="w-5 h-5" />}
					color="green"
					trend={stats ? `+${stats.transactionsByType.Add} today` : undefined}
				/>
				<ActionStatCard
					title="Check Out"
					value={actionStats.removes}
					icon={<ArrowDownCircle className="w-5 h-5" />}
					color="red"
					trend={
						stats ? `-${stats.transactionsByType.Remove} today` : undefined
					}
				/>
				<ActionStatCard
					title="Moves"
					value={actionStats.moves}
					icon={<ArrowLeftRight className="w-5 h-5" />}
					color="blue"
					trend={stats ? `${stats.transactionsByType.Move} today` : undefined}
				/>
				<ActionStatCard
					title="Adjustments"
					value={actionStats.adjusts}
					icon={<Zap className="w-5 h-5" />}
					color="yellow"
					trend={stats ? `${stats.transactionsByType.Adjust} today` : undefined}
				/>
				<ActionStatCard
					title="Total"
					value={transactions.length}
					icon={<History className="w-5 h-5" />}
					color="gray"
					trend={stats ? `${stats.totalTransactions} all time` : undefined}
				/>
				<ActionStatCard
					title="Today"
					value={stats?.transactionsToday || 0}
					icon={<Activity className="w-5 h-5" />}
					color="cyan"
					trend={stats ? `${stats.transactionsThisWeek} this week` : undefined}
				/>
			</div>

			{/* Filters */}
			<Card>
				<CardContent className="p-4">
					<TransactionFilters
						filters={filters}
						onFiltersChange={setFilters}
						onExport={
							filteredTransactions.length > 0 ? handleExport : undefined
						}
						onRefresh={handleRefresh}
						users={users}
						compartments={compartments}
						hasNewActivity={false}
					/>
				</CardContent>
			</Card>

			{/* Transactions Table */}
			<Card>
				<CardContent className="p-0">
					<TransactionTable
						transactions={paginatedTransactions}
						isLoading={transactionsResult === undefined}
						emptyMessage="No transactions match your filters. Try adjusting your search criteria."
					/>

					{/* Pagination */}
					{filteredTransactions.length > 0 && totalPages > 1 && (
						<TransactionPagination
							currentPage={currentPage}
							totalPages={totalPages}
							onPageChange={setCurrentPage}
							totalItems={filteredTransactions.length}
							itemsPerPage={ITEMS_PER_PAGE}
						/>
					)}

					{/* Single page summary */}
					{filteredTransactions.length > 0 && totalPages === 1 && (
						<div className="px-4 py-3 border-t border-gray-200 text-sm text-gray-500 text-center">
							Showing all {filteredTransactions.length} transactions
						</div>
					)}
				</CardContent>
			</Card>

			{/* Summary footer */}
			<div className="text-sm text-gray-500 text-center">
				<p>
					Displaying {filteredTransactions.length} of {transactions.length}{" "}
					total transactions
				</p>
			</div>
		</div>
	);
}

// Action stat card component
interface ActionStatCardProps {
	title: string;
	value: number;
	icon: React.ReactNode;
	color: "green" | "red" | "blue" | "yellow" | "gray" | "cyan";
	trend?: string;
}

function ActionStatCard({
	title,
	value,
	icon,
	color,
	trend,
}: ActionStatCardProps) {
	const colorClasses = {
		green: {
			bg: "bg-green-50",
			text: "text-green-700",
			icon: "text-green-600",
			border: "border-green-200",
		},
		red: {
			bg: "bg-red-50",
			text: "text-red-700",
			icon: "text-red-600",
			border: "border-red-200",
		},
		blue: {
			bg: "bg-blue-50",
			text: "text-blue-700",
			icon: "text-blue-600",
			border: "border-blue-200",
		},
		yellow: {
			bg: "bg-yellow-50",
			text: "text-yellow-700",
			icon: "text-yellow-600",
			border: "border-yellow-200",
		},
		gray: {
			bg: "bg-gray-50",
			text: "text-gray-700",
			icon: "text-gray-600",
			border: "border-gray-200",
		},
		cyan: {
			bg: "bg-cyan-50",
			text: "text-cyan-700",
			icon: "text-cyan-600",
			border: "border-cyan-200",
		},
	};

	const colors = colorClasses[color];

	return (
		<div className={`p-4 rounded-lg border ${colors.bg} ${colors.border}`}>
			<div className="flex items-center justify-between">
				<span className={`text-xs font-medium ${colors.text}`}>{title}</span>
				<span className={colors.icon}>{icon}</span>
			</div>
			<p className={`text-2xl font-bold mt-1 ${colors.text}`}>
				{value.toLocaleString()}
			</p>
			{trend && (
				<p className={`text-xs mt-1 ${colors.text} opacity-75`}>{trend}</p>
			)}
		</div>
	);
}
