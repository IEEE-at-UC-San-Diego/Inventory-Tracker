import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Filter, Layers, MapPin, Package } from "lucide-react";
import { useMemo, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@/integrations/convex/react-query";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/locations/")({
	component: LocationsPage,
});

function LocationsPage() {
	return (
		<ProtectedRoute>
			<LocationsContent />
		</ProtectedRoute>
	);
}

type LocationFilter = {
	blueprintId: string | null;
	drawerId: string | null;
};

function LocationsContent() {
	const { authContext, isLoading } = useAuth();
	const [filters, setFilters] = useState<LocationFilter>({
		blueprintId: null,
		drawerId: null,
	});

	// Fetch all data
	const blueprintsResult = useQuery(
		api.blueprints.queries.list,
		authContext ? { authContext } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const inventoryResult = useQuery(
		api.inventory.queries.list,
		authContext ? { authContext, includeDetails: true } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const drawersResult = useQuery(
		api.drawers.queries.listByBlueprint,
		authContext && filters.blueprintId
			? {
					authContext,
					blueprintId: filters.blueprintId as Id<"blueprints">,
				}
			: undefined,
		{
			enabled: !!authContext && !!filters.blueprintId,
		},
	);

	const blueprints = blueprintsResult ?? [];
	type InventoryListItem = {
		_id: Id<"inventory">;
		partId: Id<"parts">;
		compartmentId: Id<"compartments">;
		quantity: number;
		part?: {
			_id: Id<"parts">;
			name: string;
			sku: string;
			category: string;
		};
		compartment?: {
			_id: Id<"compartments">;
			label?: string;
			drawerId: Id<"drawers">;
		};
	};
	const inventory = (inventoryResult ?? []) as InventoryListItem[];

	// Group items by compartment and show available info
	const inventoryByCompartment = useMemo(() => {
		const grouped = new Map<
			string,
			{
				compartmentId: string;
				compartmentLabel?: string;
				drawerId?: string;
				items: Array<{
					partId: string;
					partName: string;
					partSku: string;
					quantity: number;
					category: string;
				}>;
			}
		>();

		inventory.forEach((item) => {
			const compartmentId = item.compartmentId.toString();
			const existing = grouped.get(compartmentId);

			const itemData = {
				partId: item.partId.toString(),
				partName: item.part?.name || "Unknown Part",
				partSku: item.part?.sku || "",
				quantity: item.quantity,
				category: item.part?.category || "Uncategorized",
			};

			if (existing) {
				existing.items.push(itemData);
			} else {
				grouped.set(compartmentId, {
					compartmentId,
					compartmentLabel: item.compartment?.label,
					drawerId: item.compartment?.drawerId?.toString(),
					items: [itemData],
				});
			}
		});

		return grouped;
	}, [inventory]);

	// Get unique compartments for filter
	const compartments = Array.from(inventoryByCompartment.values());

	// Calculate stats
	const totalCompartments = inventoryByCompartment.size;
	const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);
	const totalParts = inventory.length;

	const handleFilterByBlueprint = (blueprintId: string | null) => {
		setFilters((prev) => ({
			...prev,
			blueprintId,
			drawerId: null,
		}));
	};

	// Filter compartments based on selected blueprint
	const filteredCompartments = useMemo(() => {
		if (!filters.blueprintId) {
			return compartments;
		}
		const drawerIds = new Set(
			(drawersResult ?? []).map((drawer) => drawer._id.toString()),
		);
		return compartments.filter(
			(compartment) =>
				compartment.drawerId && drawerIds.has(compartment.drawerId),
		);
	}, [compartments, drawersResult, filters.blueprintId]);

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<h1 className="text-3xl font-bold text-gray-900">Locations</h1>
					<p className="text-gray-600 mt-1">
						View inventory organized by compartment
					</p>
				</div>
			</div>

			{/* Stats */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
				<div className="p-4 bg-white rounded-lg border border-gray-200">
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium text-gray-600">
							Blueprints
						</span>
						<MapPin className="w-4 h-4 text-cyan-600" />
					</div>
					<p className="text-2xl font-bold mt-1 text-gray-900">
						{blueprints.length}
					</p>
				</div>
				<div className="p-4 bg-white rounded-lg border border-gray-200">
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium text-gray-600">
							Compartments
						</span>
						<Layers className="w-4 h-4 text-cyan-600" />
					</div>
					<p className="text-2xl font-bold mt-1 text-gray-900">
						{totalCompartments}
					</p>
				</div>
				<div className="p-4 bg-white rounded-lg border border-gray-200">
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium text-gray-600">
							Total Parts
						</span>
						<Package className="w-4 h-4 text-cyan-600" />
					</div>
					<p className="text-2xl font-bold mt-1 text-gray-900">{totalParts}</p>
				</div>
				<div className="p-4 bg-white rounded-lg border border-gray-200">
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium text-gray-600">
							Total Items
						</span>
						<Package className="w-4 h-4 text-cyan-600" />
					</div>
					<p className="text-2xl font-bold mt-1 text-gray-900">{totalItems}</p>
				</div>
			</div>

			{/* Blueprint Selector */}
			<Card>
				<CardContent className="p-4">
					<div className="flex items-center gap-2 mb-3">
						<Filter className="w-5 h-5 text-gray-600" />
						<span className="font-medium text-gray-900">
							Filter by Blueprint
						</span>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							onClick={() => handleFilterByBlueprint(null)}
							className={cn(
								"px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
								filters.blueprintId === null
									? "bg-cyan-600 text-white"
									: "bg-gray-100 text-gray-700 hover:bg-gray-200",
							)}
						>
							All Blueprints
						</button>
						{blueprints.map((blueprint) => (
							<button
								key={blueprint._id}
								onClick={() => handleFilterByBlueprint(blueprint._id)}
								className={cn(
									"px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
									filters.blueprintId === blueprint._id
										? "bg-cyan-600 text-white"
										: "bg-gray-100 text-gray-700 hover:bg-gray-200",
								)}
							>
								{blueprint.name}
							</button>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Locations List */}
			<div className="space-y-4">
				{isLoading ? (
					<div className="p-8 text-center text-gray-500">
						Loading locations...
					</div>
				) : filteredCompartments.length === 0 ? (
					<Card>
						<CardContent className="p-12 text-center">
							<MapPin className="w-16 h-16 mx-auto text-gray-300 mb-4" />
							<h3 className="text-lg font-medium text-gray-900 mb-2">
								No inventory locations found
							</h3>
							<p className="text-gray-500">
								Add inventory to parts to see them organized by location.
							</p>
						</CardContent>
					</Card>
				) : (
					filteredCompartments.map((compartment) => (
						<Card
							key={compartment.compartmentId}
							className="border border-gray-200 hover:border-cyan-300 transition-colors"
						>
							<CardContent className="p-4">
								{/* Compartment Header */}
								<div className="flex items-center justify-between mb-3">
									<div className="flex items-center gap-3">
										<div className="p-2 bg-cyan-50 rounded-lg">
											<Layers className="w-5 h-5 text-cyan-600" />
										</div>
										<div>
											<h3 className="font-semibold text-gray-900">
												{compartment.compartmentLabel ||
													`Compartment ${compartment.compartmentId.slice(-6)}`}
											</h3>
											<p className="text-sm text-gray-500">
												{compartment.items.length} part
												{compartment.items.length !== 1 ? "s" : ""} in this
												location
											</p>
										</div>
									</div>
									<Badge variant="outline" className="text-sm">
										{compartment.items.reduce(
											(sum, item) => sum + item.quantity,
											0,
										)}{" "}
										total items
									</Badge>
								</div>

								{/* Parts List */}
								<div className="space-y-2 ml-2 border-l-2 border-gray-200 pl-4">
									{compartment.items.map((item, idx) => (
										<div
											key={`${item.partId}-${idx}`}
											className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
										>
											<div className="flex items-center gap-3">
												<Package className="w-4 h-4 text-gray-400" />
												<div>
													<p className="font-medium text-gray-900 text-sm">
														{item.partName}
													</p>
													<p className="text-xs text-gray-500">
														{item.partSku && `SKU: ${item.partSku} • `}
														{item.category}
													</p>
												</div>
											</div>
											<div className="flex items-center gap-3">
												<Badge className="bg-cyan-100 text-cyan-800 border-cyan-200">
													{item.quantity}
												</Badge>
												<Link
													to="/blueprints"
													search={{ highlight: item.partId }}
													className="p-2 text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"
													title="View on blueprint"
												>
													<ArrowRight className="w-4 h-4" />
												</Link>
											</div>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					))
				)}
			</div>
		</div>
	);
}
