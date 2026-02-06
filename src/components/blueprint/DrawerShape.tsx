import type { Group as KonvaGroup } from "konva/lib/Group";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Transformer as KonvaTransformer } from "konva/lib/shapes/Transformer";
import { memo, useCallback, useRef } from "react";
import { Group, Rect, Text, Transformer } from "react-konva";
import type { Drawer, Viewport } from "@/types";

interface DrawerShapeProps {
	drawer: Drawer;
	isSelected: boolean;
	isLocked: boolean;
	isLockedByMe: boolean;
	mode: "view" | "edit";
	viewport: Viewport;
	selectEnabled?: boolean;
	editEnabled?: boolean;
	highlighted?: boolean;
	highlightColor?: string;
	performanceMode?: boolean;
	showLabel?: boolean;
	onSelect: (drawer: Drawer) => void;
	onDragEnd: (drawerId: string, x: number, y: number) => void;
	onTransformEnd: (
		drawerId: string,
		x: number,
		y: number,
		width: number,
		height: number,
		rotation: number,
	) => void;
}

const DRAWER_COLORS = {
	default: {
		fill: "#e0f2fe", // cyan-100
		stroke: "#0ea5e9", // cyan-500
		strokeWidth: 2,
	},
	selected: {
		fill: "#bae6fd", // cyan-200
		stroke: "#0284c7", // cyan-600
		strokeWidth: 3,
	},
	locked: {
		fill: "#fef3c7", // amber-100
		stroke: "#f59e0b", // amber-500
		strokeWidth: 2,
	},
	highlighted: {
		fill: "#dcfce7", // green-100
		stroke: "#22c55e", // green-500
		strokeWidth: 3,
	},
};

const GRID_SIZE = 50;
const snapToGrid = (value: number): number =>
	Math.round(value / GRID_SIZE) * GRID_SIZE;

