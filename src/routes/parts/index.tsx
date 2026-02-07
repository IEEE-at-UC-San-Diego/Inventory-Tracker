import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Archive,
	ArrowRightLeft,
	Boxes,
	Download,
	Filter,
	Layers3,
	Minus,
	Package,
	Plus,
	Search,
	TriangleAlert,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	AdminOnly,
	EditorOnly,
	ProtectedRoute,
} from "@/components/auth/ProtectedRoute";
import {
	FilterChips,
	Pagination,
	PartFilters,
	PartList,
} from "@/components/parts";
import {
	AdjustDialog,
	CheckInDialog,
	CheckOutDialog,
	MoveDialog,
} from "@/components/inventory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	StatCard,
} from "@/components/ui/card";
import { AlertDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DataTable } from "@/components/ui/table";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useMutation, useQuery } from "@/integrations/convex/react-query";
import { createCSV, downloadCSV, generateTimestamp } from "@/lib/csv-export";
import type { Part } from "@/types";

export const Route = createFileRoute("/parts/")({
	component: InventoryWorkspacePage,
});

function InventoryWorkspacePage() {
	return (
		<ProtectedRoute>
			<ToastProvider>
				<InventoryWorkspaceContent />
			</ToastProvider>
		</ProtectedRoute>
	);
}

type SortField = "name" | "sku" | "category" | "createdAt";
type SortOrder = "asc" | "desc";

const PART_PAGE_SIZE = 20;

interface InventoryListItem {
	_id: Id<"inventory">;
	partId: Id<"parts">;
	compartmentId: Id<"compartments">;
	quantity: number;
	part?: {
		_id: Id<"parts">;
		name: string;
		sku: string;
		category: string;
	};
	compartment?: {
		_id: Id<"compartments">;
		label?: string;
	};
}

