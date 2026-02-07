import type { KonvaEventObject } from "konva/lib/Node";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import { useMemo } from "react";
import type React from "react";
import { Group, Layer, Line, Rect, Stage, Text } from "react-konva";
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
import type {
	DraftDrawer,
	DraftSplit,
	SelectionBox,
} from "./useBlueprintCanvasPointerInteractions.types";

interface BlueprintCanvasStageProps {
	stageRef: React.RefObject<KonvaStage | null>;
	width: number;
	height: number;
	drawers: DrawerWithCompartments[];
	drawersForRender: DrawerWithCompartments[];
	viewport: Viewport;
	mode: CanvasMode;
	tool: BlueprintTool;
	isLocked: boolean;
	isLockedByMe: boolean;
	isPanning: boolean;
	gridSize: number;
	gridColor: string;
	selectedElement: SelectedElement;
	selectedDrawerIdSet: Set<string>;
	highlightedCompartmentIds?: string[];
	invalidDrop: boolean;
	selectionBox: SelectionBox | null;
	draftDrawer: DraftDrawer | null;
	hoverSplit: DraftSplit | null;
	draftSplit: DraftSplit | null;
	dragState: {
		compartmentId: string;
		fromDrawerId: string;
	} | null;
	dragHover: {
		targetDrawerId: string | null;
		targetCompartmentId: string | null;
	} | null;
	dragOverlays: {
		origin: { x: number; y: number; width: number; height: number } | null;
		target: { x: number; y: number; width: number; height: number } | null;
	} | null;
	compartmentsWithInventory?: Map<string, number>;
	handleWheel: (e: KonvaEventObject<WheelEvent>) => void;
	handleMouseDown: (e: KonvaEventObject<MouseEvent>) => void;
	handleMouseMove: (e: KonvaEventObject<MouseEvent>) => void;
	handleMouseUp: () => void;
	handleDrawerSelect: (drawer: Drawer) => void;
	handleCompartmentSelect: (compartment: Compartment, drawerId: string) => void;
	handleCompartmentDoubleClick: (
		compartment: Compartment,
		drawer: Drawer,
	) => void;
	handleCompartmentDragStart: (next: {
		compartmentId: string;
		fromDrawerId: string;
		worldX: number;
		worldY: number;
	}) => void;
	handleCompartmentDragMove: (next: {
		compartmentId: string;
		fromDrawerId: string;
		worldX: number;
		worldY: number;
	}) => void;
	handleCompartmentDragEnd: (next: {
		compartmentId: string;
		fromDrawerId: string;
		worldX: number;
		worldY: number;
	}) => Promise<void>;
	handleCompartmentTransformEnd: (
		compartmentId: string,
		x: number,
		y: number,
		width: number,
		height: number,
		rotation: number,
	) => void;
}

function renderSplitLine(
	split: DraftSplit,
	drawer: DrawerWithCompartments,
	color: string,
	strokeWidth: number,
	dash: number[],
): React.ReactNode {
	const comp =
		split.targetCompartmentId && drawer.compartments.length > 0
			? (drawer.compartments.find((c) => c._id === split.targetCompartmentId) ??
				null)
			: null;

	const drawerTop = drawer.y - drawer.height / 2;
	const drawerBottom = drawer.y + drawer.height / 2;
	const drawerLeft = drawer.x - drawer.width / 2;
	const drawerRight = drawer.x + drawer.width / 2;

	const regionTop = comp ? drawer.y + comp.y - comp.height / 2 : drawerTop;
	const regionBottom = comp ? drawer.y + comp.y + comp.height / 2 : drawerBottom;
	const regionLeft = comp ? drawer.x + comp.x - comp.width / 2 : drawerLeft;
	const regionRight = comp ? drawer.x + comp.x + comp.width / 2 : drawerRight;

	if (split.orientation === "vertical") {
		const x = drawer.x + split.position;
		return (
			<Line
				points={[x, regionTop, x, regionBottom]}
				stroke={color}
				strokeWidth={strokeWidth}
				dash={dash}
				listening={false}
			/>
		);
	}

	const y = drawer.y + split.position;
	return (
		<Line
			points={[regionLeft, y, regionRight, y]}
			stroke={color}
			strokeWidth={strokeWidth}
			dash={dash}
			listening={false}
		/>
	);
}

