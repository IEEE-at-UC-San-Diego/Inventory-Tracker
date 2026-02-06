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
	PanelRightOpen,
	Redo2,
	Save,
	Trash2,
	Undo2,
	Unlock,
	X,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
	ActionHistoryPanel,
	BlueprintCanvas,
	BlueprintControls,
	useBlueprintLock,
	VersionHistoryPanel,
} from "@/components/blueprint";
import type { BlueprintTool } from "@/components/blueprint/BlueprintControls";
import { Button } from "@/components/ui/button";
import { AlertDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	type HistoryState,
	createHistoryState,
	pushEntry,
	canUndo,
	canRedo,
	moveBackward,
	moveForward,
} from "@/lib/history";
import { useBlueprintHistory } from "@/hooks/useBlueprintHistory";

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

// Re-export HistoryState for ActionHistoryPanel
export type { HistoryState } from "@/lib/history";

function FullScreenPortal({ children }: { children: React.ReactNode }) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) return null;
	return createPortal(children, document.body);
}

function BlueprintEditorPage() {
	return (
		<ProtectedRoute>
			<FullScreenPortal>
				<BlueprintEditorContent />
			</FullScreenPortal>
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
	const [selectedDrawerIds, setSelectedDrawerIds] = useState<string[]>([]);
	const [highlightedCompartmentIds, setHighlightedCompartmentIds] = useState<
		string[]
	>([]);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [isEditingName, setIsEditingName] = useState(false);
	const [nameValue, setNameValue] = useState("");
	const [canvasSize, setCanvasSize] = useState(() => ({
		width: typeof window !== "undefined" ? window.innerWidth : 800,
		height: typeof window !== "undefined" ? window.innerHeight : 600,
	}));
	const [zoomLevel, setZoomLevel] = useState(100);
	const [showVersionHistory, setShowVersionHistory] = useState(false);
	const [showActionHistory, setShowActionHistory] = useState(false);
	const [isInspectorOpen, setIsInspectorOpen] = useState(false);
	const [showDeleteDrawerDialog, setShowDeleteDrawerDialog] = useState(false);
	const [showDeleteCompartmentDialog, setShowDeleteCompartmentDialog] =
		useState(false);
	const [pendingDeleteDrawerIds, setPendingDeleteDrawerIds] = useState<
		string[]
	>([]);
	const [pendingDeleteCompartmentId, setPendingDeleteCompartmentId] = useState<
		string | null
	>(null);
	const [viewport, setViewport] = useState<Viewport>({
		zoom: 1,
		x: 0,
		y: 0,
	});

	// =============================================================================
	// Mutations (must be defined before historyMutations)
	// =============================================================================
	const updateBlueprint = useMutation(api.blueprints.mutations.update);
	const deleteBlueprint = useMutation(api.blueprints.mutations.deleteBlueprint);
	const createDrawer = useMutation(api.drawers.mutations.create);
	const updateDrawer = useMutation(api.drawers.mutations.update);
	const deleteDrawer = useMutation(api.drawers.mutations.deleteDrawer);
	const createCompartment = useMutation(api.compartments.mutations.create);
	const updateCompartment = useMutation(api.compartments.mutations.update);
	const swapCompartments = useMutation(api.compartments.mutations.swap);
	const setGridForDrawer = useMutation(
		api.compartments.mutations.setGridForDrawer,
	);
	const deleteCompartment = useMutation(
		api.compartments.mutations.deleteCompartment,
	);
	const createRevision = useMutation(
		api.blueprint_revisions.mutations.createRevision,
	);

	// =============================================================================
	// Data Queries (must be defined before history hook)
	// =============================================================================
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

	// Type assertion for blueprint data
	const blueprint = blueprintData ?? null;

	// Track if changes were made during edit session
	const [hasChanges, setHasChanges] = useState(false);

	const drawers = useMemo<DrawerWithCompartments[]>(() => {
		return blueprint?.drawers || [];
	}, [blueprint]);

	// Restore selection from history snapshot (converts logical to physical)
	const restoreSelection = useCallback(
		(snapshot: {
			selectedDrawerIds: string[];
			selectedCompartmentId: string | null;
		}) => {
			// The snapshot contains logical IDs that need to be converted
			// This is a simplified version that just applies the IDs directly
			// The hook handles the logical→physical ID mapping internally
			setSelectedDrawerIds(snapshot.selectedDrawerIds);
		},
		[],
	);

	// Restore viewport from history snapshot
	const restoreViewport = useCallback(
		(newViewport: { zoom: number; x: number; y: number }) => {
			setViewport({
				zoom: newViewport.zoom,
				x: newViewport.x,
				y: newViewport.y,
			});
		},
		[],
	);

	// =============================================================================
	// New History System
	// =============================================================================

	// Build mutation objects for history hook
	const historyMutations = useMemo(
		() => ({
			createDrawer: async (args: {
				authContext: {
					orgId: string;
					userId: string;
					token: string;
				};
				blueprintId: Id<"blueprints">;
				x: number;
				y: number;
				width: number;
				height: number;
				rotation?: number;
				zIndex?: number;
				gridRows?: number;
				gridCols?: number;
				label?: string;
			}) => {
				return await createDrawer(args);
			},
			updateDrawer: async (args: {
				authContext: {
					orgId: string;
					userId: string;
					token: string;
				};
				drawerId: Id<"drawers">;
				x?: number;
				y?: number;
				width?: number;
				height?: number;
				rotation?: number;
				zIndex?: number;
				gridRows?: number;
				gridCols?: number;
				label?: string;
			}) => {
				await updateDrawer(args);
			},
			deleteDrawer: async (args: {
				authContext: {
					orgId: string;
					userId: string;
					token: string;
				};
				drawerId: Id<"drawers">;
			}) => {
				await deleteDrawer(args);
			},
			createCompartment: async (args: {
				authContext: {
					orgId: string;
					userId: string;
					token: string;
				};
				drawerId: Id<"drawers">;
				x: number;
				y: number;
				width: number;
				height: number;
				rotation?: number;
				zIndex?: number;
				label?: string;
			}) => {
				return await createCompartment(args);
			},
			updateCompartment: async (args: {
				authContext: {
					orgId: string;
					userId: string;
					token: string;
				};
				compartmentId: Id<"compartments">;
				drawerId?: Id<"drawers">;
				x?: number;
				y?: number;
				width?: number;
				height?: number;
				rotation?: number;
				zIndex?: number;
				label?: string;
			}) => {
				await updateCompartment(args);
			},
			deleteCompartment: async (args: {
				authContext: {
					orgId: string;
					userId: string;
					token: string;
				};
				compartmentId: Id<"compartments">;
			}) => {
				await deleteCompartment(args);
			},
			updateBlueprint: async (args: {
				authContext: {
					orgId: string;
					userId: string;
					token: string;
				};
				blueprintId: Id<"blueprints">;
				name?: string;
			}) => {
				await updateBlueprint(args);
			},
		}),
		[
			createDrawer,
			updateDrawer,
			deleteDrawer,
			createCompartment,
			updateCompartment,
			deleteCompartment,
			updateBlueprint,
		],
	);

	// Lock management - MUST be called before useBlueprintHistory
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

	// New history hook
	const {
		historyState,
		canUndo: canUndoNow,
		canRedo: canRedoNow,
		isApplying: isApplyingHistory,
		pushHistoryEntry,
		undo: handleUndo,
		redo: handleRedo,
	} = useBlueprintHistory({
		getAuthContext: getRequiredAuthContext,
		mutations: historyMutations,
		blueprintId: blueprintId as Id<"blueprints">,
		blueprintName: blueprint?.name ?? "",
		drawers,
		viewport,
		selection: {
			selectedElement,
			selectedDrawerIds,
		},
		isLockedByMe,
		restoreSelection,
		restoreViewport,
		onError: (title, message) => toast.error(title, message),
	});

	// Refs for canvas controls
	const zoomInRef = useRef<(() => void) | null>(null);
	const zoomOutRef = useRef<(() => void) | null>(null);
	const zoomToFitRef = useRef<(() => void) | null>(null);
	const resetViewRef = useRef<(() => void) | null>(null);
	const zoomToLocationRef = useRef<
		((x: number, y: number, w?: number, h?: number) => void) | null
	>(null);

	const selectedDrawer = useMemo(() => {
		if (selectedElement?.type === "drawer") {
			return drawers.find((d) => d._id === selectedElement.id) ?? null;
		}
		if (selectedElement?.type === "compartment") {
			return drawers.find((d) => d._id === selectedElement.drawerId) ?? null;
		}
		return null;
	}, [drawers, selectedElement]);

	const selectedCompartment = useMemo(() => {
		return selectedElement?.type === "compartment"
			? selectedElement.data
			: null;
	}, [selectedElement]);

	const applySelection = useCallback(
		(next: {
			selectedElement: SelectedElement;
			selectedDrawerIds: string[];
		}) => {
			setSelectedElement(next.selectedElement);
			setSelectedDrawerIds(next.selectedDrawerIds);
		},
		[],
	);

	const setSelectionSilent = useCallback(
		(next: {
			selectedElement: SelectedElement;
			selectedDrawerIds: string[];
		}) => {
			setSelectedElement(next.selectedElement);
			setSelectedDrawerIds(next.selectedDrawerIds);
		},
		[],
	);

	useEffect(() => {
		if (!selectedElement && selectedDrawerIds.length === 0) return;

		const drawerById = new Map(drawers.map((d) => [d._id, d]));
		const nextSelectedDrawerIds = selectedDrawerIds.filter((id) =>
			drawerById.has(id),
		);

		let nextSelectedElement: SelectedElement = selectedElement;

		if (selectedElement?.type === "drawer") {
			const drawer = drawerById.get(selectedElement.id) ?? null;
			nextSelectedElement = drawer
				? { type: "drawer", id: drawer._id, data: drawer }
				: null;

			// Keep multi-select in sync when a single drawer is selected.
			if (drawer && nextSelectedDrawerIds.length === 0) {
				nextSelectedDrawerIds.push(drawer._id);
			}
		} else if (selectedElement?.type === "compartment") {
			const drawer = drawerById.get(selectedElement.drawerId) ?? null;
			const compartment =
				drawer?.compartments.find((c) => c._id === selectedElement.id) ?? null;
			nextSelectedElement =
				drawer && compartment
					? {
							type: "compartment",
							id: compartment._id,
							data: compartment,
							drawerId: drawer._id,
						}
					: null;
		}

		const selectionChanged =
			nextSelectedElement?.type !== selectedElement?.type ||
			(nextSelectedElement?.type === "drawer" &&
				selectedElement?.type === "drawer" &&
				nextSelectedElement.id !== selectedElement.id) ||
			(nextSelectedElement?.type === "compartment" &&
				selectedElement?.type === "compartment" &&
				(nextSelectedElement.id !== selectedElement.id ||
					nextSelectedElement.drawerId !== selectedElement.drawerId)) ||
			(nextSelectedElement === null && selectedElement !== null) ||
			nextSelectedDrawerIds.length !== selectedDrawerIds.length ||
			nextSelectedDrawerIds.some((id, i) => id !== selectedDrawerIds[i]);

		if (!selectionChanged) return;
		setSelectionSilent({
			selectedElement: nextSelectedElement,
			selectedDrawerIds: nextSelectedDrawerIds,
		});
	}, [drawers, selectedDrawerIds, selectedElement, setSelectionSilent]);

	// Local drafts for labels so we don't patch on every keystroke.
	const [drawerLabelDraft, setDrawerLabelDraft] = useState("");
	const [compartmentLabelDraft, setCompartmentLabelDraft] = useState("");

	useEffect(() => {
		setDrawerLabelDraft(selectedDrawer?.label ?? "");
	}, [selectedDrawer?.label]);

	useEffect(() => {
		setCompartmentLabelDraft(selectedCompartment?.label ?? "");
	}, [selectedCompartment?.label]);

	// Canvas tool selection
	const [tool, setTool] = useState<BlueprintTool>("select");
	useEffect(() => {
		// Prevent edit-only tools when not holding the lock.
		if (!isLockedByMe && (tool === "drawer" || tool === "split")) {
			setTool("select");
		}
	}, [isLockedByMe, tool]);

	// Drawer grid UI state (rows/cols)
	const [gridRows, setGridRows] = useState(1);
	const [gridCols, setGridCols] = useState(1);
	const [showGridWarning, setShowGridWarning] = useState(false);
	const pendingGridRef = useRef<{ rows: number; cols: number } | null>(null);

	useEffect(() => {
		if (!selectedDrawer) return;
		if (selectedDrawer.gridRows && selectedDrawer.gridCols) {
			setGridRows(Math.max(1, Math.floor(selectedDrawer.gridRows)));
			setGridCols(Math.max(1, Math.floor(selectedDrawer.gridCols)));
			return;
		}
		const n = selectedDrawer.compartments.length;
		if (n <= 0) {
			setGridRows(1);
			setGridCols(1);
			return;
		}
		// Reasonable default: close to square.
		const approx = Math.max(1, Math.round(Math.sqrt(n)));
		setGridRows(Math.max(1, Math.floor(n / approx)));
		setGridCols(
			Math.max(1, Math.ceil(n / Math.max(1, Math.floor(n / approx)))),
		);
	}, [selectedDrawer]);

	const applyGrid = useCallback(
		async (rows: number, cols: number) => {
			if (!selectedDrawer) return;
			const context = await getRequiredAuthContext();
			await setGridForDrawer({
				authContext: context,
				drawerId: selectedDrawer._id as Id<"drawers">,
				rows,
				cols,
			});
			setHasChanges(true);
			toast.success("Grid updated");
		},
		[getRequiredAuthContext, selectedDrawer, setGridForDrawer, toast],
	);

	const requestApplyGrid = useCallback(
		(rows: number, cols: number) => {
			if (!selectedDrawer) return;
			const safeRows = Math.max(1, Math.floor(rows));
			const safeCols = Math.max(1, Math.floor(cols));
			const newCells = safeRows * safeCols;
			const existing = selectedDrawer.compartments.length;

			if (newCells < existing) {
				pendingGridRef.current = { rows: safeRows, cols: safeCols };
				setShowGridWarning(true);
				return;
			}

			void applyGrid(safeRows, safeCols);
		},
		[applyGrid, selectedDrawer],
	);

	// Set initial name value when blueprint loads
	useEffect(() => {
		if (blueprintData) {
			setNameValue(blueprintData.name);
		}
	}, [blueprintData]);

	// Fullscreen sizing: use Visual Viewport if available (handles DevTools + mobile address bar)
	// so we never get "big chunks" of unused canvas space.
	useLayoutEffect(() => {
		const vv = window.visualViewport ?? null;
		const updateSize = () => {
			const width = Math.floor(vv?.width ?? window.innerWidth);
			const height = Math.floor(vv?.height ?? window.innerHeight);
			if (width <= 0 || height <= 0) return;
			setCanvasSize({ width, height });
		};

		updateSize();
		window.addEventListener("resize", updateSize);
		vv?.addEventListener("resize", updateSize);
		// Some browsers fire viewport changes as "scroll" on visualViewport.
		vv?.addEventListener("scroll", updateSize);
		return () => {
			window.removeEventListener("resize", updateSize);
			vv?.removeEventListener("resize", updateSize);
			vv?.removeEventListener("scroll", updateSize);
		};
	}, []);

	// Prevent background page scrolling while in fullscreen blueprint editor.
	useEffect(() => {
		const prevBodyOverflow = document.body.style.overflow;
		const prevHtmlOverflow = document.documentElement.style.overflow;
		document.body.style.overflow = "hidden";
		document.documentElement.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = prevBodyOverflow;
			document.documentElement.style.overflow = prevHtmlOverflow;
		};
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
			if (!blueprint) return;
			const prevName = blueprint.name;
			const nextName = nameValue;
			const context = await getRequiredAuthContext();
			await updateBlueprint({
				authContext: context,
				blueprintId: blueprintId as Id<"blueprints">,
				name: nextName,
			});
			pushHistoryEntry({
				label: "Rename blueprint",
				requiresLock: true,
				steps: [
					{
						type: "updateBlueprintName",
						blueprintId: blueprintId as string,
						prevName,
						nextName,
					},
				],
				timestamp: Date.now(),
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
			const rawX = drawerData.x ?? 100;
			const rawY = drawerData.y ?? 100;
			const rawWidth = drawerData.width ?? 150;
			const rawHeight = drawerData.height ?? 100;
			const rotation = drawerData.rotation ?? 0;
			const label = drawerData.label;

			// Snap to grid
			const x = snapToGrid(rawX);
			const y = snapToGrid(rawY);
			const width = Math.max(GRID_SIZE, snapToGrid(rawWidth));
			const height = Math.max(GRID_SIZE, snapToGrid(rawHeight));

			const overlapsExisting = drawers.some((other) => {
				const overlapX = Math.abs(x - other.x) < width / 2 + other.width / 2;
				const overlapY = Math.abs(y - other.y) < height / 2 + other.height / 2;
				return overlapX && overlapY;
			});
			if (overlapsExisting) {
				toast.error("Cannot create drawer", "New drawers cannot overlap");
				return;
			}

			const drawerId = await createDrawer({
				authContext: context,
				blueprintId: blueprintId as Id<"blueprints">,
				x,
				y,
				width,
				height,
				rotation,
				label,
			});
			pushHistoryEntry({
				label: "Create drawer",
				requiresLock: true,
				steps: [
					{
						type: "createDrawer",
						blueprintId: blueprintId as string,
						args: {
							x,
							y,
							width,
							height,
							rotation,
							label,
						},
						drawerId: drawerId as unknown as string,
					},
				],
				timestamp: Date.now(),
			});
			toast.success("Drawer created");
		} catch (error) {
			toast.error(
				"Failed to create drawer",
				error instanceof Error ? error.message : "An error occurred",
			);
		}
	};

	const handleDeleteDrawers = useCallback(
		async (drawerIds: string[]) => {
			const uniqueDrawerIds = Array.from(new Set(drawerIds));
			if (uniqueDrawerIds.length === 0) return;

			try {
				const context = await getRequiredAuthContext();
				const steps: HistoryStep[] = [];

				for (const drawerId of uniqueDrawerIds) {
					const snapshot = drawers.find((d) => d._id === drawerId) ?? null;
					if (!snapshot) continue;

					await deleteDrawer({
						authContext: context,
						drawerId: drawerId as Id<"drawers">,
					});
					steps.push({
						type: "deleteDrawer",
						snapshot,
						currentDrawerId: drawerId,
					});
				}

				if (steps.length === 0) {
					return;
				}

				setSelectedElement(null);
				setSelectedDrawerIds([]);
				pushHistoryEntry({
					label:
						steps.length === 1
							? "Delete drawer"
							: `Delete ${steps.length} drawers`,
					requiresLock: true,
					steps,
					timestamp: Date.now(),
				});
				setHasChanges(true);
				toast.success(
					steps.length === 1
						? "Drawer deleted"
						: `${steps.length} drawers deleted`,
				);
			} catch (error) {
				toast.error(
					"Failed to delete drawer",
					error instanceof Error ? error.message : "An error occurred",
				);
			}
		},
		[deleteDrawer, drawers, getRequiredAuthContext, pushHistoryEntry, toast],
	);

	const handleSwapCompartments = useCallback(
		async (aCompartmentId: string, bCompartmentId: string) => {
			try {
				let a: Compartment | null = null;
				let b: Compartment | null = null;
				for (const d of drawers) {
					a = a ?? d.compartments.find((c) => c._id === aCompartmentId) ?? null;
					b = b ?? d.compartments.find((c) => c._id === bCompartmentId) ?? null;
					if (a && b) break;
				}
				if (!a || !b) return;

				const context = await getRequiredAuthContext();
				await swapCompartments({
					authContext: context,
					aCompartmentId: aCompartmentId as Id<"compartments">,
					bCompartmentId: bCompartmentId as Id<"compartments">,
				});
				pushHistoryEntry({
					label: "Swap compartments",
					requiresLock: true,
					steps: [
						{
							type: "updateCompartment",
							compartmentId: aCompartmentId,
							prev: {
								drawerId: a.drawerId,
								x: a.x,
								y: a.y,
								width: a.width,
								height: a.height,
								rotation: a.rotation,
							},
							next: {
								drawerId: b.drawerId,
								x: b.x,
								y: b.y,
								width: b.width,
								height: b.height,
								rotation: b.rotation,
							},
						},
						{
							type: "updateCompartment",
							compartmentId: bCompartmentId,
							prev: {
								drawerId: b.drawerId,
								x: b.x,
								y: b.y,
								width: b.width,
								height: b.height,
								rotation: b.rotation,
							},
							next: {
								drawerId: a.drawerId,
								x: a.x,
								y: a.y,
								width: a.width,
								height: a.height,
								rotation: a.rotation,
							},
						},
					],
					timestamp: Date.now(),
				});
				setHasChanges(true);
			} catch (error) {
				toast.error(
					"Failed to swap compartments",
					error instanceof Error ? error.message : "An error occurred",
				);
			}
		},
		[
			drawers,
			getRequiredAuthContext,
			pushHistoryEntry,
			swapCompartments,
			toast,
		],
	);

	const handleDeleteCompartment = useCallback(
		async (compartmentId: string) => {
			try {
				let snapshot: Compartment | null = null;
				for (const d of drawers) {
					snapshot =
						d.compartments.find((c) => c._id === compartmentId) ?? null;
					if (snapshot) break;
				}
				if (!snapshot) return;

				const context = await getRequiredAuthContext();
				await deleteCompartment({
					authContext: context,
					compartmentId: compartmentId as Id<"compartments">,
				});
				setSelectedElement(null);
				setSelectedDrawerIds([]);
				pushHistoryEntry({
					label: "Delete compartment",
					requiresLock: true,
					steps: [
						{
							type: "deleteCompartment",
							snapshot,
							currentCompartmentId: compartmentId,
						},
					],
					timestamp: Date.now(),
				});
				toast.success("Compartment deleted");
			} catch (error) {
				toast.error(
					"Failed to delete compartment",
					error instanceof Error ? error.message : "An error occurred",
				);
			}
		},
		[
			deleteCompartment,
			drawers,
			getRequiredAuthContext,
			pushHistoryEntry,
			toast,
		],
	);

	const handleViewportChange = useCallback((viewport: Viewport) => {
		setZoomLevel(Math.round(viewport.zoom * 100));
	}, []);

	const GRID_SIZE = 50;

	const snapToGrid = useCallback((value: number) => {
		return Math.round(value / GRID_SIZE) * GRID_SIZE;
	}, []);

	const snapCenterToGridEdges = useCallback(
		(center: number, size: number) => {
			const half = size / 2;
			const snappedTopLeft = snapToGrid(center - half);
			return snappedTopLeft + half;
		},
		[snapToGrid],
	);

	const handleSplitDrawer = useCallback(
		async (split: {
			drawerId: string;
			orientation: "vertical" | "horizontal";
			position: number;
			targetCompartmentId?: string | null;
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

				const hintedTarget = split.targetCompartmentId
					? (candidates.find((c) => c._id === split.targetCompartmentId) ??
						null)
					: null;

				const targetCompartment =
					hintedTarget ??
					candidates.find((c) => {
						if (split.orientation === "vertical") {
							const left = c.x - c.width / 2;
							const right = c.x + c.width / 2;
							return position >= left + minEdge && position <= right - minEdge;
						}
						const top = c.y - c.height / 2;
						const bottom = c.y + c.height / 2;
						return position >= top + minEdge && position <= bottom - minEdge;
					}) ??
					null;

				if (!targetCompartment && drawer.compartments.length > 0) {
					// Prevent creating stacked layers. If the drawer already has compartments,
					// splits must target an existing compartment.
					toast.info("Hover a compartment to split it");
					return;
				}

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
					const steps: HistoryStep[] = [];

					// Preserve existing compartment by updating it to be the left side
					if (target._id && targetCompartment) {
						// Update existing compartment to be the left portion
						await updateCompartment({
							authContext: context,
							compartmentId: target._id as Id<"compartments">,
							x: leftCenterX,
							y: target.y,
							width: leftW,
							height: target.height,
						});
						steps.push({
							type: "updateCompartment",
							compartmentId: target._id,
							prev: {
								x: targetCompartment.x,
								y: targetCompartment.y,
								width: targetCompartment.width,
								height: targetCompartment.height,
							},
							next: {
								x: leftCenterX,
								y: target.y,
								width: leftW,
								height: target.height,
							},
						});
					}

					// Create only one new compartment for the right side
					const rightId = await createCompartment({
						authContext: context,
						drawerId: drawer._id as Id<"drawers">,
						x: rightCenterX,
						y: target.y,
						width: rightW,
						height: target.height,
						rotation: 0,
					});
					steps.push({
						type: "createCompartment",
						compartmentId: rightId as unknown as string,
						args: {
							drawerId: drawer._id,
							x: rightCenterX,
							y: target.y,
							width: rightW,
							height: target.height,
							rotation: 0,
						},
					});

					// If splitting an empty drawer (no target._id), also create the left compartment
					if (!target._id) {
						const leftId = await createCompartment({
							authContext: context,
							drawerId: drawer._id as Id<"drawers">,
							x: leftCenterX,
							y: target.y,
							width: leftW,
							height: target.height,
							rotation: 0,
						});
						// Insert the left compartment step before the right compartment step
						steps.splice(steps.length - 1, 0, {
							type: "createCompartment",
							compartmentId: leftId as unknown as string,
							args: {
								drawerId: drawer._id,
								x: leftCenterX,
								y: target.y,
								width: leftW,
								height: target.height,
								rotation: 0,
							},
						});
					}

					if (steps.length > 0) {
						pushHistoryEntry({
							label: "Split compartment",
							requiresLock: true,
							steps,
							timestamp: Date.now(),
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
					const steps: HistoryStep[] = [];

					// Preserve existing compartment by updating it to be the top side
					if (target._id && targetCompartment) {
						// Update existing compartment to be the top portion
						await updateCompartment({
							authContext: context,
							compartmentId: target._id as Id<"compartments">,
							x: target.x,
							y: topCenterY,
							width: target.width,
							height: topH,
							rotation: 0,
						});
						steps.push({
							type: "updateCompartment",
							compartmentId: target._id,
							prev: {
								x: targetCompartment.x,
								y: targetCompartment.y,
								width: targetCompartment.width,
								height: targetCompartment.height,
							},
							next: {
								x: target.x,
								y: topCenterY,
								width: target.width,
								height: topH,
							},
						});
					}

					// Create only one new compartment for the bottom side
					const bottomId = await createCompartment({
						authContext: context,
						drawerId: drawer._id as Id<"drawers">,
						x: target.x,
						y: bottomCenterY,
						width: target.width,
						height: bottomH,
						rotation: 0,
					});
					steps.push({
						type: "createCompartment",
						compartmentId: bottomId as unknown as string,
						args: {
							drawerId: drawer._id,
							x: target.x,
							y: bottomCenterY,
							width: target.width,
							height: bottomH,
							rotation: 0,
						},
					});

					// If splitting an empty drawer (no target._id), also create the top compartment
					if (!target._id) {
						const topId = await createCompartment({
							authContext: context,
							drawerId: drawer._id as Id<"drawers">,
							x: target.x,
							y: topCenterY,
							width: target.width,
							height: topH,
							rotation: 0,
						});
						// Insert the top compartment step before the bottom compartment step
						steps.splice(steps.length - 1, 0, {
							type: "createCompartment",
							compartmentId: topId as unknown as string,
							args: {
								drawerId: drawer._id,
								x: target.x,
								y: topCenterY,
								width: target.width,
								height: topH,
								rotation: 0,
							},
						});
					}

					if (steps.length > 0) {
						pushHistoryEntry({
							label: "Split compartment",
							requiresLock: true,
							steps,
							timestamp: Date.now(),
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
			drawers,
			getRequiredAuthContext,
			isLockedByMe,
			pushHistoryEntry,
			toast,
			updateCompartment,
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

	// --- Wrapped update handlers with history + collision ---
	const handleUpdateDrawerWithHistory = useCallback(
		async (drawerId: string, updates: Partial<Drawer>) => {
			const drawer = drawers.find((d) => d._id === drawerId);
			if (!drawer) return;

			// Collision detection is now handled in BlueprintCanvas with visual feedback
			// No need for toast errors here

			const prev: Partial<Drawer> = {};
			const next: Partial<Drawer> = {};
			for (const [key, value] of Object.entries(updates) as Array<
				[keyof Drawer, Drawer[keyof Drawer]]
			>) {
				if (value === undefined) continue;
				prev[key] = drawer[key] as never;
				next[key] = value as never;
			}

			// If drawer size changed, proportionally scale compartments inside
			const newW = updates.width ?? drawer.width;
			const newH = updates.height ?? drawer.height;
			const willScaleCompartments =
				newW !== drawer.width || newH !== drawer.height;

			try {
				const context = await getRequiredAuthContext();

				const steps: HistoryStep[] = [];
				if (Object.keys(next).length > 0) {
					await updateDrawer({
						authContext: context,
						drawerId: drawerId as Id<"drawers">,
						...next,
					});
					steps.push({
						type: "updateDrawer",
						drawerId,
						prev,
						next,
					});
				}

				if (willScaleCompartments) {
					const scaleX = newW / drawer.width;
					const scaleY = newH / drawer.height;
					for (const comp of drawer.compartments) {
						const scaledW = Math.max(
							GRID_SIZE,
							snapToGrid(comp.width * scaleX),
						);
						const scaledH = Math.max(
							GRID_SIZE,
							snapToGrid(comp.height * scaleY),
						);
						const scaledX = comp.x * scaleX;
						const scaledY = comp.y * scaleY;

						const absCenterX = (updates.x ?? drawer.x) + scaledX;
						const absCenterY = (updates.y ?? drawer.y) + scaledY;
						const snappedAbsX = snapCenterToGridEdges(absCenterX, scaledW);
						const snappedAbsY = snapCenterToGridEdges(absCenterY, scaledH);
						const finalRelX = snappedAbsX - (updates.x ?? drawer.x);
						const finalRelY = snappedAbsY - (updates.y ?? drawer.y);

						const halfW = newW / 2;
						const halfH = newH / 2;
						const halfCW = scaledW / 2;
						const halfCH = scaledH / 2;
						const clampedX = Math.max(
							-halfW + halfCW,
							Math.min(halfW - halfCW, finalRelX),
						);
						const clampedY = Math.max(
							-halfH + halfCH,
							Math.min(halfH - halfCH, finalRelY),
						);

						const compPrev: Partial<Compartment> = {
							x: comp.x,
							y: comp.y,
							width: comp.width,
							height: comp.height,
						};
						const compNext: Partial<Compartment> = {
							x: clampedX,
							y: clampedY,
							width: scaledW,
							height: scaledH,
						};

						await updateCompartment({
							authContext: context,
							compartmentId: comp._id as Id<"compartments">,
							x: compNext.x,
							y: compNext.y,
							width: compNext.width,
							height: compNext.height,
						});

						steps.push({
							type: "updateCompartment",
							compartmentId: comp._id,
							prev: compPrev,
							next: compNext,
						});
					}
				}

				if (steps.length > 0) {
					pushHistoryEntry({
						label: "Update drawer",
						requiresLock: true,
						steps,
						timestamp: Date.now(),
					});
				}

				setHasChanges(true);
			} catch (error) {
				toast.error(
					"Failed to update drawer",
					error instanceof Error ? error.message : "An error occurred",
				);
			}
		},
		[
			drawers,
			getRequiredAuthContext,
			pushHistoryEntry,
			snapCenterToGridEdges,
			snapToGrid,
			toast,
			updateCompartment,
			updateDrawer,
		],
	);

	const handleUpdateCompartmentWithHistory = useCallback(
		async (compartmentId: string, updates: Partial<Compartment>) => {
			let foundComp: Compartment | null = null;
			let foundDrawerId: string | null = null;
			for (const d of drawers) {
				const c = d.compartments.find((c) => c._id === compartmentId);
				if (c) {
					foundComp = c;
					foundDrawerId = d._id;
					break;
				}
			}

			if (!foundComp || !foundDrawerId) return;

			const prev: Partial<Compartment> & { drawerId?: string } = {};
			const next: Partial<Compartment> & { drawerId?: string } = {};

			for (const [key, value] of Object.entries(updates) as Array<
				[keyof Compartment, Compartment[keyof Compartment]]
			>) {
				if (value === undefined) continue;
				prev[key] = foundComp[key] as never;
				next[key] = value as never;
			}

			try {
				const context = await getRequiredAuthContext();
				const { drawerId, ...rest } = next;
				await updateCompartment({
					authContext: context,
					compartmentId: compartmentId as Id<"compartments">,
					...(drawerId ? { drawerId: drawerId as Id<"drawers"> } : {}),
					...rest,
				});

				pushHistoryEntry({
					label: "Update compartment",
					requiresLock: true,
					steps: [
						{
							type: "updateCompartment",
							compartmentId,
							prev,
							next,
						},
					],
					timestamp: Date.now(),
				});

				setHasChanges(true);
			} catch (error) {
				toast.error(
					"Failed to update compartment",
					error instanceof Error ? error.message : "An error occurred",
				);
			}
		},
		[
			drawers,
			getRequiredAuthContext,
			pushHistoryEntry,
			toast,
			updateCompartment,
		],
	);

	const handleUpdateDrawersBulkWithHistory = useCallback(
		async (updates: Array<{ drawerId: string; x: number; y: number }>) => {
			if (updates.length === 0) return;

			const nextById = new Map(
				updates.map((u) => [u.drawerId, { x: u.x, y: u.y }]),
			);

			// Bulk collision detection (treat all moves as a single operation).
			for (let i = 0; i < drawers.length; i++) {
				const a = drawers[i];
				const ax = nextById.get(a._id)?.x ?? a.x;
				const ay = nextById.get(a._id)?.y ?? a.y;
				const aHalfW = a.width / 2;
				const aHalfH = a.height / 2;

				for (let j = i + 1; j < drawers.length; j++) {
					const b = drawers[j];
					const bx = nextById.get(b._id)?.x ?? b.x;
					const by = nextById.get(b._id)?.y ?? b.y;
					const bHalfW = b.width / 2;
					const bHalfH = b.height / 2;

					const overlapX = Math.abs(ax - bx) < aHalfW + bHalfW;
					const overlapY = Math.abs(ay - by) < aHalfH + bHalfH;
					if (overlapX && overlapY) {
						// Collision detected - return without saving (silently reject the move)
						return;
					}
				}
			}

			try {
				const context = await getRequiredAuthContext();
				const steps: HistoryStep[] = [];

				for (const update of updates) {
					const drawer = drawers.find((d) => d._id === update.drawerId);
					if (!drawer) continue;

					await updateDrawer({
						authContext: context,
						drawerId: update.drawerId as Id<"drawers">,
						x: update.x,
						y: update.y,
					});

					steps.push({
						type: "updateDrawer",
						drawerId: update.drawerId,
						prev: { x: drawer.x, y: drawer.y },
						next: { x: update.x, y: update.y },
					});
				}

				if (steps.length > 0) {
					pushHistoryEntry({
						label: "Move drawers",
						requiresLock: true,
						steps,
						timestamp: Date.now(),
					});
				}

				setHasChanges(true);
			} catch (error) {
				toast.error(
					"Failed to move drawers",
					error instanceof Error ? error.message : "An error occurred",
				);
			}
		},
		[drawers, getRequiredAuthContext, pushHistoryEntry, toast, updateDrawer],
	);

	// --- Delete confirmation handlers ---
	const confirmDeleteDrawer = useCallback(async () => {
		if (pendingDeleteDrawerIds.length === 0) return;
		await handleDeleteDrawers(pendingDeleteDrawerIds);
		setPendingDeleteDrawerIds([]);
		setShowDeleteDrawerDialog(false);
	}, [pendingDeleteDrawerIds, handleDeleteDrawers]);

	const confirmDeleteCompartment = useCallback(async () => {
		if (!pendingDeleteCompartmentId) return;
		await handleDeleteCompartment(pendingDeleteCompartmentId);
		setPendingDeleteCompartmentId(null);
		setShowDeleteCompartmentDialog(false);
	}, [pendingDeleteCompartmentId, handleDeleteCompartment]);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = async (e: KeyboardEvent) => {
			// Don't treat backspace/delete as "delete selected element" while typing in inputs.
			const target = e.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			const isTypingTarget =
				tag === "input" ||
				tag === "textarea" ||
				tag === "select" ||
				(target?.isContentEditable ?? false);

			// Delete selected element(s) (with confirmation)
			if (
				!isTypingTarget &&
				(e.key === "Delete" || e.key === "Backspace") &&
				isLockedByMe
			) {
				e.preventDefault();
				if (selectedDrawerIds.length > 1) {
					setPendingDeleteDrawerIds(selectedDrawerIds);
					setShowDeleteDrawerDialog(true);
				} else if (selectedElement?.type === "drawer") {
					setPendingDeleteDrawerIds([selectedElement.id]);
					setShowDeleteDrawerDialog(true);
				} else if (selectedElement?.type === "compartment") {
					setPendingDeleteCompartmentId(selectedElement.id);
					setShowDeleteCompartmentDialog(true);
				}
			}

			// Ctrl/Cmd + Z to undo
			if (
				!isTypingTarget &&
				(e.ctrlKey || e.metaKey) &&
				e.key === "z" &&
				!e.shiftKey
			) {
				e.preventDefault();
				await handleUndo();
			}

			// Ctrl/Cmd + Shift + Z to redo
			if (
				!isTypingTarget &&
				(e.ctrlKey || e.metaKey) &&
				e.key === "z" &&
				e.shiftKey
			) {
				e.preventDefault();
				await handleRedo();
			}

			// Ctrl/Cmd + Y to redo
			if (
				!isTypingTarget &&
				(e.ctrlKey || e.metaKey) &&
				(e.key === "y" || e.key === "Y")
			) {
				e.preventDefault();
				await handleRedo();
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
		selectedDrawerIds,
		selectedElement,
		isLockedByMe,
		handleUndo,
		handleRedo,
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
						type="button"
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
		<div className="fixed inset-0 overflow-hidden bg-white">
			<div className="absolute inset-0">
				<BlueprintCanvas
					width={canvasSize.width}
					height={canvasSize.height}
					drawers={drawers}
					selectedElement={selectedElement}
					selectedDrawerIds={selectedDrawerIds}
					mode={mode}
					tool={tool}
					isLocked={isLocked}
					isLockedByMe={isLockedByMe}
					onSelectionChange={applySelection}
					onCreateDrawerFromTool={(drawer) => handleCreateDrawer(drawer)}
					onSplitDrawerFromTool={handleSplitDrawer}
					onSwapCompartments={handleSwapCompartments}
					onUpdateDrawers={handleUpdateDrawersBulkWithHistory}
					onUpdateCompartment={handleUpdateCompartmentWithHistory}
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

				{/* Top bar */}
				<div className="absolute top-4 left-4 right-4 z-20 pointer-events-none">
					<div className="flex items-center justify-between gap-3 pointer-events-auto">
						<div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white/95 backdrop-blur-sm shadow-lg px-3 py-2">
							<Button
								variant="ghost"
								size="icon"
								onClick={() => navigate({ to: "/blueprints" })}
								className="h-9 w-9"
								title="Back"
							>
								<ArrowLeft className="w-5 h-5" />
							</Button>

							<div className="flex items-center gap-2">
								{isEditingName ? (
									<>
										<Input
											value={nameValue}
											onChange={(e) => setNameValue(e.target.value)}
											className="h-9 w-64"
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
									</>
								) : (
									<button
										type="button"
										onClick={() => canEdit() && setIsEditingName(true)}
										className="text-left"
										title={canEdit() ? "Rename" : undefined}
									>
										<div className="text-sm font-semibold text-gray-900 leading-tight">
											{blueprint.name}
										</div>
										<div className="text-xs text-gray-500 leading-tight">
											Last updated{" "}
											{new Date(blueprint.updatedAt).toLocaleString()}
										</div>
									</button>
								)}
							</div>
						</div>

						<div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white/95 backdrop-blur-sm shadow-lg px-3 py-2">
							<Button
								variant="ghost"
								size="icon"
								onClick={() => void handleUndo()}
								disabled={!canUndoNow}
								title="Undo (Ctrl/Cmd+Z)"
							>
								<Undo2 className="w-4 h-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => void handleRedo()}
								disabled={!canRedoNow}
								title="Redo (Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z)"
							>
								<Redo2 className="w-4 h-4" />
							</Button>
							{isLockedByMe &&
								(selectedDrawerIds.length > 1 || selectedElement) && (
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											if (selectedDrawerIds.length > 1) {
												setPendingDeleteDrawerIds(selectedDrawerIds);
												setShowDeleteDrawerDialog(true);
												return;
											}
											if (selectedElement?.type === "drawer") {
												setPendingDeleteDrawerIds([selectedElement.id]);
												setShowDeleteDrawerDialog(true);
												return;
											}
											if (selectedElement?.type === "compartment") {
												setPendingDeleteCompartmentId(selectedElement.id);
												setShowDeleteCompartmentDialog(true);
											}
										}}
										className="text-red-700 hover:text-red-800"
									>
										<Trash2 className="w-4 h-4 mr-2" />
										{selectedDrawerIds.length > 1
											? `Delete ${selectedDrawerIds.length}`
											: "Delete Selected"}
									</Button>
								)}
							<Button
								variant="outline"
								size="sm"
								onClick={() => setShowActionHistory(true)}
							>
								<History className="w-4 h-4 mr-2" />
								History
							</Button>
							{canEdit() && !isLockedByMe && !isLocked && (
								<Button onClick={acquireLock} disabled={lockLoading}>
									<Lock className="w-4 h-4 mr-2" />
									Edit
								</Button>
							)}
							{isLockedByMe && (
								<Button
									variant="outline"
									onClick={releaseLock}
									disabled={lockLoading}
								>
									<Unlock className="w-4 h-4 mr-2" />
									Done
								</Button>
							)}
							{canEdit() && (
								<Button
									variant="ghost"
									size="icon"
									onClick={() => setShowDeleteDialog(true)}
									className="text-red-600 hover:text-red-700 hover:bg-red-50"
									title="Delete blueprint"
								>
									<Trash2 className="w-4 h-4" />
								</Button>
							)}
						</div>
					</div>
				</div>

				{/* Floating inspector */}
				{(selectedDrawer || selectedCompartment) && !isInspectorOpen && (
					<div className="absolute top-20 right-4 z-20">
						<Button
							variant="secondary"
							size="sm"
							className="shadow-lg"
							onClick={() => setIsInspectorOpen(true)}
						>
							<PanelRightOpen className="mr-2 h-4 w-4" />
							Details
						</Button>
					</div>
				)}
				{selectedDrawerIds.length > 1 && (
					<div className="absolute top-32 right-4 z-20">
						<Button
							variant="destructive"
							size="sm"
							className="shadow-lg"
							onClick={() => {
								setPendingDeleteDrawerIds(selectedDrawerIds);
								setShowDeleteDrawerDialog(true);
							}}
							disabled={!isLockedByMe}
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete Selected ({selectedDrawerIds.length})
						</Button>
					</div>
				)}
				{(selectedDrawer || selectedCompartment) && isInspectorOpen && (
					<div className="absolute top-20 right-4 z-20 w-85 max-h-[70vh] overflow-auto rounded-xl border border-gray-200 bg-white/95 backdrop-blur-sm shadow-lg p-3">
						<div className="flex items-center justify-between gap-2 mb-2">
							<div className="text-sm font-semibold text-gray-900">
								{selectedCompartment ? "Compartment" : "Drawer"} Details
							</div>
							<Button
								variant="ghost"
								size="icon"
								className="h-8 w-8"
								onClick={() => setIsInspectorOpen(false)}
								title="Collapse"
							>
								<X className="w-4 h-4" />
							</Button>
						</div>

						{selectedDrawer && (
							<div className="space-y-2">
								<div className="space-y-1">
									<Label>Label</Label>
									<div className="flex items-center gap-2">
										<Input
											value={drawerLabelDraft}
											onChange={(e) => setDrawerLabelDraft(e.target.value)}
											onKeyDown={(e) => {
												if (e.key !== "Enter") return;
												e.preventDefault();
												void handleUpdateDrawerWithHistory(selectedDrawer._id, {
													label: drawerLabelDraft.trim() || undefined,
												});
											}}
											disabled={!isLockedByMe || tool !== "select"}
											placeholder="Drawer name"
										/>
										<Button
											size="sm"
											variant="outline"
											onClick={() =>
												void handleUpdateDrawerWithHistory(selectedDrawer._id, {
													label: drawerLabelDraft.trim() || undefined,
												})
											}
											disabled={!isLockedByMe || tool !== "select"}
										>
											Save
										</Button>
									</div>
								</div>

								<div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
									<div className="text-xs font-medium text-gray-900">
										Grid Layout (Rows x Columns)
									</div>
									<div className="mt-2 grid grid-cols-2 gap-2">
										<div className="space-y-1">
											<Label>Rows</Label>
											<Input
												type="number"
												min={1}
												value={gridRows}
												onChange={(e) => setGridRows(Number(e.target.value))}
												disabled={!isLockedByMe}
											/>
										</div>
										<div className="space-y-1">
											<Label>Columns</Label>
											<Input
												type="number"
												min={1}
												value={gridCols}
												onChange={(e) => setGridCols(Number(e.target.value))}
												disabled={!isLockedByMe}
											/>
										</div>
									</div>
									<div className="mt-2 grid grid-cols-2 gap-2">
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												requestApplyGrid(gridRows + 1, gridCols);
											}}
											disabled={!isLockedByMe}
										>
											Add Row
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												requestApplyGrid(gridRows, gridCols + 1);
											}}
											disabled={!isLockedByMe}
										>
											Add Column
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												requestApplyGrid(gridRows - 1, gridCols);
											}}
											disabled={!isLockedByMe || gridRows <= 1}
										>
											Remove Row
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												requestApplyGrid(gridRows, gridCols - 1);
											}}
											disabled={!isLockedByMe || gridCols <= 1}
										>
											Remove Column
										</Button>
									</div>
									<div className="mt-2 flex items-center justify-between gap-2">
										<div className="text-xs text-gray-600">
											Reducing rows/cols may delete compartments.
										</div>
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												requestApplyGrid(gridRows, gridCols);
											}}
											disabled={!isLockedByMe}
										>
											Apply
										</Button>
									</div>
								</div>

								<div className="flex gap-2 pt-2">
									<Button
										variant="destructive"
										className="flex-1"
										onClick={() => {
											setPendingDeleteDrawerIds([selectedDrawer._id]);
											setShowDeleteDrawerDialog(true);
										}}
										disabled={!isLockedByMe}
									>
										Delete Drawer
									</Button>
								</div>
							</div>
						)}

						{selectedCompartment && selectedDrawer && (
							<div className="space-y-2 mt-3 border-t border-gray-200 pt-3">
								<div className="text-xs text-gray-500">
									In drawer:{" "}
									{selectedDrawer.label || `#${selectedDrawer._id.slice(-4)}`}
								</div>
								<div className="space-y-1">
									<Label>Label</Label>
									<div className="flex items-center gap-2">
										<Input
											value={compartmentLabelDraft}
											onChange={(e) => setCompartmentLabelDraft(e.target.value)}
											onKeyDown={(e) => {
												if (e.key !== "Enter") return;
												e.preventDefault();
												void handleUpdateCompartmentWithHistory(
													selectedCompartment._id,
													{
														label: compartmentLabelDraft.trim() || undefined,
													},
												);
											}}
											disabled={!isLockedByMe || tool !== "select"}
											placeholder="Compartment name"
										/>
										<Button
											size="sm"
											variant="outline"
											onClick={() =>
												void handleUpdateCompartmentWithHistory(
													selectedCompartment._id,
													{
														label: compartmentLabelDraft.trim() || undefined,
													},
												)
											}
											disabled={!isLockedByMe || tool !== "select"}
										>
											Save
										</Button>
									</div>
								</div>

								<div className="flex gap-2 pt-2">
									<Button
										variant="destructive"
										className="flex-1"
										onClick={() => {
											setPendingDeleteCompartmentId(selectedCompartment._id);
											setShowDeleteCompartmentDialog(true);
										}}
										disabled={!isLockedByMe}
									>
										Delete Compartment
									</Button>
								</div>
							</div>
						)}
					</div>
				)}

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
									type="button"
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

			<AlertDialog
				open={showGridWarning}
				onOpenChange={setShowGridWarning}
				title="Reduce Grid Size?"
				description="Reducing rows/columns may delete compartments. If any removed compartments contain inventory, this operation will fail until you move that inventory out."
				confirmLabel="Reduce"
				cancelLabel="Cancel"
				onConfirm={async () => {
					const pending = pendingGridRef.current;
					if (!pending) return;
					pendingGridRef.current = null;
					await applyGrid(pending.rows, pending.cols);
					setShowGridWarning(false);
				}}
				variant="destructive"
			/>

			{/* Delete Drawer confirmation */}
			<AlertDialog
				open={showDeleteDrawerDialog}
				onOpenChange={(open) => {
					setShowDeleteDrawerDialog(open);
					if (!open) {
						setPendingDeleteDrawerIds([]);
					}
				}}
				title={
					pendingDeleteDrawerIds.length > 1 ? "Delete Drawers" : "Delete Drawer"
				}
				description={
					pendingDeleteDrawerIds.length > 1
						? `Are you sure you want to delete ${pendingDeleteDrawerIds.length} drawers? All compartments inside them will also be deleted.`
						: "Are you sure you want to delete this drawer? All compartments inside it will also be deleted."
				}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={confirmDeleteDrawer}
				variant="destructive"
			/>

			{/* Delete Compartment confirmation */}
			<AlertDialog
				open={showDeleteCompartmentDialog}
				onOpenChange={setShowDeleteCompartmentDialog}
				title="Delete Compartment"
				description="Are you sure you want to delete this compartment? This cannot be undone."
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={confirmDeleteCompartment}
				variant="destructive"
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

			{/* Action History Panel */}
			{showActionHistory && (
				<Sheet open={showActionHistory} onOpenChange={setShowActionHistory}>
					<SheetContent
						side="right"
						className="w-96 overflow-y-auto"
						showCloseButton={false}
					>
						<ActionHistoryPanel
							historyState={historyState}
							onUndo={handleUndo}
							onRedo={handleRedo}
							onClose={() => setShowActionHistory(false)}
							canUndo={canUndoNow}
							canRedo={canRedoNow}
							isApplying={isApplyingHistory}
						/>
					</SheetContent>
				</Sheet>
			)}
		</div>
	);
}
