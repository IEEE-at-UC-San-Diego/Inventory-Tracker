import {
	createFileRoute,
	useNavigate,
	useParams,
	useSearch,
} from "@tanstack/react-router";
import {
	ArrowLeft,
	Crosshair,
	History,
	Lock,
	Save,
	Trash2,
	Unlock,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
	BlueprintCanvas,
	BlueprintControls,
	BlueprintSidebar,
	useBlueprintLock,
	VersionHistoryPanel,
} from "@/components/blueprint";
import { CompartmentDetailsPanel } from "@/components/blueprint/CompartmentDetailsPanel";
import { Button } from "@/components/ui/button";
import { AlertDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useMutation, useQuery } from "@/integrations/convex/react-query";
import type {
	CanvasMode,
	Compartment,
	Drawer,
	DrawerWithCompartments,
	SelectedElement,
	Viewport,
} from "@/types";
import type { BlueprintTool } from "@/components/blueprint/BlueprintControls";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/blueprints/$blueprintId")({
	component: BlueprintEditorPage,
	validateSearch: (search: Record<string, unknown>) => ({
		partId: typeof search.partId === "string" ? search.partId : undefined,
		mode:
			search.mode === "edit" || search.mode === "view"
				? search.mode
				: undefined,
	}),
});

function BlueprintEditorPage() {
	return (
		<ProtectedRoute>
			<BlueprintEditorContent />
		</ProtectedRoute>
	);
}

