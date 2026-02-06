import {
	Calendar,
	ChevronDown,
	Download,
	Filter,
	MapPin,
	RefreshCw,
	Search,
	User,
	X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import type { ActionType } from "@/types";
import { Input } from "../ui/input";
import { TransactionBadge } from "./TransactionBadge";

interface DateRange {
	label: string;
	value: "today" | "week" | "month" | "custom" | "all";
	startDate?: number;
	endDate?: number;
}

const dateRanges: DateRange[] = [
	{ label: "Today", value: "today" },
	{ label: "Last 7 Days", value: "week" },
	{ label: "Last 30 Days", value: "month" },
	{ label: "All Time", value: "all" },
	{ label: "Custom Range", value: "custom" },
];

const actionTypes: ActionType[] = ["Add", "Remove", "Move", "Adjust"];

interface TransactionFiltersProps {
	filters: TransactionFilterState;
	onFiltersChange: (filters: TransactionFilterState) => void;
	onExport?: () => void;
	onRefresh?: () => void;
	users?: Array<{ _id: string; name: string }>;
	compartments?: Array<{ _id: string; label?: string }>;
	hasNewActivity?: boolean;
	className?: string;
}

export interface TransactionFilterState {
	searchQuery: string;
	selectedActions: ActionType[];
	dateRange: DateRange["value"];
	customStartDate?: string;
	customEndDate?: string;
	selectedUserId?: string;
	selectedCompartmentId?: string;
}

export interface TransactionFilterable {
	_id: string;
	actionType: ActionType;
	quantityDelta: number;
	timestamp: number;
	notes?: string;
	partId: string;
	userId?: string;
	sourceCompartmentId?: string;
	destCompartmentId?: string;
	part?: { name?: string; sku?: string };
	user?: { _id?: string; name?: string };
	sourceCompartment?: { _id?: string; label?: string };
	destCompartment?: { _id?: string; label?: string };
}

const defaultFilters: TransactionFilterState = {
	searchQuery: "",
	selectedActions: [],
	dateRange: "all",
	customStartDate: undefined,
	customEndDate: undefined,
	selectedUserId: undefined,
	selectedCompartmentId: undefined,
};

export function TransactionFilters({
	filters,
	onFiltersChange,
	onExport,
	onRefresh,
	users = [],
	compartments = [],
	hasNewActivity,
	className,
}: TransactionFiltersProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [showCustomDate, setShowCustomDate] = useState(false);

	const activeFiltersCount = getActiveFiltersCount(filters);
	const hasActiveFilters = activeFiltersCount > 0;

	const updateFilter = useCallback(
		<K extends keyof TransactionFilterState>(
			key: K,
			value: TransactionFilterState[K],
		) => {
			onFiltersChange({ ...filters, [key]: value });
		},
		[filters, onFiltersChange],
	);

	const clearAllFilters = () => {
		onFiltersChange(defaultFilters);
		setShowCustomDate(false);
	};

	const handleDateRangeChange = (value: DateRange["value"]) => {
		updateFilter("dateRange", value);
		setShowCustomDate(value === "custom");
	};

	const toggleAction = (action: ActionType) => {
		const current = filters.selectedActions;
		const updated = current.includes(action)
			? current.filter((a) => a !== action)
			: [...current, action];
		updateFilter("selectedActions", updated);
	};

	return (
		<div className={cn("space-y-4", className)}>
			{/* Primary filters row */}
			<div className="flex flex-col lg:flex-row gap-4">
				{/* Search */}
				<div className="flex-1 relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
					<Input
						type="text"
						placeholder="Search by part name, SKU, or user..."
						value={filters.searchQuery}
						onChange={(e) => updateFilter("searchQuery", e.target.value)}
						className="pl-10"
					/>
					{filters.searchQuery && (
						<button
							onClick={() => updateFilter("searchQuery", "")}
							className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
						>
							<X className="w-4 h-4 text-gray-400" />
						</button>
					)}
				</div>

				{/* Quick date selector */}
				<div className="flex items-center gap-2">
					<select
						value={filters.dateRange}
						onChange={(e) =>
							handleDateRangeChange(e.target.value as DateRange["value"])
						}
						className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
					>
						{dateRanges.map((range) => (
							<option key={range.value} value={range.value}>
								{range.label}
							</option>
						))}
					</select>

					{/* New activity indicator */}
					{hasNewActivity && (
						<button
							onClick={onRefresh}
							className="flex items-center gap-2 px-3 py-2 bg-cyan-50 text-cyan-700 rounded-lg hover:bg-cyan-100 transition-colors text-sm font-medium animate-pulse"
						>
							<RefreshCw className="w-4 h-4" />
							New Activity
						</button>
					)}

					{/* Expand filters button */}
					<button
						onClick={() => setIsExpanded(!isExpanded)}
						className={cn(
							"flex items-center gap-2 px-3 py-2 border rounded-lg transition-colors text-sm",
							hasActiveFilters
								? "border-cyan-300 bg-cyan-50 text-cyan-700"
								: "hover:bg-gray-50",
						)}
					>
						<Filter className="w-4 h-4" />
						Filters
						{activeFiltersCount > 0 && (
							<span className="bg-cyan-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
								{activeFiltersCount}
							</span>
						)}
						<ChevronDown
							className={cn(
								"w-4 h-4 transition-transform",
								isExpanded && "rotate-180",
							)}
						/>
					</button>

					{/* Export button */}
					{onExport && (
						<button
							onClick={onExport}
							className="flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-gray-50 transition-colors text-sm"
						>
							<Download className="w-4 h-4" />
							Export
						</button>
					)}
				</div>
			</div>

			{/* Expanded filters */}
			{isExpanded && (
				<div className="p-4 bg-gray-50 rounded-lg space-y-4">
					{/* Action type chips */}
					<div>
						<label className="text-sm font-medium text-gray-700 mb-2 block">
							Action Types
						</label>
						<div className="flex flex-wrap gap-2">
							{actionTypes.map((action) => {
								const isSelected = filters.selectedActions.includes(action);
								return (
									<button
										key={action}
										onClick={() => toggleAction(action)}
										className={cn(
											"transition-all",
											isSelected ? "opacity-100" : "opacity-50 grayscale",
										)}
									>
										<TransactionBadge actionType={action} size="sm" />
									</button>
								);
							})}
						</div>
					</div>

					{/* User and Location filters */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{users.length > 0 && (
							<div>
								<label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
									<User className="w-4 h-4" />
									User
								</label>
								<select
									value={filters.selectedUserId || ""}
									onChange={(e) =>
										updateFilter("selectedUserId", e.target.value || undefined)
									}
									className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
								>
									<option value="">All Users</option>
									{users.map((user) => (
										<option key={user._id} value={user._id}>
											{user.name}
										</option>
									))}
								</select>
							</div>
						)}

						{compartments.length > 0 && (
							<div>
								<label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
									<MapPin className="w-4 h-4" />
									Location
								</label>
								<select
									value={filters.selectedCompartmentId || ""}
									onChange={(e) =>
										updateFilter(
											"selectedCompartmentId",
											e.target.value || undefined,
										)
									}
									className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
								>
									<option value="">All Locations</option>
									{compartments.map((comp) => (
										<option key={comp._id} value={comp._id}>
											{comp.label || `Compartment ${comp._id}`}
										</option>
									))}
								</select>
							</div>
						)}
					</div>

					{/* Custom date range */}
					{showCustomDate && (
						<div>
							<label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
								<Calendar className="w-4 h-4" />
								Custom Date Range
							</label>
							<div className="flex items-center gap-2">
								<input
									type="date"
									value={filters.customStartDate || ""}
									onChange={(e) =>
										updateFilter("customStartDate", e.target.value)
									}
									className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
								/>
								<span className="text-gray-500">to</span>
								<input
									type="date"
									value={filters.customEndDate || ""}
									onChange={(e) =>
										updateFilter("customEndDate", e.target.value)
									}
									className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
								/>
							</div>
						</div>
					)}

					{/* Clear all button */}
					{hasActiveFilters && (
						<div className="flex justify-end">
							<button
								onClick={clearAllFilters}
								className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
							>
								<X className="w-4 h-4" />
								Clear all filters
							</button>
						</div>
					)}
				</div>
			)}

			{/* Active filter chips */}
			{hasActiveFilters && !isExpanded && (
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm text-gray-500">Active filters:</span>
					{filters.selectedActions.map((action) => (
						<FilterChip
							key={action}
							label={getActionLabel(action)}
							onRemove={() => toggleAction(action)}
						/>
					))}
					{filters.selectedUserId && (
						<FilterChip
							label={`User: ${getUserName(users, filters.selectedUserId)}`}
							onRemove={() => updateFilter("selectedUserId", undefined)}
						/>
					)}
					{filters.selectedCompartmentId && (
						<FilterChip
							label={`Location: ${getCompartmentLabel(compartments, filters.selectedCompartmentId)}`}
							onRemove={() => updateFilter("selectedCompartmentId", undefined)}
						/>
					)}
					{filters.dateRange !== "all" && (
						<FilterChip
							label={`Date: ${getDateRangeLabel(filters.dateRange)}`}
							onRemove={() => updateFilter("dateRange", "all")}
						/>
					)}
					<button
						onClick={clearAllFilters}
						className="text-sm text-cyan-600 hover:text-cyan-700 ml-2"
					>
						Clear all
					</button>
				</div>
			)}
		</div>
	);
}

// Filter chip component
interface FilterChipProps {
	label: string;
	onRemove: () => void;
}

function FilterChip({ label, onRemove }: FilterChipProps) {
	return (
		<span className="inline-flex items-center gap-1 px-2 py-1 bg-cyan-50 text-cyan-700 text-xs rounded-full">
			{label}
			<button
				onClick={onRemove}
				className="p-0.5 hover:bg-cyan-100 rounded-full transition-colors"
			>
				<X className="w-3 h-3" />
			</button>
		</span>
	);
}

// Helper functions
function getActiveFiltersCount(filters: TransactionFilterState): number {
	let count = 0;
	if (filters.searchQuery) count++;
	if (filters.selectedActions.length > 0) count++;
	if (filters.dateRange !== "all") count++;
	if (filters.selectedUserId) count++;
	if (filters.selectedCompartmentId) count++;
	return count;
}

function getActionLabel(action: ActionType): string {
	const labels: Record<ActionType, string> = {
		Add: "Check In",
		Remove: "Check Out",
		Move: "Move",
		Adjust: "Adjust",
	};
	return labels[action];
}

function getUserName(
	users: Array<{ _id: string; name: string }>,
	userId: string,
): string {
	return users.find((u) => u._id === userId)?.name || userId;
}

function getCompartmentLabel(
	compartments: Array<{ _id: string; label?: string }>,
	compartmentId: string,
): string {
	const comp = compartments.find((c) => c._id === compartmentId);
	return comp?.label || compartmentId;
}

function getDateRangeLabel(range: DateRange["value"]): string {
	const labels: Record<DateRange["value"], string> = {
		today: "Today",
		week: "Last 7 Days",
		month: "Last 30 Days",
		all: "All Time",
		custom: "Custom Range",
	};
	return labels[range];
}

// Filter transactions helper
export function filterTransactions(
	transactions: TransactionFilterable[],
	filters: TransactionFilterState,
): TransactionFilterable[] {
	return transactions.filter((transaction) => {
		// Search filter
		if (filters.searchQuery) {
			const query = filters.searchQuery.toLowerCase();
			const matchesPart =
				transaction.part?.name?.toLowerCase().includes(query) ||
				transaction.part?.sku?.toLowerCase().includes(query);
			const matchesUser = transaction.user?.name?.toLowerCase().includes(query);
			if (!matchesPart && !matchesUser) return false;
		}

		// Action type filter
		if (filters.selectedActions.length > 0) {
			if (!filters.selectedActions.includes(transaction.actionType))
				return false;
		}

		// Date range filter
		if (filters.dateRange !== "all") {
			const now = Date.now();
			const oneDayMs = 24 * 60 * 60 * 1000;
			const transactionDate = transaction.timestamp;

			switch (filters.dateRange) {
				case "today":
					if (now - transactionDate >= oneDayMs) return false;
					break;
				case "week":
					if (now - transactionDate >= 7 * oneDayMs) return false;
					break;
				case "month":
					if (now - transactionDate >= 30 * oneDayMs) return false;
					break;
				case "custom":
					if (filters.customStartDate) {
						const startDate = new Date(filters.customStartDate).getTime();
						if (transactionDate < startDate) return false;
					}
					if (filters.customEndDate) {
						const endDate = new Date(filters.customEndDate).getTime();
						if (transactionDate > endDate) return false;
					}
					break;
			}
		}

		// User filter
		if (filters.selectedUserId) {
			if (transaction.user?._id !== filters.selectedUserId) return false;
		}

		// Compartment filter (source or destination)
		if (filters.selectedCompartmentId) {
			const matchesSource =
				transaction.sourceCompartment?._id === filters.selectedCompartmentId;
			const matchesDest =
				transaction.destCompartment?._id === filters.selectedCompartmentId;
			if (!matchesSource && !matchesDest) return false;
		}

		return true;
	});
}
