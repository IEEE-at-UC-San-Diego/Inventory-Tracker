import type { KonvaEventObject } from "konva/lib/Node";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import type React from "react";
import { useMemo } from "react";
import { Group, Layer, Line, Rect, Stage, Text, Circle } from "react-konva";
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
	DraftDivider,
	DraftDividerMove,
	DraftDrawer,
	DraftResize,
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
	dividers?: Array<{
		_id: string;
		x1: number;
		y1: number;
		x2: number;
		y2: number;
		thickness: number;
	}>;
	invalidDrop: boolean;
	selectionBox: SelectionBox | null;
	draftDrawer: DraftDrawer | null;
	hoverSplit: DraftSplit | null;
	draftSplit: DraftSplit | null;
	draftDivider: DraftDivider | null;
	draftDividerMove: DraftDividerMove | null;
	draftResize: DraftResize | null;
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
	handleDividerSelect: (dividerId: string, divider: { _id: string; x1: number; y1: number; x2: number; y2: number; thickness: number }) => void;
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
	const regionBottom = comp
		? drawer.y + comp.y + comp.height / 2
		: drawerBottom;
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
	dividers,
	invalidDrop,
	selectionBox,
	draftDrawer,
	hoverSplit,
	draftSplit,
	draftDivider,
	draftDividerMove,
	draftResize,
	dragState,
	dragHover,
	dragOverlays,
	compartmentsWithInventory,
	handleWheel,
	handleMouseDown,
	handleMouseMove,
	handleMouseUp,
	handleDrawerSelect,
	handleDividerSelect,
	handleCompartmentSelect,
	handleCompartmentDoubleClick,
	handleCompartmentDragStart,
	handleCompartmentDragMove,
	handleCompartmentDragEnd,
	handleCompartmentTransformEnd,
}: BlueprintCanvasStageProps) {
	const isDividerSelected = (dividerId: string) =>
		selectedElement?.type === "divider" && selectedElement.id === dividerId;

	const isSelectTool = tool === "select";
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

	const overlapDrawerIds = useMemo(() => {
		const result = new Set<string>();

		// Drawers overlapping with a resize operation
		if (draftResize && !draftResize.isValid) {
			const halfW = draftResize.currentWidth / 2;
			const halfH = draftResize.currentHeight / 2;
			for (const other of drawersForRender) {
				if (other._id === draftResize.drawerId) continue;
				const halfOW = other.width / 2;
				const halfOH = other.height / 2;
				if (
					Math.abs(draftResize.currentX - other.x) < halfW + halfOW &&
					Math.abs(draftResize.currentY - other.y) < halfH + halfOH
				) {
					result.add(other._id);
				}
			}
		}

		// Drawers overlapping with a move operation
		if (invalidDrop) {
			const movingDrawers = drawersForRender.filter((d) => selectedDrawerIdSet.has(d._id));
			const staticDrawers = drawersForRender.filter((d) => !selectedDrawerIdSet.has(d._id));
			for (const moving of movingDrawers) {
				const mHalfW = moving.width / 2;
				const mHalfH = moving.height / 2;
				for (const other of staticDrawers) {
					const oHalfW = other.width / 2;
					const oHalfH = other.height / 2;
					if (
						Math.abs(moving.x - other.x) < mHalfW + oHalfW &&
						Math.abs(moving.y - other.y) < mHalfH + oHalfH
					) {
						result.add(other._id);
					}
				}
			}
		}

		return result;
	}, [draftResize, drawersForRender, invalidDrop, selectedDrawerIdSet]);

	const compartmentGridLabels = useMemo(() => {
		const labels = new Map<string, string>();
		const SNAP = 2;
		for (const drawer of drawersForRender) {
			if (drawer.compartments.length === 0) continue;
			// Collect unique top-edges (rows) and left-edges (columns)
			const topEdges = new Set<number>();
			const leftEdges = new Set<number>();
			for (const c of drawer.compartments) {
				const top = c.y - c.height / 2;
				const left = c.x - c.width / 2;
				// Snap to nearest existing edge
				let foundTop = false;
				for (const t of topEdges) {
					if (Math.abs(t - top) <= SNAP) { foundTop = true; break; }
				}
				if (!foundTop) topEdges.add(top);
				let foundLeft = false;
				for (const l of leftEdges) {
					if (Math.abs(l - left) <= SNAP) { foundLeft = true; break; }
				}
				if (!foundLeft) leftEdges.add(left);
			}
			const sortedRows = [...topEdges].sort((a, b) => a - b);
			const sortedCols = [...leftEdges].sort((a, b) => a - b);

			for (const c of drawer.compartments) {
				const top = c.y - c.height / 2;
				const left = c.x - c.width / 2;
				let rowIdx = 0;
				for (let i = 0; i < sortedRows.length; i++) {
					if (Math.abs(sortedRows[i] - top) <= SNAP) { rowIdx = i; break; }
				}
				let colIdx = 0;
				for (let i = 0; i < sortedCols.length; i++) {
					if (Math.abs(sortedCols[i] - left) <= SNAP) { colIdx = i; break; }
				}
				const rowLetter = String.fromCharCode(65 + (rowIdx % 26));
				const colNumber = colIdx + 1;
				labels.set(c._id, `${rowLetter}${colNumber}`);
			}
		}
		return labels;
	}, [drawersForRender]);

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

					{dividers?.map((divider) => {
						const isSelected = isDividerSelected(divider._id);
						const isEditable = mode === "edit" && isLockedByMe && tool === "select";
						// Apply draftDividerMove overrides for visual feedback during drag
						let renderX1 = divider.x1;
						let renderY1 = divider.y1;
						let renderX2 = divider.x2;
						let renderY2 = divider.y2;
						if (draftDividerMove && draftDividerMove.dividerId === divider._id) {
							if (draftDividerMove.handle === "start") {
								renderX1 = draftDividerMove.currentX;
								renderY1 = draftDividerMove.currentY;
							} else if (draftDividerMove.handle === "end") {
								renderX2 = draftDividerMove.currentX;
								renderY2 = draftDividerMove.currentY;
							} else if (draftDividerMove.handle === "line" && draftDividerMove.origX1 != null && draftDividerMove.origY1 != null && draftDividerMove.origX2 != null && draftDividerMove.origY2 != null && draftDividerMove.mouseStartX != null && draftDividerMove.mouseStartY != null) {
								const dx = draftDividerMove.currentX - draftDividerMove.mouseStartX;
								const dy = draftDividerMove.currentY - draftDividerMove.mouseStartY;
								renderX1 = draftDividerMove.origX1 + dx;
								renderY1 = draftDividerMove.origY1 + dy;
								renderX2 = draftDividerMove.origX2 + dx;
								renderY2 = draftDividerMove.origY2 + dy;
							}
						}
						return (
							<Group key={`divider-${divider._id}`}>
								{/* Draggable line hit area for whole-line movement */}
								{isSelected && isEditable && (
									<Line
										name={`divider-move-line-${divider._id}`}
										points={[renderX1, renderY1, renderX2, renderY2]}
										stroke="transparent"
										strokeWidth={Math.max(16, divider.thickness + 10)}
										lineCap="round"
										listening={true}
										hitStrokeWidth={Math.max(20, divider.thickness + 14)}
									/>
								)}
								<Line
									points={[renderX1, renderY1, renderX2, renderY2]}
									stroke={isSelected ? "#0891b2" : "#6b7280"}
									strokeWidth={Math.max(6, divider.thickness)}
									lineCap="round"
									listening={isSelectTool}
									onClick={() => handleDividerSelect?.(divider._id, divider)}
									onTap={() => handleDividerSelect?.(divider._id, divider)}
								/>
								{/* Draggable endpoints for selected dividers */}
								{isSelected && isEditable && (
									<>
										{/* Start point */}
										<Circle
											name={`divider-move-start-${divider._id}`}
											x={renderX1}
											y={renderY1}
											radius={8}
											fill="white"
											stroke="#0891b2"
											strokeWidth={2}
											listening={true}
										/>
										{/* End point */}
										<Circle
											name={`divider-move-end-${divider._id}`}
											x={renderX2}
											y={renderY2}
											radius={8}
											fill="white"
											stroke="#0891b2"
											strokeWidth={2}
											listening={true}
										/>
									</>
								)}
							</Group>
						);
					})}

					{drawersForRender.map((drawer) => (
						<DrawerShape
							key={drawer._id}
							drawer={drawer}
							isSelected={
								selectedDrawerIdSet.has(drawer._id) ||
								(selectedElement?.type === "compartment" &&
									selectedElement.drawerId === drawer._id)
							}
							isLocked={isLocked}
							isLockedByMe={isLockedByMe}
							mode={mode}
							selectEnabled={tool !== "pan"}
							editEnabled={mode === "edit" && isLockedByMe && tool === "select"}
							performanceMode={performanceMode}
							showLabel={showLabels}
							highlighted={highlightedDrawerIdSet.has(drawer._id)}
							invalidDrop={
							(invalidDrop && selectedDrawerIdSet.has(drawer._id)) ||
							(draftResize !== null && draftResize.drawerId === drawer._id && !draftResize.isValid) ||
							overlapDrawerIds.has(drawer._id)
						}
							onSelect={handleDrawerSelect}
						/>
					))}

					{drawersForRender.map((drawer) => {
						// Hide compartments for the drawer being resized
						if (draftResize && draftResize.drawerId === drawer._id) return null;
						return drawer.compartments.map((compartment) => (
							<CompartmentShape
								key={`${drawer._id}:${compartment._id}`}
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
								inventoryCount={
									compartmentsWithInventory?.get(compartment._id) ?? 0
								}
								gridLabel={compartmentGridLabels.get(compartment._id)}
								onSelect={handleCompartmentSelect}
								onDoubleClick={handleCompartmentDoubleClick}
								onDragStart={handleCompartmentDragStart}
								onDragMove={handleCompartmentDragMove}
								onDragEnd={handleCompartmentDragEnd}
								onTransformEnd={handleCompartmentTransformEnd}
							/>
						));
					})}

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

					{!draftSplit &&
						tool === "split" &&
						isLockedByMe &&
						hoverSplit &&
						(() => {
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

					{draftSplit &&
						(() => {
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

					{/* Dual-outline resize visualization */}
					{draftResize && (() => {
						const sizeChanged =
							draftResize.currentWidth !== draftResize.startWidth ||
							draftResize.currentHeight !== draftResize.startHeight;
						if (!sizeChanged) return null;
						const outlineStroke = draftResize.isValid
							? "rgba(59,130,246,0.9)"
							: "rgba(239,68,68,0.9)";
						const labelBg = draftResize.isValid
							? "rgba(30,41,59,0.85)"
							: "rgba(185,28,28,0.9)";
						return (
							<>
								{/* Original size ghost outline with distinct background */}
								<Rect
									x={draftResize.startX - draftResize.startWidth / 2}
									y={draftResize.startY - draftResize.startHeight / 2}
									width={draftResize.startWidth}
									height={draftResize.startHeight}
									fill="rgba(148,163,184,0.15)"
									stroke="rgba(148,163,184,0.6)"
									strokeWidth={2}
									dash={[6, 4]}
									cornerRadius={4}
									listening={false}
								/>
								{/* New size outline — red when invalid */}
								<Rect
									x={draftResize.currentX - draftResize.currentWidth / 2}
									y={draftResize.currentY - draftResize.currentHeight / 2}
									width={draftResize.currentWidth}
									height={draftResize.currentHeight}
									fill="transparent"
									stroke={outlineStroke}
									strokeWidth={2}
									cornerRadius={4}
									listening={false}
								/>
								{/* Dimension label */}
								<Group
									x={draftResize.currentX}
									y={draftResize.currentY + draftResize.currentHeight / 2 + 12}
								>
									<Rect
										x={-40}
										y={0}
										width={80}
										height={20}
										fill={labelBg}
										cornerRadius={4}
										listening={false}
									/>
									<Text
										x={-40}
										y={4}
										width={80}
										align="center"
										text={`${draftResize.currentWidth} × ${draftResize.currentHeight}`}
										fontSize={11}
										fontFamily="monospace"
										fill="white"
										listening={false}
									/>
								</Group>
							</>
						);
					})()}

					{draftDivider && (
						<Line
							points={[
								draftDivider.startX,
								draftDivider.startY,
								draftDivider.endX,
								draftDivider.endY,
							]}
							stroke="rgba(107,114,128,0.9)"
							strokeWidth={8}
							lineCap="round"
							listening={false}
						/>
					)}
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
