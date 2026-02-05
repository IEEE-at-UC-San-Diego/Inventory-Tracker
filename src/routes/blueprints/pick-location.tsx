import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import {
	ArrowLeft,
	ArrowRight,
	CheckCircle,
	Grid3X3,
	Loader2,
	MapPin,
	X,
} from "lucide-react";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import { useCallback, useMemo, useRef, useState } from "react";
import { Layer, Rect, Stage } from "react-konva";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { BlueprintCard } from "@/components/blueprint/BlueprintCard";
import {
	CompartmentShape,
	DrawerShape,
	useCanvasViewport,
} from "@/components/blueprint";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@/integrations/convex/react-query";
import type { Blueprint, Compartment, DrawerWithCompartments } from "@/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type WizardStep = 1 | 2 | 3 | 4;
const RETURN_TO_ROUTES = ["/parts/new", "/parts", "/inventory", "/blueprints"] as const;
type ReturnToRoute = (typeof RETURN_TO_ROUTES)[number];

const isReturnToRoute = (value: string): value is ReturnToRoute =>
	RETURN_TO_ROUTES.includes(value as ReturnToRoute);

const STEP_TITLES = {
	1: "Select Blueprint",
	2: "Select Drawer",
	3: "Select Compartment",
	4: "Confirm & Set Quantity",
};
const LOCATION_PICKER_STORAGE_KEY = "inventory-tracker.location-picker";

export const Route = createFileRoute("/blueprints/pick-location")({
	component: LocationPickerPage,
});

function LocationPickerPage() {
	return (
		<ProtectedRoute>
			<LocationPickerContent />
		</ProtectedRoute>
	);
}

