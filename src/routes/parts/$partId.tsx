import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
	Archive,
	ArrowLeft,
	ArrowRightLeft,
	Edit,
	Grid3X3,
	MapPin,
	Minus,
	Package,
	Plus,
	Settings,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	AdminOnly,
	EditorOnly,
	ProtectedRoute,
} from "@/components/auth/ProtectedRoute";
import {
	AdjustDialog,
	CheckInDialog,
	CheckOutDialog,
	MoveDialog,
} from "@/components/inventory";
import {
	CanvasView,
	type DrawerWithCompartments,
} from "@/components/parts/location-picker-2d-canvas";
import { PartForm } from "@/components/parts/PartForm";
import { PartImage } from "@/components/parts/PartImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { AlertDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQuery } from "@/integrations/convex/react-query";
import type { Compartment, Drawer } from "@/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/parts/$partId")({
	component: PartDetailPage,
});

function useElementSize<T extends HTMLElement>() {
	const [element, setElement] = useState<T | null>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const ref = useCallback((node: T | null) => {
		setElement(node);
	}, []);

	useEffect(() => {
		if (!element) return;

		const measure = () => {
			const rect = element.getBoundingClientRect();
			setSize({
				width: Math.max(0, Math.floor(rect.width)),
				height: Math.max(0, Math.floor(rect.height)),
			});
		};

		measure();
		const resizeObserver = new ResizeObserver(measure);
		resizeObserver.observe(element);
		window.addEventListener("resize", measure);

		return () => {
			resizeObserver.disconnect();
			window.removeEventListener("resize", measure);
		};
	}, [element]);

	return { ref, size };
}

function PartDetailPage() {
	return (
		<ProtectedRoute>
			<PartDetailContent />
		</ProtectedRoute>
	);
}

