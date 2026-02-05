import { useMemo } from "react";
import type { Part } from "@/types";
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
		return (
			<div
				className={
					viewMode === "grid"
						? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
						: "space-y-2"
				}
			>
				{Array.from({ length: 8 }).map((_, i) => (
					<PartCardSkeleton key={i} viewMode={viewMode} />
				))}
			</div>
		);
	}

	if (parts.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-gray-500">
				<div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
					<svg
						className="w-12 h-12 text-gray-300"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={1.5}
							d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
						/>
					</svg>
				</div>
				<p className="text-lg font-medium text-gray-900">{emptyMessage}</p>
				<p className="text-sm text-gray-500 mt-1">
					Try adjusting your filters or add a new part
				</p>
			</div>
		);
	}

	// List view with sortable headers
	if (viewMode === "list") {
		return (
			<div className="bg-white rounded-lg border">
				{/* Header */}
				<div className="grid grid-cols-[auto_1fr_120px_140px_100px] gap-4 p-4 border-b bg-gray-50 text-sm font-medium text-gray-700">
					<div className="w-12"></div>
					<button
						className="flex items-center gap-1 text-left hover:text-gray-900"
						onClick={() => onSort?.("name")}
					>
						Name
						{sortField === "name" && (
							<span>{sortOrder === "asc" ? "↑" : "↓"}</span>
						)}
					</button>
					<button
						className="flex items-center gap-1 text-left hover:text-gray-900"
						onClick={() => onSort?.("category")}
					>
						Category
						{sortField === "category" && (
							<span>{sortOrder === "asc" ? "↑" : "↓"}</span>
						)}
					</button>
					<span className="text-right">Inventory</span>
					<span className="text-right">Actions</span>
				</div>

				{/* Items */}
				<div className="divide-y">
					{parts.map((part) => (
						<PartCard
							key={part._id}
							part={part}
							viewMode="list"
							onArchive={onArchive}
							onDelete={onDelete}
							onHighlightParts={onHighlightParts}
							canEdit={canEdit}
						/>
					))}
				</div>
			</div>
		);
	}

	// Grid view
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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

// Pagination component
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
			for (let i = 1; i <= totalPages; i++) {
				items.push(i);
			}
		} else {
			if (currentPage <= 3) {
				for (let i = 1; i <= 4; i++) items.push(i);
				items.push("...");
				items.push(totalPages);
			} else if (currentPage >= totalPages - 2) {
				items.push(1);
				items.push("...");
				for (let i = totalPages - 3; i <= totalPages; i++) items.push(i);
			} else {
				items.push(1);
				items.push("...");
				for (let i = currentPage - 1; i <= currentPage + 1; i++) items.push(i);
				items.push("...");
				items.push(totalPages);
			}
		}

		return items;
	}, [currentPage, totalPages]);

	const startItem = (currentPage - 1) * pageSize + 1;
	const endItem = Math.min(currentPage * pageSize, totalItems);

	return (
		<div className="flex items-center justify-between px-4 py-3 bg-white border-t">
			<div className="flex items-center gap-4">
				<span className="text-sm text-gray-700">
					Showing <span className="font-medium">{startItem}</span> to{" "}
					<span className="font-medium">{endItem}</span> of{" "}
					<span className="font-medium">{totalItems}</span> results
				</span>
				{onPageSizeChange && (
					<select
						value={pageSize}
						onChange={(e) => onPageSizeChange(Number(e.target.value))}
						className="text-sm border rounded px-2 py-1"
					>
						<option value={10}>10 per page</option>
						<option value={20}>20 per page</option>
						<option value={50}>50 per page</option>
						<option value={100}>100 per page</option>
					</select>
				)}
			</div>

			<div className="flex items-center gap-1">
				<button
					onClick={() => onPageChange(currentPage - 1)}
					disabled={currentPage === 1}
					className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Previous
				</button>

				{pages.map((page, index) => (
					<button
						key={index}
						onClick={() => typeof page === "number" && onPageChange(page)}
						disabled={page === "..."}
						className={`px-3 py-1 text-sm border rounded ${
							page === currentPage
								? "bg-cyan-600 text-white border-cyan-600"
								: page === "..."
									? "cursor-default border-transparent"
									: "hover:bg-gray-50"
						}`}
					>
						{page}
					</button>
				))}

				<button
					onClick={() => onPageChange(currentPage + 1)}
					disabled={currentPage === totalPages}
					className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Next
				</button>
			</div>
		</div>
	);
}

// Filter and search bar component
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
		<div className="flex flex-col sm:flex-row gap-4 p-4 bg-white rounded-lg border">
			{/* Search */}
			<div className="flex-1 relative">
				<svg
					className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/>
				</svg>
				<input
					type="text"
					placeholder="Search by name, SKU, or description..."
					value={searchQuery}
					onChange={(e) => onSearchChange(e.target.value)}
					className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
				/>
			</div>

			{/* Filters */}
			<div className="flex items-center gap-2 flex-wrap">
				{/* Category filter */}
				<select
					value={selectedCategory}
					onChange={(e) => onCategoryChange(e.target.value)}
					className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
				>
					<option value="">All Categories</option>
					{categories.map((cat) => (
						<option key={cat} value={cat}>
							{cat}
						</option>
					))}
				</select>

				{/* Archived toggle */}
				<label className="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-gray-50">
					<input
						type="checkbox"
						checked={showArchived}
						onChange={(e) => onShowArchivedChange(e.target.checked)}
						className="rounded border-gray-300"
					/>
					<span className="text-sm text-gray-700">Show archived</span>
				</label>

				{/* View mode toggle */}
				<div className="flex items-center border rounded-lg overflow-hidden">
					<button
						onClick={() => onViewModeChange("grid")}
						className={`p-2 ${
							viewMode === "grid"
								? "bg-cyan-600 text-white"
								: "hover:bg-gray-50"
						}`}
						title="Grid view"
					>
						<svg
							className="w-5 h-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
							/>
						</svg>
					</button>
					<button
						onClick={() => onViewModeChange("list")}
						className={`p-2 ${
							viewMode === "list"
								? "bg-cyan-600 text-white"
								: "hover:bg-gray-50"
						}`}
						title="List view"
					>
						<svg
							className="w-5 h-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M4 6h16M4 12h16M4 18h16"
							/>
						</svg>
					</button>
				</div>
			</div>
		</div>
	);
}

// Active filter chips
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
		<div className="flex items-center gap-2 flex-wrap">
			{filters.map((filter) => (
				<span
					key={filter.key}
					className="inline-flex items-center gap-1 px-2 py-1 bg-cyan-50 text-cyan-700 text-sm rounded-full"
				>
					{filter.label}
					<button
						onClick={filter.onRemove}
						className="p-0.5 hover:bg-cyan-100 rounded-full"
					>
						<svg
							className="w-3 h-3"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</span>
			))}
		</div>
	);
}
