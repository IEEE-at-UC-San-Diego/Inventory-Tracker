import type { KonvaEventObject } from "konva/lib/Node";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import {
	forwardRef,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	Group,
	Image as KonvaImage,
	Layer,
	Line,
	Rect,
	Stage,
	Text,
} from "react-konva";
import useImage from "use-image";
import type {
	CanvasMode,
	Compartment,
	Drawer,
	DrawerWithCompartments,
	SelectedElement,
	Viewport,
} from "@/types";
import type { BlueprintTool } from "./BlueprintControls";
import { CompartmentShape } from "./CompartmentShape";
import { DrawerShape } from "./DrawerShape";
import { useCanvasViewport } from "./useCanvasViewport";

interface BlueprintCanvasProps {
	width: number;
	height: number;
	backgroundImageUrl?: string | null;
	drawers: DrawerWithCompartments[];
	selectedElement: SelectedElement;
	mode: CanvasMode;
	tool?: BlueprintTool;
	isLocked: boolean;
	isLockedByMe: boolean;
	highlightedPartId?: string;
	highlightedCompartmentIds?: string[];
	onSelectElement: (element: SelectedElement) => void;
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
		position: number; // position in drawer local coordinates (x or y)
		targetCompartmentId?: string | null;
	}) => void;
	onSwapCompartments?: (
		aCompartmentId: string,
		bCompartmentId: string,
	) => Promise<void> | void;
	onUpdateDrawer: (drawerId: string, updates: Partial<Drawer>) => void;
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
	compartmentsWithInventory?: Map<string, number>; // compartmentId -> inventory count
	onContextMenu?: (info: {
		screenX: number;
		screenY: number;
		worldX: number;
		worldY: number;
		drawer: DrawerWithCompartments | null;
	}) => void;
}

const GRID_SIZE = 50;
const GRID_COLOR = "#e2e8f0";
const PAN_DRAG_THRESHOLD_PX = 3;

// Background image wrapper component with useImage
const BlueprintBackgroundImage = ({
	imageUrl,
}: {
	imageUrl?: string | null;
}) => {
	const [image] = useImage(imageUrl ?? "", "anonymous");
	const [imageDimensions, setImageDimensions] = useState<{
		width: number;
		height: number;
	} | null>(null);

	useEffect(() => {
		if (image) {
			setImageDimensions({ width: image.width, height: image.height });
		}
	}, [image]);

	if (!image || !imageDimensions) return null;

	return (
		<KonvaImage
			image={image}
			width={imageDimensions.width}
			height={imageDimensions.height}
			opacity={0.7}
		/>
	);
};

