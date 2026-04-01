import { Link } from "@tanstack/react-router";
import {
	ArrowRight,
	ChevronDown,
	ChevronRight,
	ChevronUp,
	ExternalLink,
	MapPin,
	Package,
	User,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { TransactionFilterable } from "./TransactionFilters";
import { QuantityDelta, TransactionBadge } from "./TransactionBadge";

interface TransactionTableProps {
	transactions: TransactionFilterable[];
	isLoading?: boolean;
	onRowClick?: (transaction: TransactionFilterable) => void;
	sortColumn?: string;
	sortDirection?: "asc" | "desc";
	onSort?: (column: string) => void;
	emptyMessage?: string;
}

type SortColumn =
	| "timestamp"
	| "actionType"
	| "part"
	| "quantity"
	| "location"
	| "user";

export function TransactionTable({
	transactions,
	isLoading,
	onRowClick,
	sortColumn: externalSortColumn,
	sortDirection: externalSortDirection,
	onSort: externalOnSort,
	emptyMessage = "No transactions found",
}: TransactionTableProps) {
	const [internalSortColumn, setInternalSortColumn] =
		useState<SortColumn>("timestamp");
	const [internalSortDirection, setInternalSortDirection] = useState<
		"asc" | "desc"
	>("desc");
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

	// Use external sort state if provided, otherwise use internal
	const sortColumn = externalSortColumn || internalSortColumn;
	const sortDirection = externalSortDirection || internalSortDirection;

	const handleSort = (column: SortColumn) => {
		if (externalOnSort) {
			externalOnSort(column);
		} else {
			if (internalSortColumn === column) {
				setInternalSortDirection(
					internalSortDirection === "asc" ? "desc" : "asc",
				);
			} else {
				setInternalSortColumn(column);
				setInternalSortDirection("asc");
			}
		}
	};

	const toggleRow = (id: string) => {
		const newExpanded = new Set(expandedRows);
		if (newExpanded.has(id)) {
			newExpanded.delete(id);
		} else {
			newExpanded.add(id);
		}
		setExpandedRows(newExpanded);
	};

	// Sort transactions
	const sortedTransactions = [...transactions].sort((a, b) => {
		let comparison = 0;
		switch (sortColumn) {
			case "timestamp":
				comparison = a.timestamp - b.timestamp;
				break;
			case "actionType":
				comparison = a.actionType.localeCompare(b.actionType);
				break;
			case "part":
				comparison = (a.part?.name || "").localeCompare(b.part?.name || "");
				break;
			case "quantity":
				comparison = a.quantityDelta - b.quantityDelta;
				break;
			case "location": {
				const aLoc = a.destCompartment?.label || "";
				const bLoc = b.destCompartment?.label || "";
				comparison = aLoc.localeCompare(bLoc);
				break;
			}
			case "user":
				comparison = (a.user?.name || "").localeCompare(b.user?.name || "");
				break;
		}
		return sortDirection === "asc" ? comparison : -comparison;
	});

	if (isLoading) {
		return <TransactionTableSkeleton />;
	}

	if (transactions.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
					<Package className="w-8 h-8 text-muted-foreground/80" />
				</div>
				<p className="text-muted-foreground font-medium">{emptyMessage}</p>
				<p className="text-sm text-muted-foreground/80 mt-1">
					Transactions will appear here when inventory changes occur
				</p>
			</div>
		);
	}

	return (
		<div className="overflow-x-auto">
			<table className="w-full">
				<thead>
					<tr className="border-b border-border">
						<th className="w-8 px-2 py-3"></th>
						<SortableHeader
							label="Date/Time"
							column="timestamp"
							currentColumn={sortColumn}
							direction={sortDirection}
							onSort={handleSort}
						/>
						<SortableHeader
							label="Action"
							column="actionType"
							currentColumn={sortColumn}
							direction={sortDirection}
							onSort={handleSort}
							className="w-32"
						/>
						<SortableHeader
							label="Part"
							column="part"
							currentColumn={sortColumn}
							direction={sortDirection}
						/>
						<SortableHeader
							label="Quantity"
							column="quantity"
							currentColumn={sortColumn}
							direction={sortDirection}
							className="w-24"
						/>
						<SortableHeader
							label="Location"
							column="location"
							currentColumn={sortColumn}
							direction={sortDirection}
						/>
						<SortableHeader
							label="User"
							column="user"
							currentColumn={sortColumn}
							direction={sortDirection}
						/>
					</tr>
				</thead>
				<tbody className="divide-y divide-border/70">
					{sortedTransactions.map((transaction) => (
						<TransactionRow
							key={transaction._id}
							transaction={transaction}
							isExpanded={expandedRows.has(transaction._id)}
							onToggle={() => toggleRow(transaction._id)}
							onClick={() => onRowClick?.(transaction)}
						/>
					))}
				</tbody>
			</table>
		</div>
	);
}

interface SortableHeaderProps {
	label: string;
	column: SortColumn;
	currentColumn: string;
	direction: "asc" | "desc";
	onSort?: (column: SortColumn) => void;
	className?: string;
}

