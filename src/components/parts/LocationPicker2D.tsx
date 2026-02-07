import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ChevronRight,
	ChevronLeft,
	Home,
	Layers,
	MapPin,
	Package,
	X,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@/integrations/convex/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Blueprint, Compartment, Drawer } from "@/types";
import {
	BlueprintGridCard,
	CanvasView,
	type DrawerWithCompartments,
	type ViewLevel,
} from "./location-picker-2d-canvas";

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