export const BlueprintCanvas = forwardRef(function BlueprintCanvas(
	{
		width,
		height,
		backgroundImageUrl,
		drawers,
		selectedElement,
		mode,
		tool = "select",
		isLocked,
		isLockedByMe,
		highlightedCompartmentIds,
		onSelectElement,
		onCompartmentDoubleClick,
		onCreateDrawerFromTool,
		onSplitDrawerFromTool,
		onSwapCompartments,
		onUpdateDrawer,
		onUpdateCompartment,
		onViewportChange,
		zoomInRef,
		zoomOutRef,
		zoomToFitRef,
		resetViewRef,
		zoomToLocationRef,
		compartmentsWithInventory,
		onContextMenu: onContextMenuProp,
	}: BlueprintCanvasProps,
	_ref,
) {
	const stageRef = useRef<KonvaStage>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [isPanning, setIsPanning] = useState(false);
	const lastPointerPosition = useRef<{ x: number; y: number } | null>(null);
	const panCandidate = useRef<{ x: number; y: number; button: 0 | 2 } | null>(
		null,
	);
	const clickCandidate = useRef(false);
	const didPanWithRightClickRef = useRef(false);
	const pendingDragMove = useRef<{
		compartmentId: string;
		fromDrawerId: string;
		worldX: number;
		worldY: number;
	} | null>(null);
	const dragMoveRaf = useRef<number | null>(null);

	const [draftDrawer, setDraftDrawer] = useState<{
		startX: number;
		startY: number;
		endX: number;
		endY: number;
	} | null>(null);
	const [draftSplit, setDraftSplit] = useState<{
		drawerId: string;
		orientation: "vertical" | "horizontal";
		position: number;
		targetCompartmentId?: string | null;
	} | null>(null);
	const [hoverSplit, setHoverSplit] = useState<{
		drawerId: string;
		orientation: "vertical" | "horizontal";
		position: number;
		targetCompartmentId?: string | null;
	} | null>(null);
	const [splitOrientation, setSplitOrientation] = useState<
		"vertical" | "horizontal"
	>("vertical");

	const [dragState, setDragState] = useState<{
		compartmentId: string;
		fromDrawerId: string;
	} | null>(null);
	const [dragHover, setDragHover] = useState<{
		targetDrawerId: string | null;
		targetCompartmentId: string | null;
	} | null>(null);

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

	const setHoverSplitIfChanged = useCallback(
		(
			next: {
				drawerId: string;
				orientation: "vertical" | "horizontal";
				position: number;
				targetCompartmentId?: string | null;
			} | null,
		) => {
			setHoverSplit((prev) => {
				if (
					prev?.drawerId === next?.drawerId &&
					prev?.orientation === next?.orientation &&
					prev?.position === next?.position &&
					(prev?.targetCompartmentId ?? null) ===
						(next?.targetCompartmentId ?? null)
				) {
					return prev;
				}
				return next;
			});
		},
		[],
	);

	// Expose zoom functions via refs
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

	// Notify parent of viewport changes
	useEffect(() => {
		onViewportChange?.(viewport);
	}, [viewport, onViewportChange]);

	useEffect(() => {
		return () => {
			if (dragMoveRaf.current != null) {
				cancelAnimationFrame(dragMoveRaf.current);
				dragMoveRaf.current = null;
			}
		};
	}, []);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === "Escape") {
				setDraftDrawer(null);
				setDraftSplit(null);
				onSelectElement(null);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [onSelectElement]);

	const snapToGrid = useCallback((value: number): number => {
		return Math.round(value / GRID_SIZE) * GRID_SIZE;
	}, []);

	const getWorldPointer = useCallback((): { x: number; y: number } | null => {
		const stage = stageRef.current;
		if (!stage) return null;
		const pointer = stage.getPointerPosition();
		if (!pointer) return null;
		return {
			x: (pointer.x - viewport.x) / viewport.zoom,
			y: (pointer.y - viewport.y) / viewport.zoom,
		};
	}, [viewport.x, viewport.y, viewport.zoom]);

	const drawersByZDesc = useMemo(() => {
		return [...drawers].sort((a, b) => b.zIndex - a.zIndex);
	}, [drawers]);

	const findDrawerAtWorldPoint = useCallback(
		(point: { x: number; y: number }): DrawerWithCompartments | null => {
			// Prefer higher zIndex drawers first.
			for (const drawer of drawersByZDesc) {
				// Splitting rotated drawers requires more complex math; keep it explicit for now.
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
			// Split/move math assumes drawer rotation = 0.
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

	// Wheel zoom
	const handleWheel = useCallback(
		(e: KonvaEventObject<WheelEvent>) => {
			e.evt.preventDefault();

			const stage = stageRef.current;
			if (!stage) return;

			const pointer = stage.getPointerPosition();
			if (!pointer) return;

			const delta = e.evt.deltaY;
			const factor = delta > 0 ? 0.9 : 1.1;

			zoom(factor, { x: pointer.x, y: pointer.y });
		},
		[zoom],
	);

	const handleContextMenu = useCallback(
		(e: KonvaEventObject<PointerEvent>) => {
			e.evt.preventDefault();

			// If the user was panning with right-click drag, suppress "right-click toggles"
			// behaviors on mouseup.
			if (didPanWithRightClickRef.current) {
				didPanWithRightClickRef.current = false;
				return;
			}

			// Right click (no pan) in split tool: toggle split orientation.
			if (tool === "split" && isLockedByMe) {
				setSplitOrientation((prev) =>
					prev === "vertical" ? "horizontal" : "vertical",
				);
				return;
			}

			// Emit context menu event to parent for all other tools.
			if (onContextMenuProp) {
				const world = getWorldPointer();
				if (world) {
					const drawer = findDrawerAtWorldPoint(world);
					onContextMenuProp({
						screenX: e.evt.clientX,
						screenY: e.evt.clientY,
						worldX: world.x,
						worldY: world.y,
						drawer,
					});
				}
			}
		},
		[isLockedByMe, tool, onContextMenuProp, getWorldPointer, findDrawerAtWorldPoint],
	);

	// Mouse events for panning/selection
	const handleMouseDown = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
			const stage = e.target.getStage();
			if (!stage) return;

			const isStage = e.target === stage;
			clickCandidate.current = false;

			// Right-click drag: pan (even when starting on shapes).
			if (e.evt.button === 2) {
				panCandidate.current = {
					x: e.evt.clientX,
					y: e.evt.clientY,
					button: 2,
				};
				lastPointerPosition.current = { x: e.evt.clientX, y: e.evt.clientY };
				didPanWithRightClickRef.current = false;
				return;
			}

			// Only left-click interacts with tools / selection.
			if (e.evt.button !== 0) return;
			const world = getWorldPointer();

			// Drawer tool: click-drag on empty canvas to create a drawer (snapped).
			if (tool === "drawer" && isLockedByMe && isStage && world) {
				const startX = snapToGrid(world.x);
				const startY = snapToGrid(world.y);
				setDraftDrawer({ startX, startY, endX: startX, endY: startY });
				return;
			}

			// Split tool: draw a divider line inside a drawer (snapped).
			if (tool === "split" && isLockedByMe && world) {
				const drawer =
					(hoverSplit
						? (drawers.find((d) => d._id === hoverSplit.drawerId) ?? null)
						: selectedElement?.type === "drawer"
							? (drawers.find((d) => d._id === selectedElement.id) ?? null)
							: findDrawerAtWorldPoint(world)) ?? null;
				if (!drawer) return;

				const hoveredComp = findCompartmentAtWorldPoint(drawer, world);
				if (drawer.compartments.length > 0 && !hoveredComp) {
					// If the drawer already has compartments, splits must target a compartment.
					return;
				}

				// Local point within drawer (drawer-centered coordinates)
				const halfW = drawer.width / 2;
				const halfH = drawer.height / 2;
				const snappedWorldX = snapToGrid(world.x);
				const snappedWorldY = snapToGrid(world.y);
				const localX = Math.min(
					Math.max(snappedWorldX - drawer.x, -halfW),
					halfW,
				);
				const localY = Math.min(
					Math.max(snappedWorldY - drawer.y, -halfH),
					halfH,
				);

				const position =
					splitOrientation === "vertical"
						? hoverSplit?.orientation === splitOrientation
							? hoverSplit.position
							: localX
						: hoverSplit?.orientation === splitOrientation
							? hoverSplit.position
							: localY;

				setDraftSplit({
					drawerId: drawer._id,
					orientation: splitOrientation,
					position,
					targetCompartmentId: hoveredComp?._id ?? null,
				});
				lastPointerPosition.current = { x: e.evt.clientX, y: e.evt.clientY };
				return;
			}

			// Pan tool: always pan (even when starting on shapes).
			if (tool === "pan") {
				panCandidate.current = {
					x: e.evt.clientX,
					y: e.evt.clientY,
					button: 0,
				};
				lastPointerPosition.current = { x: e.evt.clientX, y: e.evt.clientY };
				return;
			}

			// Default: left-click on empty canvas deselects (no panning on left-drag in select mode).
			if (isStage) {
				clickCandidate.current = true;
				lastPointerPosition.current = { x: e.evt.clientX, y: e.evt.clientY };
			}

			// Clicking on shapes is handled by their onSelect handlers.
		},
		[
			drawers,
			findCompartmentAtWorldPoint,
			findDrawerAtWorldPoint,
			getWorldPointer,
			hoverSplit,
			isLockedByMe,
			selectedElement,
			splitOrientation,
			snapToGrid,
			tool,
		],
	);

	const handleMouseMove = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
			// Hover split preview (no click).
			if (
				tool === "split" &&
				isLockedByMe &&
				!draftSplit &&
				!draftDrawer &&
				!isPanning
			) {
				const world = getWorldPointer();
				if (!world) {
					setHoverSplitIfChanged(null);
				} else {
					const drawer =
						selectedElement?.type === "drawer"
							? (drawers.find((d) => d._id === selectedElement.id) ?? null)
							: findDrawerAtWorldPoint(world);

					if (!drawer) {
						setHoverSplitIfChanged(null);
					} else {
						const hoveredComp = findCompartmentAtWorldPoint(drawer, world);
						if (drawer.compartments.length > 0 && !hoveredComp) {
							setHoverSplitIfChanged(null);
							return;
						}

						const halfW = drawer.width / 2;
						const halfH = drawer.height / 2;
						const snappedWorldX = snapToGrid(world.x);
						const snappedWorldY = snapToGrid(world.y);
						const localX = Math.min(
							Math.max(snappedWorldX - drawer.x, -halfW),
							halfW,
						);
						const localY = Math.min(
							Math.max(snappedWorldY - drawer.y, -halfH),
							halfH,
						);

						setHoverSplitIfChanged({
							drawerId: drawer._id,
							orientation: splitOrientation,
							position: splitOrientation === "vertical" ? localX : localY,
							targetCompartmentId: hoveredComp?._id ?? null,
						});
					}
				}
			} else if (hoverSplit) {
				setHoverSplitIfChanged(null);
			}

			// Update drawer draft while drawing.
			if (draftDrawer) {
				const world = getWorldPointer();
				if (!world) return;
				setDraftDrawer((prev) => {
					if (!prev) return prev;
					return {
						...prev,
						endX: snapToGrid(world.x),
						endY: snapToGrid(world.y),
					};
				});
				return;
			}

			// Update split draft while drawing.
			if (draftSplit && lastPointerPosition.current) {
				const world = getWorldPointer();
				if (!world) return;
				const drawer = drawers.find((d) => d._id === draftSplit.drawerId);
				if (!drawer) return;

				const halfW = drawer.width / 2;
				const halfH = drawer.height / 2;
				const snappedWorldX = snapToGrid(world.x);
				const snappedWorldY = snapToGrid(world.y);
				const localX = Math.min(
					Math.max(snappedWorldX - drawer.x, -halfW),
					halfW,
				);
				const localY = Math.min(
					Math.max(snappedWorldY - drawer.y, -halfH),
					halfH,
				);

				setDraftSplit({
					drawerId: drawer._id,
					orientation: draftSplit.orientation,
					position: draftSplit.orientation === "vertical" ? localX : localY,
					targetCompartmentId: draftSplit.targetCompartmentId ?? null,
				});
				return;
			}

			// Pan (candidate becomes real pan after threshold).
			if (!panCandidate.current || !lastPointerPosition.current) return;

			const totalDx = e.evt.clientX - panCandidate.current.x;
			const totalDy = e.evt.clientY - panCandidate.current.y;
			const movedEnough =
				Math.abs(totalDx) > PAN_DRAG_THRESHOLD_PX ||
				Math.abs(totalDy) > PAN_DRAG_THRESHOLD_PX;

			if (!isPanning && movedEnough) {
				setIsPanning(true);
				if (panCandidate.current.button === 2) {
					didPanWithRightClickRef.current = true;
				}
			}

			if (!isPanning && !movedEnough) return;

			const dx = e.evt.clientX - lastPointerPosition.current.x;
			const dy = e.evt.clientY - lastPointerPosition.current.y;

			pan(dx, dy);

			lastPointerPosition.current = {
				x: e.evt.clientX,
				y: e.evt.clientY,
			};
		},
		[
			draftDrawer,
			draftSplit,
			drawers,
			findCompartmentAtWorldPoint,
			findDrawerAtWorldPoint,
			getWorldPointer,
			hoverSplit,
			isPanning,
			isLockedByMe,
			pan,
			selectedElement,
			setHoverSplitIfChanged,
			splitOrientation,
			snapToGrid,
			tool,
		],
	);

	const handleMouseUp = useCallback(() => {
		// Commit drawer.
		if (draftDrawer && isLockedByMe) {
			const x1 = Math.min(draftDrawer.startX, draftDrawer.endX);
			const y1 = Math.min(draftDrawer.startY, draftDrawer.endY);
			const x2 = Math.max(draftDrawer.startX, draftDrawer.endX);
			const y2 = Math.max(draftDrawer.startY, draftDrawer.endY);
			const w = x2 - x1;
			const h = y2 - y1;
			const centerX = x1 + w / 2;
			const centerY = y1 + h / 2;

			setDraftDrawer(null);

			// Avoid accidental tiny drawers.
			if (w >= GRID_SIZE && h >= GRID_SIZE) {
				onCreateDrawerFromTool?.({
					x: centerX,
					y: centerY,
					width: w,
					height: h,
				});
			}

			panCandidate.current = null;
			setIsPanning(false);
			lastPointerPosition.current = null;
			return;
		}

		// Commit split.
		if (draftSplit && isLockedByMe) {
			const split = draftSplit;
			setDraftSplit(null);
			onSplitDrawerFromTool?.(split);

			panCandidate.current = null;
			setIsPanning(false);
			lastPointerPosition.current = null;
			return;
		}

		// Pan commit / click-to-deselect.
		if (clickCandidate.current && !isPanning && tool !== "pan") {
			onSelectElement(null);
		}
		clickCandidate.current = false;
		panCandidate.current = null;
		setIsPanning(false);
		lastPointerPosition.current = null;
	}, [
		draftDrawer,
		draftSplit,
		isLockedByMe,
		isPanning,
		onCreateDrawerFromTool,
		onSelectElement,
		onSplitDrawerFromTool,
		tool,
	]);

	// Drawer selection
	const handleDrawerSelect = useCallback(
		(drawer: Drawer) => {
			onSelectElement({ type: "drawer", id: drawer._id, data: drawer });
		},
		[onSelectElement],
	);

	// Compartment selection
	const handleCompartmentSelect = useCallback(
		(compartment: Compartment, drawerId: string) => {
			onSelectElement({
				type: "compartment",
				id: compartment._id,
				data: compartment,
				drawerId,
			});
		},
		[onSelectElement],
	);

	// Compartment double-click for details panel
	const handleCompartmentDoubleClick = useCallback(
		(compartment: Compartment, drawer: Drawer) => {
			onCompartmentDoubleClick?.(compartment, drawer);
		},
		[onCompartmentDoubleClick],
	);

	// Drawer drag end
	const handleDrawerDragEnd = useCallback(
		(drawerId: string, x: number, y: number) => {
			onUpdateDrawer(drawerId, { x, y });
		},
		[onUpdateDrawer],
	);

	// Drawer transform end
	const handleDrawerTransformEnd = useCallback(
		(
			drawerId: string,
			x: number,
			y: number,
			width: number,
			height: number,
			rotation: number,
		) => {
			onUpdateDrawer(drawerId, { x, y, width, height, rotation });
		},
		[onUpdateDrawer],
	);

	const handleCompartmentDragStart = useCallback(
		(next: {
			compartmentId: string;
			fromDrawerId: string;
			worldX: number;
			worldY: number;
		}) => {
			setDragState({
				compartmentId: next.compartmentId,
				fromDrawerId: next.fromDrawerId,
			});
			setDragHover({
				targetDrawerId: next.fromDrawerId,
				targetCompartmentId: next.compartmentId,
			});
		},
		[],
	);

	const handleCompartmentDragMove = useCallback(
		(next: {
			compartmentId: string;
			fromDrawerId: string;
			worldX: number;
			worldY: number;
		}) => {
			if (!dragState || dragState.compartmentId !== next.compartmentId) return;

			// Throttle drag hover computation to animation frames to avoid re-rendering
			// the entire Konva tree at pointer-move frequency.
			pendingDragMove.current = next;
			if (dragMoveRaf.current != null) return;
			dragMoveRaf.current = requestAnimationFrame(() => {
				dragMoveRaf.current = null;
				const pending = pendingDragMove.current;
				if (!pending) return;
				const point = { x: pending.worldX, y: pending.worldY };
				const targetDrawer = findDrawerAtWorldPoint(point);
				if (!targetDrawer) {
					setDragHover({ targetDrawerId: null, targetCompartmentId: null });
					return;
				}
				const targetComp = findCompartmentAtWorldPoint(targetDrawer, point);
				setDragHover({
					targetDrawerId: targetDrawer._id,
					targetCompartmentId: targetComp?._id ?? null,
				});
			});
		},
		[dragState, findCompartmentAtWorldPoint, findDrawerAtWorldPoint],
	);

	// Compartment drag end
	const handleCompartmentDragEnd = useCallback(
		async (next: {
			compartmentId: string;
			fromDrawerId: string;
			worldX: number;
			worldY: number;
		}) => {
			pendingDragMove.current = null;
			if (dragMoveRaf.current != null) {
				cancelAnimationFrame(dragMoveRaf.current);
				dragMoveRaf.current = null;
			}
			setDragState(null);
			setDragHover(null);

			// We only support snapping/swap/move for non-rotated drawers right now.
			const point = { x: next.worldX, y: next.worldY };
			const fromDrawer =
				drawers.find((d) => d._id === next.fromDrawerId) ?? null;
			if (!fromDrawer || fromDrawer.rotation !== 0) return;

			const movingComp =
				fromDrawer.compartments.find((c) => c._id === next.compartmentId) ??
				null;
			if (!movingComp) return;

			const targetDrawer = findDrawerAtWorldPoint(point);
			if (!targetDrawer || targetDrawer.rotation !== 0) return;

			const targetComp = findCompartmentAtWorldPoint(targetDrawer, point);

			// If dropping onto another compartment, swap (including sizes; and drawerId if across drawers).
			if (targetComp && targetComp._id !== movingComp._id) {
				if (onSwapCompartments) {
					await onSwapCompartments(movingComp._id, targetComp._id);
				} else {
					await onUpdateCompartment(movingComp._id, {
						drawerId: targetDrawer._id,
						x: targetComp.x,
						y: targetComp.y,
						width: targetComp.width,
						height: targetComp.height,
					});
					await onUpdateCompartment(targetComp._id, {
						drawerId: fromDrawer._id,
						x: movingComp.x,
						y: movingComp.y,
						width: movingComp.width,
						height: movingComp.height,
					});
				}
				return;
			}

			// If the target drawer is empty (or we're the only compartment), allow snapping move within bounds.
			const isTargetEmpty =
				targetDrawer.compartments.length === 0 ||
				(targetDrawer._id === fromDrawer._id &&
					targetDrawer.compartments.length === 1);

			if (!isTargetEmpty) {
				// Prevent stacking/layers: only allow swaps when other compartments exist.
				return;
			}

			const halfW = targetDrawer.width / 2;
			const halfH = targetDrawer.height / 2;
			const halfCompW = movingComp.width / 2;
			const halfCompH = movingComp.height / 2;

			// Snap corners to the grid: snap top-left in world coords, then convert back.
			const snappedTopLeftWorldX = snapToGrid(point.x - halfCompW);
			const snappedTopLeftWorldY = snapToGrid(point.y - halfCompH);
			const snappedCenterWorldX = snappedTopLeftWorldX + halfCompW;
			const snappedCenterWorldY = snappedTopLeftWorldY + halfCompH;

			const rawRelX = snappedCenterWorldX - targetDrawer.x;
			const rawRelY = snappedCenterWorldY - targetDrawer.y;

			const clampedRelX = Math.max(
				-halfW + halfCompW,
				Math.min(halfW - halfCompW, rawRelX),
			);
			const clampedRelY = Math.max(
				-halfH + halfCompH,
				Math.min(halfH - halfCompH, rawRelY),
			);

			const clampedCenterWorldX = targetDrawer.x + clampedRelX;
			const clampedCenterWorldY = targetDrawer.y + clampedRelY;
			const finalTopLeftWorldX = snapToGrid(clampedCenterWorldX - halfCompW);
			const finalTopLeftWorldY = snapToGrid(clampedCenterWorldY - halfCompH);
			const finalRelX = Math.max(
				-halfW + halfCompW,
				Math.min(
					halfW - halfCompW,
					finalTopLeftWorldX + halfCompW - targetDrawer.x,
				),
			);
			const finalRelY = Math.max(
				-halfH + halfCompH,
				Math.min(
					halfH - halfCompH,
					finalTopLeftWorldY + halfCompH - targetDrawer.y,
				),
			);

			await onUpdateCompartment(movingComp._id, {
				drawerId: targetDrawer._id,
				x: finalRelX,
				y: finalRelY,
			});
		},
		[
			drawers,
			findCompartmentAtWorldPoint,
			findDrawerAtWorldPoint,
			onUpdateCompartment,
			onSwapCompartments,
			snapToGrid,
		],
	);

	const dragOverlays = useMemo(() => {
		if (!dragState) return null;
		const fromDrawer =
			drawers.find((d) => d._id === dragState.fromDrawerId) ?? null;
		const originComp =
			fromDrawer?.compartments.find((c) => c._id === dragState.compartmentId) ??
			null;

		const origin =
			fromDrawer && originComp
				? {
						x: fromDrawer.x + originComp.x - originComp.width / 2,
						y: fromDrawer.y + originComp.y - originComp.height / 2,
						width: originComp.width,
						height: originComp.height,
					}
				: null;

		const target =
			dragHover?.targetDrawerId && dragHover.targetCompartmentId
				? (() => {
						const td =
							drawers.find((d) => d._id === dragHover.targetDrawerId) ?? null;
						const tc =
							td?.compartments.find(
								(c) => c._id === dragHover.targetCompartmentId,
							) ?? null;
						if (!td || !tc) return null;
						return {
							x: td.x + tc.x - tc.width / 2,
							y: td.y + tc.y - tc.height / 2,
							width: tc.width,
							height: tc.height,
						};
					})()
				: null;

		return { origin, target };
	}, [
		dragHover?.targetCompartmentId,
		dragHover?.targetDrawerId,
		dragState,
		drawers,
	]);

	// Compartment transform end
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

	// Get inventory count for a compartment
	const getCompartmentInventoryCount = useCallback(
		(compartmentId: string): number => {
			return compartmentsWithInventory?.get(compartmentId) ?? 0;
		},
		[compartmentsWithInventory],
	);

	// Sort drawers by zIndex
	const sortedDrawers = useMemo(() => {
		return [...drawers].sort((a, b) => a.zIndex - b.zIndex);
	}, [drawers]);
	const performanceMode = isPanning || dragState !== null;
	const showLabels = !isPanning && viewport.zoom >= 0.5;

	const highlightedCompartmentIdSet = useMemo(() => {
		return new Set(highlightedCompartmentIds ?? []);
	}, [highlightedCompartmentIds]);

	const highlightedDrawerIdSet = useMemo(() => {
		if (highlightedCompartmentIdSet.size === 0) return new Set<string>();
		const result = new Set<string>();
		for (const drawer of drawers) {
			if (
				drawer.compartments.some((c) => highlightedCompartmentIdSet.has(c._id))
			) {
				result.add(drawer._id);
			}
		}
		return result;
	}, [drawers, highlightedCompartmentIdSet]);


	// Generate grid lines
	const gridLines = useMemo(() => {
		// Draw grid lines in *world* coordinates then transform to screen.
		// This avoids % behavior on negative viewport offsets (which can visually de-sync
		// the grid from snapping).
		const lines = [];
		const zoom = viewport.zoom;
		const stageW = width + 2;
		const stageH = height + 2;

		// Keep grid rendering cheap when zoomed far out by coarsening the rendered grid.
		// Snapping still happens at GRID_SIZE; this only changes the visible grid density.
		const minGridPx = 24;
		const densityFactor = Math.max(
			1,
			Math.ceil(minGridPx / (GRID_SIZE * zoom)),
		);
		const gridStepWorld = GRID_SIZE * densityFactor;

		const worldLeft = -viewport.x / zoom;
		const worldTop = -viewport.y / zoom;
		const worldRight = (stageW - viewport.x) / zoom;
		const worldBottom = (stageH - viewport.y) / zoom;

		const firstWorldX = Math.floor(worldLeft / gridStepWorld) * gridStepWorld;
		const firstWorldY = Math.floor(worldTop / gridStepWorld) * gridStepWorld;

		let i = 0;
		for (
			let worldX = firstWorldX;
			worldX <= worldRight;
			worldX += gridStepWorld
		) {
			const x = worldX * zoom + viewport.x;
			lines.push(
				<Line
					key={`v-${i++}`}
					points={[x, 0, x, stageH]}
					stroke={GRID_COLOR}
					strokeWidth={1}
					listening={false}
				/>,
			);
		}

		for (
			let worldY = firstWorldY;
			worldY <= worldBottom;
			worldY += gridStepWorld
		) {
			const y = worldY * zoom + viewport.y;
			lines.push(
				<Line
					key={`h-${i++}`}
					points={[0, y, stageW, y]}
					stroke={GRID_COLOR}
					strokeWidth={1}
					listening={false}
				/>,
			);
		}

		return lines;
	}, [viewport, width, height]);

	return (
		<div
			ref={containerRef}
			className="relative w-full h-full overflow-hidden bg-slate-50 cursor-crosshair"
			style={{
				cursor: tool === "pan" || isPanning ? "grab" : "default",
			}}
		>
			<Stage
				ref={stageRef}
				// Slightly overscan to avoid 1px right/bottom gaps from subpixel layout rounding.
				width={width + 2}
				height={height + 2}
				onWheel={handleWheel}
				onContextMenu={handleContextMenu}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
				draggable={false}
			>
				{/* Background Image Layer - renders below everything */}
				{backgroundImageUrl && (
					<Layer
						listening={false}
						x={viewport.x}
						y={viewport.y}
						scaleX={viewport.zoom}
						scaleY={viewport.zoom}
					>
						<BlueprintBackgroundImage imageUrl={backgroundImageUrl} />
					</Layer>
				)}

				{/* Grid Layer */}
				<Layer listening={false}>{gridLines}</Layer>

				{/* Blueprint Content Layer */}
				<Layer
					x={viewport.x}
					y={viewport.y}
					scaleX={viewport.zoom}
					scaleY={viewport.zoom}
				>
					{/* Drawers */}
					{sortedDrawers.map((drawer) => (
						<DrawerShape
							key={drawer._id}
							drawer={drawer}
							isSelected={
								selectedElement?.type === "drawer" &&
								selectedElement.id === drawer._id
							}
							isLocked={isLocked}
							isLockedByMe={isLockedByMe}
							mode={mode}
							viewport={viewport}
							selectEnabled={tool !== "pan"}
							editEnabled={mode === "edit" && isLockedByMe && tool === "select"}
							performanceMode={performanceMode}
							showLabel={showLabels}
							highlighted={highlightedDrawerIdSet.has(drawer._id)}
							onSelect={handleDrawerSelect}
							onDragEnd={handleDrawerDragEnd}
							onTransformEnd={handleDrawerTransformEnd}
						/>
					))}

					{/* Compartments */}
					{sortedDrawers.map((drawer) =>
						drawer.compartments.map((compartment) => (
							<CompartmentShape
								key={compartment._id}
								compartment={compartment}
								drawer={drawer}
								isSelected={
									selectedElement?.type === "compartment" &&
									selectedElement.id === compartment._id
								}
								isLockedByMe={isLockedByMe}
								mode={mode}
								viewport={viewport}
								selectEnabled={tool !== "pan"}
								editEnabled={
									mode === "edit" && isLockedByMe && tool === "select"
								}
								performanceMode={performanceMode}
								showLabel={showLabels}
								highlighted={highlightedCompartmentIdSet.has(compartment._id)}
								isDragOrigin={dragState?.compartmentId === compartment._id}
								isDropTarget={
									dragHover?.targetCompartmentId === compartment._id
								}
								inventoryCount={getCompartmentInventoryCount(compartment._id)}
								onSelect={handleCompartmentSelect}
								onDoubleClick={handleCompartmentDoubleClick}
								onDragStart={handleCompartmentDragStart}
								onDragMove={handleCompartmentDragMove}
								onDragEnd={handleCompartmentDragEnd}
								onTransformEnd={handleCompartmentTransformEnd}
							/>
						)),
					)}

					{/* Drag overlays */}
					{dragOverlays?.origin && (
						<Rect
							x={dragOverlays.origin.x}
							y={dragOverlays.origin.y}
							width={dragOverlays.origin.width}
							height={dragOverlays.origin.height}
							stroke="rgba(2,132,199,0.55)"
							strokeWidth={2}
							dash={[6, 4]}
							listening={false}
						/>
					)}
					{dragOverlays?.target && (
						<Rect
							x={dragOverlays.target.x}
							y={dragOverlays.target.y}
							width={dragOverlays.target.width}
							height={dragOverlays.target.height}
							stroke="rgba(124,58,237,0.8)"
							strokeWidth={3}
							dash={[10, 6]}
							listening={false}
						/>
					)}

					{/* Draft drawer preview (world coords) */}
					{draftDrawer && (
						<Rect
							x={Math.min(draftDrawer.startX, draftDrawer.endX)}
							y={Math.min(draftDrawer.startY, draftDrawer.endY)}
							width={Math.abs(draftDrawer.endX - draftDrawer.startX)}
							height={Math.abs(draftDrawer.endY - draftDrawer.startY)}
							fill="rgba(6,182,212,0.12)"
							stroke="rgba(6,182,212,0.9)"
							strokeWidth={2}
							dash={[8, 6]}
							listening={false}
						/>
					)}

					{/* Hover split preview (world coords) */}
					{!draftSplit &&
						tool === "split" &&
						isLockedByMe &&
						hoverSplit &&
						(() => {
							const drawer = drawers.find((d) => d._id === hoverSplit.drawerId);
							if (!drawer) return null;
							const comp =
								hoverSplit.targetCompartmentId && drawer.compartments.length > 0
									? (drawer.compartments.find(
											(c) => c._id === hoverSplit.targetCompartmentId,
										) ?? null)
									: null;

							const drawerTop = drawer.y - drawer.height / 2;
							const drawerBottom = drawer.y + drawer.height / 2;
							const drawerLeft = drawer.x - drawer.width / 2;
							const drawerRight = drawer.x + drawer.width / 2;

							const regionTop = comp
								? drawer.y + comp.y - comp.height / 2
								: drawerTop;
							const regionBottom = comp
								? drawer.y + comp.y + comp.height / 2
								: drawerBottom;
							const regionLeft = comp
								? drawer.x + comp.x - comp.width / 2
								: drawerLeft;
							const regionRight = comp
								? drawer.x + comp.x + comp.width / 2
								: drawerRight;

							if (hoverSplit.orientation === "vertical") {
								const x = drawer.x + hoverSplit.position;
								return (
									<Line
										points={[x, regionTop, x, regionBottom]}
										stroke="rgba(99,102,241,0.55)"
										strokeWidth={2}
										dash={[8, 6]}
										listening={false}
									/>
								);
							}

							const y = drawer.y + hoverSplit.position;
							return (
								<Line
									points={[regionLeft, y, regionRight, y]}
									stroke="rgba(99,102,241,0.55)"
									strokeWidth={2}
									dash={[8, 6]}
									listening={false}
								/>
							);
						})()}

					{/* Draft split preview (world coords) */}
					{draftSplit &&
						(() => {
							const drawer = drawers.find((d) => d._id === draftSplit.drawerId);
							if (!drawer) return null;
							const comp =
								draftSplit.targetCompartmentId && drawer.compartments.length > 0
									? (drawer.compartments.find(
											(c) => c._id === draftSplit.targetCompartmentId,
										) ?? null)
									: null;

							const drawerTop = drawer.y - drawer.height / 2;
							const drawerBottom = drawer.y + drawer.height / 2;
							const drawerLeft = drawer.x - drawer.width / 2;
							const drawerRight = drawer.x + drawer.width / 2;

							const regionTop = comp
								? drawer.y + comp.y - comp.height / 2
								: drawerTop;
							const regionBottom = comp
								? drawer.y + comp.y + comp.height / 2
								: drawerBottom;
							const regionLeft = comp
								? drawer.x + comp.x - comp.width / 2
								: drawerLeft;
							const regionRight = comp
								? drawer.x + comp.x + comp.width / 2
								: drawerRight;

							if (draftSplit.orientation === "vertical") {
								const x = drawer.x + draftSplit.position;
								return (
									<Line
										points={[x, regionTop, x, regionBottom]}
										stroke="rgba(99,102,241,0.95)"
										strokeWidth={3}
										dash={[10, 6]}
										listening={false}
									/>
								);
							}
							const y = drawer.y + draftSplit.position;
							return (
								<Line
									points={[regionLeft, y, regionRight, y]}
									stroke="rgba(99,102,241,0.95)"
									strokeWidth={3}
									dash={[10, 6]}
									listening={false}
								/>
							);
						})()}
				</Layer>

				{/* UI Overlay Layer */}
				<Layer listening={false}>
					{/* Origin marker */}
					<Group x={viewport.x} y={viewport.y}>
						<Line points={[-10, 0, 10, 0]} stroke="#ef4444" strokeWidth={2} />
						<Line points={[0, -10, 0, 10]} stroke="#ef4444" strokeWidth={2} />
						<Text x={12} y={-15} text="(0,0)" fontSize={10} fill="#ef4444" />
					</Group>
				</Layer>
			</Stage>
		</div>
	);
});
