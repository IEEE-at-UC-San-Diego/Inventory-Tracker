import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
	Archive,
	ArrowLeft,
	ArrowRightLeft,
	Edit,
	Grid3X3,
	History,
	MapPin,
	Minus,
	Package,
	Plus,
	Settings,
	Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";
import {
	AdminOnly,
	EditorOnly,
	ProtectedRoute,
} from "@/components/auth/ProtectedRoute";
import {
	AdjustDialog,
	CheckInDialog,
	CheckOutDialog,
	MoveDialog,
} from "@/components/inventory";
import { PartForm } from "@/components/parts/PartForm";
import { PartImage } from "@/components/parts/PartImage";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	StatCard,
} from "@/components/ui/card";
import { AlertDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQuery } from "@/integrations/convex/react-query";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/parts/$partId")({
	component: PartDetailPage,
});

function PartDetailPage() {
	return (
		<ProtectedRoute>
			<PartDetailContent />
		</ProtectedRoute>
	);
}

function PartDetailContent() {
	const { partId } = useParams({ from: "/parts/$partId" });
	const { toast } = useToast();
	const { authContext, getFreshAuthContext } = useAuth();

	// Helper to get fresh auth context for mutations
	const getAuthContextForMutation = useCallback(
		async (context: typeof authContext) => {
			const fresh = await getFreshAuthContext();
			return fresh || context;
		},
		[getFreshAuthContext],
	);
	const getRequiredAuthContext = useCallback(async () => {
		const context = await getAuthContextForMutation(authContext);
		if (!context) {
			throw new Error("Not authenticated");
		}
		return context;
	}, [authContext, getAuthContextForMutation]);

	// Dialog states
	const [isEditing, setIsEditing] = useState(false);
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [showCheckIn, setShowCheckIn] = useState(false);
	const [showCheckOut, setShowCheckOut] = useState(false);
	const [showMove, setShowMove] = useState(false);
	const [showAdjust, setShowAdjust] = useState(false);

	// Fetch part data with inventory
	const partData = useQuery(
		api.parts.queries.getWithInventory,
		authContext
			? {
					authContext,
					partId: partId as Id<"parts">,
				}
			: undefined,
		{ enabled: !!authContext },
	);

	const part = partData?.part;
	const inventory = partData?.inventory ?? [];
	const totalQuantity = partData?.totalQuantity ?? 0;
	const uniqueBlueprints = Array.from(
		inventory
			.map((item) => item.blueprint)
			.reduce((map, blueprint) => {
				if (!blueprint) return map;
				map.set(blueprint._id, blueprint);
				return map;
			}, new Map<string, NonNullable<(typeof inventory)[number]["blueprint"]>>())
			.values(),
	);

	// Fetch transactions
	const transactions = useQuery(
		api.transactions.queries.getByPart,
		authContext
			? {
					authContext,
					partId: partId as Id<"parts">,
					limit: 10,
				}
			: undefined,
		{ enabled: !!authContext },
	);

	// Mutations
	const archivePart = useMutation(api.parts.mutations.archive);
	const unarchivePart = useMutation(api.parts.mutations.unarchive);
	const deletePart = useMutation(api.parts.mutations.remove);

	const handleArchive = useCallback(async () => {
		if (!part) return;
		try {
			const context = await getRequiredAuthContext();
			if (part.archived) {
				await unarchivePart({
					authContext: context,
					partId: partId as Id<"parts">,
				});
				toast.success("Part unarchived successfully");
			} else {
				await archivePart({
					authContext: context,
					partId: partId as Id<"parts">,
				});
				toast.success("Part archived successfully");
			}
		} catch (error) {
			toast.error(
				"Failed to archive/unarchive part",
				error instanceof Error ? error.message : "An error occurred",
			);
		}
	}, [
		part,
		partId,
		archivePart,
		unarchivePart,
		toast,
		authContext,
		getAuthContextForMutation,
	]);

	const handleDelete = useCallback(async () => {
		try {
			const context = await getRequiredAuthContext();
			await deletePart({ authContext: context, partId: partId as Id<"parts"> });
			toast.success("Part deleted successfully");
			// Navigate back to parts list
			window.location.href = "/parts";
		} catch (error) {
			toast.error(
				"Failed to delete part",
				error instanceof Error ? error.message : "An error occurred",
			);
			setShowDeleteDialog(false);
		}
	}, [partId, deletePart, toast, authContext, getAuthContextForMutation]);

	const handleEditSuccess = useCallback(() => {
		setIsEditing(false);
	}, []);

	const handleCheckOutClick = useCallback(() => {
		setShowCheckOut(true);
	}, []);

	if (part === undefined) {
		return (
			<div className="p-6 max-w-6xl mx-auto animate-pulse">
				<div className="mb-6 h-10 w-1/2 rounded bg-slate-200" />
				<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
					<div className="space-y-6 lg:col-span-2">
						<div className="h-56 rounded-lg bg-slate-200" />
						<div className="h-72 rounded-lg bg-slate-200" />
					</div>
					<div className="space-y-6">
						<div className="h-44 rounded-lg bg-slate-200" />
						<div className="h-64 rounded-lg bg-slate-200" />
					</div>
				</div>
			</div>
		);
	}

	if (part === null) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-center">
					<h1 className="text-2xl font-bold text-gray-900">Part not found</h1>
					<p className="text-gray-600 mt-2">
						The part you're looking for doesn't exist or has been deleted.
					</p>
					<Link
						to="/parts"
						className="mt-4 inline-flex items-center gap-2 text-cyan-600 hover:text-cyan-700"
					>
						<ArrowLeft className="w-4 h-4" />
						Back to parts
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="p-6 max-w-6xl mx-auto">
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
				<div className="flex items-center gap-4">
					<Link
						to="/parts"
						className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
					>
						<ArrowLeft className="w-5 h-5" />
					</Link>
					<div>
						<div className="flex items-center gap-3">
							<h1 className="text-3xl font-bold text-gray-900">{part.name}</h1>
							{part.archived && (
								<span className="px-2 py-1 bg-gray-100 text-gray-600 text-sm rounded-full">
									Archived
								</span>
							)}
						</div>
						<p className="text-gray-600 mt-1">SKU: {part.sku}</p>
					</div>
				</div>

				<EditorOnly>
					<div className="flex items-center gap-2">
						{isEditing ? (
							<Button variant="outline" onClick={() => setIsEditing(false)}>
								Cancel
							</Button>
						) : (
							<>
								<Button variant="outline" onClick={() => setIsEditing(true)}>
									<Edit className="w-4 h-4 mr-2" />
									Edit
								</Button>
								<Button variant="outline" onClick={handleArchive}>
									<Archive className="w-4 h-4 mr-2" />
									{part.archived ? "Unarchive" : "Archive"}
								</Button>
								<Button
									variant="destructive"
									onClick={() => setShowDeleteDialog(true)}
								>
									<Trash2 className="w-4 h-4" />
								</Button>
							</>
						)}
					</div>
				</EditorOnly>
			</div>

			{/* Edit Mode */}
			{isEditing ? (
				<PartForm
					part={part}
					onSubmit={handleEditSuccess}
					onCancel={() => setIsEditing(false)}
				/>
			) : (
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* Main content */}
					<div className="lg:col-span-2 space-y-6">
						{/* Details */}
						<Card>
							<CardHeader>
								<CardTitle>Part Details</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="grid grid-cols-2 gap-4">
									<div>
										<p className="text-sm text-gray-500">Name</p>
										<p className="font-medium">{part.name}</p>
									</div>
									<div>
										<p className="text-sm text-gray-500">SKU</p>
										<p className="font-medium">{part.sku}</p>
									</div>
								</div>
								<div>
									<p className="text-sm text-gray-500">Category</p>
									<span className="inline-block mt-1 px-2 py-1 bg-cyan-100 text-cyan-800 text-sm rounded">
										{part.category}
									</span>
								</div>
								{part.description && (
									<div>
										<p className="text-sm text-gray-500">Description</p>
										<p className="mt-1">{part.description}</p>
									</div>
								)}
							</CardContent>
						</Card>

						{/* Storage Locations */}
						<Card>
							<CardHeader className="flex flex-row items-center justify-between">
								<div>
									<CardTitle>Storage Locations</CardTitle>
									<CardDescription>
										Where this part is stored in your inventory
									</CardDescription>
								</div>
								<EditorOnly>
									<div className="flex items-center gap-2">
										<Button size="sm" onClick={() => setShowCheckIn(true)}>
											<Plus className="w-4 h-4 mr-2" />
											Check In
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => setShowMove(true)}
										>
											<ArrowRightLeft className="w-4 h-4 mr-2" />
											Move
										</Button>
									</div>
								</EditorOnly>
							</CardHeader>
							<CardContent>
								{inventory.length > 0 ? (
									<div className="space-y-2">
										{inventory.map((item) => (
											<div
												key={item._id}
												className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
											>
												<div className="flex items-center gap-3">
													<MapPin className="w-5 h-5 text-cyan-600" />
													<div>
														<p className="font-medium">
															{item.compartment?.label || "Unknown Compartment"}
														</p>
														<p className="text-sm text-gray-500">
															{item.drawer?.label || "Unknown Drawer"} →{" "}
															{item.blueprint?.name || "Unknown Blueprint"}
														</p>
													</div>
												</div>
												<div className="flex items-center gap-3">
													<span className="font-medium">
														{item.quantity} units
													</span>
													<EditorOnly>
														<Button
															size="sm"
															variant="outline"
															onClick={handleCheckOutClick}
														>
															<Minus className="w-4 h-4" />
														</Button>
													</EditorOnly>
												</div>
											</div>
										))}
									</div>
								) : (
									<div className="text-center py-8 text-gray-500">
										<Package className="w-12 h-12 mx-auto mb-2" />
										<p>No inventory for this part yet</p>
										<EditorOnly>
											<Button
												className="mt-4"
												onClick={() => setShowCheckIn(true)}
											>
												<Plus className="w-4 h-4 mr-2" />
												Check In Inventory
											</Button>
										</EditorOnly>
									</div>
								)}
							</CardContent>
						</Card>

						{/* Transaction History */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<History className="w-5 h-5" />
									Recent Activity
								</CardTitle>
							</CardHeader>
							<CardContent>
								{transactions && transactions.length > 0 ? (
									<div className="space-y-2">
										{transactions.map((transaction) => (
											<div
												key={transaction._id}
												className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
											>
												<History className="w-5 h-5 text-gray-400" />
												<div className="flex-1">
													<p className="text-sm">
														<span className="font-medium">
															{transaction.actionType}
														</span>{" "}
														{Math.abs(transaction.quantityDelta)} units
														{transaction.user?.name &&
															` by ${transaction.user.name}`}
													</p>
													<p className="text-xs text-gray-500">
														{new Date(transaction.timestamp).toLocaleString()}
													</p>
												</div>
												<span
													className={`font-medium ${
														transaction.quantityDelta > 0
															? "text-green-600"
															: "text-red-600"
													}`}
												>
													{transaction.quantityDelta > 0 ? "+" : ""}
													{transaction.quantityDelta}
												</span>
											</div>
										))}
									</div>
								) : (
									<div className="text-center py-8 text-gray-500">
										<History className="w-12 h-12 mx-auto mb-2" />
										<p>No activity recorded</p>
									</div>
								)}
							</CardContent>
						</Card>

						{/* Find on Blueprint */}
						{inventory.length > 0 && (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Grid3X3 className="w-5 h-5" />
										Blueprint Locations
									</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-gray-600 mb-4">
										This part is stored in {inventory.length} location(s). View
										on blueprints:
									</p>
									<div className="flex flex-wrap gap-2">
										{uniqueBlueprints.map((blueprint) => (
											<Link
												key={blueprint._id}
												to="/blueprints/$blueprintId"
												params={{ blueprintId: blueprint._id }}
												search={{ partId, mode: undefined }}
											>
												<Button variant="outline" size="sm">
													<Grid3X3 className="w-4 h-4 mr-2" />
													{blueprint.name}
												</Button>
											</Link>
										))}
									</div>
								</CardContent>
							</Card>
						)}
					</div>

					{/* Sidebar */}
					<div className="space-y-6">
						{/* Overview Stats */}
						<Card>
							<CardHeader>
								<CardTitle>Overview</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<StatCard
									title="Total Quantity"
									value={totalQuantity}
									description="Units in stock"
									icon={<Package className="w-4 h-4" />}
								/>
								<div className="flex items-center justify-between py-2 border-t">
									<span className="text-gray-600">Locations</span>
									<span className="font-medium">{inventory.length}</span>
								</div>
								<div className="flex items-center justify-between py-2 border-t">
									<span className="text-gray-600">Status</span>
									<span
										className={`font-medium ${part.archived ? "text-gray-500" : "text-green-600"}`}
									>
										{part.archived ? "Archived" : "Active"}
									</span>
								</div>
							</CardContent>
						</Card>

						{/* Part Image */}
						<Card>
							<CardHeader>
								<CardTitle>Image</CardTitle>
							</CardHeader>
							<CardContent>
								<PartImage
									imageId={part.imageId}
									name={part.name}
									size="xl"
									className="w-full"
								/>
							</CardContent>
						</Card>

						{/* Quick Actions */}
						<EditorOnly>
							<Card>
								<CardHeader>
									<CardTitle>Quick Actions</CardTitle>
								</CardHeader>
								<CardContent className="space-y-2">
									<Button
										className="w-full justify-start"
										onClick={() => setShowCheckIn(true)}
									>
										<Plus className="w-4 h-4 mr-2" />
										Check In
									</Button>
									<Button
										className="w-full justify-start"
										variant="outline"
										onClick={() => setShowCheckOut(true)}
									>
										<Minus className="w-4 h-4 mr-2" />
										Check Out
									</Button>
									<Button
										className="w-full justify-start"
										variant="outline"
										onClick={() => setShowMove(true)}
									>
										<ArrowRightLeft className="w-4 h-4 mr-2" />
										Move
									</Button>
									<AdminOnly>
										<Button
											className="w-full justify-start"
											variant="outline"
											onClick={() => setShowAdjust(true)}
										>
											<Settings className="w-4 h-4 mr-2" />
											Adjust (Admin)
										</Button>
									</AdminOnly>
								</CardContent>
							</Card>
						</EditorOnly>
					</div>
				</div>
			)}

			{/* Inventory Operation Dialogs */}
			<CheckInDialog
				open={showCheckIn}
				onOpenChange={setShowCheckIn}
				preselectedPartId={partId}
				onSuccess={() => {
					// Query will automatically refetch
				}}
			/>

			<CheckOutDialog
				open={showCheckOut}
				onOpenChange={setShowCheckOut}
				preselectedPartId={partId}
				onSuccess={() => {
					// Query will automatically refetch
				}}
			/>

			<MoveDialog
				open={showMove}
				onOpenChange={setShowMove}
				preselectedPartId={partId}
				onSuccess={() => {
					// Query will automatically refetch
				}}
			/>

			<AdjustDialog
				open={showAdjust}
				onOpenChange={setShowAdjust}
				preselectedPartId={partId}
				onSuccess={() => {
					// Query will automatically refetch
				}}
			/>

			{/* Delete Confirmation */}
			<AlertDialog
				open={showDeleteDialog}
				onOpenChange={setShowDeleteDialog}
				title="Delete Part"
				description={`Are you sure you want to delete "${part.name}"? This action cannot be undone and will remove all associated inventory records.`}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={handleDelete}
				variant="destructive"
			/>
		</div>
	);
}
