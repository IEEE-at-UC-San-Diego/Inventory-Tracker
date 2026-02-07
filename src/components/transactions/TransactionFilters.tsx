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
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
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
	};

	const handleDateRangeChange = (value: DateRange["value"]) => {
		updateFilter("dateRange", value);
		if (value !== "custom") {
			updateFilter("customStartDate", undefined);
			updateFilter("customEndDate", undefined);
		}
	};

	const toggleAction = (action: ActionType) => {
		const current = filters.selectedActions;
		const updated = current.includes(action)
			? current.filter((item) => item !== action)
			: [...current, action];
		updateFilter("selectedActions", updated);
	};

	const showCustomDate = filters.dateRange === "custom";

	return (
		<div className={cn("space-y-4", className)}>
			<div className="flex flex-col gap-3 lg:flex-row">
				<div className="relative flex-1">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
					<Input
						type="text"
						placeholder="Search by part name, SKU, or user"
						value={filters.searchQuery}
						onChange={(event) =>
							updateFilter("searchQuery", event.target.value)
						}
						className="pl-10"
					/>
					{filters.searchQuery && (
						<Button
							variant="ghost"
							size="icon-xs"
							className="absolute right-2 top-1/2 -translate-y-1/2"
							onClick={() => updateFilter("searchQuery", "")}
						>
							<X className="h-3 w-3" />
						</Button>
					)}
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Select
						value={filters.dateRange}
						onValueChange={handleDateRangeChange}
					>
						<SelectTrigger className="w-[170px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{dateRanges.map((range) => (
								<SelectItem key={range.value} value={range.value}>
									{range.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{hasNewActivity && (
						<Button variant="outline" onClick={onRefresh}>
							<RefreshCw className="h-4 w-4" />
							New Activity
						</Button>
					)}

					<Button
						variant={hasActiveFilters ? "default" : "outline"}
						onClick={() => setIsExpanded((prev) => !prev)}
					>
						<Filter className="h-4 w-4" />
						Filters
						{activeFiltersCount > 0 && (
							<Badge className="ml-1 bg-white text-slate-800">
								{activeFiltersCount}
							</Badge>
						)}
						<ChevronDown
							className={cn("h-4 w-4 transition-transform", {
								"rotate-180": isExpanded,
							})}
						/>
					</Button>

					{onExport && (
						<Button variant="outline" onClick={onExport}>
							<Download className="h-4 w-4" />
							Export
						</Button>
					)}
				</div>
			</div>

			{isExpanded && (
				<div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
					<div>
						<p className="mb-2 text-sm font-medium text-slate-700">
							Action Types
						</p>
						<div className="flex flex-wrap gap-2">
							{actionTypes.map((action) => {
								const isSelected = filters.selectedActions.includes(action);
								return (
									<Button
										key={action}
										variant={isSelected ? "outline" : "ghost"}
										size="sm"
										onClick={() => toggleAction(action)}
										className={cn({
											"border-cyan-300 bg-cyan-50": isSelected,
										})}
									>
										<TransactionBadge actionType={action} size="sm" />
									</Button>
								);
							})}
						</div>
					</div>

					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						{users.length > 0 && (
							<div className="space-y-2">
								<p className="flex items-center gap-1 text-sm font-medium text-slate-700">
									<User className="h-4 w-4" />
									User
								</p>
								<Select
									value={filters.selectedUserId || "all"}
									onValueChange={(value) =>
										updateFilter(
											"selectedUserId",
											value === "all" ? undefined : value,
										)
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="All Users" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Users</SelectItem>
										{users.map((user) => (
											<SelectItem key={user._id} value={user._id}>
												{user.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}

						{compartments.length > 0 && (
							<div className="space-y-2">
								<p className="flex items-center gap-1 text-sm font-medium text-slate-700">
									<MapPin className="h-4 w-4" />
									Location
								</p>
								<Select
									value={filters.selectedCompartmentId || "all"}
									onValueChange={(value) =>
										updateFilter(
											"selectedCompartmentId",
											value === "all" ? undefined : value,
										)
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="All Locations" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Locations</SelectItem>
										{compartments.map((compartment) => (
											<SelectItem key={compartment._id} value={compartment._id}>
												{compartment.label || `Compartment ${compartment._id}`}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</div>

					{showCustomDate && (
						<div className="space-y-2">
							<p className="flex items-center gap-1 text-sm font-medium text-slate-700">
								<Calendar className="h-4 w-4" />
								Custom Date Range
							</p>
							<div className="flex flex-wrap items-center gap-2">
								<Input
									type="date"
									value={filters.customStartDate || ""}
									onChange={(event) =>
										updateFilter("customStartDate", event.target.value)
									}
									className="w-auto"
								/>
								<span className="text-sm text-slate-500">to</span>
								<Input
									type="date"
									value={filters.customEndDate || ""}
									onChange={(event) =>
										updateFilter("customEndDate", event.target.value)
									}
									className="w-auto"
								/>
							</div>
						</div>
					)}

					{hasActiveFilters && (
						<div className="flex justify-end">
							<Button variant="ghost" size="sm" onClick={clearAllFilters}>
								<X className="h-4 w-4" />
								Clear all filters
							</Button>
						</div>
					)}
				</div>
			)}

			{hasActiveFilters && !isExpanded && (
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm text-slate-500">Active filters:</span>
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
					<Button variant="link" size="sm" onClick={clearAllFilters}>
						Clear all
					</Button>
				</div>
			)}
		</div>
	);
}

interface FilterChipProps {
	label: string;
	onRemove: () => void;
}

function FilterChip({ label, onRemove }: FilterChipProps) {
	return (
		<Badge
			variant="outline"
			className="gap-1 border-cyan-200 bg-cyan-50 text-cyan-800"
		>
			{label}
			<Button
				variant="ghost"
				size="icon-xs"
				className="h-4 w-4 rounded-full p-0"
				onClick={onRemove}
			>
				<X className="h-3 w-3" />
			</Button>
		</Badge>
	);
}

function getActiveFiltersCount(filters: TransactionFilterState): number {
	let count = 0;
	if (filters.searchQuery) count += 1;
	if (filters.selectedActions.length > 0) count += 1;
	if (filters.dateRange !== "all") count += 1;
	if (filters.selectedUserId) count += 1;
	if (filters.selectedCompartmentId) count += 1;
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
	return users.find((user) => user._id === userId)?.name || userId;
}

function getCompartmentLabel(
	compartments: Array<{ _id: string; label?: string }>,
	compartmentId: string,
): string {
	const compartment = compartments.find((item) => item._id === compartmentId);
	return compartment?.label || compartmentId;
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

export function filterTransactions(
	transactions: TransactionFilterable[],
	filters: TransactionFilterState,
): TransactionFilterable[] {
	return transactions.filter((transaction) => {
		if (filters.searchQuery) {
			const query = filters.searchQuery.toLowerCase();
			const matchesPart =
				transaction.part?.name?.toLowerCase().includes(query) ||
				transaction.part?.sku?.toLowerCase().includes(query);
			const matchesUser = transaction.user?.name?.toLowerCase().includes(query);
			if (!matchesPart && !matchesUser) return false;
		}

		if (filters.selectedActions.length > 0) {
			if (!filters.selectedActions.includes(transaction.actionType)) {
				return false;
			}
		}

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

		if (filters.selectedUserId) {
			if (transaction.user?._id !== filters.selectedUserId) return false;
		}

		if (filters.selectedCompartmentId) {
			const matchesSource =
				transaction.sourceCompartment?._id === filters.selectedCompartmentId;
			const matchesDestination =
				transaction.destCompartment?._id === filters.selectedCompartmentId;
			if (!matchesSource && !matchesDestination) return false;
		}

		return true;
	});
}