function LocationPickerContent() {
	const navigate = useNavigate();
	const router = useRouter();
	const { toast } = useToast();
	const { authContext } = useAuth();

	const routerState = router.state.location.state as {
		returnTo?: string;
	} | null;

	const [step, setStep] = useState<WizardStep>(1);
	const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(
		null,
	);
	const [selectedDrawer, setSelectedDrawer] =
		useState<DrawerWithCompartments | null>(null);
	const [selectedCompartment, setSelectedCompartment] =
		useState<Compartment | null>(null);
	const [quantity, setQuantity] = useState(1);

	const containerRef = useRef<HTMLDivElement>(null);
	const stageRef = useRef<KonvaStage | null>(null);
	const canvasSize = { width: 800, height: 600 };

	const blueprintsResult = useQuery(
		api.blueprints.queries.list,
		authContext ? { authContext } : undefined,
		{ enabled: !!authContext },
	);

	const blueprints = useMemo(() => {
		return blueprintsResult?.sort((a, b) => a.name.localeCompare(b.name)) || [];
	}, [blueprintsResult]);

	const blueprintDataResult = useQuery(
		api.blueprints.queries.getWithHierarchy,
		authContext && selectedBlueprint
			? { authContext, blueprintId: selectedBlueprint._id as Id<"blueprints"> }
			: undefined,
		{ enabled: !!authContext && !!selectedBlueprint },
	);

	const drawers = useMemo<DrawerWithCompartments[]>(() => {
		return blueprintDataResult?.drawers || [];
	}, [blueprintDataResult]);

	const {
		viewport,
		zoom,
		zoomIn,
		zoomOut,
		zoomToFit,
		resetView,
		startDrag,
		drag,
		endDrag,
	} = useCanvasViewport({
		containerWidth: canvasSize.width,
		containerHeight: canvasSize.height,
		drawers,
	});

	const handleZoomIn = useCallback(() => zoomIn(), [zoomIn]);
	const handleZoomOut = useCallback(() => zoomOut(), [zoomOut]);
	const handleZoomToFit = useCallback(() => zoomToFit(), [zoomToFit]);
	const handleResetView = useCallback(() => resetView(), [resetView]);

	const backgroundImageUrlResult = useQuery(
		api.storage.getImageUrl,
		authContext && selectedBlueprint?.backgroundImageId
			? {
					authContext,
					storageId: selectedBlueprint.backgroundImageId as Id<"_storage">,
				}
			: undefined,
		{ enabled: !!authContext && !!selectedBlueprint?.backgroundImageId },
	);

	const backgroundImageUrl = backgroundImageUrlResult || null;

	const handleBack = useCallback(() => {
		if (step > 1) {
			setStep((step - 1) as WizardStep);
		} else {
			if (routerState?.returnTo && isReturnToRoute(routerState.returnTo)) {
				navigate({ to: routerState.returnTo });
			} else {
				navigate({ to: "/blueprints" });
			}
		}
	}, [step, routerState, navigate]);

	const handleNext = useCallback(() => {
		if (step < 4) {
			setStep((step + 1) as WizardStep);
		}
	}, [step]);

	const handleSelectBlueprint = useCallback(
		(blueprint: Blueprint) => {
			setSelectedBlueprint(blueprint);
			setSelectedDrawer(null);
			setSelectedCompartment(null);
			handleNext();
		},
		[handleNext],
	);

	const handleSelectDrawer = useCallback(
		(drawer: DrawerWithCompartments) => {
			setSelectedDrawer(drawer);
			setSelectedCompartment(null);
			handleNext();
		},
		[handleNext],
	);

	const handleSelectCompartment = useCallback(
		(compartment: Compartment) => {
			setSelectedCompartment(compartment);
			handleNext();
		},
		[handleNext],
	);

	const handleConfirm = useCallback(() => {
		if (!selectedCompartment || quantity < 1) {
			toast.error("Please select a compartment and enter a valid quantity");
			return;
		}

		const result = {
			blueprintId: selectedBlueprint?._id,
			drawerId: selectedDrawer?._id,
			compartmentId: selectedCompartment._id,
			quantity,
			displayName: `${selectedBlueprint?.name} → ${selectedDrawer?.label || "Drawer"} → ${selectedCompartment.label || "Compartment"}`,
		};

		if (typeof window !== "undefined") {
			try {
				sessionStorage.setItem(
					LOCATION_PICKER_STORAGE_KEY,
					JSON.stringify(result),
				);
			} catch {
				// Ignore storage errors
			}
		}

		if (routerState?.returnTo && isReturnToRoute(routerState.returnTo)) {
			navigate({
				to: routerState.returnTo,
			});
		} else {
			navigate({ to: "/parts/new" });
		}
	}, [
		selectedCompartment,
		quantity,
		selectedBlueprint,
		selectedDrawer,
		routerState,
		navigate,
		toast,
	]);

	const isNextDisabled = useMemo(() => {
		switch (step) {
			case 1:
				return !selectedBlueprint;
			case 2:
				return !selectedDrawer;
			case 3:
				return !selectedCompartment;
			case 4:
				return quantity < 1;
			default:
				return true;
		}
	}, [step, selectedBlueprint, selectedDrawer, selectedCompartment, quantity]);

	if (!authContext) {
		return (
			<div className="flex items-center justify-center h-screen">
				<Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
			</div>
		);
	}

	return (
		<div className="h-screen flex flex-col bg-gray-50">
			<header className="bg-white border-b px-6 py-4 shrink-0">
				<div className="max-w-6xl mx-auto flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Button variant="ghost" size="icon" onClick={handleBack}>
							<ArrowLeft className="w-5 h-5" />
						</Button>
						<div>
							<div className="flex items-center gap-2 text-sm text-gray-500">
								{step > 1 && selectedBlueprint && (
									<span className="font-medium text-cyan-600">
										{selectedBlueprint.name}
									</span>
								)}
								{step > 2 && selectedDrawer && (
									<>
										<span>→</span>
										<span className="font-medium text-cyan-600">
											{selectedDrawer.label || "Drawer"}
										</span>
									</>
								)}
								{step > 3 && selectedCompartment && (
									<>
										<span>→</span>
										<span className="font-medium text-cyan-600">
											{selectedCompartment.label || "Compartment"}
										</span>
									</>
								)}
							</div>
							<h1 className="text-2xl font-bold text-gray-900 mt-1">
								{STEP_TITLES[step]}
							</h1>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm text-gray-500">Step {step} of 4</span>
						<div className="bg-gray-200 rounded-full h-1.5 w-32">
							<div
								className="bg-cyan-600 rounded-full h-1.5 transition-all"
								style={{ width: `${(step / 4) * 100}%` }}
							/>
						</div>
					</div>
				</div>
			</header>

			<main className="flex-1 overflow-hidden">
				{step === 1 && (
					<BlueprintSelectionStep
						blueprints={blueprints}
						selectedBlueprint={selectedBlueprint}
						onSelect={handleSelectBlueprint}
					/>
				)}

				{(step === 2 || step === 3) && (
					<div className="h-full flex">
						<div className="flex-1 relative bg-slate-50">
							<div
								ref={containerRef}
								className="w-full h-full cursor-crosshair"
							>
								<Stage
									ref={stageRef}
									width={canvasSize.width}
									height={canvasSize.height}
										onWheel={(e: KonvaEventObject<WheelEvent>) => {
											e.evt.preventDefault();
											const zoomFactor = 1 - e.evt.deltaY / 1000;
											zoom(zoomFactor, {
												x: e.evt.offsetX,
												y: e.evt.offsetY,
											});
										}}
										onMouseDown={(e: KonvaEventObject<MouseEvent>) => {
											if (e.evt.button === 2) {
												startDrag({
													x: e.evt.offsetX,
													y: e.evt.offsetY,
												});
											}
										}}
										onMouseMove={(e: KonvaEventObject<MouseEvent>) => {
											if (e.evt.buttons === 2) {
												drag({
													x: e.evt.offsetX,
													y: e.evt.offsetY,
												});
											}
										}}
										onMouseUp={() => endDrag()}
										onTouchStart={(e: KonvaEventObject<TouchEvent>) => {
											const touch = e.evt.touches[0];
											if (!touch || !containerRef.current) return;
											const bounds = containerRef.current.getBoundingClientRect();
											startDrag({
												x: touch.clientX - bounds.left,
												y: touch.clientY - bounds.top,
											});
										}}
										onTouchMove={(e: KonvaEventObject<TouchEvent>) => {
											e.evt.preventDefault();
											const touch = e.evt.touches[0];
											if (!touch || !containerRef.current) return;
											const bounds = containerRef.current.getBoundingClientRect();
											drag({
												x: touch.clientX - bounds.left,
												y: touch.clientY - bounds.top,
											});
										}}
										onTouchEnd={() => endDrag()}
										draggable={false}
									>
										<Layer listening={false}>
											<Rect
												width={canvasSize.width}
												height={canvasSize.height}
												fill="#f0f4f8"
											/>
										</Layer>

									{backgroundImageUrl && (
										<Layer
											listening={false}
											x={viewport.x}
											y={viewport.y}
											scaleX={viewport.zoom}
											scaleY={viewport.zoom}
										>
											{/* Background image would be rendered here */}
											<Rect
												x={0}
												y={0}
												width={canvasSize.width}
												height={canvasSize.height}
												fill="#f8fafc"
											/>
										</Layer>
									)}

									<Layer
										x={viewport.x}
										y={viewport.y}
										scaleX={viewport.zoom}
										scaleY={viewport.zoom}
									>
										{step === 2 && (
											<>
												{drawers
													.filter(
														(d) =>
															!selectedDrawer || d._id === selectedDrawer._id,
													)
													.sort((a, b) => a.zIndex - b.zIndex)
													.map((drawer) => (
														<DrawerShape
															key={drawer._id}
															drawer={drawer}
															isSelected={selectedDrawer?._id === drawer._id}
															isLocked={false}
															isLockedByMe={true}
															mode="view"
															highlighted={false}
															onSelect={() => handleSelectDrawer(drawer)}
															onDragEnd={() => {}}
															onTransformEnd={() => {}}
														/>
													))}
											</>
										)}

										{step === 3 && selectedDrawer && (
											<>
												{selectedDrawer.compartments
													.sort((a, b) => a.zIndex - b.zIndex)
													.map((compartment) => (
														<CompartmentShape
															key={compartment._id}
															compartment={compartment}
															drawer={selectedDrawer}
															isSelected={
																selectedCompartment?._id === compartment._id
															}
															isLockedByMe={true}
															mode="view"
															highlighted={false}
															inventoryCount={0}
															onSelect={() =>
																handleSelectCompartment(compartment)
															}
															onDoubleClick={() => {}}
															onDragEnd={() => {}}
															onTransformEnd={() => {}}
														/>
													))}
											</>
										)}
									</Layer>
								</Stage>
							</div>

							<div className="absolute bottom-6 left-6 flex flex-col gap-3 z-10">
								<div className="flex items-center gap-2 p-2 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200">
									<Button
										variant="ghost"
										size="icon"
										onClick={handleZoomIn}
										className="h-9 w-9"
									>
										<span className="text-xl font-bold">+</span>
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onClick={handleZoomOut}
										className="h-9 w-9"
									>
										<span className="text-xl font-bold">−</span>
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onClick={handleZoomToFit}
										className="h-9 w-9"
									>
										<Grid3X3 className="w-4 h-4" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onClick={handleResetView}
										className="h-9 w-9"
									>
										<X className="w-4 h-4" />
									</Button>
								</div>
							</div>
						</div>

						<div className="w-96 border-l bg-white overflow-y-auto p-6">
							{step === 2 && (
								<DrawerInfoPanel drawer={selectedDrawer} drawers={drawers} />
							)}

							{step === 3 && selectedDrawer && (
								<CompartmentInfoPanel
									drawer={selectedDrawer}
									compartments={selectedDrawer.compartments}
									selectedCompartment={selectedCompartment}
								/>
							)}
						</div>
					</div>
				)}

				{step === 4 && (
					<ConfirmationStep
						blueprint={selectedBlueprint!}
						drawer={selectedDrawer!}
						compartment={selectedCompartment!}
						quantity={quantity}
						onQuantityChange={setQuantity}
					/>
				)}
			</main>

			<footer className="bg-white border-t px-6 py-4 shrink-0">
				<div className="max-w-6xl mx-auto flex items-center justify-between">
					<Button variant="outline" onClick={handleBack}>
						<ArrowLeft className="w-4 h-4 mr-2" />
						{step === 1 ? "Cancel" : "Back"}
					</Button>

					{step < 4 ? (
						<Button onClick={handleNext} disabled={isNextDisabled}>
							Next
							<ArrowRight className="w-4 h-4 ml-2" />
						</Button>
					) : (
						<Button
							onClick={handleConfirm}
							disabled={isNextDisabled}
							className="bg-cyan-600 hover:bg-cyan-700"
						>
							<CheckCircle className="w-4 h-4 mr-2" />
							Select Location
						</Button>
					)}
				</div>
			</footer>
		</div>
	);
}

