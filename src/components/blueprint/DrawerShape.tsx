import type { Group as KonvaGroup } from "konva/lib/Group";
import type { KonvaEventObject } from "konva/lib/Node";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Group, Rect, Text } from "react-konva";
import type { Drawer } from "@/types";

interface DrawerShapeProps {
	drawer: Drawer;
	isSelected: boolean;
	isLocked: boolean;
	isLockedByMe: boolean;
	mode: "view" | "edit";
	selectEnabled?: boolean;
	editEnabled?: boolean;
	highlighted?: boolean;
	highlightColor?: string;
	performanceMode?: boolean;
	showLabel?: boolean;
	invalidDrop?: boolean;
	onSelect: (drawer: Drawer) => void;
}

const DRAWER_COLORS = {
	default: {
		fill: "#e0f2fe", // cyan-100
		stroke: "#0ea5e9", // cyan-500
		strokeWidth: 2,
	},
	selected: {
		fill: "#dbeafe", // blue-100
		stroke: "#3b82f6", // blue-500 - more prominent primary color
		strokeWidth: 4,
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
	invalidDrop: {
		fill: "#fee2e2", // red-100
		stroke: "#ef4444", // red-500
		strokeWidth: 4,
	},
};

export const DrawerShape = memo(function DrawerShape({
	drawer,
	isSelected,
	isLocked,
	isLockedByMe,
	mode,
	selectEnabled = true,
	editEnabled,
	highlighted = false,
	highlightColor,
	performanceMode = false,
	showLabel = true,
	invalidDrop = false,
	onSelect,
}: DrawerShapeProps) {
	const shapeRef = useRef<KonvaGroup>(null);
	const [isPulseOn, setIsPulseOn] = useState(false);

	useEffect(() => {
		if (!highlighted) {
			setIsPulseOn(false);
			return;
		}
		const intervalId = window.setInterval(() => {
			setIsPulseOn((prev) => !prev);
		}, 650);
		return () => window.clearInterval(intervalId);
	}, [highlighted]);

	// Determine colors based on state
	const getColors = () => {
		if (invalidDrop) return DRAWER_COLORS.invalidDrop;
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
	const highlightedStrokeWidth = highlighted
		? isPulseOn
			? 5
			: 3
		: colors.strokeWidth;
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

	return (
		<Group
			name="drawer"
			drawerId={drawer._id}
			x={drawer.x}
			y={drawer.y}
			rotation={0}
			onClick={handleClick}
			onTap={handleTap}
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
				strokeWidth={highlightedStrokeWidth}
				cornerRadius={4}
				shadowColor="black"
				shadowBlur={
					performanceMode ? 0 : highlighted ? 14 : isSelected ? 10 : 5
				}
				shadowOpacity={performanceMode ? 0 : highlighted ? 0.18 : 0.1}
				shadowOffsetY={2}
				perfectDrawEnabled={false}
			/>
			{highlighted && (
				<Rect
					x={-drawer.width / 2 - 3}
					y={-drawer.height / 2 - 3}
					width={drawer.width + 6}
					height={drawer.height + 6}
					stroke={highlightColor || "#16a34a"}
					strokeWidth={2}
					cornerRadius={6}
					opacity={isPulseOn ? 0.85 : 0.4}
					listening={false}
					perfectDrawEnabled={false}
				/>
			)}

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

			{/* Drag affordance shown for selected drawers in edit mode */}
			{isSelected && isEditable && (
				<Group>
					<Rect
						x={-40}
						y={-drawer.height / 2 - 24}
						width={80}
						height={18}
						fill="#dbeafe"
						stroke="#3b82f6"
						strokeWidth={1}
						cornerRadius={4}
						perfectDrawEnabled={false}
					/>
					<Text
						x={-26}
						y={-drawer.height / 2 - 20}
						text="DRAG"
						fontSize={10}
						fontStyle="bold"
						fill="#1d4ed8"
						perfectDrawEnabled={false}
					/>
				</Group>
			)}
		</Group>
	);
});