function BlueprintEditorContent() {
	const { blueprintId } = useParams({ from: "/blueprints/$blueprintId" });
	const navigate = useNavigate();

	// Redirect "new" to the proper new blueprint route
	useEffect(() => {
		if (blueprintId === "new") {
			navigate({ to: "/blueprints/new" });
		}
	}, [blueprintId, navigate]);

	const { authContext, getFreshAuthContext, isLoading } = useAuth();
	const { canEdit } = useRole();
	const { toast } = useToast();

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

	// URL search params for part highlighting and edit mode
	const search = useSearch({ from: "/blueprints/$blueprintId" });
	const highlightPartId = search.partId;
	const initialMode = search.mode;

	const [mode, setMode] = useState<CanvasMode>(
		initialMode === "edit" ? "edit" : "view",
	);
	const [selectedElement, setSelectedElement] = useState<SelectedElement>(null);
	const [highlightedCompartmentIds, setHighlightedCompartmentIds] = useState<
		string[]
	>([]);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [isEditingName, setIsEditingName] = useState(false);
	const [nameValue, setNameValue] = useState("");
	const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
	const [zoomLevel, setZoomLevel] = useState(100);
	const [showCompartmentDetails, setShowCompartmentDetails] = useState(false);
	const [showVersionHistory, setShowVersionHistory] = useState(false);
	const [selectedCompartmentForDetails, setSelectedCompartmentForDetails] =
		useState<{
			compartment: Compartment | null;
			drawer: Drawer | null;
		}>({ compartment: null, drawer: null });

	// Refs for canvas controls
	const zoomInRef = useRef<(() => void) | null>(null);
	const zoomOutRef = useRef<(() => void) | null>(null);
	const zoomToFitRef = useRef<(() => void) | null>(null);
	const resetViewRef = useRef<(() => void) | null>(null);
	const zoomToLocationRef = useRef<
		((x: number, y: number, w?: number, h?: number) => void) | null
	>(null);

	// Fetch blueprint with full hierarchy
	const blueprintData = useQuery(
		api.blueprints.queries.getWithHierarchy,
		authContext
			? {
					authContext,
					blueprintId: blueprintId as Id<"blueprints">,
				}
			: undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);

	// Fetch inventory for this blueprint to get compartment inventory counts
	const inventoryData = useQuery(
		api.inventory.queries.list,
		authContext
			? {
					authContext,
					includeDetails: false,
				}
			: undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);

	// Fetch compartments containing highlighted part
	const partCompartmentsQuery = useQuery(
		api.compartments.queries.findByPart,
		authContext && highlightPartId
			? { authContext, partId: highlightPartId as Id<"parts"> }
			: undefined,
		{
			enabled: !!authContext && !isLoading && !!highlightPartId,
		},
	);

	// Fetch background image URL if blueprint has one
	const backgroundImageUrl = useQuery(
		api.storage.getImageUrl,
		authContext && blueprintData?.backgroundImageId
			? { authContext, storageId: blueprintData.backgroundImageId }
			: undefined,
		{
			enabled: !!blueprintData?.backgroundImageId && !!authContext,
		},
	);

	// Type assertion for blueprint data
	const blueprint = blueprintData ?? null;

	// Lock management - MUST be called before any early returns
	const {
		isLocked,
		isLockedByMe,
		acquireLock,
		releaseLock,
		isLoading: lockLoading,
	} = useBlueprintLock({
		blueprintId: blueprintId as Id<"blueprints">,
		canEdit,
		onLockAcquired: () => {
			setMode("edit");
			setHasChanges(false);
			toast.success("Lock acquired - you can now edit this blueprint");
		},
		onLockReleased: async () => {
			setMode("view");
			// Create a revision if changes were made
			if (hasChanges && blueprint) {
				try {
						const context = await getRequiredAuthContext();
						const revisionState = {
							drawers: blueprint.drawers.map((drawer) => ({
								_id: drawer._id,
							x: drawer.x,
							y: drawer.y,
							width: drawer.width,
							height: drawer.height,
							rotation: drawer.rotation,
							zIndex: drawer.zIndex,
							label: drawer.label,
						})),
						compartments: blueprint.drawers.flatMap((drawer) =>
							drawer.compartments.map((comp) => ({
								_id: comp._id,
								drawerId: comp.drawerId,
								x: comp.x,
								y: comp.y,
								width: comp.width,
								height: comp.height,
								rotation: comp.rotation,
								zIndex: comp.zIndex,
								label: comp.label,
							})),
						),
					};
						await createRevision({
							authContext: context,
							blueprintId: blueprintId as Id<"blueprints">,
							state: revisionState,
							description: "Auto-created on edit completion",
						});
					toast.success("Lock released - revision saved");
				} catch (error) {
					console.error("Failed to create revision:", error);
					toast.success("Lock released");
				}
			} else {
				toast.success("Lock released");
			}
			setHasChanges(false);
		},
		onLockLost: () => {
			setMode("view");
			setSelectedElement(null);
			setHasChanges(false);
			toast.error("Lock lost - another user may have taken it");
		},
	});

	// Mutations
	const updateBlueprint = useMutation(api.blueprints.mutations.update);
	const deleteBlueprint = useMutation(api.blueprints.mutations.deleteBlueprint);
	const createDrawer = useMutation(api.drawers.mutations.create);
	const updateDrawer = useMutation(api.drawers.mutations.update);
	const deleteDrawer = useMutation(api.drawers.mutations.deleteDrawer);
	const createCompartment = useMutation(api.compartments.mutations.create);
	const updateCompartment = useMutation(api.compartments.mutations.update);
	const deleteCompartment = useMutation(
		api.compartments.mutations.deleteCompartment,
	);
	const createRevision = useMutation(
		api.blueprint_revisions.mutations.createRevision,
	);
	// Track if changes were made during edit session
	const [hasChanges, setHasChanges] = useState(false);

	// Canvas tool selection
	const [tool, setTool] = useState<BlueprintTool>("pan");
	useEffect(() => {
		// In view mode, default to pan so click-drag moves around quickly.
		setTool(isLockedByMe ? "select" : "pan");
	}, [isLockedByMe]);

	// Set initial name value when blueprint loads
	useEffect(() => {
		if (blueprintData) {
			setNameValue(blueprintData.name);
		}
	}, [blueprintData]);

	// Handle canvas resize
	useEffect(() => {
		const updateSize = () => {
			const container = document.getElementById("canvas-container");
			if (container) {
				const rect = container.getBoundingClientRect();
				setCanvasSize({
					width: rect.width,
					height: rect.height,
				});
			}
		};

		updateSize();
		window.addEventListener("resize", updateSize);
		return () => window.removeEventListener("resize", updateSize);
	}, []);

	// Build compartments with inventory count map
	const compartmentsWithInventory = useMemo(() => {
		const map = new Map<string, number>();
		inventoryData?.forEach((item) => {
			const existing = map.get(item.compartmentId) ?? 0;
			map.set(item.compartmentId, existing + item.quantity);
		});
		return map;
	}, [inventoryData]);

	const drawers = useMemo<DrawerWithCompartments[]>(() => {
		return blueprint?.drawers || [];
	}, [blueprint]);

	// Handle part highlighting from URL
	useEffect(() => {
		if (highlightPartId && partCompartmentsQuery) {
			const compartments = partCompartmentsQuery;
			if (compartments.length > 0) {
				setHighlightedCompartmentIds(compartments.map((c) => c._id));

				// Zoom to first compartment location after a short delay to ensure canvas is ready
				const firstCompartment = compartments[0];
				const drawer = blueprint?.drawers.find(
					(d) => d._id === firstCompartment.drawerId,
				);
				if (drawer && zoomToLocationRef.current) {
					const compartmentX = drawer.x + firstCompartment.x;
					const compartmentY = drawer.y + firstCompartment.y;
					setTimeout(() => {
						zoomToLocationRef.current?.(
							compartmentX,
							compartmentY,
							firstCompartment.width,
							firstCompartment.height,
						);
					}, 100);
				}
			}
		}
	}, [highlightPartId, partCompartmentsQuery, blueprint]);

	// Handlers
	const handleSaveName = async () => {
		try {
			const context = await getRequiredAuthContext();
			await updateBlueprint({
				authContext: context,
				blueprintId: blueprintId as Id<"blueprints">,
				name: nameValue,
			});
			toast.success("Blueprint name updated");
			setIsEditingName(false);
		} catch (error) {
			toast.error(
				"Failed to update name",
				error instanceof Error ? error.message : "An error occurred",
			);
		}
	};

	const handleDelete = async () => {
		try {
			const context = await getRequiredAuthContext();
			await deleteBlueprint({
				authContext: context,
				blueprintId: blueprintId as Id<"blueprints">,
			});
			toast.success("Blueprint deleted successfully");
			navigate({ to: "/blueprints" });
		} catch (error) {
			toast.error(
				"Failed to delete blueprint",
				error instanceof Error ? error.message : "An error occurred",
			);
		}
	};

	const handleCreateDrawer = async (drawerData: Partial<Drawer>) => {
		try {
			const context = await getRequiredAuthContext();
			await createDrawer({
				authContext: context,
				blueprintId: blueprintId as Id<"blueprints">,
				x: drawerData.x ?? 100,
				y: drawerData.y ?? 100,
				width: drawerData.width ?? 150,
				height: drawerData.height ?? 100,
				rotation: drawerData.rotation ?? 0,
				label: drawerData.label,
			});
			toast.success("Drawer created");
		} catch (error) {
			toast.error(
				"Failed to create drawer",
				error instanceof Error ? error.message : "An error occurred",
			);
		}
	};

	const handleUpdateDrawer = async (
		drawerId: string,
		updates: Partial<Drawer>,
	) => {
		try {
			const context = await getRequiredAuthContext();
			await updateDrawer({
				authContext: context,
				drawerId: drawerId as Id<"drawers">,
				...updates,
			});
			setHasChanges(true);
		} catch (error) {
			toast.error(
				"Failed to update drawer",
				error instanceof Error ? error.message : "An error occurred",
			);
		}
	};

	const handleDeleteDrawer = async (drawerId: string) => {
		try {
			const context = await getRequiredAuthContext();
			await deleteDrawer({
				authContext: context,
				drawerId: drawerId as Id<"drawers">,
			});
			setSelectedElement(null);
			toast.success("Drawer deleted");
		} catch (error) {
			toast.error(
				"Failed to delete drawer",
				error instanceof Error ? error.message : "An error occurred",
			);
		}
	};

	const handleCreateCompartment = async (
		compartmentData: Partial<Compartment>,
		drawerId: string,
	) => {
		try {
			const context = await getRequiredAuthContext();
			await createCompartment({
				authContext: context,
				drawerId: drawerId as Id<"drawers">,
				x: compartmentData.x ?? 0,
				y: compartmentData.y ?? 0,
				width: compartmentData.width ?? 40,
				height: compartmentData.height ?? 30,
				rotation: compartmentData.rotation ?? 0,
				label: compartmentData.label,
			});
			toast.success("Compartment created");
		} catch (error) {
			toast.error(
				"Failed to create compartment",
				error instanceof Error ? error.message : "An error occurred",
			);
		}
	};

	const handleUpdateCompartment = async (
		compartmentId: string,
		updates: Partial<Compartment>,
	) => {
		try {
			const context = await getRequiredAuthContext();
			await updateCompartment({
				authContext: context,
				compartmentId: compartmentId as Id<"compartments">,
				...updates,
			});
			setHasChanges(true);
		} catch (error) {
			toast.error(
				"Failed to update compartment",
				error instanceof Error ? error.message : "An error occurred",
			);
		}
	};

	const handleDeleteCompartment = async (compartmentId: string) => {
		try {
			const context = await getRequiredAuthContext();
			await deleteCompartment({
				authContext: context,
				compartmentId: compartmentId as Id<"compartments">,
			});
			setSelectedElement(null);
			toast.success("Compartment deleted");
		} catch (error) {
			toast.error(
				"Failed to delete compartment",
				error instanceof Error ? error.message : "An error occurred",
			);
		}
	};

	const handleViewportChange = useCallback((viewport: Viewport) => {
		setZoomLevel(Math.round(viewport.zoom * 100));
	}, []);

	const GRID_SIZE = 50;

	const handleSplitDrawer = useCallback(
		async (split: {
			drawerId: string;
			orientation: "vertical" | "horizontal";
			position: number;
		}) => {
			try {
				const drawer = drawers.find((d) => d._id === split.drawerId);
				if (!drawer) return;

				if (!isLockedByMe) {
					toast.error("You must be editing to split drawers");
					return;
				}

				if (drawer.rotation !== 0) {
					toast.error("Splitting rotated drawers isn't supported yet");
					return;
				}

				// Pick a target compartment to split (or the whole drawer if empty).
				const candidates = [...drawer.compartments].sort(
					(a, b) => b.zIndex - a.zIndex,
				);

				const position = split.position;
				const minEdge = GRID_SIZE;

				const targetCompartment =
					candidates.find((c) => {
						if (split.orientation === "vertical") {
							const left = c.x - c.width / 2;
							const right = c.x + c.width / 2;
							return position > left + minEdge && position < right - minEdge;
						}
						const top = c.y - c.height / 2;
						const bottom = c.y + c.height / 2;
						return position > top + minEdge && position < bottom - minEdge;
					}) ?? null;

				const target = targetCompartment
					? {
							_id: targetCompartment._id,
							x: targetCompartment.x,
							y: targetCompartment.y,
							width: targetCompartment.width,
							height: targetCompartment.height,
						}
					: {
							_id: null as string | null,
							x: 0,
							y: 0,
							width: drawer.width,
							height: drawer.height,
						};

				if (target._id) {
					const qty = compartmentsWithInventory.get(target._id) ?? 0;
					if (qty > 0) {
						toast.error(
							"Can't split a compartment that contains inventory. Move inventory out first.",
						);
						return;
					}
				}

				// Compute the two new compartments.
				if (split.orientation === "vertical") {
					const leftEdge = target.x - target.width / 2;
					const rightEdge = target.x + target.width / 2;
					const leftW = position - leftEdge;
					const rightW = rightEdge - position;
					if (leftW < GRID_SIZE || rightW < GRID_SIZE) {
						toast.error("Split too close to the edge");
						return;
					}

					const leftCenterX = leftEdge + leftW / 2;
					const rightCenterX = position + rightW / 2;

					const context = await getRequiredAuthContext();
					await createCompartment({
						authContext: context,
						drawerId: drawer._id as Id<"drawers">,
						x: leftCenterX,
						y: target.y,
						width: leftW,
						height: target.height,
						rotation: 0,
					});
					await createCompartment({
						authContext: context,
						drawerId: drawer._id as Id<"drawers">,
						x: rightCenterX,
						y: target.y,
						width: rightW,
						height: target.height,
						rotation: 0,
					});

					if (target._id) {
						await deleteCompartment({
							authContext: context,
							compartmentId: target._id as Id<"compartments">,
						});
					}
				} else {
					const topEdge = target.y - target.height / 2;
					const bottomEdge = target.y + target.height / 2;
					const topH = position - topEdge;
					const bottomH = bottomEdge - position;
					if (topH < GRID_SIZE || bottomH < GRID_SIZE) {
						toast.error("Split too close to the edge");
						return;
					}

					const topCenterY = topEdge + topH / 2;
					const bottomCenterY = position + bottomH / 2;

					const context = await getRequiredAuthContext();
					await createCompartment({
						authContext: context,
						drawerId: drawer._id as Id<"drawers">,
						x: target.x,
						y: topCenterY,
						width: target.width,
						height: topH,
						rotation: 0,
					});
					await createCompartment({
						authContext: context,
						drawerId: drawer._id as Id<"drawers">,
						x: target.x,
						y: bottomCenterY,
						width: target.width,
						height: bottomH,
						rotation: 0,
					});

					if (target._id) {
						await deleteCompartment({
							authContext: context,
							compartmentId: target._id as Id<"compartments">,
						});
					}
				}

				toast.success("Drawer split");
				setHasChanges(true);
			} catch (error) {
				toast.error(
					"Failed to split drawer",
					error instanceof Error ? error.message : "An error occurred",
				);
			}
		},
		[
			compartmentsWithInventory,
			createCompartment,
			deleteCompartment,
			drawers,
			getRequiredAuthContext,
			isLockedByMe,
			toast,
		],
	);

	// Zoom control handlers
	const handleZoomIn = useCallback(() => {
		zoomInRef.current?.();
	}, []);

	const handleZoomOut = useCallback(() => {
		zoomOutRef.current?.();
	}, []);

	const handleZoomToFit = useCallback(() => {
		zoomToFitRef.current?.();
	}, []);

	const handleResetView = useCallback(() => {
		resetViewRef.current?.();
	}, []);

		const handleClearHighlight = useCallback(() => {
			setHighlightedCompartmentIds([]);
			navigate({
				to: "/blueprints/$blueprintId",
				params: { blueprintId },
				search: { partId: undefined, mode: undefined },
			});
		}, [blueprintId, navigate]);

	// Handle compartment click for details panel
	const handleCompartmentClick = useCallback(
		(compartment: Compartment, drawer: Drawer) => {
			setSelectedCompartmentForDetails({ compartment, drawer });
			setShowCompartmentDetails(true);
		},
		[],
	);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = async (e: KeyboardEvent) => {
			// Delete selected element
			if (
				(e.key === "Delete" || e.key === "Backspace") &&
				selectedElement &&
				isLockedByMe
			) {
				e.preventDefault();
				if (selectedElement.type === "drawer") {
					await handleDeleteDrawer(selectedElement.id);
				} else if (selectedElement.type === "compartment") {
					await handleDeleteCompartment(selectedElement.id);
				}
			}

			// Ctrl/Cmd + S to save
			if ((e.ctrlKey || e.metaKey) && e.key === "s" && isLockedByMe) {
				e.preventDefault();
				toast.info("All changes are saved automatically");
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		selectedElement,
		isLockedByMe,
		handleDeleteCompartment,
		handleDeleteDrawer,
		toast,
	]);

	// Early returns for loading and error states - AFTER ALL hooks
	if (blueprint === undefined) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600" />
			</div>
		);
	}

	if (blueprint === null) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-center">
					<h1 className="text-2xl font-bold text-gray-900">
						Blueprint not found
					</h1>
					<p className="text-gray-600 mt-2">
						The blueprint you're looking for doesn't exist or has been deleted.
					</p>
					<button
						onClick={() => navigate({ to: "/blueprints" })}
						className="mt-4 inline-flex items-center gap-2 text-cyan-600 hover:text-cyan-700"
					>
						<ArrowLeft className="w-4 h-4" />
						Back to blueprints
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="h-screen flex flex-col overflow-hidden">
			{/* Header */}
			<header className="flex items-center justify-between px-6 py-4 border-b bg-white shrink-0">
				<div className="flex items-center gap-4">
					<button
						onClick={() => navigate({ to: "/blueprints" })}
						className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
					>
						<ArrowLeft className="w-5 h-5" />
					</button>
					<div>
						<div className="flex items-center gap-3">
							{isEditingName ? (
								<div className="flex items-center gap-2">
									<Input
										value={nameValue}
										onChange={(e) => setNameValue(e.target.value)}
										className="text-xl font-bold h-9 w-64"
										autoFocus
									/>
									<Button size="sm" onClick={handleSaveName}>
										<Save className="w-4 h-4" />
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => {
											setIsEditingName(false);
											setNameValue(blueprint.name);
										}}
									>
										<X className="w-4 h-4" />
									</Button>
								</div>
							) : (
								<>
									<h1
										className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-cyan-600"
										onClick={() => canEdit() && setIsEditingName(true)}
									>
										{blueprint.name}
									</h1>
									{canEdit() && (
										<button
											onClick={() => setIsEditingName(true)}
											className="p-1 hover:bg-gray-100 rounded text-gray-400"
										>
											<Lock className="w-4 h-4" />
										</button>
									)}
								</>
							)}
						</div>
						<p className="text-sm text-gray-500 mt-0.5">
							Last updated {new Date(blueprint.updatedAt).toLocaleString()}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowVersionHistory(true)}
					>
						<History className="w-4 h-4 mr-2" />
						History
					</Button>
					{canEdit() && !isLockedByMe && !isLocked && (
						<Button onClick={acquireLock} disabled={lockLoading}>
							<Lock className="w-4 h-4 mr-2" />
							Edit Blueprint
						</Button>
					)}
					{isLockedByMe && (
						<Button
							variant="outline"
							onClick={releaseLock}
							disabled={lockLoading}
						>
							<Unlock className="w-4 h-4 mr-2" />
							Done Editing
						</Button>
					)}
					{canEdit() && (
						<Button
							variant="ghost"
							size="icon"
							onClick={() => setShowDeleteDialog(true)}
							className="text-red-600 hover:text-red-700 hover:bg-red-50"
						>
							<Trash2 className="w-4 h-4" />
						</Button>
					)}
				</div>
			</header>

			{/* Main content */}
			<div className="flex-1 flex overflow-hidden">
				{/* Canvas area */}
				<div id="canvas-container" className="flex-1 relative">
					<BlueprintCanvas
						width={canvasSize.width}
						height={canvasSize.height}
						backgroundImageUrl={backgroundImageUrl}
						drawers={drawers}
						selectedElement={selectedElement}
						mode={mode}
						tool={tool}
						isLocked={isLocked}
						isLockedByMe={isLockedByMe}
						onSelectElement={setSelectedElement}
						onCompartmentDoubleClick={handleCompartmentClick}
						onCreateDrawerFromTool={(drawer) => handleCreateDrawer(drawer)}
						onSplitDrawerFromTool={handleSplitDrawer}
						onUpdateDrawer={handleUpdateDrawer}
						onUpdateCompartment={handleUpdateCompartment}
						onViewportChange={handleViewportChange}
						zoomInRef={zoomInRef}
						zoomOutRef={zoomOutRef}
						zoomToFitRef={zoomToFitRef}
						resetViewRef={resetViewRef}
						zoomToLocationRef={zoomToLocationRef}
						compartmentsWithInventory={compartmentsWithInventory}
						highlightedCompartmentIds={highlightedCompartmentIds}
					/>

					<BlueprintControls
						tool={tool}
						onToolChange={setTool}
						onZoomIn={handleZoomIn}
						onZoomOut={handleZoomOut}
						onZoomToFit={handleZoomToFit}
						onResetView={handleResetView}
						zoomLevel={zoomLevel}
						canEditTools={isLockedByMe}
					/>

					{/* Highlight indicator */}
					{highlightedCompartmentIds.length > 0 && (
						<div className="absolute top-4 right-4 z-10">
							<div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 shadow-sm">
								<div className="flex items-center gap-2">
									<Crosshair className="w-4 h-4 text-green-600" />
									<div className="text-sm">
										<span className="font-medium text-green-800">
											{highlightedCompartmentIds.length}
										</span>
										<span className="text-green-700">
											{" "}
											compartment
											{highlightedCompartmentIds.length > 1 ? "s" : ""}{" "}
											highlighted
										</span>
									</div>
									<button
										onClick={handleClearHighlight}
										className="ml-2 p-1 hover:bg-green-100 rounded text-green-600"
										title="Clear highlight"
									>
										<X className="w-4 h-4" />
									</button>
								</div>
							</div>
						</div>
					)}
				</div>

				{/* Sidebar */}
				<div className="w-80 border-l bg-white overflow-y-auto p-4">
					<BlueprintSidebar
						blueprint={blueprint}
						drawers={drawers}
						selectedElement={selectedElement}
						mode={mode}
						isLockedByMe={isLockedByMe}
						onSelectElement={setSelectedElement}
						onCreateDrawer={handleCreateDrawer}
						onCreateCompartment={handleCreateCompartment}
						onUpdateDrawer={handleUpdateDrawer}
						onUpdateCompartment={handleUpdateCompartment}
						onDeleteDrawer={handleDeleteDrawer}
						onDeleteCompartment={handleDeleteCompartment}
					/>
				</div>
			</div>

			{/* Delete confirmation */}
			<AlertDialog
				open={showDeleteDialog}
				onOpenChange={setShowDeleteDialog}
				title="Delete Blueprint"
				description={`Are you sure you want to delete "${blueprint.name}"? This will remove all associated drawers and compartments.`}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={handleDelete}
				variant="destructive"
			/>

			{/* Compartment Details Panel */}
			<CompartmentDetailsPanel
				open={showCompartmentDetails}
				onOpenChange={setShowCompartmentDetails}
				compartment={selectedCompartmentForDetails.compartment}
				drawer={selectedCompartmentForDetails.drawer}
			/>

			{/* Version History Panel */}
			{showVersionHistory && (
				<Sheet open={showVersionHistory} onOpenChange={setShowVersionHistory}>
					<SheetContent side="right" className="w-96 overflow-y-auto">
						<VersionHistoryPanel
							blueprintId={blueprintId as Id<"blueprints">}
							onClose={() => setShowVersionHistory(false)}
						/>
					</SheetContent>
				</Sheet>
			)}
		</div>
	);
}
