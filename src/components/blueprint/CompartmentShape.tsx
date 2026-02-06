import type { Group as KonvaGroup } from "konva/lib/Group";
import type { KonvaEventObject } from "konva/lib/Node";
import { memo, useCallback, useRef } from "react";
import { Circle, Group, Rect, Text } from "react-konva";
import type { Compartment, Drawer, Viewport } from "@/types";

interface CompartmentShapeProps {
	compartment: Compartment;
	drawer: Drawer;
	isSelected: boolean;
	isLockedByMe: boolean;
	mode: "view" | "edit";
	viewport: Viewport;
	selectEnabled?: boolean;
	editEnabled?: boolean;
	highlighted?: boolean;
	highlightColor?: string;
	inventoryCount?: number;
	isDragOrigin?: boolean;
	isDropTarget?: boolean;
	performanceMode?: boolean;
	showLabel?: boolean;
	onSelect: (compartment: Compartment, drawerId: string) => void;
	onDoubleClick?: (compartment: Compartment, drawer: Drawer) => void;
	onDragStart?: (next: {
		compartmentId: string;
		fromDrawerId: string;
		worldX: number;
		worldY: number;
	}) => void;
	onDragMove?: (next: {
		compartmentId: string;
		fromDrawerId: string;
		worldX: number;
		worldY: number;
	}) => void;
	onDragEnd: (next: {
		compartmentId: string;
		fromDrawerId: string;
		worldX: number;
		worldY: number;
	}) => void;
	onTransformEnd: (
		compartmentId: string,
		x: number,
		y: number,
		width: number,
		height: number,
		rotation: number,
	) => void;
}

const COMPARTMENT_COLORS = {
	default: {
		fill: "#f8fafc", // slate-50
		stroke: "#94a3b8", // slate-400
		strokeWidth: 1,
	},
	selected: {
		fill: "#f3e8ff", // purple-100
		stroke: "#a855f7", // purple-500 - distinct from drawer's blue
		strokeWidth: 3,
	},
	highlighted: {
		fill: "#dcfce7", // green-100
		stroke: "#22c55e", // green-500
		strokeWidth: 2,
	},
	hasInventory: {
		fill: "#eff6ff", // blue-50
		stroke: "#3b82f6", // blue-500
		strokeWidth: 1,
	},
};

const GRID_SIZE = 50;
const snapToGrid = (value: number): number =>
	Math.round(value / GRID_SIZE) * GRID_SIZE;

