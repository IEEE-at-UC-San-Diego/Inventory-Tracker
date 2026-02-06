import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ChevronRight,
	Home,
	Layers,
	MapPin,
	Package,
	X,
	ChevronLeft,
} from "lucide-react";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useQuery } from "@/integrations/convex/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Blueprint, Drawer, Compartment, Viewport } from "@/types";

interface LocationPicker2DProps {
	orgId: string;
	selectedLocation: {
		blueprintId?: string;
		drawerId?: string;
		compartmentId?: string;
	};
	onLocationChange: (location: {
		blueprintId?: string;
		drawerId?: string;
		compartmentId?: string;
	}) => void;
	allowSkip?: boolean;
}

type ViewLevel = "blueprints" | "drawers" | "compartments";
type DrawerWithCompartments = Drawer & { compartments?: Compartment[] };

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
	onClick: () => void;
}

function SimpleCompartmentShape({
	compartment,
	drawer,
	isSelected,
	onClick,
}: SimpleCompartmentShapeProps) {
	const absoluteX = drawer.x + compartment.x;
	const absoluteY = drawer.y + compartment.y;
	const fill = isSelected ? "#e0f2fe" : "#f8fafc";
	const stroke = isSelected ? "#0ea5e9" : "#94a3b8";
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
			cursor="pointer"
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
	onDrawerClick: (drawer: Drawer) => void;
	onCompartmentClick: (compartment: Compartment, drawer: Drawer) => void;
}

function CanvasView({
	width,
	height,
	drawers,
	selectedDrawerId,
	selectedCompartmentId,
	onDrawerClick,
	onCompartmentClick,
}: CanvasViewProps) {
	const stageRef = useRef<KonvaStage>(null);
	const [viewport, setViewport] = useState<Viewport>(() =>
		getDefaultViewport(width, height),
	);
	const [isPanning, setIsPanning] = useState(false);
	const lastPointerPosition = useRef<{ x: number; y: number } | null>(null);

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
		if (e.evt.button === 1 || (e.evt.button === 0 && e.evt.shiftKey)) {
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
								onClick={() => onCompartmentClick(compartment, drawer)}
							/>
						)),
					)}
				</Layer>
			</Stage>
			<div className="absolute bottom-2 right-2 px-2 py-1 bg-white/80 rounded text-xs text-gray-500">
				Scroll to zoom • Shift+drag to pan
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

