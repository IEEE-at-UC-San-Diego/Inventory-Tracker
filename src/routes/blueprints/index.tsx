import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Edit,
	Folder,
	Lock,
	Pencil,
	Plus,
	Settings,
	Unlock,
	Users,
} from "lucide-react";
import { useMemo } from "react";
import { EditorOnly, ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, StatCard } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@/integrations/convex/react-query";
import type { Blueprint } from "@/types";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/blueprints/")({
	component: BlueprintsPage,
});

function BlueprintsPage() {
	return (
		<ProtectedRoute>
			<BlueprintsContent />
		</ProtectedRoute>
	);
}

function BlueprintsContent() {
	const { authContext, isLoading } = useAuth();

	// Fetch blueprints
	const blueprintsResult = useQuery(
		api.blueprints.queries.list,
		authContext ? { authContext } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const blueprints = (blueprintsResult ?? []) as Blueprint[];

	// Calculate stats
	const totalBlueprints = blueprints.length;
	const lockedBlueprints = blueprints.filter((bp) => bp.isLocked).length;
	const unlockedBlueprints = totalBlueprints - lockedBlueprints;
	const totalDrawers = blueprints.reduce(
		(sum, bp) => sum + (bp.drawerCount ?? 0),
		0,
	);

	const isLoadingBlueprints = blueprintsResult === undefined;

	// Sort blueprints by updatedAt (most recent first)
	const sortedBlueprints = useMemo(() => {
		return [...blueprints].sort((a, b) => b.updatedAt - a.updatedAt);
	}, [blueprints]);

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<h1 className="text-3xl font-bold text-gray-900">Blueprints</h1>
					<p className="text-gray-600 mt-1">
						View and manage your storage location layouts
					</p>
				</div>
				<div className="flex items-center gap-2">
					<EditorOnly>
						<Link
							to="/blueprints/new"
							className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
						>
							<Plus className="w-5 h-5" />
							New Blueprint
						</Link>
					</EditorOnly>
				</div>
			</div>

			{/* Stats */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
				<StatCard
					title="Total Blueprints"
					value={totalBlueprints}
					description="All layouts"
					icon={<Folder className="w-4 h-4" />}
				/>
				<StatCard
					title="Drawers"
					value={totalDrawers}
					description="Storage units"
					icon={<Settings className="w-4 h-4" />}
				/>
				<StatCard
					title="Unlocked"
					value={unlockedBlueprints}
					description="Available for editing"
					icon={<Unlock className="w-4 h-4" />}
				/>
				<StatCard
					title="Locked"
					value={lockedBlueprints}
					description="Currently in use"
					icon={<Lock className="w-4 h-4" />}
				/>
			</div>

			{/* Blueprints List */}
			<Card>
				<CardContent className="p-0">
					{isLoadingBlueprints ? (
						<div className="p-12 text-center text-gray-500">
							Loading blueprints...
						</div>
					) : sortedBlueprints.length === 0 ? (
						<div className="p-12 text-center">
							<Folder className="w-16 h-16 mx-auto text-gray-300 mb-4" />
							<h3 className="text-lg font-medium text-gray-900 mb-2">
								No blueprints yet
							</h3>
							<p className="text-gray-500 mb-4">
								Create your first blueprint to start organizing your inventory.
							</p>
							<EditorOnly>
								<Link
									to="/blueprints/new"
									className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
								>
									<Plus className="w-5 h-5" />
									Create Blueprint
								</Link>
							</EditorOnly>
						</div>
					) : (
						<div className="divide-y divide-gray-200">
							{sortedBlueprints.map((blueprint) => (
									<Link
										key={blueprint._id}
										to="/blueprints/$blueprintId"
										params={{ blueprintId: blueprint._id }}
										search={{ partId: undefined, mode: undefined }}
										className="block hover:bg-gray-50 transition-colors"
									>
									<div className="p-4 flex items-center justify-between">
										<div className="flex items-center gap-4">
											<div className="p-3 bg-cyan-50 rounded-lg">
												<Folder className="w-6 h-6 text-cyan-600" />
											</div>
											<div>
												<div className="flex items-center gap-2">
													<h3 className="font-semibold text-gray-900">
														{blueprint.name}
													</h3>
													{blueprint.isLocked && (
														<Badge variant="outline" className="text-xs">
															<Lock className="w-3 h-3 mr-1" />
															Locked
														</Badge>
													)}
												</div>
												<div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
													<span className="flex items-center gap-1">
														<Settings className="w-3 h-3" />
															{blueprint.drawerCount ?? 0} drawers
													</span>
													<span className="flex items-center gap-1">
														<Edit className="w-3 h-3" />
														Updated{" "}
														{new Date(blueprint.updatedAt).toLocaleDateString()}
													</span>
												</div>
											</div>
										</div>
										<div className="text-right text-sm text-gray-500">
											<div className="flex items-center gap-3 justify-end">
												<EditorOnly>
														<Link
															to="/blueprints/$blueprintId"
															params={{ blueprintId: blueprint._id }}
															search={{ mode: "edit", partId: undefined }}
															className="inline-flex items-center gap-1 text-cyan-600 hover:text-cyan-700"
															onClick={(e) => e.stopPropagation()}
														>
														<Pencil className="w-3 h-3" />
														<span>Edit</span>
													</Link>
												</EditorOnly>
												<div className="flex items-center gap-1">
													<Users className="w-3 h-3" />
													<span>View Details</span>
												</div>
											</div>
										</div>
									</div>
								</Link>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
