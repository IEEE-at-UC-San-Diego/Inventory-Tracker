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
import { CompartmentShape } from "./CompartmentShape";
import { DrawerShape } from "./DrawerShape";
import type { BlueprintTool } from "./BlueprintControls";
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
	}) => void;
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
		onUpdateDrawer,
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
	const containerRef = useRef<HTMLDivElement>(null);
	const [isPanning, setIsPanning] = useState(false);
	const lastPointerPosition = useRef<{ x: number; y: number } | null>(null);
	const panCandidate = useRef<{ x: number; y: number } | null>(null);

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

	const findDrawerAtWorldPoint = useCallback(
		(point: { x: number; y: number }): DrawerWithCompartments | null => {
			// Prefer higher zIndex drawers first.
			const candidates = [...drawers].sort((a, b) => b.zIndex - a.zIndex);
			for (const drawer of candidates) {
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
		[drawers],
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

	// Mouse events for panning
	const handleMouseDown = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
			if (e.evt.button !== 0) return;

			const stage = e.target.getStage();
			if (!stage) return;

			const isStage = e.target === stage;
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
				let drawer: DrawerWithCompartments | null = null;
				if (selectedElement?.type === "drawer") {
					drawer = drawers.find((d) => d._id === selectedElement.id) ?? null;
				} else {
					drawer = findDrawerAtWorldPoint(world);
				}

				if (!drawer) return;

				// Local point within drawer (drawer-centered coordinates)
				const halfW = drawer.width / 2;
				const localX = Math.min(Math.max(world.x - drawer.x, -halfW), halfW);
				const snappedX = snapToGrid(localX);

				setDraftSplit({
					drawerId: drawer._id,
					orientation: "vertical",
					position: snappedX,
				});
				lastPointerPosition.current = { x: e.evt.clientX, y: e.evt.clientY };
				return;
			}

			// Pan tool: always pan (even when starting on shapes).
			if (tool === "pan") {
				panCandidate.current = { x: e.evt.clientX, y: e.evt.clientY };
				lastPointerPosition.current = { x: e.evt.clientX, y: e.evt.clientY };
				return;
			}

			// Default: click-drag on empty canvas pans; click on empty canvas deselects.
			if (isStage) {
				panCandidate.current = { x: e.evt.clientX, y: e.evt.clientY };
				lastPointerPosition.current = { x: e.evt.clientX, y: e.evt.clientY };
			}

			// Clicking on shapes is handled by their onSelect handlers.
		},
		[
			drawers,
			findDrawerAtWorldPoint,
			getWorldPointer,
			isLockedByMe,
			selectedElement,
			snapToGrid,
			tool,
		],
	);

	const handleMouseMove = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
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

				const start = lastPointerPosition.current;
				const dx = e.evt.clientX - start.x;
				const dy = e.evt.clientY - start.y;
				const orientation =
					Math.abs(dx) >= Math.abs(dy) ? "vertical" : "horizontal";

				const halfW = drawer.width / 2;
				const halfH = drawer.height / 2;
				const localX = Math.min(Math.max(world.x - drawer.x, -halfW), halfW);
				const localY = Math.min(Math.max(world.y - drawer.y, -halfH), halfH);

				setDraftSplit({
					drawerId: drawer._id,
					orientation,
					position: snapToGrid(orientation === "vertical" ? localX : localY),
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
			getWorldPointer,
			isPanning,
			pan,
			snapToGrid,
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
		if (panCandidate.current && !isPanning && tool !== "pan") {
			onSelectElement(null);
		}
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

	// Double-click to fit to screen
	const handleDblClick = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
			if (e.target === e.target.getStage()) {
				zoomToFit();
			}
		},
		[zoomToFit],
	);

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

	// Compartment drag end
	const handleCompartmentDragEnd = useCallback(
		(compartmentId: string, x: number, y: number) => {
			onUpdateCompartment(compartmentId, { x, y });
		},
		[onUpdateCompartment],
	);

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

	// Generate grid lines
	const gridLines = useMemo(() => {
		const lines = [];
		const offsetX = viewport.x % (GRID_SIZE * viewport.zoom);
		const offsetY = viewport.y % (GRID_SIZE * viewport.zoom);

		// Vertical lines
		for (let x = offsetX; x < width; x += GRID_SIZE * viewport.zoom) {
			lines.push(
				<Line
					key={`v-${x}`}
					points={[x, 0, x, height]}
					stroke={GRID_COLOR}
					strokeWidth={1}
					listening={false}
				/>,
			);
		}

		// Horizontal lines
		for (let y = offsetY; y < height; y += GRID_SIZE * viewport.zoom) {
			lines.push(
				<Line
					key={`h-${y}`}
					points={[0, y, width, y]}
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
				width={width}
				height={height}
				onWheel={handleWheel}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
				onDblClick={handleDblClick}
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
							highlighted={highlightedCompartmentIds?.some((id) =>
								drawer.compartments.some((c) => c._id === id),
							)}
							onSelect={() => handleDrawerSelect(drawer)}
							onDragEnd={(x, y) => handleDrawerDragEnd(drawer._id, x, y)}
							onTransformEnd={(x, y, w, h, r) =>
								handleDrawerTransformEnd(drawer._id, x, y, w, h, r)
							}
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
								highlighted={
									highlightedCompartmentIds?.includes(compartment._id) ?? false
								}
								inventoryCount={getCompartmentInventoryCount(compartment._id)}
								onSelect={() =>
									handleCompartmentSelect(compartment, drawer._id)
								}
								onDoubleClick={() =>
									handleCompartmentDoubleClick(compartment, drawer)
								}
								onDragEnd={(x, y) =>
									handleCompartmentDragEnd(compartment._id, x, y)
								}
								onTransformEnd={(x, y, w, h, r) =>
									handleCompartmentTransformEnd(compartment._id, x, y, w, h, r)
								}
							/>
						)),
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

					{/* Draft split preview (world coords) */}
					{draftSplit && (() => {
						const drawer = drawers.find((d) => d._id === draftSplit.drawerId);
						if (!drawer) return null;
						if (draftSplit.orientation === "vertical") {
							const x = drawer.x + draftSplit.position;
							const y1 = drawer.y - drawer.height / 2;
							const y2 = drawer.y + drawer.height / 2;
							return (
								<Line
									points={[x, y1, x, y2]}
									stroke="rgba(99,102,241,0.95)"
									strokeWidth={3}
									dash={[10, 6]}
									listening={false}
								/>
							);
						}
						const y = drawer.y + draftSplit.position;
						const x1 = drawer.x - drawer.width / 2;
						const x2 = drawer.x + drawer.width / 2;
						return (
							<Line
								points={[x1, y, x2, y]}
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
