import { ChevronRight, MapPin } from "lucide-react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useQuery } from "@/integrations/convex/react-query";
import type { AuthContext } from "@/types/auth";

interface LocationSelectorProps {
	authContext: AuthContext | null;
	value: string;
	onChange: (value: string) => void;
	excludeCompartmentId?: string;
}

export function LocationSelector({
	authContext,
	value,
	onChange,
	excludeCompartmentId,
}: LocationSelectorProps) {
	const [selectedBlueprintId, setSelectedBlueprintId] = useState("");
	const [selectedDrawerId, setSelectedDrawerId] = useState("");

	// Fetch blueprints
	const blueprintsResult = useQuery(
		api.blueprints.queries.list,
		authContext ? { authContext } : undefined,
		{ enabled: !!authContext },
	);
	const blueprints = (blueprintsResult as any[]) ?? [];

	// Fetch drawers for selected blueprint
	const drawersResult = useQuery(
		(api as any)["drawers/queries"].listByBlueprint,
		selectedBlueprintId && authContext
			? { authContext, blueprintId: selectedBlueprintId as Id<"blueprints"> }
			: undefined,
	);
	const drawers = (drawersResult as any[]) ?? [];

	// Fetch compartments for selected drawer
	const compartmentsResult = useQuery(
		(api as any)["compartments/queries"].getByDrawer,
		selectedDrawerId && authContext
			? { authContext, drawerId: selectedDrawerId as Id<"drawers"> }
			: undefined,
	);
	const compartments = (compartmentsResult as any[]) ?? [];

	// Filter out excluded compartment
	const availableCompartments = excludeCompartmentId
		? compartments.filter((comp: any) => comp._id !== excludeCompartmentId)
		: compartments;

	const selectedBlueprint = blueprints.find(
		(b: any) => b._id === selectedBlueprintId,
	);
	const selectedDrawer = drawers.find((d: any) => d._id === selectedDrawerId);
	const selectedCompartment = compartments.find((c: any) => c._id === value);

	// Show summary if all selected
	if (value && selectedCompartment) {
		return (
			<div className="p-3 bg-cyan-50 border border-cyan-200 rounded-lg">
				<div className="flex items-center gap-2 text-sm text-cyan-800">
					<MapPin className="w-4 h-4" />
					<span className="font-medium">
						{selectedBlueprint?.name} → {selectedDrawer?.label || "Drawer"} →{" "}
						{selectedCompartment.label || "Compartment"}
					</span>
				</div>
				<button
					type="button"
					onClick={() => {
						onChange("");
						setSelectedDrawerId("");
						setSelectedBlueprintId("");
					}}
					className="mt-2 text-xs text-cyan-600 hover:text-cyan-700"
				>
					Change location
				</button>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{/* Blueprint Selection */}
			<div className="space-y-1">
				<label className="text-sm font-medium text-gray-700">Blueprint</label>
				<select
					value={selectedBlueprintId}
					onChange={(e) => {
						setSelectedBlueprintId(e.target.value);
						setSelectedDrawerId("");
						onChange("");
					}}
					className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
				>
					<option value="">Select a blueprint...</option>
					{blueprints.map((bp: any) => (
						<option key={bp._id} value={bp._id}>
							{bp.name}
						</option>
					))}
				</select>
			</div>

			{/* Drawer Selection */}
			{selectedBlueprintId && (
				<div className="space-y-1">
					<label className="text-sm font-medium text-gray-700 flex items-center gap-1">
						<ChevronRight className="w-4 h-4" />
						Drawer
					</label>
					<select
						value={selectedDrawerId}
						onChange={(e) => {
							setSelectedDrawerId(e.target.value);
							onChange("");
						}}
						className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
					>
						<option value="">Select a drawer...</option>
						{drawers.map((drawer: any) => (
							<option key={drawer._id} value={drawer._id}>
								{drawer.label || `Drawer ${drawer._id.slice(-4)}`}
							</option>
						))}
					</select>
				</div>
			)}

			{/* Compartment Selection */}
			{selectedDrawerId && (
				<div className="space-y-1">
					<label className="text-sm font-medium text-gray-700 flex items-center gap-1">
						<ChevronRight className="w-4 h-4" />
						Compartment
					</label>
					<select
						value={value}
						onChange={(e) => onChange(e.target.value)}
						className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
					>
						<option value="">Select a compartment...</option>
						{availableCompartments.map((comp: any) => (
							<option key={comp._id} value={comp._id}>
								{comp.label || `Compartment ${comp._id.slice(-4)}`}
							</option>
						))}
					</select>
					{availableCompartments.length === 0 && (
						<p className="text-sm text-amber-600">
							No compartments available in this drawer.
						</p>
					)}
				</div>
			)}
		</div>
	);
}
