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
	Save,
	Trash2,
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
	BlueprintCanvas,
	BlueprintControls,
	useBlueprintLock,
	VersionHistoryPanel,
} from "@/components/blueprint";
import type { BlueprintTool } from "@/components/blueprint/BlueprintControls";
import {
	EditorContextMenu,
	type ContextMenuState,
} from "@/components/blueprint/EditorContextMenu";
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
	const [isInspectorOpen, setIsInspectorOpen] = useState(false);
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(
		null,
	);
	const [showDeleteDrawerDialog, setShowDeleteDrawerDialog] = useState(false);
	const [showDeleteCompartmentDialog, setShowDeleteCompartmentDialog] =
		useState(false);
	const [pendingDeleteDrawerId, setPendingDeleteDrawerId] = useState<
		string | null
	>(null);
	const [pendingDeleteCompartmentId, setPendingDeleteCompartmentId] = useState<
		string | null
	>(null);

	// History (undo/redo) state
	const [history, setHistory] = useState<
		Array<{
			type: string;
			data: Record<string, unknown>;
			timestamp: number;
		}>
	>([]);
	const [historyIndex, setHistoryIndex] = useState(-1);

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
	// Track if changes were made during edit session
	const [hasChanges, setHasChanges] = useState(false);

	const drawers = useMemo<DrawerWithCompartments[]>(() => {
		return blueprint?.drawers || [];
	}, [blueprint]);

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

	// Local drafts for labels so we don't patch on every keystroke.
	const [drawerLabelDraft, setDrawerLabelDraft] = useState("");
	const [compartmentLabelDraft, setCompartmentLabelDraft] = useState("");

	useEffect(() => {
		setDrawerLabelDraft(selectedDrawer?.label ?? "");
	}, [selectedDrawer?._id]);

	useEffect(() => {
		setCompartmentLabelDraft(selectedCompartment?.label ?? "");
	}, [selectedCompartment?._id]);

	// Canvas tool selection
	const [tool, setTool] = useState<BlueprintTool>("pan");
	useEffect(() => {
		// In view mode, default to pan so click-drag moves around quickly.
		setTool(isLockedByMe ? "select" : "pan");
	}, [isLockedByMe]);

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

	const handleUpdateCompartment = async (
		compartmentId: string,
		updates: Partial<Compartment>,
	) => {
		try {
			const context = await getRequiredAuthContext();
			const { drawerId, ...rest } = updates;
			await updateCompartment({
				authContext: context,
				compartmentId: compartmentId as Id<"compartments">,
				...(drawerId ? { drawerId: drawerId as Id<"drawers"> } : {}),
				...rest,
			});
			setHasChanges(true);
		} catch (error) {
			toast.error(
				"Failed to update compartment",
				error instanceof Error ? error.message : "An error occurred",
			);
		}
	};

	const handleSwapCompartments = useCallback(
		async (aCompartmentId: string, bCompartmentId: string) => {
			try {
				const context = await getRequiredAuthContext();
				await swapCompartments({
					authContext: context,
					aCompartmentId: aCompartmentId as Id<"compartments">,
					bCompartmentId: bCompartmentId as Id<"compartments">,
				});
				setHasChanges(true);
			} catch (error) {
				toast.error(
					"Failed to swap compartments",
					error instanceof Error ? error.message : "An error occurred",
				);
			}
		},
		[getRequiredAuthContext, swapCompartments, toast],
	);

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

	// --- History (undo/redo) support ---
	const pushHistory = useCallback(
		(type: string, data: Record<string, unknown>) => {
			setHistory((prev) => {
				const truncated = prev.slice(0, historyIndex + 1);
				const entry = { type, data, timestamp: Date.now() };
				return [...truncated, entry];
			});
			setHistoryIndex((prev) => prev + 1);
		},
		[historyIndex],
	);

	const canUndo = historyIndex >= 0;
	const canRedo = historyIndex < history.length - 1;

	const handleUndo = useCallback(async () => {
		if (!canUndo || !isLockedByMe) return;
		const entry = history[historyIndex];
		if (!entry) return;
		try {
			const context = await getRequiredAuthContext();
			if (entry.type === "updateDrawer" && entry.data.prev) {
				const prev = entry.data.prev as Partial<Drawer> & { _id: string };
				await updateDrawer({
					authContext: context,
					drawerId: prev._id as Id<"drawers">,
					...prev,
				});
			} else if (entry.type === "updateCompartment" && entry.data.prev) {
				const prev = entry.data.prev as Partial<Compartment> & {
					_id: string;
				};
				const { _id, drawerId, ...rest } = prev;
				await updateCompartment({
					authContext: context,
					compartmentId: _id as Id<"compartments">,
					...(drawerId ? { drawerId: drawerId as Id<"drawers"> } : {}),
					...rest,
				});
			}
			setHistoryIndex((prev) => prev - 1);
		} catch (error) {
			toast.error("Undo failed");
		}
	}, [
		canUndo,
		history,
		historyIndex,
		isLockedByMe,
		getRequiredAuthContext,
		updateDrawer,
		updateCompartment,
		toast,
	]);

	const handleRedo = useCallback(async () => {
		if (!canRedo || !isLockedByMe) return;
		const entry = history[historyIndex + 1];
		if (!entry) return;
		try {
			const context = await getRequiredAuthContext();
			if (entry.type === "updateDrawer" && entry.data.next) {
				const next = entry.data.next as Partial<Drawer> & { _id: string };
				await updateDrawer({
					authContext: context,
					drawerId: next._id as Id<"drawers">,
					...next,
				});
			} else if (entry.type === "updateCompartment" && entry.data.next) {
				const next = entry.data.next as Partial<Compartment> & {
					_id: string;
				};
				const { _id, drawerId, ...rest } = next;
				await updateCompartment({
					authContext: context,
					compartmentId: _id as Id<"compartments">,
					...(drawerId ? { drawerId: drawerId as Id<"drawers"> } : {}),
					...rest,
				});
			}
			setHistoryIndex((prev) => prev + 1);
		} catch (error) {
			toast.error("Redo failed");
		}
	}, [
		canRedo,
		history,
		historyIndex,
		isLockedByMe,
		getRequiredAuthContext,
		updateDrawer,
		updateCompartment,
		toast,
	]);

	// --- Collision detection for drawers ---
	const checkDrawerCollision = useCallback(
		(
			movingDrawerId: string,
			newX: number,
			newY: number,
			newWidth?: number,
			newHeight?: number,
		): boolean => {
			const moving = drawers.find((d) => d._id === movingDrawerId);
			if (!moving) return false;
			const w = newWidth ?? moving.width;
			const h = newHeight ?? moving.height;
			const halfW = w / 2;
			const halfH = h / 2;

			for (const other of drawers) {
				if (other._id === movingDrawerId) continue;
				const oHalfW = other.width / 2;
				const oHalfH = other.height / 2;

				// AABB overlap check
				const overlapX =
					Math.abs(newX - other.x) < halfW + oHalfW;
				const overlapY =
					Math.abs(newY - other.y) < halfH + oHalfH;

				if (overlapX && overlapY) return true;
			}
			return false;
		},
		[drawers],
	);

	// --- Wrapped update handlers with history + collision ---
	const handleUpdateDrawerWithHistory = useCallback(
		async (drawerId: string, updates: Partial<Drawer>) => {
			const drawer = drawers.find((d) => d._id === drawerId);
			if (!drawer) return;

			// Collision detection for position/size changes
			if (updates.x !== undefined || updates.y !== undefined || updates.width !== undefined || updates.height !== undefined) {
				const newX = updates.x ?? drawer.x;
				const newY = updates.y ?? drawer.y;
				const newW = updates.width ?? drawer.width;
				const newH = updates.height ?? drawer.height;
				if (checkDrawerCollision(drawerId, newX, newY, newW, newH)) {
					toast.error("Cannot move drawer: overlaps with another drawer");
					return;
				}
			}

			// Push to history
			pushHistory("updateDrawer", {
				prev: { _id: drawerId, x: drawer.x, y: drawer.y, width: drawer.width, height: drawer.height, label: drawer.label },
				next: { _id: drawerId, ...updates },
			});

			// If drawer size changed, proportionally scale compartments inside
			const newW = updates.width ?? drawer.width;
			const newH = updates.height ?? drawer.height;
			if (newW !== drawer.width || newH !== drawer.height) {
				const scaleX = newW / drawer.width;
				const scaleY = newH / drawer.height;
				for (const comp of drawer.compartments) {
					const scaledW = Math.max(GRID_SIZE, snapToGrid(comp.width * scaleX));
					const scaledH = Math.max(GRID_SIZE, snapToGrid(comp.height * scaleY));
					const scaledX = comp.x * scaleX;
					const scaledY = comp.y * scaleY;
					// Snap the compartment center so its edges align to grid
					const absCenterX = (updates.x ?? drawer.x) + scaledX;
					const absCenterY = (updates.y ?? drawer.y) + scaledY;
					const snappedAbsX = snapCenterToGridEdges(absCenterX, scaledW);
					const snappedAbsY = snapCenterToGridEdges(absCenterY, scaledH);
					const finalRelX = snappedAbsX - (updates.x ?? drawer.x);
					const finalRelY = snappedAbsY - (updates.y ?? drawer.y);
					// Clamp within new drawer bounds
					const halfW = newW / 2;
					const halfH = newH / 2;
					const halfCW = scaledW / 2;
					const halfCH = scaledH / 2;
					const clampedX = Math.max(-halfW + halfCW, Math.min(halfW - halfCW, finalRelX));
					const clampedY = Math.max(-halfH + halfCH, Math.min(halfH - halfCH, finalRelY));
					await handleUpdateCompartment(comp._id, {
						x: clampedX,
						y: clampedY,
						width: scaledW,
						height: scaledH,
					});
				}
			}

			await handleUpdateDrawer(drawerId, updates);
		},
		[drawers, checkDrawerCollision, pushHistory, handleUpdateDrawer, handleUpdateCompartment, snapToGrid, snapCenterToGridEdges, toast],
	);

	const handleUpdateCompartmentWithHistory = useCallback(
		async (compartmentId: string, updates: Partial<Compartment>) => {
			// Find the compartment in drawers
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
			if (foundComp && foundDrawerId) {
				pushHistory("updateCompartment", {
					prev: { _id: compartmentId, drawerId: foundDrawerId, x: foundComp.x, y: foundComp.y, width: foundComp.width, height: foundComp.height },
					next: { _id: compartmentId, ...updates },
				});
			}

			await handleUpdateCompartment(compartmentId, updates);
		},
		[drawers, pushHistory, handleUpdateCompartment],
	);

	// --- Context menu handlers ---
	const handleContextMenu = useCallback(
		(info: {
			screenX: number;
			screenY: number;
			worldX: number;
			worldY: number;
			drawer: DrawerWithCompartments | null;
		}) => {
			setContextMenu({
				x: info.screenX,
				y: info.screenY,
				worldX: info.worldX,
				worldY: info.worldY,
				drawer: info.drawer,
			});
		},
		[],
	);

	const handleContextMenuClose = useCallback(() => {
		setContextMenu(null);
	}, []);

	const handleContextMenuMoveDrawer = useCallback(
		(drawer: Drawer) => {
			setSelectedElement({ type: "drawer", id: drawer._id, data: drawer });
			setIsInspectorOpen(true);
			setTool("select");
		},
		[],
	);

	const handleContextMenuRenameDrawer = useCallback(
		(drawer: Drawer) => {
			setSelectedElement({ type: "drawer", id: drawer._id, data: drawer });
			setIsInspectorOpen(true);
			setDrawerLabelDraft(drawer.label ?? "");
		},
		[],
	);

	const handleContextMenuResizeDrawer = useCallback(
		(drawer: Drawer) => {
			setSelectedElement({ type: "drawer", id: drawer._id, data: drawer });
			setIsInspectorOpen(true);
			setTool("select");
		},
		[],
	);

	const handleContextMenuDeleteDrawer = useCallback(
		(drawer: Drawer) => {
			setPendingDeleteDrawerId(drawer._id);
			setShowDeleteDrawerDialog(true);
		},
		[],
	);

	const handleContextMenuAddDrawer = useCallback(
		async (worldX: number, worldY: number) => {
			const GRID_SIZE = 50;
			const snappedX =
				Math.round((worldX - 75) / GRID_SIZE) * GRID_SIZE + 75;
			const snappedY =
				Math.round((worldY - 50) / GRID_SIZE) * GRID_SIZE + 50;
			await handleCreateDrawer({
				x: snappedX,
				y: snappedY,
				width: 150,
				height: 100,
			});
		},
		[handleCreateDrawer],
	);

	// --- Delete confirmation handlers ---
	const confirmDeleteDrawer = useCallback(async () => {
		if (!pendingDeleteDrawerId) return;
		await handleDeleteDrawer(pendingDeleteDrawerId);
		setPendingDeleteDrawerId(null);
		setShowDeleteDrawerDialog(false);
	}, [pendingDeleteDrawerId, handleDeleteDrawer]);

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

			// Delete selected element (with confirmation)
			if (
				!isTypingTarget &&
				(e.key === "Delete" || e.key === "Backspace") &&
				selectedElement &&
				isLockedByMe
			) {
				e.preventDefault();
				if (selectedElement.type === "drawer") {
					setPendingDeleteDrawerId(selectedElement.id);
					setShowDeleteDrawerDialog(true);
				} else if (selectedElement.type === "compartment") {
					setPendingDeleteCompartmentId(selectedElement.id);
					setShowDeleteCompartmentDialog(true);
				}
			}

			// Ctrl/Cmd + Z to undo
			if (
				!isTypingTarget &&
				(e.ctrlKey || e.metaKey) &&
				e.key === "z" &&
				!e.shiftKey &&
				isLockedByMe
			) {
				e.preventDefault();
				await handleUndo();
			}

			// Ctrl/Cmd + Shift + Z to redo
			if (
				!isTypingTarget &&
				(e.ctrlKey || e.metaKey) &&
				e.key === "z" &&
				e.shiftKey &&
				isLockedByMe
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

	const handleSnapNumber = (value: number) => {
		const GRID_SIZE = 50;
		return Math.round(value / GRID_SIZE) * GRID_SIZE;
	};

	return (
		<div className="fixed inset-0 overflow-hidden bg-white">
			<div id="canvas-container" className="absolute inset-0">
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
					onCreateDrawerFromTool={(drawer) => handleCreateDrawer(drawer)}
					onSplitDrawerFromTool={handleSplitDrawer}
					onSwapCompartments={handleSwapCompartments}
					onUpdateDrawer={handleUpdateDrawerWithHistory}
					onUpdateCompartment={handleUpdateCompartmentWithHistory}
					onViewportChange={handleViewportChange}
					zoomInRef={zoomInRef}
					zoomOutRef={zoomOutRef}
					zoomToFitRef={zoomToFitRef}
					resetViewRef={resetViewRef}
					zoomToLocationRef={zoomToLocationRef}
					compartmentsWithInventory={compartmentsWithInventory}
					highlightedCompartmentIds={highlightedCompartmentIds}
					onContextMenu={handleContextMenu}
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
												handleUpdateDrawer(selectedDrawer._id, {
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
												handleUpdateDrawer(selectedDrawer._id, {
													label: drawerLabelDraft.trim() || undefined,
												})
											}
											disabled={!isLockedByMe || tool !== "select"}
										>
											Save
										</Button>
									</div>
								</div>

								<div className="grid grid-cols-2 gap-2">
									<div className="space-y-1">
										<Label>X</Label>
										<Input
											type="number"
											value={Math.round(selectedDrawer.x)}
											onChange={(e) =>
												handleUpdateDrawer(selectedDrawer._id, {
													x: snapCenterToGridEdges(
														Number(e.target.value),
														selectedDrawer.width,
													),
												})
											}
											disabled={!isLockedByMe || tool !== "select"}
										/>
									</div>
									<div className="space-y-1">
										<Label>Y</Label>
										<Input
											type="number"
											value={Math.round(selectedDrawer.y)}
											onChange={(e) =>
												handleUpdateDrawer(selectedDrawer._id, {
													y: snapCenterToGridEdges(
														Number(e.target.value),
														selectedDrawer.height,
													),
												})
											}
											disabled={!isLockedByMe || tool !== "select"}
										/>
									</div>
									<div className="space-y-1">
										<Label>Width</Label>
										<Input
											type="number"
											value={Math.round(selectedDrawer.width)}
											onChange={(e) => {
												const nextWidth = Math.max(
													GRID_SIZE,
													handleSnapNumber(Number(e.target.value)),
												);
												handleUpdateDrawer(selectedDrawer._id, {
													width: nextWidth,
													x: snapCenterToGridEdges(selectedDrawer.x, nextWidth),
												});
											}}
											disabled={!isLockedByMe || tool !== "select"}
											min={50}
										/>
									</div>
									<div className="space-y-1">
										<Label>Height</Label>
										<Input
											type="number"
											value={Math.round(selectedDrawer.height)}
											onChange={(e) => {
												const nextHeight = Math.max(
													GRID_SIZE,
													handleSnapNumber(Number(e.target.value)),
												);
												handleUpdateDrawer(selectedDrawer._id, {
													height: nextHeight,
													y: snapCenterToGridEdges(
														selectedDrawer.y,
														nextHeight,
													),
												});
											}}
											disabled={!isLockedByMe || tool !== "select"}
											min={50}
										/>
									</div>
								</div>

								<div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
									<div className="text-xs font-medium text-amber-900">
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
									<div className="mt-2 flex items-center justify-between gap-2">
										<div className="text-xs text-amber-800">
											Reducing rows/cols may delete compartments (and any empty
											data in them).
										</div>
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												if (!selectedDrawer) return;
												const rows = Math.max(1, Math.floor(gridRows));
												const cols = Math.max(1, Math.floor(gridCols));
												const newCells = rows * cols;
												const existing = selectedDrawer.compartments.length;

												if (newCells < existing) {
													pendingGridRef.current = { rows, cols };
													setShowGridWarning(true);
													return;
												}

												applyGrid(rows, cols);
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
											setPendingDeleteDrawerId(selectedDrawer._id);
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
												handleUpdateCompartment(selectedCompartment._id, {
													label: compartmentLabelDraft.trim() || undefined,
												});
											}}
											disabled={!isLockedByMe || tool !== "select"}
											placeholder="Compartment name"
										/>
										<Button
											size="sm"
											variant="outline"
											onClick={() =>
												handleUpdateCompartment(selectedCompartment._id, {
													label: compartmentLabelDraft.trim() || undefined,
												})
											}
											disabled={!isLockedByMe || tool !== "select"}
										>
											Save
										</Button>
									</div>
								</div>

								<div className="grid grid-cols-2 gap-2">
									<div className="space-y-1">
										<Label>Rel X</Label>
										<Input
											type="number"
											value={Math.round(selectedCompartment.x)}
											onChange={(e) => {
												const desiredRelX = Number(e.target.value);
												const desiredAbsCenterX =
													selectedDrawer.x + desiredRelX;
												const snappedAbsCenterX = snapCenterToGridEdges(
													desiredAbsCenterX,
													selectedCompartment.width,
												);
												handleUpdateCompartment(selectedCompartment._id, {
													x: snappedAbsCenterX - selectedDrawer.x,
												});
											}}
											disabled={!isLockedByMe || tool !== "select"}
										/>
									</div>
									<div className="space-y-1">
										<Label>Rel Y</Label>
										<Input
											type="number"
											value={Math.round(selectedCompartment.y)}
											onChange={(e) => {
												const desiredRelY = Number(e.target.value);
												const desiredAbsCenterY =
													selectedDrawer.y + desiredRelY;
												const snappedAbsCenterY = snapCenterToGridEdges(
													desiredAbsCenterY,
													selectedCompartment.height,
												);
												handleUpdateCompartment(selectedCompartment._id, {
													y: snappedAbsCenterY - selectedDrawer.y,
												});
											}}
											disabled={!isLockedByMe || tool !== "select"}
										/>
									</div>
									<div className="space-y-1">
										<Label>Width</Label>
										<Input
											type="number"
											value={Math.round(selectedCompartment.width)}
											onChange={(e) => {
												const nextWidth = Math.max(
													GRID_SIZE,
													handleSnapNumber(Number(e.target.value)),
												);
												const absCenterX =
													selectedDrawer.x + selectedCompartment.x;
												const snappedAbsCenterX = snapCenterToGridEdges(
													absCenterX,
													nextWidth,
												);
												handleUpdateCompartment(selectedCompartment._id, {
													width: nextWidth,
													x: snappedAbsCenterX - selectedDrawer.x,
												});
											}}
											disabled={!isLockedByMe || tool !== "select"}
											min={50}
										/>
									</div>
									<div className="space-y-1">
										<Label>Height</Label>
										<Input
											type="number"
											value={Math.round(selectedCompartment.height)}
											onChange={(e) => {
												const nextHeight = Math.max(
													GRID_SIZE,
													handleSnapNumber(Number(e.target.value)),
												);
												const absCenterY =
													selectedDrawer.y + selectedCompartment.y;
												const snappedAbsCenterY = snapCenterToGridEdges(
													absCenterY,
													nextHeight,
												);
												handleUpdateCompartment(selectedCompartment._id, {
													height: nextHeight,
													y: snappedAbsCenterY - selectedDrawer.y,
												});
											}}
											disabled={!isLockedByMe || tool !== "select"}
											min={50}
										/>
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
				onOpenChange={setShowDeleteDrawerDialog}
				title="Delete Drawer"
				description="Are you sure you want to delete this drawer? All compartments inside it will also be deleted."
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

			{/* Context menu overlay */}
			<EditorContextMenu
				state={contextMenu}
				isLockedByMe={isLockedByMe}
				onClose={handleContextMenuClose}
				onMoveDrawer={handleContextMenuMoveDrawer}
				onRenameDrawer={handleContextMenuRenameDrawer}
				onResizeDrawer={handleContextMenuResizeDrawer}
				onDeleteDrawer={handleContextMenuDeleteDrawer}
				onAddDrawerHere={handleContextMenuAddDrawer}
				onUndo={handleUndo}
				onRedo={handleRedo}
				canUndo={canUndo}
				canRedo={canRedo}
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