function InventoryWorkspaceContent() {
	const { toast } = useToast();
	const { canEdit } = useRole();
	const { authContext, getFreshAuthContext, isLoading } = useAuth();

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

	const [searchQuery, setSearchQuery] = useState("");
	const [showArchived, setShowArchived] = useState(false);
	const [selectedCategory, setSelectedCategory] = useState("");
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [sortField, setSortField] = useState<SortField>("name");
	const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
	const [currentPage, setCurrentPage] = useState(1);

	const [inventorySearchQuery, setInventorySearchQuery] = useState("");
	const [inventoryCategory, setInventoryCategory] = useState("");
	const [showLowStockOnly, setShowLowStockOnly] = useState(false);

	const [showCheckIn, setShowCheckIn] = useState(false);
	const [showCheckOut, setShowCheckOut] = useState(false);
	const [showMove, setShowMove] = useState(false);
	const [showAdjust, setShowAdjust] = useState(false);
	const [adjustItem, setAdjustItem] = useState<InventoryListItem | null>(null);

	const [deletePart, setDeletePart] = useState<Part | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

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

	const inventoryResult = useQuery(
		api.inventory.queries.list,
		authContext ? { authContext, includeDetails: true } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const inventory = (inventoryResult ?? []) as InventoryListItem[];

	const lowStockResult = useQuery(
		api.inventory.queries.getLowStock,
		authContext ? { authContext, threshold: 10 } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const lowStockItems = lowStockResult ?? [];

	const categories = useMemo(() => {
		return Array.from(new Set(parts.map((part) => part.category))).sort();
	}, [parts]);

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

	const totalPartPages = Math.ceil(filteredParts.length / PART_PAGE_SIZE);
	const paginatedParts = filteredParts.slice(
		(currentPage - 1) * PART_PAGE_SIZE,
		currentPage * PART_PAGE_SIZE,
	);

	const filteredInventory = useMemo(() => {
		return inventory.filter((item) => {
			const part = item.part;
			if (!part) return false;

			const matchesSearch =
				inventorySearchQuery === "" ||
				part.name.toLowerCase().includes(inventorySearchQuery.toLowerCase()) ||
				part.sku.toLowerCase().includes(inventorySearchQuery.toLowerCase());

			const matchesCategory =
				inventoryCategory === "" || part.category === inventoryCategory;

			const matchesLowStock = !showLowStockOnly || item.quantity < 10;

			return matchesSearch && matchesCategory && matchesLowStock;
		});
	}, [inventory, inventorySearchQuery, inventoryCategory, showLowStockOnly]);

	const totalParts = parts.length;
	const archivedCount = parts.filter((part) => part.archived).length;
	const activeCount = totalParts - archivedCount;
	const totalUnits = inventory.reduce((sum, item) => sum + item.quantity, 0);
	const locationCount = new Set(inventory.map((item) => item.compartmentId))
		.size;
	const lowStockCount = lowStockItems.length;

	const handleSort = useCallback(
		(field: SortField) => {
			setCurrentPage(1);
			if (sortField === field) {
				setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
			} else {
				setSortField(field);
				setSortOrder("asc");
			}
		},
		[sortField],
	);

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
		[archivePart, getRequiredAuthContext, toast, unarchivePart],
	);

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
	}, [deletePart, deletePartMutation, getRequiredAuthContext, toast]);

	const handleAdjust = useCallback((item: InventoryListItem) => {
		setAdjustItem(item);
		setShowAdjust(true);
	}, []);

	const handleHighlightOnBlueprint = useCallback(
		(_partId: string) => {
			toast.info(
				"Part highlighted",
				"Open a blueprint to view this part location",
			);
		},
		[toast],
	);

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
			"Parts Export Complete",
			`Downloaded ${filteredParts.length} part records`,
		);
	}, [filteredParts, toast]);

	const handleExportInventory = useCallback(() => {
		const headers = [
			"Part Name",
			"Part SKU",
			"Category",
			"Quantity",
			"Location",
			"Low Stock",
		];

		const rows = filteredInventory.map((item) => [
			item.part?.name || "",
			item.part?.sku || "",
			item.part?.category || "",
			String(item.quantity),
			item.compartment?.label || "Unknown",
			item.quantity < 10 ? "Yes" : "No",
		]);

		const csvContent = createCSV(headers, rows);
		const timestamp = generateTimestamp();
		downloadCSV(csvContent, `inventory_${timestamp}.csv`);

		toast.success(
			"Inventory Export Complete",
			`Downloaded ${filteredInventory.length} inventory records`,
		);
	}, [filteredInventory, toast]);

	const partFilterChips = useMemo(() => {
		const chips: Array<{ key: string; label: string; onRemove: () => void }> =
			[];

		if (searchQuery) {
			chips.push({
				key: "search",
				label: `Search: "${searchQuery}"`,
				onRemove: () => {
					setSearchQuery("");
					setCurrentPage(1);
				},
			});
		}

		if (selectedCategory) {
			chips.push({
				key: "category",
				label: `Category: ${selectedCategory}`,
				onRemove: () => {
					setSelectedCategory("");
					setCurrentPage(1);
				},
			});
		}

		if (showArchived) {
			chips.push({
				key: "archived",
				label: "Show Archived",
				onRemove: () => {
					setShowArchived(false);
					setCurrentPage(1);
				},
			});
		}

		return chips;
	}, [searchQuery, selectedCategory, showArchived]);

	const inventoryColumns = [
		{
			key: "part",
			header: "Part",
			cell: (item: InventoryListItem) => (
				<div className="min-w-0">
					<Link
						to="/parts/$partId"
						params={{ partId: item.partId }}
						className="block truncate text-sm font-medium text-slate-900 hover:text-cyan-700"
					>
						{item.part?.name || "Unknown Part"}
					</Link>
					<p className="truncate text-xs text-slate-500">
						{item.part?.sku || ""}
					</p>
				</div>
			),
		},
		{
			key: "location",
			header: "Location",
			cell: (item: InventoryListItem) => (
				<span className="text-sm text-slate-700">
					{item.compartment?.label || "Unknown"}
				</span>
			),
		},
		{
			key: "qty",
			header: "Qty",
			cell: (item: InventoryListItem) => (
				<div className="flex items-center gap-1.5">
					<span
						className={
							item.quantity < 10
								? "font-semibold text-rose-600"
								: "font-semibold text-slate-900"
						}
					>
						{item.quantity}
					</span>
					{item.quantity < 10 && (
						<TriangleAlert className="h-3.5 w-3.5 text-rose-500" />
					)}
				</div>
			),
		},
		{
			key: "actions",
			header: "",
			cell: (item: InventoryListItem) => (
				<AdminOnly>
					<Button variant="ghost" size="sm" onClick={() => handleAdjust(item)}>
						Adjust
					</Button>
				</AdminOnly>
			),
		},
	];

	return (
		<div className="bg-gradient-to-b from-slate-50/80 to-background">
			<div className="mx-auto w-full max-w-[1480px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
				<Card className="border-slate-200 bg-gradient-to-r from-white via-white to-cyan-50/40 shadow-sm">
					<CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-1">
							<CardTitle className="text-2xl sm:text-3xl">
								Inventory Workspace
							</CardTitle>
							<CardDescription className="text-sm sm:text-base">
								Manage parts and live stock from one compact page.
							</CardDescription>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Button variant="outline" size="sm" onClick={handleExportParts}>
								<Download className="h-4 w-4" />
								Export Parts
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={handleExportInventory}
							>
								<Download className="h-4 w-4" />
								Export Stock
							</Button>
							<EditorOnly>
								<Button asChild size="sm">
									<Link to="/parts/new">
										<Plus className="h-4 w-4" />
										Add Part
									</Link>
								</Button>
								<Button size="sm" onClick={() => setShowCheckIn(true)}>
									<Plus className="h-4 w-4" />
									Check In
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setShowCheckOut(true)}
								>
									<Minus className="h-4 w-4" />
									Check Out
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setShowMove(true)}
								>
									<ArrowRightLeft className="h-4 w-4" />
									Move
								</Button>
							</EditorOnly>
						</div>
					</CardHeader>
				</Card>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
					<StatCard
						title="Parts"
						value={totalParts}
						description="Total records"
						icon={<Package className="h-4 w-4" />}
					/>
					<StatCard
						title="Active"
						value={activeCount}
						description="In use"
						icon={<Filter className="h-4 w-4" />}
					/>
					<StatCard
						title="Archived"
						value={archivedCount}
						description="Hidden"
						icon={<Archive className="h-4 w-4" />}
					/>
					<StatCard
						title="Units"
						value={totalUnits}
						description="In stock"
						icon={<Boxes className="h-4 w-4" />}
					/>
					<StatCard
						title="Locations"
						value={locationCount}
						description="With inventory"
						icon={<Layers3 className="h-4 w-4" />}
					/>
					<StatCard
						title="Low Stock"
						value={lowStockCount}
						description="Below 10 units"
						icon={<TriangleAlert className="h-4 w-4" />}
						className={lowStockCount > 0 ? "border-amber-200" : undefined}
					/>
				</div>

				<div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
					<Card className="xl:col-span-3">
						<CardHeader className="pb-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div>
									<CardTitle className="text-lg">Parts Catalog</CardTitle>
									<CardDescription>
										Showing {paginatedParts.length} of {filteredParts.length}{" "}
										parts
									</CardDescription>
								</div>
								<Badge variant="outline">
									{viewMode === "grid" ? "Grid" : "List"} view
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<PartFilters
								searchQuery={searchQuery}
								onSearchChange={(query) => {
									setSearchQuery(query);
									setCurrentPage(1);
								}}
								selectedCategory={selectedCategory}
								onCategoryChange={(category) => {
									setSelectedCategory(category);
									setCurrentPage(1);
								}}
								categories={categories}
								showArchived={showArchived}
								onShowArchivedChange={(show) => {
									setShowArchived(show);
									setCurrentPage(1);
								}}
								viewMode={viewMode}
								onViewModeChange={setViewMode}
							/>

							<FilterChips
								filters={[
									...partFilterChips,
									{
										key: "sort",
										label: `Sort: ${sortField} ${sortOrder === "asc" ? "↑" : "↓"}`,
										onRemove: () => {
											setSortField("name");
											setSortOrder("asc");
											setCurrentPage(1);
										},
									},
								]}
							/>

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
								emptyMessage="No parts found. Adjust filters or add a new part."
							/>

							{filteredParts.length > 0 && (
								<Pagination
									currentPage={currentPage}
									totalPages={totalPartPages}
									onPageChange={setCurrentPage}
									pageSize={PART_PAGE_SIZE}
									totalItems={filteredParts.length}
								/>
							)}
						</CardContent>
					</Card>

					<Card className="xl:col-span-2">
						<CardHeader className="pb-3">
							<CardTitle className="text-lg">Live Stock</CardTitle>
							<CardDescription>
								Filter inventory by part, category, and low-stock risk.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-1 gap-2">
								<div className="relative">
									<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
									<Input
										placeholder="Search inventory"
										value={inventorySearchQuery}
										onChange={(event) =>
											setInventorySearchQuery(event.target.value)
										}
										className="pl-10"
									/>
								</div>

								<Select
									value={inventoryCategory || "all"}
									onValueChange={(value) =>
										setInventoryCategory(value === "all" ? "" : value)
									}
								>
									<SelectTrigger>
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

								<div className="flex items-center justify-between rounded-md border px-3 py-2">
									<div>
										<p className="text-sm font-medium">Low stock only</p>
										<p className="text-xs text-slate-500">Under 10 units</p>
									</div>
									<Switch
										checked={showLowStockOnly}
										onCheckedChange={setShowLowStockOnly}
									/>
								</div>
							</div>

							{lowStockCount > 0 && (
								<div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
									<p className="mb-2 text-sm font-semibold text-amber-900">
										{lowStockCount} low-stock item
										{lowStockCount === 1 ? "" : "s"}
									</p>
									<div className="space-y-1.5">
										{lowStockItems.slice(0, 4).map((item) => (
											<div
												key={item._id}
												className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 text-sm"
											>
												<span className="truncate">{item.part?.name}</span>
												<span className="font-semibold text-rose-600">
													{item.quantity}
												</span>
											</div>
										))}
									</div>
								</div>
							)}

							<div className="overflow-hidden rounded-lg border">
								<DataTable
									columns={inventoryColumns}
									data={filteredInventory}
									keyExtractor={(item) => item._id}
									isLoading={isLoading}
									emptyMessage="No inventory records match your filters."
								/>
							</div>
						</CardContent>
					</Card>
				</div>

				<CheckInDialog
					open={showCheckIn}
					onOpenChange={setShowCheckIn}
					onSuccess={() => {
						// Refetch happens automatically.
					}}
				/>
				<CheckOutDialog
					open={showCheckOut}
					onOpenChange={setShowCheckOut}
					onSuccess={() => {
						// Refetch happens automatically.
					}}
				/>
				<MoveDialog
					open={showMove}
					onOpenChange={setShowMove}
					onSuccess={() => {
						// Refetch happens automatically.
					}}
				/>
				<AdjustDialog
					open={showAdjust}
					onOpenChange={(open) => {
						setShowAdjust(open);
						if (!open) setAdjustItem(null);
					}}
					inventoryId={adjustItem?._id ?? null}
					preselectedPartId={adjustItem?.partId ?? null}
					preselectedCompartmentId={adjustItem?.compartmentId ?? null}
					onSuccess={() => {
						setAdjustItem(null);
					}}
				/>

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
		</div>
	);
}
