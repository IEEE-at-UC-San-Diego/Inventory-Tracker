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
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
	filterTransactions,
	type TransactionFilterState,
	TransactionFilters,
	TransactionPagination,
	TransactionTable,
} from "@/components/transactions";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@/integrations/convex/react-query";

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

	const transactionsResult = useQuery(
		api.transactions.queries.list,
		authContext
			? {
					authContext,
					limit: 1000,
				}
			: undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);

	const statsResult = useQuery(
		api.transactions.queries.getStats,
		authContext ? { authContext } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);

	const orgUsers = useQuery(
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

	const filteredTransactions = useMemo(
		() => filterTransactions(transactions, filters),
		[transactions, filters],
	);

	const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
	const paginatedTransactions = useMemo(() => {
		const start = (currentPage - 1) * ITEMS_PER_PAGE;
		return filteredTransactions.slice(start, start + ITEMS_PER_PAGE);
	}, [filteredTransactions, currentPage]);

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

		const rows = filteredTransactions.map((transaction) => [
			new Date(transaction.timestamp).toISOString(),
			transaction.actionType,
			transaction.part?.name || "",
			transaction.part?.sku || "",
			transaction.quantityDelta,
			transaction.sourceCompartment?.label || "",
			transaction.destCompartment?.label || "",
			transaction.user?.name || "",
			transaction.notes || "",
		]);

		const csvContent = [
			headers.join(","),
			...rows.map((row) =>
				row
					.map((cell) => {
						const cellString = String(cell || "");
						if (
							cellString.includes(",") ||
							cellString.includes('"') ||
							cellString.includes("\n")
						) {
							return `"${cellString.replace(/"/g, '""')}"`;
						}
						return cellString;
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

	const handleRefresh = useCallback(() => {
		toast.info("Refreshed", "Transaction data has been updated");
	}, [toast]);

	const handleFiltersChange = useCallback(
		(nextFilters: TransactionFilterState) => {
			setFilters(nextFilters);
			setCurrentPage(1);
		},
		[],
	);

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
		<div className="bg-gradient-to-b from-slate-50/80 to-background">
			<div className="mx-auto w-full max-w-[1480px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
				<Card className="border-slate-200 bg-gradient-to-r from-white via-white to-cyan-50/40 shadow-sm">
					<CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-1">
							<CardTitle className="text-2xl sm:text-3xl">
								Transaction Log
							</CardTitle>
							<CardDescription className="text-sm sm:text-base">
								Full audit history for all inventory changes.
							</CardDescription>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Button variant="outline" onClick={handleRefresh}>
								<RefreshCw className="h-4 w-4" />
								Refresh
							</Button>
							<Button
								onClick={handleExport}
								disabled={filteredTransactions.length === 0}
							>
								<Download className="h-4 w-4" />
								Export CSV
							</Button>
						</div>
					</CardHeader>
				</Card>

				<div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
					<ActionStatCard
						title="Check In"
						value={actionStats.adds}
						icon={<ArrowUpCircle className="h-5 w-5" />}
						color="green"
						trend={stats ? `+${stats.transactionsByType.Add} today` : undefined}
					/>
					<ActionStatCard
						title="Check Out"
						value={actionStats.removes}
						icon={<ArrowDownCircle className="h-5 w-5" />}
						color="red"
						trend={
							stats ? `-${stats.transactionsByType.Remove} today` : undefined
						}
					/>
					<ActionStatCard
						title="Moves"
						value={actionStats.moves}
						icon={<ArrowLeftRight className="h-5 w-5" />}
						color="blue"
						trend={stats ? `${stats.transactionsByType.Move} today` : undefined}
					/>
					<ActionStatCard
						title="Adjust"
						value={actionStats.adjusts}
						icon={<Zap className="h-5 w-5" />}
						color="amber"
						trend={
							stats ? `${stats.transactionsByType.Adjust} today` : undefined
						}
					/>
					<ActionStatCard
						title="Total"
						value={transactions.length}
						icon={<History className="h-5 w-5" />}
						color="slate"
						trend={stats ? `${stats.totalTransactions} all time` : undefined}
					/>
					<ActionStatCard
						title="Today"
						value={stats?.transactionsToday || 0}
						icon={<Activity className="h-5 w-5" />}
						color="cyan"
						trend={
							stats ? `${stats.transactionsThisWeek} this week` : undefined
						}
					/>
				</div>

				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-lg">Filters</CardTitle>
						<CardDescription>
							Refine results by action, date, user, location, and search terms.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<TransactionFilters
							filters={filters}
							onFiltersChange={handleFiltersChange}
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

				<Card>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between gap-3">
							<CardTitle className="text-lg">Transactions</CardTitle>
							<CardDescription>
								Showing {filteredTransactions.length} of {transactions.length}{" "}
								records
							</CardDescription>
						</div>
					</CardHeader>
					<CardContent className="p-0">
						<TransactionTable
							transactions={paginatedTransactions}
							isLoading={transactionsResult === undefined}
							emptyMessage="No transactions match your filters. Try adjusting your search criteria."
						/>

						{filteredTransactions.length > 0 && totalPages > 1 && (
							<TransactionPagination
								currentPage={currentPage}
								totalPages={totalPages}
								onPageChange={setCurrentPage}
								totalItems={filteredTransactions.length}
								itemsPerPage={ITEMS_PER_PAGE}
							/>
						)}

						{filteredTransactions.length > 0 && totalPages === 1 && (
							<div className="border-t border-slate-200 px-4 py-3 text-center text-sm text-slate-500">
								Showing all {filteredTransactions.length} transactions
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

interface ActionStatCardProps {
	title: string;
	value: number;
	icon: ReactNode;
	color: "green" | "red" | "blue" | "amber" | "slate" | "cyan";
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
		green: "border-emerald-200 bg-emerald-50 text-emerald-800",
		red: "border-rose-200 bg-rose-50 text-rose-800",
		blue: "border-blue-200 bg-blue-50 text-blue-800",
		amber: "border-amber-200 bg-amber-50 text-amber-800",
		slate: "border-slate-200 bg-slate-50 text-slate-800",
		cyan: "border-cyan-200 bg-cyan-50 text-cyan-800",
	};

	return (
		<div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
			<div className="flex items-center justify-between">
				<span className="text-xs font-semibold uppercase tracking-wide">
					{title}
				</span>
				<span>{icon}</span>
			</div>
			<p className="mt-1 text-2xl font-semibold">{value.toLocaleString()}</p>
			{trend && <p className="mt-1 text-xs opacity-80">{trend}</p>}
		</div>
	);
}