export const CompartmentShape = memo(function CompartmentShape({
	compartment,
	drawer,
	isSelected,
	isLockedByMe,
	mode,
	viewport,
	selectEnabled = true,
	editEnabled,
	highlighted = false,
	highlightColor,
	inventoryCount = 0,
	isDragOrigin = false,
	isDropTarget = false,
	performanceMode = false,
	showLabel = true,
	onSelect,
	onDoubleClick,
	onDragStart,
	onDragMove,
	onDragEnd,
	onTransformEnd,
}: CompartmentShapeProps) {
	const shapeRef = useRef<KonvaGroup>(null);
	const dragStartRef = useRef<{ x: number; y: number } | null>(null);

	// Determine colors based on state
	const getColors = () => {
		if (highlighted)
			return {
				...COMPARTMENT_COLORS.highlighted,
				stroke: highlightColor || COMPARTMENT_COLORS.highlighted.stroke,
			};
		if (isSelected) return COMPARTMENT_COLORS.selected;
		if (inventoryCount > 0) return COMPARTMENT_COLORS.hasInventory;
		return COMPARTMENT_COLORS.default;
	};

	const baseColors = getColors();
	const colors = isDropTarget
		? {
				...baseColors,
				stroke: "#7c3aed",
				strokeWidth: 3,
			}
		: baseColors;
	const isEditable = editEnabled ?? (mode === "edit" && isLockedByMe);

	// Calculate absolute position within the drawer
	// Compartment coordinates are relative to drawer's center
	const absoluteX = drawer.x + compartment.x;
	const absoluteY = drawer.y + compartment.y;

	const handleClick = useCallback(
		(e: KonvaEventObject<MouseEvent | TouchEvent>) => {
			e.cancelBubble = true;
			if ("button" in e.evt && e.evt.button !== 0) return;
			if (!selectEnabled) return;
			onSelect(compartment, drawer._id);
		},
		[compartment, drawer._id, onSelect, selectEnabled],
	);

	const handleTap = useCallback(
		(e: KonvaEventObject<TouchEvent>) => {
			e.cancelBubble = true;
			if (!selectEnabled) return;
			onSelect(compartment, drawer._id);
		},
		[compartment, drawer._id, onSelect, selectEnabled],
	);

	const handleDblClick = useCallback(
		(e: KonvaEventObject<MouseEvent | TouchEvent>) => {
			e.cancelBubble = true;
			if ("button" in e.evt && e.evt.button !== 0) return;
			if (!selectEnabled) return;
			onDoubleClick?.(compartment, drawer);
		},
		[compartment, drawer, onDoubleClick, selectEnabled],
	);

	const handleDragEnd = useCallback(
		(e: KonvaEventObject<DragEvent>) => {
			if (!isEditable) return;
			const node = e.target;
			const dropX = node.x();
			const dropY = node.y();

			// Immediately snap back to the last committed position; the real position is driven
			// by Convex state updates (swap/move). This prevents "free roaming" outside drawers.
			if (dragStartRef.current) {
				node.position(dragStartRef.current);
				node.getLayer()?.batchDraw();
			}
			onDragEnd({
				compartmentId: compartment._id,
				fromDrawerId: drawer._id,
				worldX: dropX,
				worldY: dropY,
			});
		},
		[compartment._id, drawer._id, isEditable, onDragEnd],
	);

	const handleTransformEnd = useCallback(() => {
		if (!isEditable || !shapeRef.current) return;

		const node = shapeRef.current;
		const scaleX = node.scaleX();
		const scaleY = node.scaleY();

		// Reset scale and apply to width/height
		node.scaleX(1);
		node.scaleY(1);

		const newWidth = Math.max(15, compartment.width * scaleX);
		const newHeight = Math.max(15, compartment.height * scaleY);

		// Clamp size to drawer bounds
		const clampedWidth = Math.min(newWidth, drawer.width - 10);
		const clampedHeight = Math.min(newHeight, drawer.height - 10);

		onTransformEnd(
			compartment._id,
			snapToGrid(compartment.x),
			snapToGrid(compartment.y),
			Math.max(GRID_SIZE, snapToGrid(clampedWidth)),
			Math.max(GRID_SIZE, snapToGrid(clampedHeight)),
			node.rotation(),
		);
	}, [isEditable, compartment, drawer, onTransformEnd]);

	return (
		<Group
			name="compartment"
			compartmentId={compartment._id}
			drawerId={drawer._id}
			x={absoluteX}
			y={absoluteY}
			rotation={drawer.rotation + compartment.rotation}
			draggable={isEditable}
			dragBoundFunc={(pos) => {
				// pos is in absolute (stage/screen) coordinates.
				// Convert to world coordinates, snap, then convert back.
				const worldX = (pos.x - viewport.x) / viewport.zoom;
				const worldY = (pos.y - viewport.y) / viewport.zoom;
				const snappedTopLeftX = snapToGrid(worldX - compartment.width / 2);
				const snappedTopLeftY = snapToGrid(worldY - compartment.height / 2);
				const snappedWorldX = snappedTopLeftX + compartment.width / 2;
				const snappedWorldY = snappedTopLeftY + compartment.height / 2;
				return {
					x: snappedWorldX * viewport.zoom + viewport.x,
					y: snappedWorldY * viewport.zoom + viewport.y,
				};
			}}
			onDragStart={(e) => {
				dragStartRef.current = { x: e.target.x(), y: e.target.y() };
				// Ensure the dragged compartment is visually on top while moving.
				e.target.moveToTop();
				e.target.getLayer()?.batchDraw();
				onDragStart?.({
					compartmentId: compartment._id,
					fromDrawerId: drawer._id,
					worldX: e.target.x(),
					worldY: e.target.y(),
				});
			}}
			onDragMove={(e) => {
				if (!isEditable) return;
				onDragMove?.({
					compartmentId: compartment._id,
					fromDrawerId: drawer._id,
					worldX: e.target.x(),
					worldY: e.target.y(),
				});
			}}
			onClick={handleClick}
			onTap={handleTap}
			onDblClick={handleDblClick}
			onDragEnd={handleDragEnd}
			onTransformEnd={handleTransformEnd}
			ref={shapeRef}
		>
			{/* Main compartment rectangle - centered at (0,0) */}
			<Rect
				x={-compartment.width / 2}
				y={-compartment.height / 2}
				width={compartment.width}
				height={compartment.height}
				fill={colors.fill}
				stroke={colors.stroke}
				strokeWidth={colors.strokeWidth}
				cornerRadius={2}
				shadowColor="black"
				shadowBlur={performanceMode ? 0 : isSelected ? 6 : 2}
				shadowOpacity={performanceMode ? 0 : 0.05}
				shadowOffsetY={1}
				perfectDrawEnabled={false}
			/>

			{/* Label text - only if compartment is large enough */}
			{showLabel && compartment.width > 40 && compartment.height > 30 && (
				<Text
					x={-compartment.width / 2 + 4}
					y={-compartment.height / 2 + 4}
					text={compartment.label || `#${compartment._id.slice(-4)}`}
					fontSize={10}
					fontFamily="system-ui, -apple-system, sans-serif"
					fill="#475569"
					fontStyle={isSelected ? "bold" : "normal"}
					width={compartment.width - 8}
					height={compartment.height - 8}
					align="center"
					verticalAlign="middle"
					ellipsis
					perfectDrawEnabled={false}
					listening={false}
				/>
			)}

			{/* Inventory count badge */}
			{inventoryCount > 0 && (
				<Group x={compartment.width / 2 - 14} y={-compartment.height / 2 + 4}>
					<Circle
						radius={10}
						fill="#3b82f6"
						shadowColor="black"
						shadowBlur={performanceMode ? 0 : 2}
						shadowOpacity={performanceMode ? 0 : 0.2}
						perfectDrawEnabled={false}
						listening={false}
					/>
					<Text
						text={inventoryCount > 99 ? "99+" : String(inventoryCount)}
						fontSize={inventoryCount > 9 ? 8 : 9}
						fontFamily="system-ui, -apple-system, sans-serif"
						fill="white"
						fontStyle="bold"
						width={20}
						height={20}
						x={-10}
						y={-7}
						align="center"
						verticalAlign="middle"
						perfectDrawEnabled={false}
						listening={false}
					/>
				</Group>
			)}

			{/* Selection indicator (subtle border glow) */}
			{(isSelected || isDragOrigin) && (
				<Rect
					x={-compartment.width / 2 - 2}
					y={-compartment.height / 2 - 2}
					width={compartment.width + 4}
					height={compartment.height + 4}
					stroke={isDragOrigin ? "rgba(2,132,199,0.9)" : "#a855f7"}
					strokeWidth={2}
					dash={[4, 2]}
					cornerRadius={3}
					listening={false}
					perfectDrawEnabled={false}
				/>
			)}
		</Group>
	);
});