function BlueprintGridCard({
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

// ============================================
// Main Component
// ============================================

export function LocationPicker2D({
	orgId: _orgId,
	selectedLocation,
	onLocationChange,
	allowSkip = false,
}: LocationPicker2DProps) {
	const { authContext } = useAuth();
	const [viewLevel, setViewLevel] = useState<ViewLevel>("blueprints");
	const [localSelection, setLocalSelection] = useState(selectedLocation);
	const canvasContainerRef = useRef<HTMLDivElement>(null);
	const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

	useEffect(() => {
		setLocalSelection(selectedLocation);
		if (selectedLocation.compartmentId) {
			setViewLevel("compartments");
		} else if (selectedLocation.drawerId) {
			setViewLevel("compartments");
		} else if (selectedLocation.blueprintId) {
			setViewLevel("drawers");
		} else {
			setViewLevel("blueprints");
		}
	}, [selectedLocation]);

	useEffect(() => {
		if (!canvasContainerRef.current) return;

		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setCanvasSize({
					width: entry.contentRect.width,
					height: entry.contentRect.height,
				});
			}
		});

		resizeObserver.observe(canvasContainerRef.current);
		return () => resizeObserver.disconnect();
	}, []);

	const blueprintsQuery = useQuery(
		api.blueprints.queries.list,
		authContext ? { authContext } : undefined,
		{ enabled: !!authContext },
	);
	const drawersQuery = useQuery(
		api.drawers.queries.listByBlueprint,
		authContext && localSelection.blueprintId && viewLevel !== "blueprints"
			? {
					authContext,
					blueprintId: localSelection.blueprintId as Id<"blueprints">,
					includeCompartments: true,
				}
			: undefined,
		{
			enabled:
				!!authContext &&
				!!localSelection.blueprintId &&
				viewLevel !== "blueprints",
		},
	);

	const blueprints = blueprintsQuery ?? [];
	const drawers = (drawersQuery ?? []) as DrawerWithCompartments[];

	const selectedBlueprint = useMemo(
		() =>
			blueprints.find((b: Blueprint) => b._id === localSelection.blueprintId),
		[blueprints, localSelection.blueprintId],
	);

	const selectedDrawer = useMemo(
		() => drawers.find((d) => d._id === localSelection.drawerId),
		[drawers, localSelection.drawerId],
	);

	const selectedCompartment = useMemo(() => {
		for (const drawer of drawers) {
			const comp = drawer.compartments?.find(
				(c) => c._id === localSelection.compartmentId,
			);
			if (comp) return comp;
		}
		return undefined;
	}, [drawers, localSelection.compartmentId]);

	const handleBlueprintSelect = useCallback((blueprint: Blueprint) => {
		setLocalSelection({ blueprintId: blueprint._id });
		setViewLevel("drawers");
	}, []);

	const handleDrawerSelect = useCallback((drawer: Drawer) => {
		setLocalSelection((prev) => ({
			...prev,
			drawerId: drawer._id,
			compartmentId: undefined,
		}));
		setViewLevel("compartments");
	}, []);

	const handleCompartmentSelect = useCallback(
		(compartment: Compartment, _drawer: Drawer) => {
			const newLocation = {
				blueprintId: localSelection.blueprintId,
				drawerId: localSelection.drawerId,
				compartmentId: compartment._id,
			};
			setLocalSelection(newLocation);
			onLocationChange(newLocation);
		},
		[localSelection.blueprintId, localSelection.drawerId, onLocationChange],
	);

	const handleBackToBlueprints = useCallback(() => {
		setLocalSelection({});
		setViewLevel("blueprints");
		onLocationChange({});
	}, [onLocationChange]);

	const handleBackToDrawers = useCallback(() => {
		setLocalSelection((prev) => ({
			blueprintId: prev.blueprintId,
		}));
		setViewLevel("drawers");
		onLocationChange({ blueprintId: localSelection.blueprintId });
	}, [localSelection.blueprintId, onLocationChange]);

	const handleClearSelection = useCallback(() => {
		setLocalSelection({});
		setViewLevel("blueprints");
		onLocationChange({});
	}, [onLocationChange]);

	const handleSkip = useCallback(() => {
		onLocationChange({});
	}, [onLocationChange]);

	const breadcrumbItems = useMemo(() => {
		const items: Array<{ label: string; level: ViewLevel }> = [
			{ label: "Blueprints", level: "blueprints" },
		];
		if (selectedBlueprint) {
			items.push({ label: selectedBlueprint.name, level: "drawers" });
		}
		if (selectedDrawer) {
			items.push({
				label: selectedDrawer.label || "Drawer",
				level: "compartments",
			});
		}
		if (selectedCompartment) {
			items.push({
				label: selectedCompartment.label || "Compartment",
				level: "compartments",
			});
		}
		return items;
	}, [selectedBlueprint, selectedDrawer, selectedCompartment]);

	const handleBreadcrumbClick = useCallback(
		(level: ViewLevel) => {
			if (level === "blueprints") {
				handleBackToBlueprints();
			} else if (level === "drawers" && localSelection.blueprintId) {
				handleBackToDrawers();
			}
		},
		[handleBackToBlueprints, handleBackToDrawers, localSelection.blueprintId],
	);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<nav className="flex items-center space-x-2 text-sm">
					{breadcrumbItems.map((item, index) => (
						<div key={`${item.label}-${index}`} className="flex items-center">
							{index > 0 && (
								<ChevronRight className="w-4 h-4 text-gray-400 mx-1" />
							)}
							<button
								type="button"
								onClick={() => handleBreadcrumbClick(item.level)}
								className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
									index === breadcrumbItems.length - 1
										? "font-medium text-cyan-700 bg-cyan-50"
										: "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
								}`}
							>
								{index === 0 && <Home className="w-3 h-3" />}
								<span className="truncate max-w-[120px]">{item.label}</span>
							</button>
						</div>
					))}
				</nav>

				<div className="flex items-center gap-2">
					{allowSkip && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleSkip}
							className="text-gray-500"
						>
							Skip
						</Button>
					)}
					{(localSelection.blueprintId || localSelection.compartmentId) && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleClearSelection}
							className="text-red-600 hover:text-red-700 hover:bg-red-50"
						>
							<X className="w-4 h-4 mr-1" />
							Clear
						</Button>
					)}
				</div>
			</div>

			{localSelection.compartmentId && selectedCompartment && (
				<div className="p-3 bg-cyan-50 border border-cyan-200 rounded-lg">
					<div className="flex items-center gap-2 text-sm text-cyan-800">
						<MapPin className="w-4 h-4" />
						<span className="font-medium">
							{selectedBlueprint?.name} → {selectedDrawer?.label || "Drawer"} →{" "}
							{selectedCompartment.label || "Compartment"}
						</span>
					</div>
				</div>
			)}

			<div className="border rounded-lg overflow-hidden bg-white">
				{viewLevel === "blueprints" && (
					<div className="p-4">
						<h4 className="text-sm font-medium text-gray-700 mb-3">
							Select a Blueprint
						</h4>
						{blueprints.length === 0 ? (
							<div className="text-center py-8 text-gray-500">
								<Layers className="w-12 h-12 mx-auto mb-3 text-gray-300" />
								<p>No blueprints available</p>
								<p className="text-sm">
									Create a blueprint first to select a location
								</p>
							</div>
						) : (
							<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
								{blueprints.map((blueprint: Blueprint) => (
									<BlueprintGridCard
										key={blueprint._id}
										blueprint={blueprint}
										isSelected={localSelection.blueprintId === blueprint._id}
										onClick={() => handleBlueprintSelect(blueprint)}
									/>
								))}
							</div>
						)}
					</div>
				)}

				{(viewLevel === "drawers" || viewLevel === "compartments") && (
					<div className="relative">
						<div className="absolute top-3 left-3 z-10">
							{viewLevel === "drawers" ? (
								<Button
									type="button"
									variant="secondary"
									size="sm"
									onClick={handleBackToBlueprints}
									className="bg-white/90 backdrop-blur shadow-sm"
								>
									<ChevronLeft className="w-4 h-4 mr-1" />
									Back to Blueprints
								</Button>
							) : (
								<Button
									type="button"
									variant="secondary"
									size="sm"
									onClick={handleBackToDrawers}
									className="bg-white/90 backdrop-blur shadow-sm"
								>
									<ChevronLeft className="w-4 h-4 mr-1" />
									Back to Drawers
								</Button>
							)}
						</div>

						<div className="absolute top-3 right-3 z-10">
							<div className="bg-white/90 backdrop-blur rounded-lg shadow-sm border px-3 py-2 text-xs text-gray-600 max-w-[200px]">
								{viewLevel === "drawers" ? (
									<>
										<p className="font-medium text-gray-900 mb-1">
											Select a Drawer
										</p>
										<p>Click on a drawer to view its compartments</p>
									</>
								) : (
									<>
										<p className="font-medium text-gray-900 mb-1">
											Select a Compartment
										</p>
										<p>Click on a compartment to assign the location</p>
									</>
								)}
							</div>
						</div>

						<div ref={canvasContainerRef} className="h-[400px] bg-slate-50">
							{canvasSize.width > 0 && canvasSize.height > 0 && (
								<CanvasView
									width={canvasSize.width}
									height={canvasSize.height}
									drawers={drawers}
									selectedDrawerId={localSelection.drawerId}
									selectedCompartmentId={localSelection.compartmentId}
									onDrawerClick={handleDrawerSelect}
									onCompartmentClick={handleCompartmentSelect}
								/>
							)}
						</div>
					</div>
				)}
			</div>

			{!localSelection.compartmentId && !allowSkip && (
				<div className="text-sm text-amber-600 flex items-center gap-2">
					<Package className="w-4 h-4" />
					<span>
						{viewLevel === "blueprints"
							? "Select a blueprint to continue"
							: viewLevel === "drawers"
								? "Select a drawer to continue"
								: "Select a compartment to complete location assignment"}
					</span>
				</div>
			)}
		</div>
	);
}
