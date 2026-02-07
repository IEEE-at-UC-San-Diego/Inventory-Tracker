import { Link } from "@tanstack/react-router";
import { Archive, Grid2X2, LayoutList, Search, X } from "lucide-react";
import { useMemo } from "react";
import type { Part } from "@/types";
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
import { Switch } from "../ui/switch";
import { PartCard, PartCardSkeleton } from "./PartCard";

type SortField = "name" | "sku" | "category" | "createdAt";
type SortOrder = "asc" | "desc";

interface PartWithStats extends Part {
	totalQuantity?: number;
	locationCount?: number;
}

interface PartListProps {
	parts: PartWithStats[];
	isLoading?: boolean;
	viewMode?: "grid" | "list";
	sortField?: SortField;
	sortOrder?: SortOrder;
	onSort?: (field: SortField) => void;
	onArchive?: (partId: string, archived: boolean) => void;
	onDelete?: (part: Part) => void;
	onHighlightParts?: (partId: string) => void;
	canEdit?: boolean;
	emptyMessage?: string;
}

export function PartList({
	parts,
	isLoading,
	viewMode = "grid",
	sortField,
	sortOrder,
	onSort,
	onArchive,
	onDelete,
	onHighlightParts,
	canEdit = false,
	emptyMessage = "No parts found",
}: PartListProps) {
	if (isLoading) {
		const skeletonIds = [
			"skeleton-a",
			"skeleton-b",
			"skeleton-c",
			"skeleton-d",
			"skeleton-e",
			"skeleton-f",
			"skeleton-g",
			"skeleton-h",
		];

		return (
			<div
				className={
					viewMode === "grid"
						? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
						: "space-y-2"
				}
			>
				{skeletonIds.map((skeletonId) => (
					<PartCardSkeleton key={skeletonId} viewMode={viewMode} />
				))}
			</div>
		);
	}

	if (parts.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-center">
				<div className="mb-4 rounded-full bg-slate-100 p-5">
					<Search className="h-8 w-8 text-slate-400" />
				</div>
				<p className="text-lg font-medium text-slate-900">{emptyMessage}</p>
				<p className="mt-1 text-sm text-slate-500">
					Try adjusting your filters or add a new part.
				</p>
			</div>
		);
	}

	if (viewMode === "list") {
		return (
			<div className="overflow-hidden rounded-lg border border-slate-200">
				<div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_120px_120px_100px] items-center gap-4 border-b border-slate-200 bg-slate-50/90 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
					<button
						type="button"
						className="text-left"
						onClick={() => onSort?.("name")}
					>
						Name {sortField === "name" ? (sortOrder === "asc" ? "↑" : "↓") : ""}
					</button>
					<button
						type="button"
						className="text-left"
						onClick={() => onSort?.("category")}
					>
						Category{" "}
						{sortField === "category" ? (sortOrder === "asc" ? "↑" : "↓") : ""}
					</button>
					<div className="text-right">Stock</div>
					<div className="text-right">Locations</div>
					<div className="text-right">Status</div>
				</div>

				<div className="divide-y divide-slate-100">
					{parts.map((part) => {
						const totalQuantity = part.totalQuantity ?? 0;
						const locationCount = part.locationCount ?? 0;
						return (
							<Link
							key={part._id}
							to="/parts/$partId"
							params={{ partId: part._id }}
							preload="intent"
							className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_120px_120px_100px] items-center gap-4 px-4 py-2.5 transition-colors hover:bg-slate-50"
						>
							<div className="min-w-0">
								<p className="truncate text-sm font-medium text-slate-900">
									{part.name}
								</p>
								<p className="truncate text-xs text-slate-500">{part.sku}</p>
							</div>
							<div className="truncate text-sm text-slate-700">{part.category}</div>
							<div className="text-right text-sm font-medium text-slate-900">
								{totalQuantity}
							</div>
							<div className="text-right text-sm text-slate-700">
								{locationCount}
							</div>
							<div className="text-right text-xs font-medium">
								<span
									className={
										part.archived ? "text-slate-500" : "text-emerald-700"
									}
								>
									{part.archived ? "Archived" : "Active"}
								</span>
							</div>
						</Link>
						);
					})}
				</div>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{parts.map((part) => (
				<PartCard
					key={part._id}
					part={part}
					viewMode="grid"
					onArchive={onArchive}
					onDelete={onDelete}
					onHighlightParts={onHighlightParts}
					canEdit={canEdit}
				/>
			))}
		</div>
	);
}

interface PaginationProps {
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
	pageSize?: number;
	onPageSizeChange?: (size: number) => void;
	totalItems: number;
}

