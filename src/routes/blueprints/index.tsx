import { createFileRoute, Link } from "@tanstack/react-router";
import {
	CalendarClock,
	Folder,
	Lock,
	LockOpen,
	LayoutPanelTop,
	Pencil,
	Plus,
} from "lucide-react";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import { EditorOnly, ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	StatCard,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@/integrations/convex/react-query";
import type { Blueprint } from "@/types";

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

	const blueprintsResult = useQuery(
		api.blueprints.queries.list,
		authContext ? { authContext } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const blueprints = (blueprintsResult ?? []) as Blueprint[];

	const totalBlueprints = blueprints.length;
	const lockedBlueprints = blueprints.filter((bp) => bp.isLocked).length;
	const unlockedBlueprints = totalBlueprints - lockedBlueprints;
	const totalDrawers = blueprints.reduce(
		(sum, blueprint) => sum + (blueprint.drawerCount ?? 0),
		0,
	);

	const isLoadingBlueprints = blueprintsResult === undefined;

	const sortedBlueprints = useMemo(() => {
		return [...blueprints].sort((a, b) => b.updatedAt - a.updatedAt);
	}, [blueprints]);

	return (
		<div className="bg-gradient-to-b from-slate-50/80 to-background">
			<div className="mx-auto w-full max-w-[1480px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
				<Card className="border-slate-200 bg-gradient-to-r from-white via-white to-cyan-50/40 shadow-sm">
					<CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-1">
							<CardTitle className="text-2xl sm:text-3xl">Blueprints</CardTitle>
							<CardDescription className="text-sm sm:text-base">
								Manage storage layouts, track lock status, and open editors
								faster.
							</CardDescription>
						</div>
						<EditorOnly>
							<Button asChild>
								<Link to="/blueprints/new">
									<Plus className="h-4 w-4" />
									New Blueprint
								</Link>
							</Button>
						</EditorOnly>
					</CardHeader>
				</Card>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
					<StatCard
						title="Total Blueprints"
						value={totalBlueprints}
						description="Layouts available"
						icon={<Folder className="h-4 w-4" />}
					/>
					<StatCard
						title="Drawers"
						value={totalDrawers}
						description="Storage units across layouts"
						icon={<LayoutPanelTop className="h-4 w-4" />}
					/>
					<StatCard
						title="Unlocked"
						value={unlockedBlueprints}
						description="Ready for editing"
						icon={<LockOpen className="h-4 w-4" />}
					/>
					<StatCard
						title="Locked"
						value={lockedBlueprints}
						description="Currently in use"
						icon={<Lock className="h-4 w-4" />}
					/>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-lg">Blueprint Library</CardTitle>
						<CardDescription>
							{sortedBlueprints.length} blueprint
							{sortedBlueprints.length === 1 ? "" : "s"} sorted by most recent
							update.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{isLoadingBlueprints ? (
							<div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-500">
								Loading blueprints...
							</div>
						) : sortedBlueprints.length === 0 ? (
							<div className="rounded-lg border border-dashed border-slate-300 p-10 text-center">
								<Folder className="mx-auto mb-3 h-12 w-12 text-slate-300" />
								<p className="text-base font-medium text-slate-900">
									No blueprints yet
								</p>
								<p className="mt-1 text-sm text-slate-500">
									Create your first layout to start assigning inventory
									locations.
								</p>
								<EditorOnly>
									<Button asChild className="mt-4">
										<Link to="/blueprints/new">
											<Plus className="h-4 w-4" />
											Create Blueprint
										</Link>
									</Button>
								</EditorOnly>
							</div>
						) : (
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
								{sortedBlueprints.map((blueprint) => (
									<Card
										key={blueprint._id}
										className="border-slate-200 transition-colors hover:border-cyan-300"
									>
										<CardHeader className="pb-3">
											<div className="flex items-start justify-between gap-3">
												<div className="space-y-1">
													<CardTitle className="text-base">
														{blueprint.name}
													</CardTitle>
													<CardDescription className="text-xs">
														Updated{" "}
														{new Date(blueprint.updatedAt).toLocaleDateString()}
													</CardDescription>
												</div>
												{blueprint.isLocked ? (
													<Badge
														variant="outline"
														className="border-amber-200 text-amber-700"
													>
														<Lock className="mr-1 h-3 w-3" />
														Locked
													</Badge>
												) : (
													<Badge
														variant="outline"
														className="border-emerald-200 text-emerald-700"
													>
														<LockOpen className="mr-1 h-3 w-3" />
														Unlocked
													</Badge>
												)}
											</div>
										</CardHeader>
										<CardContent className="space-y-4">
											<div className="grid grid-cols-2 gap-2 text-sm">
												<div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
													<p className="text-xs text-slate-500">Drawers</p>
													<p className="font-semibold text-slate-900">
														{blueprint.drawerCount ?? 0}
													</p>
												</div>
												<div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
													<p className="text-xs text-slate-500">Last Edited</p>
													<p className="font-semibold text-slate-900">
														{new Date(blueprint.updatedAt).toLocaleTimeString(
															[],
															{
																hour: "2-digit",
																minute: "2-digit",
															},
														)}
													</p>
												</div>
											</div>

											<div className="flex flex-wrap items-center gap-2">
												<Button asChild variant="outline" size="sm">
													<Link
														to="/blueprints/$blueprintId"
														params={{ blueprintId: blueprint._id }}
													>
														<Folder className="h-3.5 w-3.5" />
														Open
													</Link>
												</Button>
												<EditorOnly>
													<Button asChild size="sm">
														<Link
															to="/blueprints/$blueprintId"
															params={{ blueprintId: blueprint._id }}
															search={{ mode: "edit", partId: undefined }}
														>
															<Pencil className="h-3.5 w-3.5" />
															Edit
														</Link>
													</Button>
												</EditorOnly>
											</div>

											<div className="flex items-center gap-2 text-xs text-slate-500">
												<CalendarClock className="h-3.5 w-3.5" />
												{blueprint.isLocked
													? "Read-only while locked"
													: "Available for updates"}
											</div>
										</CardContent>
									</Card>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