function SortableHeader({
	label,
	column,
	currentColumn,
	direction,
	onSort,
	className,
}: SortableHeaderProps) {
	const isActive = currentColumn === column;
	const ariaSort: "none" | "ascending" | "descending" = isActive
		? direction === "asc"
			? "ascending"
			: "descending"
		: "none";

	return (
		<th
			className={cn(
				"px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider",
				className,
			)}
			aria-sort={ariaSort}
		>
			{onSort ? (
				<button
					type="button"
					onClick={() => onSort(column)}
					className="flex items-center gap-1 hover:text-foreground/90"
				>
					{label}
					{isActive && (
						<span className="text-muted-foreground/80">
							{direction === "asc" ? (
								<ChevronUp className="w-4 h-4" />
							) : (
								<ChevronDown className="w-4 h-4" />
							)}
						</span>
					)}
				</button>
			) : (
				<div className="flex items-center gap-1">{label}</div>
			)}
		</th>
	);
}

interface TransactionRowProps {
	transaction: TransactionFilterable;
	isExpanded: boolean;
	onToggle: () => void;
	onClick?: () => void;
}

function TransactionRow({
	transaction,
	isExpanded,
	onToggle,
	onClick,
}: TransactionRowProps) {
	const formatDate = (timestamp: number) => {
		const date = new Date(timestamp);
		return {
			date: date.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
				year: "numeric",
			}),
			time: date.toLocaleTimeString(undefined, {
				hour: "2-digit",
				minute: "2-digit",
			}),
		};
	};

	const { date, time } = formatDate(transaction.timestamp);

	// Get location display
	const getLocationDisplay = () => {
		if (transaction.actionType === "Move") {
			return (
				<div className="flex items-center gap-1 text-sm">
					<span className="text-muted-foreground">
						{transaction.sourceCompartment?.label || "Unknown"}
					</span>
					<ArrowRight className="w-3 h-3 text-muted-foreground/80" />
					<span>{transaction.destCompartment?.label || "Unknown"}</span>
				</div>
			);
		}
		return (
			<div className="flex items-center gap-1 text-sm">
				<MapPin className="w-3 h-3 text-muted-foreground/80" />
				<span>{transaction.destCompartment?.label || "Unknown"}</span>
			</div>
		);
	};

	return (
		<>
			<tr
				className={cn(
					"hover:bg-muted/40 transition-colors",
					onClick && "cursor-pointer",
				)}
				onClick={onClick}
				tabIndex={onClick ? 0 : undefined}
				onKeyDown={(e) => {
					if (!onClick) return;
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onClick();
					}
				}}
			>
				<td className="px-2 py-3">
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onToggle();
						}}
						className="p-1 hover:bg-muted rounded transition-colors"
						aria-label={isExpanded ? "Collapse transaction details" : "Expand transaction details"}
					>
						<ChevronRight
							className={cn(
								"w-4 h-4 text-muted-foreground/80 transition-transform",
								isExpanded && "rotate-90",
							)}
						/>
					</button>
				</td>
				<td className="px-4 py-3">
					<div className="text-sm">
						<div className="font-medium text-foreground">{date}</div>
						<div className="text-muted-foreground">{time}</div>
					</div>
				</td>
				<td className="px-4 py-3">
					<TransactionBadge actionType={transaction.actionType} size="sm" />
				</td>
				<td className="px-4 py-3">
					<div className="flex items-center gap-2">
						<Package className="w-4 h-4 text-muted-foreground/80" />
						<Link
							to="/parts/$partId"
							params={{ partId: transaction.partId }}
							className="font-medium text-foreground hover:text-primary transition-colors"
							onClick={(e) => e.stopPropagation()}
						>
							{transaction.part?.name || "Unknown Part"}
						</Link>
						{transaction.part?.sku && (
							<span className="text-xs text-muted-foreground/80">
								({transaction.part.sku})
							</span>
						)}
					</div>
				</td>
				<td className="px-4 py-3">
					<QuantityDelta delta={transaction.quantityDelta} />
				</td>
				<td className="px-4 py-3">{getLocationDisplay()}</td>
				<td className="px-4 py-3">
					<div className="flex items-center gap-2">
						<User className="w-4 h-4 text-muted-foreground/80" />
						<span className="text-sm text-foreground/90">
							{transaction.user?.name || "Unknown"}
						</span>
					</div>
				</td>
			</tr>
			{isExpanded && (
				<tr>
					<td colSpan={7} className="px-4 py-4 bg-muted/40">
						<TransactionDetails transaction={transaction} />
					</td>
				</tr>
			)}
		</>
	);
}

