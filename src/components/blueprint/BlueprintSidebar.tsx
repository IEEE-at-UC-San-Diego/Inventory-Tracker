import { Link } from "@tanstack/react-router";
import {
	Box,
	ChevronDown,
	ChevronRight,
	Grid3X3,
	Image as ImageIcon,
	Minus,
	Package,
	Plus,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import { EditorOnly, MemberOnly } from "@/components/auth/ProtectedRoute";
import { CheckInDialog } from "@/components/inventory/CheckInDialog";
import { CheckOutDialog } from "@/components/inventory/CheckOutDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import {
	useMutation as useConvexMutation,
	useQuery as useConvexQuery,
} from "@/integrations/convex/react-query";
import {
	sanitizeFileName,
	validateImageContentType,
	validateImageFileSize,
} from "@/lib/fileValidation";
import type {
	Blueprint,
	CanvasMode,
	Compartment,
	Drawer,
	DrawerWithCompartments,
	SelectedElement,
} from "@/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface BlueprintSidebarProps {
	blueprint: Blueprint;
	drawers: DrawerWithCompartments[];
	selectedElement: SelectedElement;
	mode: CanvasMode;
	isLockedByMe: boolean;
	onSelectElement: (element: SelectedElement) => void;
	onCreateDrawer: (drawer: Partial<Drawer>) => void;
	onCreateCompartment: (
		compartment: Partial<Compartment>,
		drawerId: string,
	) => void;
	onUpdateDrawer: (drawerId: string, updates: Partial<Drawer>) => void;
	onUpdateCompartment: (
		compartmentId: string,
		updates: Partial<Compartment>,
	) => void;
	onDeleteDrawer: (drawerId: string) => void;
	onDeleteCompartment: (compartmentId: string) => void;
}