export function BlueprintCanvasStage({
	stageRef,
	width,
	height,
	drawers,
	drawersForRender,
	viewport,
	mode,
	tool,
	isLocked,
	isLockedByMe,
	isPanning,
	gridSize,
	gridColor,
	selectedElement,
	selectedDrawerIdSet,
	highlightedCompartmentIds,
	invalidDrop,
	selectionBox,
	draftDrawer,
	hoverSplit,
	draftSplit,
	dragState,
	dragHover,
	dragOverlays,
	compartmentsWithInventory,
	handleWheel,
	handleMouseDown,
	handleMouseMove,
	handleMouseUp,
	handleDrawerSelect,
	handleCompartmentSelect,
	handleCompartmentDoubleClick,
	handleCompartmentDragStart,
	handleCompartmentDragMove,
	handleCompartmentDragEnd,
	handleCompartmentTransformEnd,
}: BlueprintCanvasStageProps) {
	const performanceMode = isPanning || dragState !== null;
	const showLabels = !isPanning && viewport.zoom >= 0.5;

	const highlightedCompartmentIdSet = useMemo(() => {
		return new Set(highlightedCompartmentIds ?? []);
	}, [highlightedCompartmentIds]);

	const highlightedDrawerIdSet = useMemo(() => {
		if (highlightedCompartmentIdSet.size === 0) return new Set<string>();
		const result = new Set<string>();
		for (const drawer of drawersForRender) {
			if (
				drawer.compartments.some((c) => highlightedCompartmentIdSet.has(c._id))
			) {
				result.add(drawer._id);
			}
		}
		return result;
	}, [drawersForRender, highlightedCompartmentIdSet]);

	const gridLines = useMemo(() => {
		const lines = [];
		const zoom = viewport.zoom;
		const stageW = width + 2;
		const stageH = height + 2;

		const minGridPx = 24;
		const densityFactor = Math.max(1, Math.ceil(minGridPx / (gridSize * zoom)));
		const gridStepWorld = gridSize * densityFactor;

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
					stroke={gridColor}
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
					stroke={gridColor}
					strokeWidth={1}
					listening={false}
				/>,
			);
		}

		return lines;
	}, [gridColor, gridSize, height, viewport, width]);

	return (
		<div
			className="relative w-full h-full overflow-hidden bg-slate-50 cursor-crosshair"
			style={{
				cursor: tool === "pan" || isPanning ? "grab" : "default",
			}}
		>
			<Stage
				ref={stageRef}
				width={width + 2}
				height={height + 2}
				onWheel={handleWheel}
				onContextMenu={(e) => e.evt.preventDefault()}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
				draggable={false}
			>
				<Layer listening={false}>{gridLines}</Layer>

				<Layer
					x={viewport.x}
					y={viewport.y}
					scaleX={viewport.zoom}
					scaleY={viewport.zoom}
				>
					{selectionBox && (
						<Rect
							x={Math.min(selectionBox.startWorldX, selectionBox.endWorldX)}
							y={Math.min(selectionBox.startWorldY, selectionBox.endWorldY)}
							width={Math.abs(
								selectionBox.endWorldX - selectionBox.startWorldX,
							)}
							height={Math.abs(
								selectionBox.endWorldY - selectionBox.startWorldY,
							)}
							fill="rgba(2,132,199,0.08)"
							stroke="rgba(2,132,199,0.9)"
							strokeWidth={2}
							dash={[8, 6]}
							listening={false}
						/>
					)}

					{drawersForRender.map((drawer) => (
						<DrawerShape
							key={drawer._id}
							drawer={drawer}
							isSelected={selectedDrawerIdSet.has(drawer._id)}
							isLocked={isLocked}
							isLockedByMe={isLockedByMe}
							mode={mode}
							selectEnabled={tool !== "pan"}
							editEnabled={mode === "edit" && isLockedByMe && tool === "select"}
							performanceMode={performanceMode}
							showLabel={showLabels}
							highlighted={highlightedDrawerIdSet.has(drawer._id)}
							invalidDrop={invalidDrop && selectedDrawerIdSet.has(drawer._id)}
							onSelect={handleDrawerSelect}
						/>
					))}

					{drawersForRender.map((drawer) =>
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
								isDropTarget={dragHover?.targetCompartmentId === compartment._id}
								inventoryCount={
									compartmentsWithInventory?.get(compartment._id) ?? 0
								}
								onSelect={handleCompartmentSelect}
								onDoubleClick={handleCompartmentDoubleClick}
								onDragStart={handleCompartmentDragStart}
								onDragMove={handleCompartmentDragMove}
								onDragEnd={handleCompartmentDragEnd}
								onTransformEnd={handleCompartmentTransformEnd}
							/>
						)),
					)}

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

					{!draftSplit && tool === "split" && isLockedByMe && hoverSplit && (() => {
						const drawer = drawers.find((d) => d._id === hoverSplit.drawerId);
						if (!drawer) return null;
						return renderSplitLine(
							hoverSplit,
							drawer,
							"rgba(99,102,241,0.55)",
							2,
							[8, 6],
						);
					})()}

					{draftSplit && (() => {
						const drawer = drawers.find((d) => d._id === draftSplit.drawerId);
						if (!drawer) return null;
						return renderSplitLine(
							draftSplit,
							drawer,
							"rgba(99,102,241,0.95)",
							3,
							[10, 6],
						);
					})()}
				</Layer>

				<Layer listening={false}>
					<Group x={viewport.x} y={viewport.y}>
						<Line points={[-10, 0, 10, 0]} stroke="#ef4444" strokeWidth={2} />
						<Line points={[0, -10, 0, 10]} stroke="#ef4444" strokeWidth={2} />
						<Text x={12} y={-15} text="(0,0)" fontSize={10} fill="#ef4444" />
					</Group>
				</Layer>
			</Stage>
		</div>
	);
}