function TransactionDetails({
	transaction,
}: {
	transaction: TransactionFilterable;
}) {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
			<div className="space-y-3">
				<h4 className="font-semibold text-foreground">Transaction Details</h4>
				<dl className="space-y-2">
					<div className="flex gap-2">
						<dt className="text-muted-foreground w-24">ID:</dt>
						<dd className="font-mono text-xs text-foreground/90">
							{transaction._id}
						</dd>
					</div>
					<div className="flex gap-2">
						<dt className="text-muted-foreground w-24">Action:</dt>
						<dd>
							<TransactionBadge actionType={transaction.actionType} size="sm" />
						</dd>
					</div>
					<div className="flex gap-2">
						<dt className="text-muted-foreground w-24">Quantity:</dt>
						<dd>
							<QuantityDelta delta={transaction.quantityDelta} />
						</dd>
					</div>
					{transaction.notes && (
						<div className="flex gap-2">
							<dt className="text-muted-foreground w-24">Notes:</dt>
							<dd className="text-foreground/90 italic">{transaction.notes}</dd>
						</div>
					)}
				</dl>
			</div>

			<div className="space-y-3">
				<h4 className="font-semibold text-foreground">Related Information</h4>
				<dl className="space-y-2">
					<div className="flex gap-2">
						<dt className="text-muted-foreground w-24">Part:</dt>
						<dd>
							<Link
								to="/parts/$partId"
								params={{ partId: transaction.partId }}
								className="flex items-center gap-1 text-primary hover:text-primary/90"
							>
								{transaction.part?.name || "View Part"}
								<ExternalLink className="w-3 h-3" />
							</Link>
						</dd>
					</div>
					<div className="flex gap-2">
						<dt className="text-muted-foreground w-24">User:</dt>
						<dd className="text-foreground/90">
							{transaction.user?.name || "Unknown"}
						</dd>
					</div>
					{transaction.sourceCompartment && (
						<div className="flex gap-2">
							<dt className="text-muted-foreground w-24">From:</dt>
							<dd className="text-foreground/90">
								{transaction.sourceCompartment.label || "Unknown"}
							</dd>
						</div>
					)}
					{transaction.destCompartment && (
						<div className="flex gap-2">
							<dt className="text-muted-foreground w-24">To:</dt>
							<dd className="text-foreground/90">
								{transaction.destCompartment.label || "Unknown"}
							</dd>
						</div>
					)}
				</dl>
			</div>
		</div>
	);
}

// Skeleton loader for table
function TransactionTableSkeleton() {
	return (
		<div className="overflow-x-auto">
			<table className="w-full">
				<thead>
					<tr className="border-b border-border">
						<th className="w-8 px-2 py-3"></th>
						<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
							Date/Time
						</th>
						<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
							Action
						</th>
						<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
							Part
						</th>
						<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
							Quantity
						</th>
						<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
							Location
						</th>
						<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
							User
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-border/70">
					{Array.from({ length: 5 }).map((_, i) => (
						<tr key={i}>
							<td className="px-2 py-3">
								<div className="w-6 h-6 bg-muted rounded animate-pulse" />
							</td>
							<td className="px-4 py-3">
								<div className="space-y-1">
									<div className="w-24 h-4 bg-muted rounded animate-pulse" />
									<div className="w-16 h-3 bg-muted rounded animate-pulse" />
								</div>
							</td>
							<td className="px-4 py-3">
								<div className="w-20 h-6 bg-muted rounded-full animate-pulse" />
							</td>
							<td className="px-4 py-3">
								<div className="w-32 h-4 bg-muted rounded animate-pulse" />
							</td>
							<td className="px-4 py-3">
								<div className="w-12 h-4 bg-muted rounded animate-pulse" />
							</td>
							<td className="px-4 py-3">
								<div className="w-24 h-4 bg-muted rounded animate-pulse" />
							</td>
							<td className="px-4 py-3">
								<div className="w-20 h-4 bg-muted rounded animate-pulse" />
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

// Pagination component
interface PaginationProps {
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
	totalItems: number;
	itemsPerPage: number;
}

export function TransactionPagination({
	currentPage,
	totalPages,
	onPageChange,
	totalItems,
	itemsPerPage,
}: PaginationProps) {
	const startItem = (currentPage - 1) * itemsPerPage + 1;
	const endItem = Math.min(currentPage * itemsPerPage, totalItems);

	return (
		<div className="flex items-center justify-between px-4 py-3 border-t border-border">
			<div className="text-sm text-muted-foreground">
				Showing <span className="font-medium">{startItem}</span> to{" "}
				<span className="font-medium">{endItem}</span> of{" "}
				<span className="font-medium">{totalItems}</span> transactions
			</div>
			<div className="flex items-center gap-2">
				<button
					onClick={() => onPageChange(currentPage - 1)}
					disabled={currentPage === 1}
					className="px-3 py-1 text-sm border rounded-md hover:bg-muted/40 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Previous
				</button>
				<span className="text-sm text-muted-foreground">
					Page {currentPage} of {totalPages}
				</span>
				<button
					onClick={() => onPageChange(currentPage + 1)}
					disabled={currentPage === totalPages}
					className="px-3 py-1 text-sm border rounded-md hover:bg-muted/40 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Next
				</button>
			</div>
		</div>
	);
}