export function BlueprintSidebar({
	blueprint,
	drawers,
	selectedElement,
	mode: _mode,
	isLockedByMe,
	onSelectElement,
	onCreateDrawer: _onCreateDrawer,
	onCreateCompartment: _onCreateCompartment,
	onUpdateDrawer,
	onUpdateCompartment,
	onDeleteDrawer,
	onDeleteCompartment,
}: BlueprintSidebarProps) {
	const { authContext, getFreshAuthContext } = useAuth();
	const drawerLabelId = useId();
	const compartmentLabelId = useId();
	const selectedCompartment =
		selectedElement?.type === "compartment" ? selectedElement.data : null;
	const selectedCompartmentDrawerId =
		selectedElement?.type === "compartment" ? selectedElement.drawerId : null;

	const [expandedDrawers, setExpandedDrawers] = useState<Set<string>>(
		new Set(),
	);
	const [_showCreateDrawer, setShowCreateDrawer] = useState(false);
	const [_showCreateCompartment, setShowCreateCompartment] = useState(false);
	const [_createTargetDrawer, setCreateTargetDrawer] = useState<string | null>(
		null,
	);

	// Background image upload state
	const [isUploading, setIsUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Inventory dialog state
	const [showCheckIn, setShowCheckIn] = useState(false);
	const [showCheckOut, setShowCheckOut] = useState(false);
	const [selectedCompartmentId, setSelectedCompartmentId] = useState<
		string | null
	>(null);

	// Get background image URL if exists
	const backgroundImageUrl = useConvexQuery(
		api.storage.getImageUrl,
		authContext && blueprint.backgroundImageId
			? {
					authContext: authContext ?? undefined,
					storageId: blueprint.backgroundImageId as Id<"_storage">,
				}
			: undefined,
		{ enabled: !!blueprint.backgroundImageId && !!authContext },
	);

	// Fetch inventory for the selected compartment (must be declared unconditionally to obey Rules of Hooks).
	const compartmentInventoryResult = useConvexQuery(
		api.inventory.queries.getByCompartment,
		authContext && selectedCompartment
			? {
					authContext,
					compartmentId: selectedCompartment._id as Id<"compartments">,
				}
			: undefined,
		{ enabled: !!authContext && !!selectedCompartment },
	);

	// Generate upload URL mutation
	const generateUploadUrl = useConvexMutation(
		api.storage.generateBlueprintBackgroundUploadUrl,
	);

	// Confirm upload mutation
	const confirmUpload = useConvexMutation(
		api.storage.confirmBlueprintBackgroundUpload,
	);

	// Delete background mutation
	const deleteBackground = useConvexMutation(
		api.storage.deleteBlueprintBackgroundImage,
	);

	const toggleDrawerExpanded = useCallback((drawerId: string) => {
		setExpandedDrawers((prev) => {
			const next = new Set(prev);
			if (next.has(drawerId)) {
				next.delete(drawerId);
			} else {
				next.add(drawerId);
			}
			return next;
		});
	}, []);

	const totalCompartments = drawers.reduce(
		(sum, d) => sum + d.compartments.length,
		0,
	);

	// Handle check in for compartment
	const handleCheckIn = useCallback((compartmentId: string) => {
		setSelectedCompartmentId(compartmentId);
		setShowCheckIn(true);
	}, []);

	// Handle check out for compartment
	const handleCheckOut = useCallback((compartmentId: string) => {
		setSelectedCompartmentId(compartmentId);
		setShowCheckOut(true);
	}, []);

	// Handle background image file selection
	const handleBackgroundFileSelect = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;

			// Validate file type
			if (!validateImageContentType(file.type)) {
				alert("Please select a valid image file (JPEG, PNG, GIF, or WebP).");
				return;
			}

			// Validate file size (5MB)
			if (!validateImageFileSize(file.size)) {
				alert("Image file is too large. Maximum size is 5MB.");
				return;
			}

			const context = (await getFreshAuthContext()) ?? authContext ?? undefined;
			setIsUploading(true);
			try {
				if (!context) {
					throw new Error("Authentication required");
				}
				// Generate upload URL
				const { uploadUrl } = await (generateUploadUrl as any).mutateAsync({
					authContext: context,
					blueprintId: blueprint._id as Id<"blueprints">,
					fileName: sanitizeFileName(file.name),
					contentType: file.type,
				});

				// Upload the file
				const response = await fetch(uploadUrl, {
					method: "PUT",
					headers: { "Content-Type": file.type },
					body: file,
				});

				if (!response.ok) {
					throw new Error("Failed to upload image");
				}

				// Get the storage ID from the response
				const storageId = (await response.text()) as Id<"_storage">;

				// Confirm the upload
				await (confirmUpload as any).mutateAsync({
					authContext: context,
					blueprintId: blueprint._id as Id<"blueprints">,
					storageId,
				});

				// Reset file input
				if (fileInputRef.current) {
					fileInputRef.current.value = "";
				}
			} catch (error) {
				console.error("Failed to upload background image:", error);
				alert("Failed to upload background image. Please try again.");
			} finally {
				setIsUploading(false);
			}
		},
		[
			blueprint._id,
			generateUploadUrl,
			confirmUpload,
			getFreshAuthContext,
			authContext,
		],
	);

	// Handle delete background image
	const handleDeleteBackground = useCallback(async () => {
		if (!blueprint.backgroundImageId) return;

		if (!confirm("Are you sure you want to remove the background image?")) {
			return;
		}

		const context = (await getFreshAuthContext()) ?? authContext ?? undefined;
		if (!context) {
			alert("Authentication required");
			return;
		}
		try {
			await (deleteBackground as any).mutateAsync({
				authContext: context,
				blueprintId: blueprint._id as Id<"blueprints">,
			});
		} catch (error) {
			console.error("Failed to delete background image:", error);
			alert("Failed to remove background image. Please try again.");
		}
	}, [
		blueprint._id,
		blueprint.backgroundImageId,
		deleteBackground,
		getFreshAuthContext,
		authContext,
	]);

	// Handle upload button click
	const handleUploadClick = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	// Nothing selected - show blueprint info
	if (!selectedElement) {
		return (
			<div className="space-y-4">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Box className="w-5 h-5" />
							Blueprint Info
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<Label className="text-gray-500">Name</Label>
							<p className="font-medium">{blueprint.name}</p>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="p-3 bg-slate-50 rounded-lg">
								<p className="text-2xl font-bold text-slate-700">
									{drawers.length}
								</p>
								<p className="text-sm text-slate-500">Drawers</p>
							</div>
							<div className="p-3 bg-slate-50 rounded-lg">
								<p className="text-2xl font-bold text-slate-700">
									{totalCompartments}
								</p>
								<p className="text-sm text-slate-500">Compartments</p>
							</div>
						</div>
						<div className="text-sm text-gray-500">
							<p>
								Last updated: {new Date(blueprint.updatedAt).toLocaleString()}
							</p>
						</div>
					</CardContent>
				</Card>

				{/* Background Image Card */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<ImageIcon className="w-5 h-5" />
							Background Image
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<input
							ref={fileInputRef}
							type="file"
							accept="image/jpeg,image/png,image/gif,image/webp"
							onChange={handleBackgroundFileSelect}
							className="hidden"
						/>

						{blueprint.backgroundImageId ? (
							<div className="space-y-3">
								{backgroundImageUrl && (
									<div className="relative group">
										<img
											src={backgroundImageUrl}
											alt="Blueprint background"
											className="w-full h-auto rounded-lg border border-gray-200 object-contain bg-gray-50"
										/>
									</div>
								)}
								{isLockedByMe && (
									<Button
										variant="destructive"
										size="sm"
										className="w-full"
										onClick={handleDeleteBackground}
										disabled={isUploading}
									>
										<X className="w-4 h-4 mr-2" />
										Remove Background
									</Button>
								)}
							</div>
						) : (
							<div className="text-center py-4">
								<EditorOnly>
									<Button
										variant="outline"
										size="sm"
										onClick={handleUploadClick}
										disabled={isUploading}
										className="w-full"
									>
										<Upload className="w-4 h-4 mr-2" />
										{isUploading ? "Uploading..." : "Upload Background"}
									</Button>
								</EditorOnly>
								<p className="text-xs text-gray-500 mt-2">
									Upload a reference image to trace while editing your layout
								</p>
								<p className="text-xs text-gray-400 mt-1">
									Supports: JPEG, PNG, GIF, WebP (max 5MB)
								</p>
							</div>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center justify-between">
							<span className="flex items-center gap-2">
								<Grid3X3 className="w-5 h-5" />
								Drawers
							</span>
							{isLockedByMe && (
								<Button
									size="sm"
									variant="ghost"
									onClick={() => setShowCreateDrawer(true)}
								>
									<Plus className="w-4 h-4" />
								</Button>
							)}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{drawers.length === 0 ? (
							<div className="text-center py-8 text-gray-500">
								<Grid3X3 className="w-12 h-12 mx-auto mb-2 text-gray-300" />
								<p>No drawers yet</p>
								{isLockedByMe && (
									<Button
										variant="outline"
										size="sm"
										className="mt-4"
										onClick={() => setShowCreateDrawer(true)}
									>
										<Plus className="w-4 h-4 mr-2" />
										Add Drawer
									</Button>
								)}
							</div>
						) : (
							<div className="space-y-1">
								{drawers.map((drawer) => (
									<div key={drawer._id}>
										<button
											type="button"
											onClick={() =>
												onSelectElement({
													type: "drawer",
													id: drawer._id,
													data: drawer,
												})
											}
											className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
										>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													toggleDrawerExpanded(drawer._id);
												}}
												className="p-1 hover:bg-slate-200 rounded"
											>
												{expandedDrawers.has(drawer._id) ? (
													<ChevronDown className="w-4 h-4" />
												) : (
													<ChevronRight className="w-4 h-4" />
												)}
											</button>
											<span className="flex-1 font-medium">
												{drawer.label || `Drawer ${drawer._id.slice(-4)}`}
											</span>
											<span className="text-xs text-gray-400">
												{drawer.compartments.length} compartments
											</span>
										</button>

										{/* Compartments list */}
										{expandedDrawers.has(drawer._id) && (
											<div className="ml-6 space-y-1">
												{drawer.compartments.map((compartment) => (
													<button
														type="button"
														key={compartment._id}
														onClick={() =>
															onSelectElement({
																type: "compartment",
																id: compartment._id,
																data: compartment,
																drawerId: drawer._id,
															})
														}
														className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left text-sm"
													>
														<Grid3X3 className="w-3 h-3 text-gray-400" />
														<span className="flex-1">
															{compartment.label ||
																`Compartment ${compartment._id.slice(-4)}`}
														</span>
													</button>
												))}
												{isLockedByMe && (
													<Button
														variant="ghost"
														size="sm"
														className="w-full justify-start text-gray-500"
														onClick={() => {
															setCreateTargetDrawer(drawer._id);
															setShowCreateCompartment(true);
														}}
													>
														<Plus className="w-3 h-3 mr-2" />
														Add Compartment
													</Button>
												)}
											</div>
										)}
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		);
	}

	// Drawer selected
	if (selectedElement.type === "drawer") {
		const drawer = selectedElement.data;
		const drawerDisplayLabel = drawer.label || `Drawer ${drawer._id.slice(-4)}`;
		return (
			<div className="space-y-4">
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="flex items-center justify-between gap-2">
							<span className="flex items-center gap-2 min-w-0">
								<Box className="w-5 h-5 flex-shrink-0" />
								<span className="truncate">{drawerDisplayLabel}</span>
							</span>
							<Badge variant="secondary" className="tabular-nums">
								#{drawer._id.slice(-4)}
							</Badge>
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="space-y-1.5">
							<Label htmlFor={drawerLabelId} className="text-xs text-gray-500">
								Label
							</Label>
							<Input
								id={drawerLabelId}
								value={drawer.label || ""}
								onChange={(e) =>
									onUpdateDrawer(drawer._id, { label: e.target.value })
								}
								disabled={!isLockedByMe}
								placeholder="Drawer name"
								className="h-8 text-sm"
							/>
						</div>

						<div className="space-y-2">
							<p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
								Transform
							</p>
							<div className="grid grid-cols-2 gap-2">
								<div className="space-y-1.5">
									<Label className="text-xs text-gray-500">X</Label>
									<Input
										type="number"
										value={Math.round(drawer.x)}
										onChange={(e) =>
											onUpdateDrawer(drawer._id, { x: Number(e.target.value) })
										}
										disabled={!isLockedByMe}
										className="h-8 text-sm tabular-nums"
									/>
								</div>
								<div className="space-y-1.5">
									<Label className="text-xs text-gray-500">Y</Label>
									<Input
										type="number"
										value={Math.round(drawer.y)}
										onChange={(e) =>
											onUpdateDrawer(drawer._id, { y: Number(e.target.value) })
										}
										disabled={!isLockedByMe}
										className="h-8 text-sm tabular-nums"
									/>
								</div>
								<div className="space-y-1.5">
									<Label className="text-xs text-gray-500">W</Label>
									<Input
										type="number"
										value={Math.round(drawer.width)}
										onChange={(e) =>
											onUpdateDrawer(drawer._id, {
												width: Number(e.target.value),
											})
										}
										disabled={!isLockedByMe}
										min={20}
										className="h-8 text-sm tabular-nums"
									/>
								</div>
								<div className="space-y-1.5">
									<Label className="text-xs text-gray-500">H</Label>
									<Input
										type="number"
										value={Math.round(drawer.height)}
										onChange={(e) =>
											onUpdateDrawer(drawer._id, {
												height: Number(e.target.value),
											})
										}
										disabled={!isLockedByMe}
										min={20}
										className="h-8 text-sm tabular-nums"
									/>
								</div>
							</div>
						</div>

						<div className="flex gap-2 pt-1">
							{isLockedByMe && (
								<Button
									variant="outline"
									size="sm"
									className="flex-1 h-8"
									onClick={() => {
										setCreateTargetDrawer(drawer._id);
										setShowCreateCompartment(true);
									}}
								>
									<Plus className="w-4 h-4 mr-2" />
									Add Compartment
								</Button>
							)}
							<Button
								variant="destructive"
								size="sm"
								className="flex-1 h-8"
								onClick={() => onDeleteDrawer(drawer._id)}
								disabled={!isLockedByMe}
							>
								<Trash2 className="w-4 h-4 mr-2" />
								Delete
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	// Compartment selected - show properties and inventory
	if (selectedElement.type === "compartment") {
		const compartment = selectedElement.data;
		const compartmentDisplayLabel =
			compartment.label || `Compartment ${compartment._id.slice(-4)}`;
		const parentDrawer = selectedCompartmentDrawerId
			? drawers.find((d) => d._id === selectedCompartmentDrawerId)
			: undefined;

		const compartmentInventory = compartmentInventoryResult ?? [];
		const totalInCompartment = compartmentInventory.reduce(
			(sum, item) => sum + item.quantity,
			0,
		);

		return (
			<div className="space-y-4">
				{/* Properties Card */}
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="flex items-center justify-between gap-2">
							<span className="flex items-center gap-2 min-w-0">
								<Grid3X3 className="w-5 h-5 flex-shrink-0" />
								<span className="truncate">{compartmentDisplayLabel}</span>
							</span>
							<Badge variant="secondary" className="tabular-nums">
								#{compartment._id.slice(-4)}
							</Badge>
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						{parentDrawer && (
							<div className="text-xs text-gray-500">
								In drawer:{" "}
								{parentDrawer.label || `Drawer ${parentDrawer._id.slice(-4)}`}
							</div>
						)}

						<div className="space-y-1.5">
							<Label
								htmlFor={compartmentLabelId}
								className="text-xs text-gray-500"
							>
								Label
							</Label>
							<Input
								id={compartmentLabelId}
								value={compartment.label || ""}
								onChange={(e) =>
									onUpdateCompartment(compartment._id, {
										label: e.target.value,
									})
								}
								disabled={!isLockedByMe}
								placeholder="Compartment name"
								className="h-8 text-sm"
							/>
						</div>

						<div className="space-y-2">
							<p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
								Transform
							</p>
							<div className="grid grid-cols-2 gap-2">
								<div className="space-y-1.5">
									<Label className="text-xs text-gray-500">X</Label>
									<Input
										type="number"
										value={Math.round(compartment.x)}
										onChange={(e) =>
											onUpdateCompartment(compartment._id, {
												x: Number(e.target.value),
											})
										}
										disabled={!isLockedByMe}
										className="h-8 text-sm tabular-nums"
									/>
								</div>
								<div className="space-y-1.5">
									<Label className="text-xs text-gray-500">Y</Label>
									<Input
										type="number"
										value={Math.round(compartment.y)}
										onChange={(e) =>
											onUpdateCompartment(compartment._id, {
												y: Number(e.target.value),
											})
										}
										disabled={!isLockedByMe}
										className="h-8 text-sm tabular-nums"
									/>
								</div>
								<div className="space-y-1.5">
									<Label className="text-xs text-gray-500">W</Label>
									<Input
										type="number"
										value={Math.round(compartment.width)}
										onChange={(e) =>
											onUpdateCompartment(compartment._id, {
												width: Number(e.target.value),
											})
										}
										disabled={!isLockedByMe}
										min={15}
										className="h-8 text-sm tabular-nums"
									/>
								</div>
								<div className="space-y-1.5">
									<Label className="text-xs text-gray-500">H</Label>
									<Input
										type="number"
										value={Math.round(compartment.height)}
										onChange={(e) =>
											onUpdateCompartment(compartment._id, {
												height: Number(e.target.value),
											})
										}
										disabled={!isLockedByMe}
										min={15}
										className="h-8 text-sm tabular-nums"
									/>
								</div>
							</div>
						</div>

						<div className="space-y-2">
							<p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
								Rotation
							</p>
							<div className="flex gap-2">
								{[0, 90, 180, 270].map((angle) => (
									<Button
										key={angle}
										variant={
											compartment.rotation === angle ? "default" : "outline"
										}
										size="sm"
										onClick={() =>
											onUpdateCompartment(compartment._id, { rotation: angle })
										}
										disabled={!isLockedByMe}
										className="flex-1 h-8"
									>
										{angle}°
									</Button>
								))}
							</div>
						</div>

						<div className="pt-1">
							<Button
								variant="destructive"
								size="sm"
								className="w-full h-8"
								onClick={() => onDeleteCompartment(compartment._id)}
								disabled={!isLockedByMe}
							>
								<Trash2 className="w-4 h-4 mr-2" />
								Delete
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Inventory Card */}
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="flex items-center justify-between gap-2">
							<span className="flex items-center gap-2">
								<Package className="w-5 h-5" />
								Inventory
								<Badge variant="secondary">{totalInCompartment} units</Badge>
							</span>
							<MemberOnly>
								<div className="flex gap-2">
									<Button
										size="sm"
										variant="outline"
										className="h-8"
										onClick={() => handleCheckOut(compartment._id)}
										disabled={totalInCompartment <= 0}
										title="Check Out"
									>
										<Minus className="w-4 h-4" />
									</Button>
									<Button
										size="sm"
										className="h-8"
										onClick={() => handleCheckIn(compartment._id)}
										title="Check In"
									>
										<Plus className="w-4 h-4" />
									</Button>
								</div>
							</MemberOnly>
						</CardTitle>
					</CardHeader>
					<CardContent>
						{compartmentInventory.length === 0 ? (
							<div className="text-center py-4 text-gray-500 text-sm">
								<Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
								<p>No inventory in this compartment</p>
								<MemberOnly>
									<Button
										size="sm"
										variant="outline"
										className="mt-3"
										onClick={() => handleCheckIn(compartment._id)}
									>
										<Plus className="w-4 h-4 mr-1" />
										Check In Part
									</Button>
								</MemberOnly>
							</div>
						) : (
							<div className="space-y-2">
								{compartmentInventory.map((item) => (
									<div
										key={item._id}
										className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
									>
										<div className="flex items-center gap-2">
											<Package className="w-4 h-4 text-gray-400" />
											<div>
												<Link
													to="/parts/$partId"
													params={{ partId: item.partId }}
													className="font-medium text-sm hover:text-cyan-600"
												>
													{item.part?.name || "Unknown Part"}
												</Link>
												<p className="text-xs text-gray-500">
													{item.part?.sku}
												</p>
											</div>
										</div>
										<div className="flex items-center gap-2">
											<Badge
												variant={item.quantity < 10 ? "destructive" : "default"}
											>
												{item.quantity}
											</Badge>
											<MemberOnly>
												<Button
													size="sm"
													variant="ghost"
													onClick={() => handleCheckOut(compartment._id)}
													disabled={item.quantity <= 0}
												>
													<Minus className="w-4 h-4" />
												</Button>
											</MemberOnly>
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				{/* Inventory Dialogs */}
				<CheckInDialog
					open={showCheckIn}
					onOpenChange={setShowCheckIn}
					preselectedCompartmentId={selectedCompartmentId}
					onSuccess={() => {
						// Refetch will happen automatically
					}}
				/>

				<CheckOutDialog
					open={showCheckOut}
					onOpenChange={setShowCheckOut}
					preselectedPartId={selectedCompartmentId ?? undefined}
					onSuccess={() => {
						// Refetch will happen automatically
					}}
				/>
			</div>
		);
	}

	return null;
}
