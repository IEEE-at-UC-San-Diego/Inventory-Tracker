import { CheckCircle, Grid3X3, MapPin } from "lucide-react";
import { BlueprintCard } from "@/components/blueprint/BlueprintCard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Blueprint, Compartment, DrawerWithCompartments } from "@/types";

interface BlueprintSelectionStepProps {
	blueprints: Blueprint[];
	selectedBlueprint: Blueprint | null;
	onSelect: (blueprint: Blueprint) => void;
}

export function BlueprintSelectionStep({
	blueprints,
	selectedBlueprint,
	onSelect,
}: BlueprintSelectionStepProps) {
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

interface DrawerInfoPanelProps {
	drawer: DrawerWithCompartments | null;
	drawers: DrawerWithCompartments[];
}

export function DrawerInfoPanel({ drawer, drawers }: DrawerInfoPanelProps) {
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

interface CompartmentInfoPanelProps {
	drawer: DrawerWithCompartments;
	compartments: Compartment[];
	selectedCompartment: Compartment | null;
}

export function CompartmentInfoPanel({
	drawer,
	compartments,
	selectedCompartment,
}: CompartmentInfoPanelProps) {
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

interface ConfirmationStepProps {
	blueprint: Blueprint;
	drawer: DrawerWithCompartments;
	compartment: Compartment;
	quantity: number;
	onQuantityChange: (quantity: number) => void;
}

export function ConfirmationStep({
	blueprint,
	drawer,
	compartment,
	quantity,
	onQuantityChange,
}: ConfirmationStepProps) {
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
						/>
						<p className="text-xs text-gray-500 mt-2">
							This quantity will be used when creating the part inventory entry.
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
