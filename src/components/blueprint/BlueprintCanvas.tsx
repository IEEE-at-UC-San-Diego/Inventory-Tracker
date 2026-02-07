import type { Stage as KonvaStage } from "konva/lib/Stage";
import {
	forwardRef,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react";
import type React from "react";
import type {
	CanvasMode,
	Compartment,
	Drawer,
	DrawerWithCompartments,
	SelectedElement,
	Viewport,
} from "@/types";
import type { BlueprintTool } from "./BlueprintControls";
import { BlueprintCanvasStage } from "./BlueprintCanvasStage";
import { useBlueprintCanvasCompartmentDrag } from "./useBlueprintCanvasCompartmentDrag";
import { useBlueprintCanvasPointerInteractions } from "./useBlueprintCanvasPointerInteractions";
import { useCanvasViewport } from "./useCanvasViewport";

interface BlueprintCanvasProps {
	width: number;
	height: number;
	drawers: DrawerWithCompartments[];
	selectedElement: SelectedElement;
	selectedDrawerIds: string[];
	mode: CanvasMode;
	tool?: BlueprintTool;
	isLocked: boolean;
	isLockedByMe: boolean;
	highlightedPartId?: string;
	highlightedCompartmentIds?: string[];
	onSelectionChange: (next: {
		selectedElement: SelectedElement;
		selectedDrawerIds: string[];
	}) => void;
	onCompartmentDoubleClick?: (compartment: Compartment, drawer: Drawer) => void;
	onCreateDrawerFromTool?: (drawer: {
		x: number;
		y: number;
		width: number;
		height: number;
	}) => void;
	onSplitDrawerFromTool?: (split: {
		drawerId: string;
		orientation: "vertical" | "horizontal";
		position: number;
		targetCompartmentId?: string | null;
	}) => void;
	onSwapCompartments?: (
		aCompartmentId: string,
		bCompartmentId: string,
	) => Promise<void> | void;
	onUpdateDrawers?: (
		updates: Array<{ drawerId: string; x: number; y: number }>,
	) => void;
	onUpdateCompartment: (
		compartmentId: string,
		updates: Partial<Compartment>,
	) => void;
	onViewportChange?: (viewport: Viewport) => void;
	zoomInRef?: React.MutableRefObject<(() => void) | null>;
	zoomOutRef?: React.MutableRefObject<(() => void) | null>;
	zoomToFitRef?: React.MutableRefObject<(() => void) | null>;
	resetViewRef?: React.MutableRefObject<(() => void) | null>;
	zoomToLocationRef?: React.MutableRefObject<
		| ((
				targetX: number,
				targetY: number,
				targetWidth?: number,
				targetHeight?: number,
		  ) => void)
		| null
	>;
	compartmentsWithInventory?: Map<string, number>;
}

const GRID_SIZE = 50;
const GRID_COLOR = "#e2e8f0";

export const BlueprintCanvas = forwardRef(function BlueprintCanvas(
	{
		width,
		height,
		drawers,
		selectedElement,
		selectedDrawerIds,
		mode,
		tool = "select",
		isLocked,
		isLockedByMe,
		highlightedCompartmentIds,
		onSelectionChange,
		onCompartmentDoubleClick,
		onCreateDrawerFromTool,
		onSplitDrawerFromTool,
		onSwapCompartments,
		onUpdateDrawers,
		onUpdateCompartment,
		onViewportChange,
		zoomInRef,
		zoomOutRef,
		zoomToFitRef,
		resetViewRef,
		zoomToLocationRef,
		compartmentsWithInventory,
	}: BlueprintCanvasProps,
	_ref,
) {
	const stageRef = useRef<KonvaStage>(null);

	const selectedDrawerIdSet = useMemo(() => {
		return new Set(selectedDrawerIds);
	}, [selectedDrawerIds]);

	const checkBulkMoveCollision = useCallback(
		(
			drawerIds: string[],
			positionOverrides: Record<string, { x: number; y: number }>,
			allDrawers: DrawerWithCompartments[],
		): boolean => {
			for (const drawerId of drawerIds) {
				const newPos = positionOverrides[drawerId];
				if (!newPos) continue;

				for (const otherId of drawerIds) {
					if (drawerId === otherId) continue;
					const otherPos = positionOverrides[otherId];
					if (!otherPos) continue;

					const d1 = allDrawers.find((d) => d._id === drawerId);
					const d2 = allDrawers.find((d) => d._id === otherId);
					if (!d1 || !d2) continue;

					const halfW1 = d1.width / 2;
					const halfH1 = d1.height / 2;
					const halfW2 = d2.width / 2;
					const halfH2 = d2.height / 2;

					const overlapX = Math.abs(newPos.x - otherPos.x) < halfW1 + halfW2;
					const overlapY = Math.abs(newPos.y - otherPos.y) < halfH1 + halfH2;

					if (overlapX && overlapY) return true;
				}
			}

			const nonSelectedDrawers = allDrawers.filter(
				(d) => !drawerIds.includes(d._id),
			);
			for (const drawerId of drawerIds) {
				const newPos = positionOverrides[drawerId];
				if (!newPos) continue;

				const movingDrawer = allDrawers.find((d) => d._id === drawerId);
				if (!movingDrawer) continue;

				const halfDW = movingDrawer.width / 2;
				const halfDH = movingDrawer.height / 2;

				for (const other of nonSelectedDrawers) {
					const halfW = other.width / 2;
					const halfH = other.height / 2;

					const overlapX = Math.abs(newPos.x - other.x) < halfDW + halfW;
					const overlapY = Math.abs(newPos.y - other.y) < halfDH + halfH;

					if (overlapX && overlapY) return true;
				}
			}
			return false;
		},
		[],
	);

	const {
		viewport,
		zoom,
		zoomIn,
		zoomOut,
		zoomToFit,
		resetView,
		zoomToLocation,
		pan,
	} = useCanvasViewport({
		containerWidth: width,
		containerHeight: height,
		drawers,
	});

	useEffect(() => {
		if (zoomInRef) zoomInRef.current = zoomIn;
		if (zoomOutRef) zoomOutRef.current = zoomOut;
		if (zoomToFitRef) zoomToFitRef.current = zoomToFit;
		if (resetViewRef) resetViewRef.current = resetView;
		if (zoomToLocationRef) {
			zoomToLocationRef.current = (
				targetX: number,
				targetY: number,
				targetWidth?: number,
				targetHeight?: number,
			) => {
				zoomToLocation(targetX, targetY, targetWidth, targetHeight, {
					animate: true,
					duration: 0.5,
				});
			};
		}
	}, [
		zoomIn,
		zoomOut,
		zoomToFit,
		resetView,
		zoomToLocation,
		zoomInRef,
		zoomOutRef,
		zoomToFitRef,
		resetViewRef,
		zoomToLocationRef,
	]);

	useEffect(() => {
		onViewportChange?.(viewport);
	}, [viewport, onViewportChange]);

	const snapToGrid = useCallback((value: number): number => {
		return Math.round(value / GRID_SIZE) * GRID_SIZE;
	}, []);

	const drawersByZDesc = useMemo(() => {
		return [...drawers].sort((a, b) => b.zIndex - a.zIndex);
	}, [drawers]);

	const findDrawerAtWorldPoint = useCallback(
		(point: { x: number; y: number }): DrawerWithCompartments | null => {
			for (const drawer of drawersByZDesc) {
				if (drawer.rotation !== 0) continue;
				const halfW = drawer.width / 2;
				const halfH = drawer.height / 2;
				if (
					Math.abs(point.x - drawer.x) <= halfW &&
					Math.abs(point.y - drawer.y) <= halfH
				) {
					return drawer;
				}
			}
			return null;
		},
		[drawersByZDesc],
	);

	const findCompartmentAtWorldPoint = useCallback(
		(
			drawer: DrawerWithCompartments,
			point: { x: number; y: number },
		): Compartment | null => {
			if (drawer.rotation !== 0) return null;
			for (const compartment of drawer.compartments) {
				const centerX = drawer.x + compartment.x;
				const centerY = drawer.y + compartment.y;
				if (
					Math.abs(point.x - centerX) <= compartment.width / 2 &&
					Math.abs(point.y - centerY) <= compartment.height / 2
				) {
					return compartment;
				}
			}
			return null;
		},
		[],
	);

	const {
		dragState,
		dragHover,
		dragOverlays,
		handleCompartmentDragStart,
		handleCompartmentDragMove,
		handleCompartmentDragEnd,
	} = useBlueprintCanvasCompartmentDrag({
		drawers,
		snapToGrid,
		findDrawerAtWorldPoint,
		findCompartmentAtWorldPoint,
		onSwapCompartments,
		onUpdateCompartment,
	});

	const {
		isPanning,
		draftDrawer,
		draftSplit,
		hoverSplit,
		selectionBox,
		drawerPositionOverrides,
		invalidDrop,
		handleWheel,
		handleMouseDown,
		handleMouseMove,
		handleMouseUp,
	} = useBlueprintCanvasPointerInteractions({
		stageRef,
		drawers,
		viewport,
		mode,
		tool,
		isLockedByMe,
		selectedElement,
		selectedDrawerIdSet,
		dragStateActive: dragState !== null,
		gridSize: GRID_SIZE,
		snapToGrid,
		zoom,
		pan,
		findDrawerAtWorldPoint,
		findCompartmentAtWorldPoint,
		checkBulkMoveCollision,
		onSelectionChange,
		onCreateDrawerFromTool,
		onSplitDrawerFromTool,
		onUpdateDrawers,
	});

	const handleDrawerSelect = useCallback(
		(drawer: Drawer) => {
			onSelectionChange({
				selectedElement: { type: "drawer", id: drawer._id, data: drawer },
				selectedDrawerIds: [drawer._id],
			});
		},
		[onSelectionChange],
	);

	const handleCompartmentSelect = useCallback(
		(compartment: Compartment, drawerId: string) => {
			onSelectionChange({
				selectedElement: {
					type: "compartment",
					id: compartment._id,
					data: compartment,
					drawerId,
				},
				selectedDrawerIds: [],
			});
		},
		[onSelectionChange],
	);

	const handleCompartmentDoubleClick = useCallback(
		(compartment: Compartment, drawer: Drawer) => {
			onCompartmentDoubleClick?.(compartment, drawer);
		},
		[onCompartmentDoubleClick],
	);

	const handleCompartmentTransformEnd = useCallback(
		(
			compartmentId: string,
			x: number,
			y: number,
			width: number,
			height: number,
			rotation: number,
		) => {
			onUpdateCompartment(compartmentId, { x, y, width, height, rotation });
		},
		[onUpdateCompartment],
	);

	const sortedDrawers = useMemo(() => {
		const byId = new Map<string, DrawerWithCompartments>();
		for (const drawer of drawers) {
			byId.set(drawer._id, drawer);
		}
		return [...byId.values()].sort((a, b) => a.zIndex - b.zIndex);
	}, [drawers]);

	const drawersForRender = useMemo(() => {
		if (!drawerPositionOverrides) return sortedDrawers;
		return sortedDrawers.map((drawer) => {
			const override = drawerPositionOverrides[drawer._id];
			return override ? { ...drawer, x: override.x, y: override.y } : drawer;
		});
	}, [drawerPositionOverrides, sortedDrawers]);

	return (
		<BlueprintCanvasStage
			stageRef={stageRef}
			width={width}
			height={height}
			drawers={drawers}
			drawersForRender={drawersForRender}
			viewport={viewport}
			mode={mode}
			tool={tool}
			isLocked={isLocked}
			isLockedByMe={isLockedByMe}
			isPanning={isPanning}
			gridSize={GRID_SIZE}
			gridColor={GRID_COLOR}
			selectedElement={selectedElement}
			selectedDrawerIdSet={selectedDrawerIdSet}
			highlightedCompartmentIds={highlightedCompartmentIds}
			invalidDrop={invalidDrop}
			selectionBox={selectionBox}
			draftDrawer={draftDrawer}
			hoverSplit={hoverSplit}
			draftSplit={draftSplit}
			dragState={dragState}
			dragHover={dragHover}
			dragOverlays={dragOverlays}
			compartmentsWithInventory={compartmentsWithInventory}
			handleWheel={handleWheel}
			handleMouseDown={handleMouseDown}
			handleMouseMove={handleMouseMove}
			handleMouseUp={handleMouseUp}
			handleDrawerSelect={handleDrawerSelect}
			handleCompartmentSelect={handleCompartmentSelect}
			handleCompartmentDoubleClick={handleCompartmentDoubleClick}
			handleCompartmentDragStart={handleCompartmentDragStart}
			handleCompartmentDragMove={handleCompartmentDragMove}
			handleCompartmentDragEnd={handleCompartmentDragEnd}
			handleCompartmentTransformEnd={handleCompartmentTransformEnd}
		/>
	);
});