function BlueprintSelectionStep({
	blueprints,
	selectedBlueprint,
	onSelect,
}: {
	blueprints: Blueprint[];
	selectedBlueprint: Blueprint | null;
	onSelect: (blueprint: Blueprint) => void;
}) {
	if (blueprints.length === 0) {
		return (
			<div className="flex items-center justify-center h-full">
				<Card className="max-w-md">
					<CardContent className="p-8 text-center">
						<Grid3X3 className="w-16 h-16 mx-auto text-gray-400 mb-4" />
						<h3 className="text-lg font-semibold mb-2">
							No Blueprints Available
						</h3>
						<p className="text-gray-600">
							You need to create a blueprint before you can select a storage
							location.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="p-6 max-w-6xl mx-auto">
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{blueprints.map((blueprint) => (
					<BlueprintCard
						key={blueprint._id}
						blueprint={blueprint}
						drawerCount={0}
						compartmentCount={0}
						isSelected={selectedBlueprint?._id === blueprint._id}
						onClick={() => onSelect(blueprint)}
					/>
				))}
			</div>
		</div>
	);
}

function DrawerInfoPanel({
	drawer,
	drawers,
}: {
	drawer: DrawerWithCompartments | null;
	drawers: DrawerWithCompartments[];
}) {
	return (
		<div>
			<h2 className="text-lg font-semibold mb-4">Drawer List</h2>
			{drawers.length === 0 ? (
				<Card>
					<CardContent className="p-6 text-center text-gray-500">
						This blueprint has no drawers yet.
					</CardContent>
				</Card>
			) : (
				<div className="space-y-2">
					{drawers.map((d) => (
						<Card
							key={d._id}
							className={`cursor-pointer transition-all ${
								drawer?._id === d._id
									? "ring-2 ring-cyan-500 bg-cyan-50"
									: "hover:bg-gray-50"
							}`}
							// onClick={() => onSelectDrawer(d)}
						>
							<CardContent className="p-3">
								<div className="flex items-center gap-3">
									<MapPin className="w-5 h-5 text-cyan-600" />
									<div>
										<p className="font-medium">
											{d.label || `Drawer ${d._id.slice(-4)}`}
										</p>
										<p className="text-xs text-gray-500">
											{d.compartments.length} compartment
											{d.compartments.length !== 1 ? "s" : ""}
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}

function CompartmentInfoPanel({
	drawer,
	compartments,
	selectedCompartment,
}: {
	drawer: DrawerWithCompartments;
	compartments: Compartment[];
	selectedCompartment: Compartment | null;
}) {
	return (
		<div>
			<h2 className="text-lg font-semibold mb-2">
				{drawer.label || `Drawer ${drawer._id.slice(-4)}`}
			</h2>
			<p className="text-sm text-gray-500 mb-4">
				{compartments.length} compartment
				{compartments.length !== 1 ? "s" : ""}
			</p>

			{compartments.length === 0 ? (
				<Card>
					<CardContent className="p-6 text-center text-gray-500">
						This drawer has no compartments yet.
					</CardContent>
				</Card>
			) : (
				<div className="space-y-2">
					{compartments.map((c) => (
						<Card
							key={c._id}
							className={`cursor-pointer transition-all ${
								selectedCompartment?._id === c._id
									? "ring-2 ring-cyan-500 bg-cyan-50"
									: "hover:bg-gray-50"
							}`}
						>
							<CardContent className="p-3">
								<div className="flex items-center gap-3">
									<div className="w-10 h-10 rounded bg-cyan-100 flex items-center justify-center">
										<MapPin className="w-5 h-5 text-cyan-600" />
									</div>
									<div>
										<p className="font-medium">
											{c.label || `Compartment ${c._id.slice(-4)}`}
										</p>
										<p className="text-xs text-gray-500">
											{c.width}×{c.height} units
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}

function ConfirmationStep({
	blueprint,
	drawer,
	compartment,
	quantity,
	onQuantityChange,
}: {
	blueprint: Blueprint;
	drawer: DrawerWithCompartments;
	compartment: Compartment;
	quantity: number;
	onQuantityChange: (quantity: number) => void;
}) {
	return (
		<div className="p-6 max-w-2xl mx-auto">
			<Card>
				<CardContent className="p-6">
					<div className="mb-6">
						<h2 className="text-lg font-semibold mb-4">Confirm Selection</h2>
						<div className="space-y-3">
							<div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
								<Grid3X3 className="w-5 h-5 text-cyan-600" />
								<div>
									<p className="text-xs text-gray-500">Blueprint</p>
									<p className="font-medium">{blueprint.name}</p>
								</div>
							</div>
							<div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
								<div className="w-10 h-10 rounded bg-cyan-100 flex items-center justify-center">
									<MapPin className="w-5 h-5 text-cyan-600" />
								</div>
								<div>
									<p className="text-xs text-gray-500">Drawer</p>
									<p className="font-medium">
										{drawer.label || `Drawer ${drawer._id.slice(-4)}`}
									</p>
								</div>
							</div>
							<div className="flex items-center gap-3 p-3 bg-cyan-50 rounded-lg border border-cyan-200">
								<div className="w-10 h-10 rounded bg-cyan-100 flex items-center justify-center">
									<MapPin className="w-5 h-5 text-cyan-600" />
								</div>
								<div className="flex-1">
									<p className="text-xs text-cyan-700">Compartment</p>
									<p className="font-medium text-cyan-900">
										{compartment.label ||
											`Compartment ${compartment._id.slice(-4)}`}
									</p>
								</div>
								<CheckCircle className="w-5 h-5 text-cyan-600" />
							</div>
						</div>
					</div>

					<div>
						<Label htmlFor="quantity">Initial Quantity</Label>
						<Input
							id="quantity"
							type="number"
							min={1}
							value={quantity}
							onChange={(e) => {
								const val = parseInt(e.target.value);
								if (val >= 1) {
									onQuantityChange(val);
								}
							}}
							className="mt-2"
							placeholder="Enter quantity"
						/>
						<p className="text-sm text-gray-500 mt-2">
							This is the initial quantity of items to check in to this
							location.
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
