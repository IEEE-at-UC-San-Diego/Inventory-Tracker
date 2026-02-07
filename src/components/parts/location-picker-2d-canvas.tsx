import type { KonvaEventObject } from "konva/lib/Node";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import { Layers } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { Card, CardContent } from "@/components/ui/card";
import type { Blueprint, Compartment, Drawer, Viewport } from "@/types";
export type ViewLevel = "blueprints" | "drawers" | "compartments";
export type DrawerWithCompartments = Drawer & { compartments?: Compartment[] };

const GRID_SIZE = 50;
const GRID_COLOR = "#e2e8f0";

// ============================================
// Utility Functions
// ============================================

function getDefaultViewport(
	canvasWidth: number,
	canvasHeight: number,
): Viewport {
	const zoom = Math.min(canvasWidth / 1000, canvasHeight / 1000, 1) * 0.9;
	const scaledWidth = 1000 * zoom;
	const scaledHeight = 1000 * zoom;
	return {
		x: (canvasWidth - scaledWidth) / 2,
		y: (canvasHeight - scaledHeight) / 2,
		zoom,
	};
}

function clampZoom(zoom: number, min = 0.1, max = 5): number {
	return Math.max(min, Math.min(max, zoom));
}

function getElementsBounds(
	drawers: Array<{ x: number; y: number; width: number; height: number }>,
	padding = 50,
) {
	if (drawers.length === 0) {
		return { minX: -500, minY: -500, maxX: 500, maxY: 500 };
	}

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (const drawer of drawers) {
		const halfW = drawer.width / 2;
		const halfH = drawer.height / 2;
		minX = Math.min(minX, drawer.x - halfW);
		minY = Math.min(minY, drawer.y - halfH);
		maxX = Math.max(maxX, drawer.x + halfW);
		maxY = Math.max(maxY, drawer.y + halfH);
	}

	return {
		minX: minX - padding,
		minY: minY - padding,
		maxX: maxX + padding,
		maxY: maxY + padding,
	};
}

// ============================================
// Konva Canvas Components
// ============================================

interface SimpleDrawerShapeProps {
	drawer: Drawer;
	isSelected: boolean;
	isHighlighted: boolean;
	compartmentCount: number;
	onClick: () => void;
}

function SimpleDrawerShape({
	drawer,
	isSelected,
	isHighlighted,
	compartmentCount,
	onClick,
}: SimpleDrawerShapeProps) {
	const fill = isSelected ? "#bae6fd" : isHighlighted ? "#dcfce7" : "#e0f2fe";
	const stroke = isSelected ? "#0284c7" : isHighlighted ? "#22c55e" : "#0ea5e9";
	const strokeWidth = isSelected || isHighlighted ? 3 : 2;

	const handleClick = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
			e.cancelBubble = true;
			onClick();
		},
		[onClick],
	);

	return (
		<Group
			x={drawer.x}
			y={drawer.y}
			rotation={drawer.rotation}
			onClick={handleClick}
			onTap={
				handleClick as unknown as (evt: KonvaEventObject<TouchEvent>) => void
			}
			cursor="pointer"
		>
			<Rect
				x={-drawer.width / 2}
				y={-drawer.height / 2}
				width={drawer.width}
				height={drawer.height}
				fill={fill}
				stroke={stroke}
				strokeWidth={strokeWidth}
				cornerRadius={4}
				shadowColor="black"
				shadowBlur={isSelected ? 10 : 5}
				shadowOpacity={0.1}
				shadowOffsetY={2}
			/>
			<Text
				x={-drawer.width / 2 + 8}
				y={-drawer.height / 2 + 8}
				text={drawer.label || "Drawer"}
				fontSize={12}
				fontFamily="system-ui, -apple-system, sans-serif"
				fill="#0c4a6e"
				fontStyle={isSelected ? "bold" : "normal"}
				width={drawer.width - 16}
				ellipsis
			/>
			<Text
				x={-drawer.width / 2 + 8}
				y={drawer.height / 2 - 20}
				text={`${compartmentCount} compartments`}
				fontSize={10}
				fill="#64748b"
			/>
		</Group>
	);
}

interface SimpleCompartmentShapeProps {
	compartment: Compartment;
	drawer: Drawer;
	isSelected: boolean;
	disabled?: boolean;
	onClick: () => void;
}