export const DrawerShape = memo(function DrawerShape({
	drawer,
	isSelected,
	isLocked,
	isLockedByMe,
	mode,
	viewport,
	selectEnabled = true,
	editEnabled,
	highlighted = false,
	highlightColor,
	performanceMode = false,
	showLabel = true,
	onSelect,
	onDragEnd,
	onTransformEnd,
}: DrawerShapeProps) {
	const shapeRef = useRef<KonvaGroup>(null);
	const trRef = useRef<KonvaTransformer>(null);

	// Determine colors based on state
	const getColors = () => {
		if (highlighted)
			return {
				...DRAWER_COLORS.highlighted,
				stroke: highlightColor || DRAWER_COLORS.highlighted.stroke,
			};
		if (isSelected) return DRAWER_COLORS.selected;
		if (isLocked && !isLockedByMe) return DRAWER_COLORS.locked;
		return DRAWER_COLORS.default;
	};

	const colors = getColors();
	const isEditable = editEnabled ?? (mode === "edit" && isLockedByMe);

	const handleClick = useCallback(
		(e: KonvaEventObject<MouseEvent | TouchEvent>) => {
			e.cancelBubble = true;
			if ("button" in e.evt && e.evt.button !== 0) return;
			if (!selectEnabled) return;
			onSelect(drawer);
		},
		[drawer, onSelect, selectEnabled],
	);

	const handleTap = useCallback(
		(e: KonvaEventObject<TouchEvent>) => {
			e.cancelBubble = true;
			if (!selectEnabled) return;
			onSelect(drawer);
		},
		[drawer, onSelect, selectEnabled],
	);

	const handleDragEnd = useCallback(
		(e: KonvaEventObject<DragEvent>) => {
			if (!isEditable) return;
			const node = e.target;
			// Snap drawer corners to the grid by snapping the top-left corner, then recomputing center.
			const snappedTopLeftX = snapToGrid(node.x() - drawer.width / 2);
			const snappedTopLeftY = snapToGrid(node.y() - drawer.height / 2);
			onDragEnd(
				drawer._id,
				snappedTopLeftX + drawer.width / 2,
				snappedTopLeftY + drawer.height / 2,
			);
		},
		[drawer._id, drawer.height, drawer.width, isEditable, onDragEnd],
	);

	const handleTransformEnd = useCallback(() => {
		if (!isEditable || !shapeRef.current) return;

		const node = shapeRef.current;
		const scaleX = node.scaleX();
		const scaleY = node.scaleY();

		// Reset scale and apply to width/height
		node.scaleX(1);
		node.scaleY(1);

		const nextWidth = Math.max(GRID_SIZE, snapToGrid(drawer.width * scaleX));
		const nextHeight = Math.max(GRID_SIZE, snapToGrid(drawer.height * scaleY));
		const snappedTopLeftX = snapToGrid(node.x() - nextWidth / 2);
		const snappedTopLeftY = snapToGrid(node.y() - nextHeight / 2);
		const nextX = snappedTopLeftX + nextWidth / 2;
		const nextY = snappedTopLeftY + nextHeight / 2;

		onTransformEnd(drawer._id, nextX, nextY, nextWidth, nextHeight, 0);
	}, [drawer._id, drawer.height, drawer.width, isEditable, onTransformEnd]);

	// Enable transformer when selected and in edit mode
	const enableTransformer = isSelected && isEditable;

	return (
		<>
			<Group
				x={drawer.x}
				y={drawer.y}
				rotation={0}
				draggable={isEditable}
				dragBoundFunc={(pos) => {
					// pos is in absolute (stage/screen) coordinates.
					// Convert to world coordinates, snap, then convert back.
					const worldX = (pos.x - viewport.x) / viewport.zoom;
					const worldY = (pos.y - viewport.y) / viewport.zoom;
					const snappedTopLeftX = snapToGrid(worldX - drawer.width / 2);
					const snappedTopLeftY = snapToGrid(worldY - drawer.height / 2);
					const snappedWorldX = snappedTopLeftX + drawer.width / 2;
					const snappedWorldY = snappedTopLeftY + drawer.height / 2;
					return {
						x: snappedWorldX * viewport.zoom + viewport.x,
						y: snappedWorldY * viewport.zoom + viewport.y,
					};
				}}
				onClick={handleClick}
				onTap={handleTap}
				onDragEnd={handleDragEnd}
				onTransformEnd={handleTransformEnd}
				ref={shapeRef}
			>
				{/* Main drawer rectangle - centered at (0,0) for rotation */}
				<Rect
					x={-drawer.width / 2}
					y={-drawer.height / 2}
					width={drawer.width}
					height={drawer.height}
					fill={colors.fill}
					stroke={colors.stroke}
					strokeWidth={colors.strokeWidth}
					cornerRadius={4}
					shadowColor="black"
					shadowBlur={performanceMode ? 0 : isSelected ? 10 : 5}
					shadowOpacity={performanceMode ? 0 : 0.1}
					shadowOffsetY={2}
					perfectDrawEnabled={false}
				/>

				{/* Label background */}
				{showLabel && (
					<Rect
						x={-drawer.width / 2 + 4}
						y={-drawer.height / 2 + 4}
						width={Math.min(drawer.width - 8, 120)}
						height={24}
						fill={colors.fill}
						cornerRadius={2}
						opacity={0.9}
						perfectDrawEnabled={false}
						listening={false}
					/>
				)}

				{/* Label text */}
				{showLabel && (
					<Text
						x={-drawer.width / 2 + 8}
						y={-drawer.height / 2 + 8}
						text={drawer.label || "Drawer"}
						fontSize={12}
						fontFamily="system-ui, -apple-system, sans-serif"
						fill="#0c4a6e"
						fontStyle={isSelected ? "bold" : "normal"}
						width={Math.min(drawer.width - 16, 112)}
						ellipsis
						perfectDrawEnabled={false}
						listening={false}
					/>
				)}

				{/* Lock indicator */}
				{isLocked && !isLockedByMe && (
					<Text
						x={drawer.width / 2 - 24}
						y={-drawer.height / 2 + 8}
						text="🔒"
						fontSize={14}
						perfectDrawEnabled={false}
						listening={false}
					/>
				)}

				{/* ID badge (small, in corner) */}
				<Text
					x={drawer.width / 2 - 40}
					y={drawer.height / 2 - 16}
					text={`#${drawer._id.slice(-4)}`}
					fontSize={10}
					fill="#64748b"
					fontFamily="monospace"
					perfectDrawEnabled={false}
					listening={false}
				/>
			</Group>

			{/* Transformer for resize/rotate */}
			{enableTransformer && (
				<Transformer
					ref={trRef}
					nodes={shapeRef.current ? [shapeRef.current] : []}
					enabledAnchors={[
						"top-left",
						"top-right",
						"bottom-left",
						"bottom-right",
					]}
					boundBoxFunc={(oldBox, newBox) => {
						// Limit minimum size
						if (newBox.width < 20 || newBox.height < 20) {
							return oldBox;
						}
						return newBox;
					}}
					rotateEnabled={false}
				/>
			)}
		</>
	);
});