function PartDetailContent() {
	const { partId } = useParams({ from: "/parts/$partId" });
	const { toast } = useToast();
	const { authContext, getFreshAuthContext } = useAuth();

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

	const [isEditing, setIsEditing] = useState(false);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [showCheckIn, setShowCheckIn] = useState(false);
	const [showCheckOut, setShowCheckOut] = useState(false);
	const [showMove, setShowMove] = useState(false);
	const [showAdjust, setShowAdjust] = useState(false);
	const [selectedInventoryId, setSelectedInventoryId] = useState<string>();
	const [isBlueprintExpanded, setIsBlueprintExpanded] = useState(false);

	const { ref: previewRef, size: previewSize } =
		useElementSize<HTMLDivElement>();
	const { ref: expandedPreviewRef, size: expandedPreviewSize } =
		useElementSize<HTMLDivElement>();

	const partData = useQuery(
		api.parts.queries.getWithInventory,
		authContext
			? {
					authContext,
					partId: partId as Id<"parts">,
				}
			: undefined,
		{ enabled: !!authContext },
	);

	const part = partData?.part;
	const inventory = partData?.inventory ?? [];
	const totalQuantity = partData?.totalQuantity ?? 0;

	useEffect(() => {
		if (inventory.length === 0) {
			setSelectedInventoryId(undefined);
			return;
		}

		if (
			!selectedInventoryId ||
			!inventory.some((item) => item._id === selectedInventoryId)
		) {
			setSelectedInventoryId(inventory[0]._id);
		}
	}, [inventory, selectedInventoryId]);

	const selectedInventoryItem = useMemo(
		() =>
			inventory.find((item) => item._id === selectedInventoryId) ??
			inventory[0],
		[inventory, selectedInventoryId],
	);

	const selectedBlueprintId = selectedInventoryItem?.blueprint?._id;

	useEffect(() => {
		if (!isBlueprintExpanded) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [isBlueprintExpanded]);

	const selectedBlueprintDrawers = useQuery(
		api.drawers.queries.listByBlueprint,
		authContext && selectedBlueprintId
			? {
					authContext,
					blueprintId: selectedBlueprintId as Id<"blueprints">,
					includeCompartments: true,
				}
			: undefined,
		{
			enabled: !!authContext && !!selectedBlueprintId,
		},
	) as DrawerWithCompartments[] | undefined;

	const drawers = selectedBlueprintDrawers ?? [];

	const archivePart = useMutation(api.parts.mutations.archive);
	const unarchivePart = useMutation(api.parts.mutations.unarchive);
	const deletePart = useMutation(api.parts.mutations.remove);

	const handleArchive = useCallback(async () => {
		if (!part) return;
		try {
			const context = await getRequiredAuthContext();
			if (part.archived) {
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
				"Failed to archive/unarchive part",
				error instanceof Error ? error.message : "An error occurred",
			);
		}
	}, [part, getRequiredAuthContext, unarchivePart, partId, toast, archivePart]);

	const handleDelete = useCallback(async () => {
		try {
			const context = await getRequiredAuthContext();
			await deletePart({ authContext: context, partId: partId as Id<"parts"> });
			toast.success("Part deleted successfully");
			window.location.href = "/parts";
		} catch (error) {
			toast.error(
				"Failed to delete part",
				error instanceof Error ? error.message : "An error occurred",
			);
			setShowDeleteDialog(false);
		}
	}, [getRequiredAuthContext, deletePart, partId, toast]);

	const handleEditSuccess = useCallback(() => {
		setIsEditing(false);
	}, []);

	const handlePreviewDrawerClick = useCallback((_drawer: Drawer) => {}, []);
	const handlePreviewCompartmentClick = useCallback(
		(_compartment: Compartment, _drawer: Drawer) => {},
		[],
	);

	if (part === undefined) {
		return (
			<div className="mx-auto max-w-7xl animate-pulse p-6">
				<div className="mb-6 h-10 w-1/2 rounded bg-slate-200" />
				<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
					<div className="h-[520px] rounded-lg bg-slate-200" />
					<div className="h-[520px] rounded-lg bg-slate-200" />
				</div>
			</div>
		);
	}

	if (part === null) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-center">
					<h1 className="text-2xl font-bold text-gray-900">Part not found</h1>
					<p className="mt-2 text-gray-600">
						The part you're looking for doesn't exist or has been deleted.
					</p>
					<Link
						to="/parts"
						className="mt-4 inline-flex items-center gap-2 text-cyan-600 hover:text-cyan-700"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to parts
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-7xl p-6">
			<div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="flex items-start gap-3">
					<Button variant="ghost" size="icon-sm" asChild>
						<Link to="/parts">
							<ArrowLeft className="h-4 w-4" />
						</Link>
					</Button>
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
								{part.name}
							</h1>
							<Badge variant={part.archived ? "secondary" : "default"}>
								{part.archived ? "Archived" : "Active"}
							</Badge>
						</div>
						<p className="text-sm text-muted-foreground">SKU: {part.sku}</p>
					</div>
				</div>

				<EditorOnly>
					<div className="flex flex-wrap items-center gap-2">
						{isEditing ? (
							<Button variant="outline" onClick={() => setIsEditing(false)}>
								Cancel
							</Button>
						) : (
							<>
								<Button size="sm" onClick={() => setShowCheckIn(true)}>
									<Plus className="h-4 w-4" />
									Check In
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() => setShowCheckOut(true)}
								>
									<Minus className="h-4 w-4" />
									Check Out
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() => setShowMove(true)}
								>
									<ArrowRightLeft className="h-4 w-4" />
									Move
								</Button>
								<Button variant="outline" onClick={() => setIsEditing(true)}>
									<Edit className="h-4 w-4" />
									Edit
								</Button>
								<Button variant="outline" onClick={handleArchive}>
									<Archive className="h-4 w-4" />
									{part.archived ? "Unarchive" : "Archive"}
								</Button>
								<Button
									variant="destructive"
									size="icon-sm"
									onClick={() => setShowDeleteDialog(true)}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</>
						)}
					</div>
				</EditorOnly>
			</div>

			{isEditing ? (
				<PartForm
					part={part}
					onSubmit={handleEditSuccess}
					onCancel={() => setIsEditing(false)}
				/>
			) : (
				<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
					<div className="space-y-6">
						<Card>
							<CardHeader className="pb-4">
								<CardTitle className="text-lg">Part Overview</CardTitle>
								<CardDescription>
									Core details and logistics summary.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-5">
								<div className="grid grid-cols-3 gap-3">
									<div className="rounded-md border bg-slate-50 px-3 py-2">
										<p className="text-xs text-muted-foreground">In Stock</p>
										<p className="text-lg font-semibold text-slate-900">
											{totalQuantity}
										</p>
									</div>
									<div className="rounded-md border bg-slate-50 px-3 py-2">
										<p className="text-xs text-muted-foreground">Locations</p>
										<p className="text-lg font-semibold text-slate-900">
											{inventory.length}
										</p>
									</div>
									<div className="rounded-md border bg-slate-50 px-3 py-2">
										<p className="text-xs text-muted-foreground">Category</p>
										<p className="truncate text-sm font-medium text-slate-900">
											{part.category}
										</p>
									</div>
								</div>

								<div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
									<div className="space-y-3">
										<div className="space-y-1">
											<p className="text-xs uppercase tracking-wide text-muted-foreground">
												Part name
											</p>
											<p className="font-medium text-slate-900">{part.name}</p>
										</div>
										<div className="space-y-1">
											<p className="text-xs uppercase tracking-wide text-muted-foreground">
												SKU
											</p>
											<p className="font-medium text-slate-900">{part.sku}</p>
										</div>
										{part.description && (
											<div className="space-y-1">
												<p className="text-xs uppercase tracking-wide text-muted-foreground">
													Description
												</p>
												<p className="text-sm leading-relaxed text-slate-700">
													{part.description}
												</p>
											</div>
										)}
									</div>

									<PartImage
										imageId={part.imageId}
										name={part.name}
										size="lg"
										className="h-28 w-28 sm:h-32 sm:w-32"
									/>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="flex flex-row items-center justify-between gap-3">
								<div>
									<CardTitle className="text-lg">Storage Logistics</CardTitle>
									<CardDescription>
										Select a location to focus it on the blueprint.
									</CardDescription>
								</div>
								<AdminOnly>
									<Button
										size="sm"
										variant="outline"
										onClick={() => setShowAdjust(true)}
									>
										<Settings className="h-4 w-4" />
										Adjust
									</Button>
								</AdminOnly>
							</CardHeader>
							<CardContent>
								{inventory.length === 0 ? (
									<div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
										<Package className="mx-auto mb-2 h-10 w-10 text-slate-300" />
										No inventory locations yet.
									</div>
								) : (
									<div className="space-y-2">
										{inventory.map((item) => {
											const isSelected =
												selectedInventoryItem?._id === item._id;
											return (
												<button
													type="button"
													key={item._id}
													onClick={() => setSelectedInventoryId(item._id)}
													className={`w-full rounded-md border p-3 text-left transition ${
														isSelected
															? "border-cyan-300 bg-cyan-50"
															: "border-border bg-background hover:border-slate-300 hover:bg-slate-50"
													}`}
												>
													<div className="flex items-start justify-between gap-3">
														<div className="flex min-w-0 items-start gap-2">
															<MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
															<div className="min-w-0">
																<p className="truncate font-medium text-slate-900">
																	{item.compartment?.label ||
																		"Unknown Compartment"}
																</p>
																<p className="truncate text-xs text-muted-foreground">
																	{item.blueprint?.name || "Unknown Blueprint"}{" "}
																	• {item.drawer?.label || "Unknown Drawer"}
																</p>
															</div>
														</div>
														<Badge variant="outline">
															{item.quantity} units
														</Badge>
													</div>
												</button>
											);
										})}
									</div>
								)}
							</CardContent>
						</Card>
					</div>

					<div className="space-y-6">
						<Card className="overflow-hidden">
							<CardHeader className="flex flex-row items-center justify-between gap-3 pb-4">
								<div>
									<CardTitle className="text-lg">Location Blueprint</CardTitle>
									<CardDescription>
										{selectedInventoryItem
											? `${selectedInventoryItem.blueprint?.name || "Unknown Blueprint"} • ${selectedInventoryItem.drawer?.label || "Unknown Drawer"} • ${selectedInventoryItem.compartment?.label || "Unknown Compartment"}`
											: "No location selected"}
									</CardDescription>
								</div>
								<div className="flex items-center gap-2">
									{selectedInventoryItem?.blueprint?._id && (
										<Button
											size="sm"
											variant="outline"
											onClick={() => setIsBlueprintExpanded(true)}
										>
											<Grid3X3 className="h-4 w-4" />
											Expand
										</Button>
									)}
								</div>
							</CardHeader>
							<CardContent>
								{selectedInventoryItem && drawers.length > 0 ? (
									<div
										ref={previewRef}
										className="h-[430px] overflow-hidden rounded-md border bg-slate-50"
									>
										<CanvasView
											width={Math.max(previewSize.width, 320)}
											height={430}
											drawers={drawers}
											selectedDrawerId={selectedInventoryItem.drawer?._id}
											selectedCompartmentId={
												selectedInventoryItem.compartment?._id
											}
											readOnly
											onDrawerClick={handlePreviewDrawerClick}
											onCompartmentClick={handlePreviewCompartmentClick}
										/>
									</div>
								) : (
									<div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
										<MapPin className="mx-auto mb-2 h-10 w-10 text-slate-300" />
										Select a storage location to preview it on the blueprint.
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			)}
			{isBlueprintExpanded && selectedInventoryItem && drawers.length > 0 && (
				<div className="fixed inset-0 z-50 bg-black/50 p-4 sm:p-6">
					<div className="flex h-full w-full flex-col overflow-hidden rounded-lg border bg-white shadow-2xl">
						<div className="flex items-center justify-between border-b px-4 py-3">
							<div className="min-w-0">
								<p className="truncate text-sm font-medium text-slate-900">
									{selectedInventoryItem.blueprint?.name || "Unknown Blueprint"}{" "}
									• {selectedInventoryItem.drawer?.label || "Unknown Drawer"} •{" "}
									{selectedInventoryItem.compartment?.label ||
										"Unknown Compartment"}
								</p>
								<p className="text-xs text-muted-foreground">
									Read-only viewer
								</p>
							</div>
							<Button
								size="sm"
								variant="outline"
								onClick={() => setIsBlueprintExpanded(false)}
							>
								<X className="h-4 w-4" />
								Close
							</Button>
						</div>
						<div ref={expandedPreviewRef} className="min-h-0 flex-1 bg-slate-50">
							<CanvasView
								width={Math.max(expandedPreviewSize.width, 320)}
								height={Math.max(expandedPreviewSize.height, 320)}
								drawers={drawers}
								selectedDrawerId={selectedInventoryItem.drawer?._id}
								selectedCompartmentId={selectedInventoryItem.compartment?._id}
								readOnly
								onDrawerClick={handlePreviewDrawerClick}
								onCompartmentClick={handlePreviewCompartmentClick}
							/>
						</div>
					</div>
				</div>
			)}

			<CheckInDialog
				open={showCheckIn}
				onOpenChange={setShowCheckIn}
				preselectedPartId={partId}
				onSuccess={() => {
					// Query will automatically refetch
				}}
			/>

			<CheckOutDialog
				open={showCheckOut}
				onOpenChange={setShowCheckOut}
				preselectedPartId={partId}
				onSuccess={() => {
					// Query will automatically refetch
				}}
			/>

			<MoveDialog
				open={showMove}
				onOpenChange={setShowMove}
				preselectedPartId={partId}
				onSuccess={() => {
					// Query will automatically refetch
				}}
			/>

			<AdjustDialog
				open={showAdjust}
				onOpenChange={setShowAdjust}
				preselectedPartId={partId}
				onSuccess={() => {
					// Query will automatically refetch
				}}
			/>

			<AlertDialog
				open={showDeleteDialog}
				onOpenChange={setShowDeleteDialog}
				title="Delete Part"
				description={`Are you sure you want to delete "${part.name}"? This action cannot be undone and will remove all associated inventory records.`}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={handleDelete}
				variant="destructive"
			/>
		</div>
	);
}