function SimpleCompartmentShape({
	compartment,
	drawer,
	isSelected,
	disabled = false,
	onClick,
}: SimpleCompartmentShapeProps) {
	const absoluteX = drawer.x + compartment.x;
	const absoluteY = drawer.y + compartment.y;
	const fill = disabled ? "#f1f5f9" : isSelected ? "#e0f2fe" : "#f8fafc";
	const stroke = disabled ? "#cbd5e1" : isSelected ? "#0ea5e9" : "#94a3b8";
	const strokeWidth = isSelected ? 2 : 1;

	const handleClick = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
			e.cancelBubble = true;
			onClick();
		},
		[onClick],
	);

	return (
		<Group
			x={absoluteX}
			y={absoluteY}
			rotation={drawer.rotation + compartment.rotation}
			onClick={handleClick}
			onTap={
				handleClick as unknown as (evt: KonvaEventObject<TouchEvent>) => void
			}
			cursor={disabled ? "not-allowed" : "pointer"}
		>
			<Rect
				x={-compartment.width / 2}
				y={-compartment.height / 2}
				width={compartment.width}
				height={compartment.height}
				fill={fill}
				stroke={stroke}
				strokeWidth={strokeWidth}
				cornerRadius={2}
				shadowColor="black"
				shadowBlur={isSelected ? 6 : 2}
				shadowOpacity={0.05}
				shadowOffsetY={1}
			/>
			{compartment.width > 40 && compartment.height > 30 && (
				<Text
					x={-compartment.width / 2 + 4}
					y={-compartment.height / 2 + 4}
					text={compartment.label || `#${compartment._id.slice(-4)}`}
					fontSize={10}
					fontFamily="system-ui, -apple-system, sans-serif"
					fill="#475569"
					opacity={disabled ? 0.5 : 1}
					fontStyle={isSelected ? "bold" : "normal"}
					width={compartment.width - 8}
					height={compartment.height - 8}
					align="center"
					verticalAlign="middle"
					ellipsis
				/>
			)}
			{isSelected && (
				<Rect
					x={-compartment.width / 2 - 2}
					y={-compartment.height / 2 - 2}
					width={compartment.width + 4}
					height={compartment.height + 4}
					stroke="#0ea5e9"
					strokeWidth={1}
					dash={[4, 2]}
					cornerRadius={3}
					listening={false}
				/>
			)}
		</Group>
	);
}

// ============================================
// Canvas View Component
// ============================================

interface CanvasViewProps {
	width: number;
	height: number;
	drawers: Array<Drawer & { compartments?: Compartment[] }>;
	selectedDrawerId?: string;
	selectedCompartmentId?: string;
	disabledCompartmentIds?: string[];
	onDrawerClick: (drawer: Drawer) => void;
	onCompartmentClick: (compartment: Compartment, drawer: Drawer) => void;
}

