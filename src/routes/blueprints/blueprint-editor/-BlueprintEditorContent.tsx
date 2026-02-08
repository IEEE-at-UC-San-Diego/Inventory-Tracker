import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlueprintLock } from "@/components/blueprint";
import type { BlueprintTool } from "@/components/blueprint/BlueprintControls";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useBlueprintHistory } from "@/hooks/useBlueprintHistory";
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
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { BlueprintEditorView } from "./-BlueprintEditorView";
import { buildHistoryMutations } from "./-historyMutations";
import { useBlueprintEditorBasicHandlers } from "./-useBlueprintEditorBasicHandlers";
import { useBlueprintEditorDerivedState } from "./-useBlueprintEditorDerivedState";
import { useBlueprintEditorShortcuts } from "./-useBlueprintEditorShortcuts";
import {
	deleteCompartmentWithHistory,
	swapCompartmentsWithHistory,
	updateCompartmentWithHistory,
} from "./actions/-compartmentActions";
import {
	deleteDrawersWithHistory,
	updateDrawersBulkWithHistory,
	updateDrawerWithHistory,
} from "./actions/-drawerActions";
import { splitDrawerWithHistory } from "./actions/-drawerSplitActions";

export function BlueprintEditorContent() {
	const { blueprintId } = useParams({ from: "/blueprints/$blueprintId" });
	const navigate = useNavigate();
	const search = useSearch({ from: "/blueprints/$blueprintId" });

	useEffect(() => {
		if (blueprintId === "new") {
			navigate({ to: "/blueprints/new" });
		}
	}, [blueprintId, navigate]);

	const { authContext, getFreshAuthContext, isLoading } = useAuth();
	const { canEdit } = useRole();
	const { toast } = useToast();

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

	const [mode, setMode] = useState<CanvasMode>(
		search.mode === "edit" ? "edit" : "view",
	);
	const [selectedElement, setSelectedElement] = useState<SelectedElement>(null);
	const [selectedDrawerIds, setSelectedDrawerIds] = useState<string[]>([]);
	const [highlightedCompartmentIds, setHighlightedCompartmentIds] = useState<
		string[]
	>([]);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [isEditingName, setIsEditingName] = useState(false);
	const [nameValue, setNameValue] = useState("");
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
	const [viewport, setViewport] = useState<Viewport>({ zoom: 1, x: 0, y: 0 });
	const [hasChanges, setHasChanges] = useState(false);
	const [tool, setTool] = useState<BlueprintTool>("select");

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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const createDividerMutation = useMutation((api as any).dividers.mutations.create);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const updateDividerMutation = useMutation((api as any).dividers.mutations.update);

	const blueprintData = useQuery(
		api.blueprints.queries.getWithHierarchy,
		authContext
			? { authContext, blueprintId: blueprintId as Id<"blueprints"> }
			: undefined,
		{ enabled: !!authContext && !isLoading },
	);
	const inventoryData = useQuery(
		api.inventory.queries.list,
		authContext ? { authContext, includeDetails: false } : undefined,
		{ enabled: !!authContext && !isLoading },
	);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const dividersData = useQuery(
		(api as any).dividers.queries.listByBlueprint,
		authContext
			? { authContext, blueprintId: blueprintId as Id<"blueprints"> }
			: undefined,
		{ enabled: !!authContext && !isLoading },
	);
	const dividers = useMemo(() => {
		return (dividersData ?? []) as Array<{
			_id: string;
			x1: number;
			y1: number;
			x2: number;
			y2: number;
			thickness: number;
		}>;
	}, [dividersData]);

	const partCompartmentsQuery = useQuery(
		api.compartments.queries.findByPart,
		authContext && search.partId
			? { authContext, partId: search.partId as Id<"parts"> }
			: undefined,
		{ enabled: !!authContext && !isLoading && !!search.partId },
	);

	const blueprint = blueprintData ?? null;
	const drawers = useMemo<DrawerWithCompartments[]>(() => {
		return blueprint?.drawers || [];
	}, [blueprint]);

	const restoreSelection = useCallback(
		(snapshot: {
			selectedDrawerIds: string[];
			selectedCompartmentId: string | null;
		}) => {
			setSelectedDrawerIds(snapshot.selectedDrawerIds);
		},
		[],
	);
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

	const historyMutations = useMemo(
		() =>
			buildHistoryMutations({
				createDrawer,
				updateDrawer,
				deleteDrawer,
				createCompartment,
				updateCompartment,
				deleteCompartment,
				updateBlueprint,
			}),
		[
			createCompartment,
			createDrawer,
			deleteCompartment,
			deleteDrawer,
			updateBlueprint,
			updateCompartment,
			updateDrawer,
		],
	);

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
				} catch {
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

	useEffect(() => {
		setMode(isLockedByMe ? "edit" : "view");
	}, [isLockedByMe]);

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
		selection: { selectedElement, selectedDrawerIds },
		isLockedByMe,
		restoreSelection,
		restoreViewport,
		onError: (title, message) => toast.error(title, message),
	});

	const zoomInRef = useRef<(() => void) | null>(null);
	const zoomOutRef = useRef<(() => void) | null>(null);
	const zoomToFitRef = useRef<(() => void) | null>(null);
	const resetViewRef = useRef<(() => void) | null>(null);
	const zoomToLocationRef = useRef<
		((x: number, y: number, w?: number, h?: number) => void) | null
	>(null);
	const hasAppliedInitialViewRef = useRef(false);
	const lastBlueprintIdRef = useRef<string | null>(null);
	const toggleSplitOrientationRef = useRef<(() => void) | null>(null);
	const [splitOrientation, setSplitOrientationLocal] = useState<
		"vertical" | "horizontal"
	>("vertical");

	const handleSplitOrientationSync = useCallback(
		(orientation: "vertical" | "horizontal") => {
			setSplitOrientationLocal(orientation);
		},
		[],
	);

	const handleSplitOrientationChange = useCallback(() => {
		toggleSplitOrientationRef.current?.();
	}, []);

	const {
		canvasSize,
		selectedDrawer,
		selectedCompartment,
		applySelection,
		drawerLabelDraft,
		setDrawerLabelDraft,
		compartmentLabelDraft,
		setCompartmentLabelDraft,
		gridRows,
		setGridRows,
		gridCols,
		setGridCols,
		showGridWarning,
		setShowGridWarning,
		pendingGridRef,
		applyGrid,
		requestApplyGrid,
		compartmentsWithInventory,
	} = useBlueprintEditorDerivedState({
		blueprintData,
		drawers,
		selectedElement,
		selectedDrawerIds,
		setSelectedElement,
		setSelectedDrawerIds,
		setNameValue,
		tool,
		setTool,
		isLockedByMe,
		highlightPartId: search.partId,
		partCompartmentsQuery,
		setHighlightedCompartmentIds,
		inventoryData,
		getRequiredAuthContext,
		setGridForDrawer,
		setHasChanges,
		toast,
	});

	useEffect(() => {
		if (lastBlueprintIdRef.current !== blueprintId) {
			lastBlueprintIdRef.current = blueprintId;
			hasAppliedInitialViewRef.current = false;
		}
		if (hasAppliedInitialViewRef.current) return;
		if (!blueprint) return;
		if (!zoomToFitRef.current || !zoomToLocationRef.current) return;

		if (search.compartmentId) {
			for (const drawer of drawers) {
				const compartment = drawer.compartments.find(
					(item) => item._id === search.compartmentId,
				);
				if (!compartment) continue;
				zoomToLocationRef.current(
					drawer.x + compartment.x,
					drawer.y + compartment.y,
					compartment.width,
					compartment.height,
				);
				hasAppliedInitialViewRef.current = true;
				return;
			}
		}

		if (search.drawerId) {
			const drawer = drawers.find((item) => item._id === search.drawerId);
			if (drawer) {
				zoomToLocationRef.current(
					drawer.x,
					drawer.y,
					drawer.width,
					drawer.height,
				);
				hasAppliedInitialViewRef.current = true;
				return;
			}
		}

		if (search.partId) {
			if (partCompartmentsQuery === undefined) return;
			const firstCompartment = partCompartmentsQuery[0];
			if (firstCompartment) {
				const drawer = drawers.find((d) => d._id === firstCompartment.drawerId);
				if (drawer) {
					zoomToLocationRef.current(
						drawer.x + firstCompartment.x,
						drawer.y + firstCompartment.y,
						firstCompartment.width,
						firstCompartment.height,
					);
					hasAppliedInitialViewRef.current = true;
					return;
				}
			}
		}

		zoomToFitRef.current();
		hasAppliedInitialViewRef.current = true;
	}, [
		blueprint,
		blueprintId,
		drawers,
		partCompartmentsQuery,
		search.compartmentId,
		search.drawerId,
		search.partId,
	]);

	const { handleSaveName, handleDelete, handleCreateDrawer } =
		useBlueprintEditorBasicHandlers({
			blueprintId,
			blueprint: blueprint ? { name: blueprint.name } : null,
			nameValue,
			drawers,
			getRequiredAuthContext,
			updateBlueprint,
			deleteBlueprint,
			createDrawer,
			pushHistoryEntry,
			toast,
			navigate,
			setIsEditingName,
			setTool,
		});

	const handleDeleteDrawers = useCallback(
		async (drawerIds: string[], force?: boolean) => {
			await deleteDrawersWithHistory({
				drawerIds,
				drawers,
				force,
				getRequiredAuthContext,
				deleteDrawer,
				pushHistoryEntry,
				setSelectionCleared: () => {
					setSelectedElement(null);
					setSelectedDrawerIds([]);
				},
				setHasChanges,
				toast,
			});
		},
		[deleteDrawer, drawers, getRequiredAuthContext, pushHistoryEntry, toast],
	);

	const handleSwapCompartments = useCallback(
		async (aCompartmentId: string, bCompartmentId: string) => {
			const ok = await swapCompartmentsWithHistory({
				aCompartmentId,
				bCompartmentId,
				drawers,
				getRequiredAuthContext,
				swapCompartments,
				pushHistoryEntry,
			});
			if (ok) setHasChanges(true);
		},
		[drawers, getRequiredAuthContext, pushHistoryEntry, swapCompartments],
	);

	const handleDeleteCompartment = useCallback(
		async (compartmentId: string, force?: boolean) => {
			const ok = await deleteCompartmentWithHistory({
				compartmentId,
				drawers,
				force,
				getRequiredAuthContext,
				deleteCompartment,
				setGridForDrawer,
				toast,
				pushHistoryEntry,
			});
			if (ok) {
				setSelectedElement(null);
				setSelectedDrawerIds([]);
				setHasChanges(true);
				toast.success("Compartment deleted");
			}
		},
		[
			deleteCompartment,
			drawers,
			getRequiredAuthContext,
			pushHistoryEntry,
			setGridForDrawer,
			toast,
		],
	);

	const handleViewportChange = useCallback((nextViewport: Viewport) => {
		setZoomLevel(Math.round(nextViewport.zoom * 100));
	}, []);

	const handleSplitDrawer = useCallback(
		async (split: {
			drawerId: string;
			orientation: "vertical" | "horizontal";
			position: number;
			targetCompartmentId?: string | null;
		}) => {
			const didSplit = await splitDrawerWithHistory({
				split,
				drawers,
				isLockedByMe,
				getRequiredAuthContext,
				createCompartment,
				updateCompartment,
				pushHistoryEntry,
				setHasChanges,
				toast,
			});
			if (didSplit) {
				// Tool persistence: keep the split tool active for repeated use
			}
		},
		[
			createCompartment,
			drawers,
			getRequiredAuthContext,
			isLockedByMe,
			pushHistoryEntry,
			toast,
			updateCompartment,
		],
	);

	const handleZoomIn = useCallback(() => zoomInRef.current?.(), []);
	const handleZoomOut = useCallback(() => zoomOutRef.current?.(), []);
	const handleZoomToFit = useCallback(() => zoomToFitRef.current?.(), []);
	const handleResetView = useCallback(() => resetViewRef.current?.(), []);

	const handleClearHighlight = useCallback(() => {
		setHighlightedCompartmentIds([]);
		navigate({
			to: "/blueprints/$blueprintId",
			params: { blueprintId },
			search: { partId: undefined, mode: undefined },
		});
	}, [blueprintId, navigate]);

	const handleUpdateDrawerWithHistory = useCallback(
		async (drawerId: string, updates: Partial<Drawer>) => {
			await updateDrawerWithHistory({
				drawerId,
				updates,
				drawers,
				getRequiredAuthContext,
				updateDrawer,
				updateCompartment,
				pushHistoryEntry,
				setHasChanges,
				toast,
			});
		},
		[
			drawers,
			getRequiredAuthContext,
			pushHistoryEntry,
			toast,
			updateCompartment,
			updateDrawer,
		],
	);

	const handleResizeDrawer = useCallback(
		(
			drawerId: string,
			updates: { x: number; y: number; width: number; height: number },
		) => {
			void handleUpdateDrawerWithHistory(drawerId, updates);
		},
		[handleUpdateDrawerWithHistory],
	);

	const handleCreateDivider = useCallback(
		async (divider: { x1: number; y1: number; x2: number; y2: number }) => {
			const authCtx = await getRequiredAuthContext();
			await createDividerMutation({
				authContext: authCtx,
				blueprintId: blueprintId as Id<"blueprints">,
				x1: divider.x1,
				y1: divider.y1,
				x2: divider.x2,
				y2: divider.y2,
			});
			setHasChanges(true);
		},
		[blueprintId, createDividerMutation, getRequiredAuthContext],
	);

	const handleUpdateDivider = useCallback(
		async (dividerId: string, updates: { x1: number; y1: number; x2: number; y2: number }) => {
			const authCtx = await getRequiredAuthContext();
			await updateDividerMutation({
				authContext: authCtx,
				dividerId: dividerId as Id<"dividers">,
				...updates,
			});
			setHasChanges(true);
		},
		[updateDividerMutation, getRequiredAuthContext],
	);

	const handleUpdateCompartmentWithHistory = useCallback(
		async (compartmentId: string, updates: Partial<Compartment>) => {
			await updateCompartmentWithHistory({
				compartmentId,
				updates,
				drawers,
				getRequiredAuthContext,
				updateCompartment,
				pushHistoryEntry,
			});
			setHasChanges(true);
		},
		[drawers, getRequiredAuthContext, pushHistoryEntry, updateCompartment],
	);

	const handleUpdateDrawersBulkWithHistory = useCallback(
		async (updates: Array<{ drawerId: string; x: number; y: number }>) => {
			await updateDrawersBulkWithHistory({
				updates,
				drawers,
				getRequiredAuthContext,
				updateDrawer,
				pushHistoryEntry,
				setHasChanges,
				toast,
			});
		},
		[drawers, getRequiredAuthContext, pushHistoryEntry, toast, updateDrawer],
	);

	const confirmDeleteDrawer = useCallback(async () => {
		if (pendingDeleteDrawerIds.length === 0) return;
		await handleDeleteDrawers(pendingDeleteDrawerIds);
		setPendingDeleteDrawerIds([]);
		setShowDeleteDrawerDialog(false);
	}, [pendingDeleteDrawerIds, handleDeleteDrawers]);

	const forceDeleteDrawer = useCallback(async () => {
		if (pendingDeleteDrawerIds.length === 0) return;
		await handleDeleteDrawers(pendingDeleteDrawerIds, true);
		setPendingDeleteDrawerIds([]);
		setShowDeleteDrawerDialog(false);
	}, [pendingDeleteDrawerIds, handleDeleteDrawers]);

	const confirmDeleteCompartment = useCallback(async () => {
		if (!pendingDeleteCompartmentId) return;
		await handleDeleteCompartment(pendingDeleteCompartmentId);
		setPendingDeleteCompartmentId(null);
		setShowDeleteCompartmentDialog(false);
	}, [pendingDeleteCompartmentId, handleDeleteCompartment]);

	const forceDeleteCompartment = useCallback(async () => {
		if (!pendingDeleteCompartmentId) return;
		await handleDeleteCompartment(pendingDeleteCompartmentId, true);
		setPendingDeleteCompartmentId(null);
		setShowDeleteCompartmentDialog(false);
	}, [pendingDeleteCompartmentId, handleDeleteCompartment]);

	useBlueprintEditorShortcuts({
		selectedDrawerIds,
		selectedElement,
		isLockedByMe,
		handleUndo,
		handleRedo,
		setPendingDeleteDrawerIds,
		setShowDeleteDrawerDialog,
		setPendingDeleteCompartmentId,
		setShowDeleteCompartmentDialog,
		toast,
	});

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
		<BlueprintEditorView
			blueprintId={blueprintId}
			blueprint={{ name: blueprint.name, updatedAt: blueprint.updatedAt }}
			canvasSize={canvasSize}
			drawers={drawers}
			selectedElement={selectedElement}
			selectedDrawerIds={selectedDrawerIds}
			selectedDrawer={selectedDrawer}
			selectedCompartment={selectedCompartment}
			mode={mode}
			tool={tool}
			isLocked={isLocked}
			isLockedByMe={isLockedByMe}
			zoomLevel={zoomLevel}
			highlightedCompartmentIds={highlightedCompartmentIds}
			compartmentsWithInventory={compartmentsWithInventory}
			dividers={dividers}
			isInspectorOpen={isInspectorOpen}
			isEditingName={isEditingName}
			nameValue={nameValue}
			drawerLabelDraft={drawerLabelDraft}
			compartmentLabelDraft={compartmentLabelDraft}
			gridRows={gridRows}
			gridCols={gridCols}
			showDeleteDialog={showDeleteDialog}
			showGridWarning={showGridWarning}
			showDeleteDrawerDialog={showDeleteDrawerDialog}
			showDeleteCompartmentDialog={showDeleteCompartmentDialog}
			showVersionHistory={showVersionHistory}
			showActionHistory={showActionHistory}
			pendingDeleteDrawerIds={pendingDeleteDrawerIds}
			pendingDeleteCompartmentId={pendingDeleteCompartmentId}
			lockLoading={lockLoading}
			canEdit={canEdit}
			canUndoNow={canUndoNow}
			canRedoNow={canRedoNow}
			isApplyingHistory={isApplyingHistory}
			historyState={historyState}
			zoomInRef={zoomInRef}
			zoomOutRef={zoomOutRef}
			zoomToFitRef={zoomToFitRef}
			resetViewRef={resetViewRef}
			zoomToLocationRef={zoomToLocationRef}
			splitOrientation={splitOrientation}
			onSplitOrientationChange={handleSplitOrientationChange}
			onSplitOrientationSync={handleSplitOrientationSync}
			toggleSplitOrientationRef={toggleSplitOrientationRef}
			onSelectionChange={applySelection}
			onCreateDrawerFromTool={handleCreateDrawer}
			onSplitDrawerFromTool={handleSplitDrawer}
			onSwapCompartments={handleSwapCompartments}
			onUpdateDrawers={handleUpdateDrawersBulkWithHistory}
			onUpdateCompartment={handleUpdateCompartmentWithHistory}
			onResizeDrawer={handleResizeDrawer}
			onCreateDivider={handleCreateDivider}
			onUpdateDivider={handleUpdateDivider}
			onViewportChange={handleViewportChange}
			onToolChange={setTool}
			onZoomIn={handleZoomIn}
			onZoomOut={handleZoomOut}
			onZoomToFit={handleZoomToFit}
			onResetView={handleResetView}
			onNavigateBack={() => navigate({ to: "/blueprints" })}
			onNameChange={setNameValue}
			onNameEditStart={() => {
				if (canEdit()) setIsEditingName(true);
			}}
			onNameEditCancel={() => {
				setIsEditingName(false);
				setNameValue(blueprint.name);
			}}
			onSaveName={() => void handleSaveName()}
			onUndo={handleUndo}
			onRedo={handleRedo}
			onDeleteSelected={() => {
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
			onAcquireLock={acquireLock}
			onReleaseLock={releaseLock}
			onOpenDeleteBlueprint={() => setShowDeleteDialog(true)}
			onCloseDeleteBlueprint={setShowDeleteDialog}
			onConfirmDeleteBlueprint={() => void handleDelete()}
			onOpenInspector={() => setIsInspectorOpen(true)}
			onCloseInspector={() => setIsInspectorOpen(false)}
			onOpenDeleteDrawers={(drawerIds) => {
				setPendingDeleteDrawerIds(drawerIds);
				setShowDeleteDrawerDialog(true);
			}}
			onCloseDeleteDrawers={(open) => {
				setShowDeleteDrawerDialog(open);
				if (!open) setPendingDeleteDrawerIds([]);
			}}
			onConfirmDeleteDrawers={confirmDeleteDrawer}
			onForceDeleteDrawers={forceDeleteDrawer}
			onOpenDeleteCompartment={(compartmentId) => {
				setPendingDeleteCompartmentId(compartmentId);
				setShowDeleteCompartmentDialog(true);
			}}
			onCloseDeleteCompartment={setShowDeleteCompartmentDialog}
			onConfirmDeleteCompartment={confirmDeleteCompartment}
			onForceDeleteCompartment={forceDeleteCompartment}
			onDrawerLabelDraftChange={setDrawerLabelDraft}
			onCompartmentLabelDraftChange={setCompartmentLabelDraft}
			onSaveDrawerLabel={() => {
				if (!selectedDrawer) return;
				void handleUpdateDrawerWithHistory(selectedDrawer._id, {
					label: drawerLabelDraft.trim() || undefined,
				});
			}}
			onSaveCompartmentLabel={() => {
				if (!selectedCompartment) return;
				void handleUpdateCompartmentWithHistory(selectedCompartment._id, {
					label: compartmentLabelDraft.trim() || undefined,
				});
			}}
			onGridRowsChange={setGridRows}
			onGridColsChange={setGridCols}
			onRequestApplyGrid={requestApplyGrid}
			onOpenGridWarning={setShowGridWarning}
			onConfirmGridWarning={async () => {
				const pending = pendingGridRef.current;
				if (!pending) return;
				pendingGridRef.current = null;
				await applyGrid(pending.rows, pending.cols);
				setShowGridWarning(false);
			}}
			onClearHighlight={handleClearHighlight}
			onShowVersionHistory={setShowVersionHistory}
			onShowActionHistory={setShowActionHistory}
		/>
	);
}
