import {
	Box,
	ChevronDown,
	ChevronRight,
	Grid3X3,
	Image as ImageIcon,
	Plus,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import type { RefObject, SetStateAction } from "react";
import { EditorOnly } from "@/components/auth/ProtectedRoute";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
	Blueprint,
	Drawer,
	DrawerWithCompartments,
	SelectedElement,
} from "@/types";

interface BlueprintOverviewPanelProps {
	blueprint: Blueprint;
	drawers: DrawerWithCompartments[];
	totalCompartments: number;
	isLockedByMe: boolean;
	backgroundImageUrl?: string | null;
	isUploading: boolean;
	expandedDrawers: Set<string>;
	fileInputRef: RefObject<HTMLInputElement | null>;
	onBackgroundFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
	onDeleteBackground: () => void;
	onUploadClick: () => void;
	onToggleDrawerExpanded: (drawerId: string) => void;
	onSelectElement: (element: SelectedElement) => void;
	onShowCreateDrawer: React.Dispatch<SetStateAction<boolean>>;
	onCreateTargetDrawer: React.Dispatch<SetStateAction<string | null>>;
	onShowCreateCompartment: React.Dispatch<SetStateAction<boolean>>;
}

export function BlueprintOverviewPanel({
	blueprint,
	drawers,
	totalCompartments,
	isLockedByMe,
	backgroundImageUrl,
	isUploading,
	expandedDrawers,
	fileInputRef,
	onBackgroundFileSelect,
	onDeleteBackground,
	onUploadClick,
	onToggleDrawerExpanded,
	onSelectElement,
	onShowCreateDrawer,
	onCreateTargetDrawer,
	onShowCreateCompartment,
}: BlueprintOverviewPanelProps) {
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
							<p className="text-2xl font-bold text-slate-700">{drawers.length}</p>
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
						<p>Last updated: {new Date(blueprint.updatedAt).toLocaleString()}</p>
					</div>
				</CardContent>
			</Card>

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
						onChange={onBackgroundFileSelect}
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
									onClick={onDeleteBackground}
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
									onClick={onUploadClick}
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
								onClick={() => onShowCreateDrawer(true)}
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
									onClick={() => onShowCreateDrawer(true)}
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
												onToggleDrawerExpanded(drawer._id);
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
														onCreateTargetDrawer(drawer._id);
														onShowCreateCompartment(true);
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

interface DrawerDetailsPanelProps {
	drawer: Drawer;
	drawerLabelId: string;
	isLockedByMe: boolean;
	onUpdateDrawer: (drawerId: string, updates: Partial<Drawer>) => void;
	onDeleteDrawer: (drawerId: string) => void;
	onCreateTargetDrawer: React.Dispatch<SetStateAction<string | null>>;
	onShowCreateCompartment: React.Dispatch<SetStateAction<boolean>>;
}

export function DrawerDetailsPanel({
	drawer,
	drawerLabelId,
	isLockedByMe,
	onUpdateDrawer,
	onDeleteDrawer,
	onCreateTargetDrawer,
	onShowCreateCompartment,
}: DrawerDetailsPanelProps) {
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
									onCreateTargetDrawer(drawer._id);
									onShowCreateCompartment(true);
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