export function CanvasView({
	width,
	height,
	drawers,
	selectedDrawerId,
	selectedCompartmentId,
	disabledCompartmentIds,
	onDrawerClick,
	onCompartmentClick,
}: CanvasViewProps) {
	const stageRef = useRef<KonvaStage>(null);
	const [viewport, setViewport] = useState<Viewport>(() =>
		getDefaultViewport(width, height),
	);
	const [isPanning, setIsPanning] = useState(false);
	const lastPointerPosition = useRef<{ x: number; y: number } | null>(null);
	const disabledCompartmentIdSet = useMemo(
		() => new Set(disabledCompartmentIds ?? []),
		[disabledCompartmentIds],
	);

	useEffect(() => {
		if (width > 0 && height > 0) {
			setViewport(getDefaultViewport(width, height));
		}
	}, [width, height]);

	useEffect(() => {
		if (drawers.length === 0) {
			setViewport(getDefaultViewport(width, height));
			return;
		}

		const bounds = getElementsBounds(drawers, 50);
		const boundsWidth = bounds.maxX - bounds.minX;
		const boundsHeight = bounds.maxY - bounds.minY;

		const padding = 50;
		const availableWidth = width - padding * 2;
		const availableHeight = height - padding * 2;

		const zoom = Math.min(
			availableWidth / boundsWidth,
			availableHeight / boundsHeight,
			1.5,
		);

		const clampedZoom = Math.max(zoom, 0.1);
		const scaledWidth = boundsWidth * clampedZoom;
		const scaledHeight = boundsHeight * clampedZoom;

		setViewport({
			x: (width - scaledWidth) / 2 - bounds.minX * clampedZoom,
			y: (height - scaledHeight) / 2 - bounds.minY * clampedZoom,
			zoom: clampedZoom,
		});
	}, [drawers, width, height]);

	const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
		e.evt.preventDefault();
		const stage = stageRef.current;
		if (!stage) return;

		const pointer = stage.getPointerPosition();
		if (!pointer) return;

		const delta = e.evt.deltaY;
		const factor = delta > 0 ? 0.9 : 1.1;

		setViewport((prev) => {
			const newZoom = clampZoom(prev.zoom * factor);
			const zoomRatio = newZoom / prev.zoom;
			return {
				zoom: newZoom,
				x: pointer.x - (pointer.x - prev.x) * zoomRatio,
				y: pointer.y - (pointer.y - prev.y) * zoomRatio,
			};
		});
	}, []);

	const handleMouseDown = useCallback((e: KonvaEventObject<MouseEvent>) => {
		if (
			e.evt.button === 1 ||
			e.evt.button === 2 ||
			(e.evt.button === 0 && e.evt.shiftKey)
		) {
			setIsPanning(true);
			lastPointerPosition.current = {
				x: e.evt.clientX,
				y: e.evt.clientY,
			};
		}
	}, []);

	const handleMouseMove = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
			if (!isPanning || !lastPointerPosition.current) return;

			const dx = e.evt.clientX - lastPointerPosition.current.x;
			const dy = e.evt.clientY - lastPointerPosition.current.y;

			setViewport((prev) => ({
				...prev,
				x: prev.x + dx,
				y: prev.y + dy,
			}));

			lastPointerPosition.current = {
				x: e.evt.clientX,
				y: e.evt.clientY,
			};
		},
		[isPanning],
	);

	const handleMouseUp = useCallback(() => {
		setIsPanning(false);
		lastPointerPosition.current = null;
	}, []);

	const gridLines = useMemo(() => {
		const lines = [];
		const offsetX = viewport.x % (GRID_SIZE * viewport.zoom);
		const offsetY = viewport.y % (GRID_SIZE * viewport.zoom);

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
			className="relative w-full h-full overflow-hidden bg-slate-50"
			style={{ cursor: isPanning ? "grabbing" : "default" }}
		>
			<Stage
				ref={stageRef}
				width={width}
				height={height}
				onContextMenu={(e) => e.evt.preventDefault()}
				onWheel={handleWheel}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
			>
				<Layer listening={false}>{gridLines}</Layer>
				<Layer
					x={viewport.x}
					y={viewport.y}
					scaleX={viewport.zoom}
					scaleY={viewport.zoom}
				>
					{drawers.map((drawer) => (
						<SimpleDrawerShape
							key={drawer._id}
							drawer={drawer}
							isSelected={selectedDrawerId === drawer._id}
							isHighlighted={false}
							compartmentCount={drawer.compartments?.length || 0}
							onClick={() => onDrawerClick(drawer)}
						/>
					))}
					{drawers.map((drawer) =>
						drawer.compartments?.map((compartment) => (
							<SimpleCompartmentShape
								key={compartment._id}
								compartment={compartment}
								drawer={drawer}
								isSelected={selectedCompartmentId === compartment._id}
								disabled={disabledCompartmentIdSet.has(compartment._id)}
								onClick={() => {
									if (disabledCompartmentIdSet.has(compartment._id)) return;
									onCompartmentClick(compartment, drawer);
								}}
							/>
						)),
					)}
				</Layer>
			</Stage>
			<div className="absolute bottom-2 right-2 px-2 py-1 bg-white/80 rounded text-xs text-gray-500">
				Scroll to zoom • Right-drag or Shift+drag to pan
			</div>
		</div>
	);
}

// ============================================
// Blueprint Card Component
// ============================================

interface BlueprintGridCardProps {
	blueprint: Blueprint;
	isSelected: boolean;
	onClick: () => void;
}

export function BlueprintGridCard({
	blueprint,
	isSelected,
	onClick,
}: BlueprintGridCardProps) {
	return (
		<Card
			onClick={onClick}
			className={`cursor-pointer transition-all hover:shadow-lg ${
				isSelected
					? "ring-2 ring-cyan-500 border-cyan-500 bg-cyan-50"
					: "border-gray-200 hover:border-cyan-300"
			}`}
		>
			<CardContent className="p-4">
				<div className="w-full h-24 bg-gradient-to-br from-cyan-50 to-slate-100 rounded-md mb-3 flex items-center justify-center border-2 border-dashed border-cyan-200">
					<Layers className="w-10 h-10 text-cyan-400" />
				</div>
				<h3 className="font-semibold text-gray-900 text-sm truncate">
					{blueprint.name}
				</h3>
			</CardContent>
		</Card>
	);
}
