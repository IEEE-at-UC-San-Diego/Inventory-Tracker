import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, Download, Filter, Package, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EditorOnly, ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
	FilterChips,
	Pagination,
	PartFilters,
	PartList,
} from "@/components/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, StatCard } from "@/components/ui/card";
import { AlertDialog } from "@/components/ui/dialog";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useMutation, useQuery } from "@/integrations/convex/react-query";
import { createCSV, downloadCSV, generateTimestamp } from "@/lib/csv-export";
import type { Part } from "@/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/parts/")({
	component: PartsPage,
});

function PartsPage() {
	return (
		<ProtectedRoute>
			<ToastProvider>
				<PartsContent />
			</ToastProvider>
		</ProtectedRoute>
	);
}

type SortField = "name" | "sku" | "category" | "createdAt";
type SortOrder = "asc" | "desc";

const PAGE_SIZE = 20;

function PartsContent() {
	const { toast } = useToast();
	const { canEdit } = useRole();
	const { authContext, getFreshAuthContext, isLoading } = useAuth();

	// Helper to get fresh auth context for mutations
	const getAuthContextForMutation = useCallback(
		async (context: typeof authContext) => {
			const fresh = await getFreshAuthContext();
			return fresh || context;
		},
		[getFreshAuthContext],
	);
	const getRequiredAuthContext = useCallback(async () => {
		const context = await getAuthContextForMutation(authContext);
		if (!context) {
			throw new Error("Not authenticated");
		}
		return context;
	}, [authContext, getAuthContextForMutation]);

	// Filter and sort state
	const [searchQuery, setSearchQuery] = useState("");
	const [showArchived, setShowArchived] = useState(false);
	const [selectedCategory, setSelectedCategory] = useState("");
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [sortField, setSortField] = useState<SortField>("name");
	const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
	const [currentPage, setCurrentPage] = useState(1);

	// Dialog state
	const [deletePart, setDeletePart] = useState<Part | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	// Handle highlight on blueprint
	const handleHighlightOnBlueprint = useCallback(
		(_partId: string) => {
			// Navigate to blueprints with partId in search params
			toast.info("Part highlighted - select a blueprint to see its location");
		},
		[toast],
	);

	// Fetch parts data
	const partsResult = useQuery(
		api.parts.queries.list,
		authContext
			? {
					authContext,
					includeArchived: showArchived,
				}
			: undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const parts = partsResult ?? [];

	// Fetch inventory summary for all parts
	const inventoryResult = useQuery(
		api.inventory.queries.list,
		authContext
			? {
					authContext,
					includeDetails: true,
				}
			: undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const inventory = inventoryResult ?? [];

	// Build parts with stats
	const partsWithStats = useMemo(() => {
		const inventoryByPart = new Map<
			string,
			{ quantity: number; locations: number }
		>();

		inventory.forEach((item) => {
			const existing = inventoryByPart.get(item.partId);
			if (existing) {
				existing.quantity += item.quantity;
				existing.locations += 1;
			} else {
				inventoryByPart.set(item.partId, {
					quantity: item.quantity,
					locations: 1,
				});
			}
		});

		return parts.map((part) => {
			const stats = inventoryByPart.get(part._id) ?? {
				quantity: 0,
				locations: 0,
			};
			return {
				...part,
				totalQuantity: stats.quantity,
				locationCount: stats.locations,
			};
		});
	}, [parts, inventory]);

	// Get unique categories
	const categories = useMemo(() => {
		return Array.from(new Set(parts.map((p) => p.category))).sort();
	}, [parts]);

	// Filter and sort parts
	const filteredParts = useMemo(() => {
		let result = partsWithStats.filter((part) => {
			const matchesSearch =
				searchQuery === "" ||
				part.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				part.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
				part.description?.toLowerCase().includes(searchQuery.toLowerCase());

			const matchesCategory =
				selectedCategory === "" || part.category === selectedCategory;

			return matchesSearch && matchesCategory;
		});

		// Sort
		result = [...result].sort((a, b) => {
			let comparison = 0;
			switch (sortField) {
				case "name":
					comparison = a.name.localeCompare(b.name);
					break;
				case "sku":
					comparison = a.sku.localeCompare(b.sku);
					break;
				case "category":
					comparison = a.category.localeCompare(b.category);
					break;
				case "createdAt":
					comparison = a.createdAt - b.createdAt;
					break;
			}
			return sortOrder === "asc" ? comparison : -comparison;
		});

		return result;
	}, [partsWithStats, searchQuery, selectedCategory, sortField, sortOrder]);

	// Pagination
	const totalPages = Math.ceil(filteredParts.length / PAGE_SIZE);
	const paginatedParts = filteredParts.slice(
		(currentPage - 1) * PAGE_SIZE,
		currentPage * PAGE_SIZE,
	);

	// Reset page when filters change
	useEffect(() => {
		setCurrentPage(1);
	}, []);

	// Handle sort
	const handleSort = useCallback(
		(field: SortField) => {
			if (sortField === field) {
				setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
			} else {
				setSortField(field);
				setSortOrder("asc");
			}
		},
		[sortField],
	);

	// Archive mutation
	const archivePart = useMutation(api.parts.mutations.archive);
	const unarchivePart = useMutation(api.parts.mutations.unarchive);

	const handleArchive = useCallback(
		async (partId: string, archived: boolean) => {
			try {
				const context = await getRequiredAuthContext();
				if (archived) {
					await unarchivePart({
						authContext: context,
						partId: partId as Id<"parts">,
					});
					toast.success("Part unarchived successfully");
				} else {
					await archivePart({
						authContext: context,
						partId: partId as Id<"parts">,
					});
					toast.success("Part archived successfully");
				}
			} catch (error) {
				toast.error(
					"Failed to update part",
					error instanceof Error ? error.message : "An error occurred",
				);
			}
		},
		[archivePart, unarchivePart, toast, getRequiredAuthContext],
	);

	// Delete mutation
	const deletePartMutation = useMutation(api.parts.mutations.remove);

	const handleDelete = useCallback(async () => {
		if (!deletePart) return;

		setIsDeleting(true);
		try {
			const context = await getRequiredAuthContext();
			await deletePartMutation({
				authContext: context,
				partId: deletePart._id as Id<"parts">,
			});
			toast.success("Part deleted successfully");
			setDeletePart(null);
		} catch (error) {
			toast.error(
				"Failed to delete part",
				error instanceof Error ? error.message : "An error occurred",
			);
		} finally {
			setIsDeleting(false);
		}
	}, [deletePart, deletePartMutation, toast, getRequiredAuthContext]);

	// Export parts to CSV
	const handleExportParts = useCallback(() => {
		const headers = [
			"Name",
			"SKU",
			"Category",
			"Description",
			"Total Quantity",
			"Location Count",
			"Archived",
			"Created At",
		];

		const rows = filteredParts.map((part) => [
			part.name,
			part.sku,
			part.category,
			part.description || "",
			String(part.totalQuantity ?? 0),
			String(part.locationCount ?? 0),
			part.archived ? "Yes" : "No",
			new Date(part.createdAt).toISOString(),
		]);

		const csvContent = createCSV(headers, rows);
		const timestamp = generateTimestamp();
		downloadCSV(csvContent, `parts_${timestamp}.csv`);

		toast.success(
			"Export Complete",
			`Downloaded ${filteredParts.length} parts to CSV`,
		);
	}, [filteredParts, toast]);

	// Build active filter chips
	const activeFilters = useMemo(() => {
		const filters: Array<{ key: string; label: string; onRemove: () => void }> =
			[];

		if (searchQuery) {
			filters.push({
				key: "search",
				label: `Search: "${searchQuery}"`,
				onRemove: () => setSearchQuery(""),
			});
		}

		if (selectedCategory) {
			filters.push({
				key: "category",
				label: `Category: ${selectedCategory}`,
				onRemove: () => setSelectedCategory(""),
			});
		}

		if (showArchived) {
			filters.push({
				key: "archived",
				label: "Show Archived",
				onRemove: () => setShowArchived(false),
			});
		}

		return filters;
	}, [searchQuery, selectedCategory, showArchived]);

	// Stats
	const totalParts = parts.length;
	const archivedCount = parts.filter((p) => p.archived).length;
	const activeCount = totalParts - archivedCount;
	const totalInventory = partsWithStats.reduce(
		(sum, p) => sum + (p.totalQuantity ?? 0),
		0,
	);

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<h1 className="text-3xl font-bold text-gray-900">Parts</h1>
					<p className="text-gray-600 mt-1">
						Manage your inventory parts and components
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						onClick={handleExportParts}
						disabled={filteredParts.length === 0}
						className="inline-flex items-center gap-2"
					>
						<Download className="w-4 h-4" />
						Export CSV
					</Button>
					<EditorOnly>
						<Link
							to="/parts/new"
							className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
						>
							<Plus className="w-5 h-5" />
							Add Part
						</Link>
					</EditorOnly>
				</div>
			</div>

			{/* Stats */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
				<StatCard
					title="Total Parts"
					value={totalParts}
					description="All parts in system"
					icon={<Package className="w-4 h-4" />}
				/>
				<StatCard
					title="Active"
					value={activeCount}
					description="Currently active"
					icon={<Filter className="w-4 h-4" />}
				/>
				<StatCard
					title="Archived"
					value={archivedCount}
					description="Inactive parts"
					icon={<Archive className="w-4 h-4" />}
				/>
				<StatCard
					title="In Stock"
					value={totalInventory}
					description="Total units across all locations"
					icon={<Package className="w-4 h-4" />}
				/>
			</div>

			{/* Filters */}
			<PartFilters
				searchQuery={searchQuery}
				onSearchChange={setSearchQuery}
				selectedCategory={selectedCategory}
				onCategoryChange={setSelectedCategory}
				categories={categories}
				showArchived={showArchived}
				onShowArchivedChange={setShowArchived}
				viewMode={viewMode}
				onViewModeChange={setViewMode}
			/>

			{/* Active filter chips */}
			<FilterChips
				filters={[
					...activeFilters,
					{
						key: "sort",
						label: `Sort: ${sortField} ${sortOrder === "asc" ? "↑" : "↓"}`,
						onRemove: () => {
							setSortField("name");
							setSortOrder("asc");
						},
					},
				]}
			/>

			{/* Parts List */}
			<Card>
				<CardContent className="p-0">
					<PartList
						parts={paginatedParts}
						isLoading={isLoading}
						viewMode={viewMode}
						sortField={sortField}
						sortOrder={sortOrder}
						onSort={handleSort}
						onArchive={handleArchive}
						onDelete={setDeletePart}
						onHighlightParts={handleHighlightOnBlueprint}
						canEdit={canEdit()}
						emptyMessage="No parts found. Try adjusting your filters or add a new part."
					/>

					{/* Pagination */}
					{filteredParts.length > 0 && (
						<Pagination
							currentPage={currentPage}
							totalPages={totalPages}
							onPageChange={setCurrentPage}
							pageSize={PAGE_SIZE}
							totalItems={filteredParts.length}
						/>
					)}
				</CardContent>
			</Card>

			{/* Delete confirmation */}
			<AlertDialog
				open={!!deletePart}
				onOpenChange={() => !isDeleting && setDeletePart(null)}
				title="Delete Part"
				description={`Are you sure you want to delete "${deletePart?.name}"? This action cannot be undone and will remove all associated inventory records.`}
				confirmLabel={isDeleting ? "Deleting..." : "Delete"}
				cancelLabel="Cancel"
				onConfirm={handleDelete}
				variant="destructive"
			/>
		</div>
	);
}
