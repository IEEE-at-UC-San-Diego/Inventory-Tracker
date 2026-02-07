import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Archive,
	ArrowRightLeft,
	Boxes,
	CheckCircle2,
	Download,
	Filter,
	Layers3,
	LayoutGrid,
	List,
	Minus,
	Package,
	Plus,
	AlertTriangle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
	const lastPartsRef = useRef<Part[]>([]);
	useEffect(() => {
		if (partsResult !== undefined) {
			lastPartsRef.current = partsResult;
		}
	}, [partsResult]);
	const parts = partsResult ?? lastPartsRef.current;

	const inventoryResult = useQuery(
		api.inventory.queries.list,
		authContext ? { authContext, includeDetails: true } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const lastInventoryRef = useRef<InventoryListItem[]>([]);
	useEffect(() => {
		if (inventoryResult !== undefined) {
			lastInventoryRef.current = inventoryResult as InventoryListItem[];
		}
	}, [inventoryResult]);
	const inventory = (inventoryResult ?? lastInventoryRef.current) as InventoryListItem[];

	const lowStockResult = useQuery(
		api.inventory.queries.getLowStock,
		authContext ? { authContext, threshold: 10 } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const lastLowStockRef = useRef<typeof lowStockResult>([]);
	useEffect(() => {
		if (lowStockResult !== undefined) {
			lastLowStockRef.current = lowStockResult;
		}
	}, [lowStockResult]);
	const lowStockItems = lowStockResult ?? lastLowStockRef.current ?? [];

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



	const lowStockFilteredInventory = useMemo(() => {
		return inventory.filter((item) => {
			const part = item.part;
			if (!part) return false;
			return item.quantity < 10;
		});
	}, [inventory]);

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

	const handleExportCsv = useCallback(() => {
		const headers = [
			"Name",
			"SKU",
			"Category",
			"Description",
			"Unit",
			"Archived",
			"Total Quantity",
			"Location Count",
			"Locations",
			"Created At",
			"Updated At",
		];

		const inventoryByPart = new Map<string, InventoryListItem[]>();
		for (const item of inventory) {
			const existing = inventoryByPart.get(item.partId) ?? [];
			existing.push(item);
			inventoryByPart.set(item.partId, existing);
		}

		const rows = filteredParts.map((part) => [
			part.name,
			part.sku,
			part.category,
			part.description || "",
			part.unit,
			part.archived ? "Yes" : "No",
			String(part.totalQuantity ?? 0),
			String(part.locationCount ?? 0),
			(inventoryByPart.get(part._id) ?? [])
				.map(
					(item) =>
						`${item.compartment?.label || "Unknown"} (${item.quantity})`,
				)
				.join("; "),
			new Date(part.createdAt).toISOString(),
			new Date(part.updatedAt).toISOString(),
		]);

		const csvContent = createCSV(headers, rows);
		const timestamp = generateTimestamp();
		downloadCSV(csvContent, `parts_inventory_${timestamp}.csv`);

		toast.success(
			"Export Complete",
			`Downloaded ${filteredParts.length} records with inventory details`,
		);
	}, [filteredParts, inventory, toast]);

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
						preload="intent"
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
						<AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
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
		<div className="min-h-screen w-full bg-background">
			<div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
				{/* Header Section */}
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h1 className="text-3xl font-bold tracking-tight text-foreground">
							Inventory workspace
						</h1>
						<p className="mt-1 text-muted-foreground">
							Manage your parts catalog and monitor live stock levels.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<EditorOnly>
							<Button asChild>
								<Link to="/parts/new">
									<Plus className="mr-2 h-4 w-4" />
									Add Part
								</Link>
							</Button>
							<Button variant="outline" onClick={() => setShowCheckIn(true)}>
								<Plus className="mr-2 h-4 w-4" />
								Check In
							</Button>
							<Button variant="outline" onClick={() => setShowCheckOut(true)}>
								<Minus className="mr-2 h-4 w-4" />
								Check Out
							</Button>
							<Button variant="outline" onClick={() => setShowMove(true)}>
								<ArrowRightLeft className="mr-2 h-4 w-4" />
								Move
							</Button>
						</EditorOnly>
					</div>
				</div>

				{/* Key Metrics Grid */}
				<div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
					<StatCard
						title="Parts"
						value={totalParts}
						description="Total records"
						icon={<Package className="h-4 w-4 text-muted-foreground" />}
					/>
					<StatCard
						title="Active"
						value={activeCount}
						description="In use"
						icon={<Filter className="h-4 w-4 text-muted-foreground" />}
					/>
					<StatCard
						title="Archived"
						value={archivedCount}
						description="Hidden"
						icon={<Archive className="h-4 w-4 text-muted-foreground" />}
					/>
					<StatCard
						title="Units"
						value={totalUnits}
						description="In stock"
						icon={<Boxes className="h-4 w-4 text-muted-foreground" />}
					/>
					<StatCard
						title="Locations"
						value={locationCount}
						description="With inventory"
						icon={<Layers3 className="h-4 w-4 text-muted-foreground" />}
					/>
					<StatCard
						title="Low Stock"
						value={lowStockCount}
						description="Below 10 units"
						icon={
							<AlertTriangle
								className={`h-4 w-4 ${
									lowStockCount > 0 ? "text-amber-500" : "text-muted-foreground"
								}`}
							/>
						}
						className={
							lowStockCount > 0 ? "border-amber-200 bg-amber-50/10" : undefined
						}
					/>
				</div>

				{/* Main Content Tabs */}
				<Tabs defaultValue="parts" className="w-full space-y-6">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<TabsList className="grid w-full grid-cols-2 sm:w-[300px]">
							<TabsTrigger value="parts">Parts Catalog</TabsTrigger>
							<TabsTrigger value="low-stock">Low Stock</TabsTrigger>
						</TabsList>
						<div className="flex items-center gap-2">
							<Button variant="ghost" size="sm" onClick={handleExportCsv}>
								<Download className="mr-2 h-4 w-4" />
								Export CSV
							</Button>
						</div>
					</div>

					<TabsContent value="parts" className="space-y-4">
						<Card>
							<CardHeader className="pb-4">
								<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
									<div>
										<CardTitle>Parts Catalog</CardTitle>
										<CardDescription>
											Viewing {paginatedParts.length} of {filteredParts.length}{" "}
											parts
										</CardDescription>
									</div>
									<div className="flex items-center gap-2">
										<Badge variant="outline" className="h-8 px-3">
											{viewMode === "grid" ? (
												<LayoutGrid className="mr-2 h-3.5 w-3.5" />
											) : (
												<List className="mr-2 h-3.5 w-3.5" />
											)}
											{viewMode === "grid" ? "Grid" : "List"} view
										</Badge>
									</div>
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
					</TabsContent>



					<TabsContent value="low-stock" className="space-y-4">
						<Card className="border-amber-200">
							<CardHeader className="bg-amber-50/40">
								<div className="flex items-center gap-2">
									<AlertTriangle className="h-5 w-5 text-amber-600" />
									<div>
										<CardTitle className="text-amber-900">
											Low Stock Alerts
										</CardTitle>
										<CardDescription className="text-amber-700/80">
											Items that have fallen below the minimum threshold (10
											units).
										</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent className="pt-6">
								{lowStockCount > 0 ? (
									<div className="rounded-md border border-amber-100">
										<DataTable
											columns={inventoryColumns}
											data={lowStockFilteredInventory}
											keyExtractor={(item) => item._id}
											isLoading={isLoading}
											emptyMessage="No low stock items found."
										/>
									</div>
								) : (
									<div className="flex flex-col items-center justify-center py-12 text-center">
										<div className="rounded-full bg-green-100 p-3">
											<CheckCircle2 className="h-6 w-6 text-green-600" />
										</div>
										<h3 className="mt-4 text-lg font-semibold text-slate-900">
											All Stock Levels Healthy
										</h3>
										<p className="mt-2.5 text-sm text-slate-500 max-w-sm">
											Great job! There are no items currently below the low stock
											threshold.
										</p>
									</div>
								)}
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>

				{/* Dialogs */}
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
					inventoryId={adjustItem?._id}
					preselectedPartId={adjustItem?.partId}
					preselectedCompartmentId={adjustItem?.compartmentId}
					onSuccess={() => {
						setAdjustItem(null);
						// Refetch happens automatically.
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