export function Pagination({
	currentPage,
	totalPages,
	onPageChange,
	pageSize = 20,
	onPageSizeChange,
	totalItems,
}: PaginationProps) {
	const pages = useMemo(() => {
		const items: (number | string)[] = [];
		const maxVisible = 5;

		if (totalPages <= maxVisible) {
			for (let index = 1; index <= totalPages; index += 1) {
				items.push(index);
			}
		} else if (currentPage <= 3) {
			for (let index = 1; index <= 4; index += 1) items.push(index);
			items.push("...");
			items.push(totalPages);
		} else if (currentPage >= totalPages - 2) {
			items.push(1);
			items.push("...");
			for (let index = totalPages - 3; index <= totalPages; index += 1) {
				items.push(index);
			}
		} else {
			items.push(1);
			items.push("...");
			for (let index = currentPage - 1; index <= currentPage + 1; index += 1) {
				items.push(index);
			}
			items.push("...");
			items.push(totalPages);
		}

		return items;
	}, [currentPage, totalPages]);

	const startItem = (currentPage - 1) * pageSize + 1;
	const endItem = Math.min(currentPage * pageSize, totalItems);

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3">
			<div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
				<span>
					Showing <span className="font-medium">{startItem}</span> to{" "}
					<span className="font-medium">{endItem}</span> of{" "}
					<span className="font-medium">{totalItems}</span>
				</span>
				{onPageSizeChange && (
					<Select
						value={String(pageSize)}
						onValueChange={(value) => onPageSizeChange(Number(value))}
					>
						<SelectTrigger size="sm" className="w-[130px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="10">10 / page</SelectItem>
							<SelectItem value="20">20 / page</SelectItem>
							<SelectItem value="50">50 / page</SelectItem>
							<SelectItem value="100">100 / page</SelectItem>
						</SelectContent>
					</Select>
				)}
			</div>

			<div className="flex items-center gap-1">
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(currentPage - 1)}
					disabled={currentPage === 1}
				>
					Previous
				</Button>

				{(() => {
					let ellipsisCount = 0;
					return pages.map((page) => {
						const key =
							page === "..."
								? `ellipsis-${ellipsisCount++}`
								: `page-${String(page)}`;

						return (
							<Button
								key={key}
								variant={page === currentPage ? "default" : "outline"}
								size="sm"
								onClick={() => typeof page === "number" && onPageChange(page)}
								disabled={page === "..."}
							>
								{page}
							</Button>
						);
					});
				})()}

				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(currentPage + 1)}
					disabled={currentPage === totalPages}
				>
					Next
				</Button>
			</div>
		</div>
	);
}

interface PartFiltersProps {
	searchQuery: string;
	onSearchChange: (query: string) => void;
	selectedCategory: string;
	onCategoryChange: (category: string) => void;
	categories: string[];
	showArchived: boolean;
	onShowArchivedChange: (show: boolean) => void;
	viewMode: "grid" | "list";
	onViewModeChange: (mode: "grid" | "list") => void;
}

export function PartFilters({
	searchQuery,
	onSearchChange,
	selectedCategory,
	onCategoryChange,
	categories,
	showArchived,
	onShowArchivedChange,
	viewMode,
	onViewModeChange,
}: PartFiltersProps) {
	return (
		<div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
			<div className="relative">
				<div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
					<Search className="h-4 w-4 text-slate-400" />
				</div>
				<Input
					type="text"
					placeholder="Search by name, SKU, or description"
					value={searchQuery}
					onChange={(event) => onSearchChange(event.target.value)}
					className="h-10 pl-10"
				/>
			</div>

			<Select
				value={selectedCategory || "all"}
				onValueChange={(value) =>
					onCategoryChange(value === "all" ? "" : value)
				}
			>
				<SelectTrigger className="w-full lg:w-[200px]">
					<SelectValue placeholder="All Categories" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Categories</SelectItem>
					{categories.map((category) => (
						<SelectItem key={category} value={category}>
							{category}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<div className="flex h-10 items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 lg:min-w-[180px]">
				<div className="flex items-center gap-2 text-sm font-medium text-slate-900">
					<Archive className="h-4 w-4 text-slate-500" />
					<span>Archived</span>
				</div>
				<Switch checked={showArchived} onCheckedChange={onShowArchivedChange} />
			</div>

			<div className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white p-1">
				<Button
					variant={viewMode === "grid" ? "default" : "ghost"}
					size="icon"
					className="h-8 w-8"
					onClick={() => onViewModeChange("grid")}
					title="Grid view"
				>
					<Grid2X2 className="h-4 w-4" />
				</Button>
				<Button
					variant={viewMode === "list" ? "default" : "ghost"}
					size="icon"
					className="h-8 w-8"
					onClick={() => onViewModeChange("list")}
					title="List view"
				>
					<LayoutList className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}

interface FilterChipsProps {
	filters: Array<{
		key: string;
		label: string;
		onRemove: () => void;
	}>;
}

export function FilterChips({ filters }: FilterChipsProps) {
	if (filters.length === 0) return null;

	return (
		<div className="flex flex-wrap items-center gap-2">
			{filters.map((filter) => (
				<Badge
					key={filter.key}
					variant="outline"
					className="gap-1 border-cyan-200 bg-cyan-50 text-cyan-800"
				>
					{filter.label}
					<Button
						variant="ghost"
						size="icon-xs"
						className="h-4 w-4 rounded-full p-0"
						onClick={filter.onRemove}
					>
						<X className="h-3 w-3" />
					</Button>
				</Badge>
			))}
		</div>
	);
}
