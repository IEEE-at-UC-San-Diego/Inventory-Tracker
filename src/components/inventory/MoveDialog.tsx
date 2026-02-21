import {
	ArrowRight,
	ArrowRightLeft,
	Loader2,
	MapPin,
	Package,
	Search,
} from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";
import { LocationPicker2D } from "@/components/parts/LocationPicker2D";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQuery } from "@/integrations/convex/react-query";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { useToast } from "../ui/toast";

interface MoveDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	preselectedPartId?: string | null;
	onSuccess?: () => void;
}

interface LocationWithInventory {
	inventoryId: string;
	compartmentId: string;
	compartmentLabel: string;
	drawerLabel: string;
	blueprintName: string;
	quantity: number;
}

export function MoveDialog({
	open,
	onOpenChange,
	preselectedPartId,
	onSuccess,
}: MoveDialogProps) {
	const { authContext, getFreshAuthContext } = useAuth();
	const { toast } = useToast();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const quantityInputId = useId();
	const notesInputId = useId();

	// Form state
	const [selectedPartId, setSelectedPartId] = useState<string>(
		preselectedPartId ?? "",
	);
	const [partSearchQuery, setPartSearchQuery] = useState("");
	const [showPartSearch, setShowPartSearch] = useState(!preselectedPartId);
	const [isPartSearchFocused, setIsPartSearchFocused] = useState(false);
	const [sourceCompartmentId, setSourceCompartmentId] = useState("");
	const [destCompartmentId, setDestCompartmentId] = useState("");
	const [destLocation, setDestLocation] = useState<{
		blueprintId?: string;
		drawerId?: string;
		compartmentId?: string;
	}>({});
	const [quantity, setQuantity] = useState(1);
	const [notes, setNotes] = useState("");

	// Fetch parts list for search
	const partsResult = useQuery(
		api.parts.queries.list as any,
		authContext
			? {
					authContext,
					includeArchived: false,
				}
			: undefined,
		{ enabled: !!authContext },
	);
	const parts = (partsResult as any[]) ?? [];

	// Filter parts based on search
	const filteredParts = parts.filter(
		(part: any) =>
			part.name.toLowerCase().includes(partSearchQuery.toLowerCase()) ||
			part.sku.toLowerCase().includes(partSearchQuery.toLowerCase()),
	);

	// Get selected part details from list
	const selectedPart = parts.find((p: any) => p._id === selectedPartId);

	// Fetch available inventory for source
	const availableInventory = useQuery(
		api.inventory.queries.getAvailable,
		selectedPartId && authContext
			? { authContext, partId: selectedPartId as Id<"parts"> }
			: undefined,
	);

	// Get source locations
	const sourceLocations: LocationWithInventory[] = useMemo(() => {
		if (!availableInventory) return [];
		return availableInventory
			.filter((item: any) => item.quantity > 0)
			.map((item: any) => ({
				inventoryId: item._id,
				compartmentId: item.compartmentId,
				compartmentLabel:
					item.compartment?.label ||
					`Compartment ${item.compartmentId.slice(-4)}`,
				drawerLabel:
					item.drawer?.label ||
					(item.drawer ? `Drawer ${item.drawer._id.slice(-4)}` : ""),
				blueprintName: item.blueprint?.name || "",
				quantity: item.quantity,
			}));
	}, [availableInventory]);

	// Get selected source
	const selectedSource = sourceLocations.find(
		(l) => l.compartmentId === sourceCompartmentId,
	);
	const maxQuantity = selectedSource?.quantity ?? 0;

	// Fetch part details (for preselected case)
	const partResult = useQuery(
		api.parts.queries.get,
		selectedPartId && authContext && preselectedPartId
			? { authContext, partId: selectedPartId as Id<"parts"> }
			: undefined,
	);
	// Move mutation
	const move = useMutation(api.inventory.mutations.move);

	// Handle submit
	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();

			if (!selectedPartId) {
				toast.error("Please select a part");
				return;
			}

			if (!sourceCompartmentId) {
				toast.error("Please select a source location");
				return;
			}

			if (!destCompartmentId) {
				toast.error("Please select a destination location");
				return;
			}

			if (sourceCompartmentId === destCompartmentId) {
				toast.error("Source and destination must be different");
				return;
			}

			if (quantity <= 0) {
				toast.error("Quantity must be greater than 0");
				return;
			}

			if (quantity > maxQuantity) {
				toast.error(`Cannot move more than ${maxQuantity} units`);
				return;
			}

			setIsSubmitting(true);

			try {
				const context = (await getFreshAuthContext()) || authContext;
				if (!context) {
					throw new Error("Auth context is required");
				}
				await move({
					authContext: context,
					partId: selectedPartId as Id<"parts">,
					sourceCompartmentId: sourceCompartmentId as Id<"compartments">,
					destCompartmentId: destCompartmentId as Id<"compartments">,
					quantity,
					notes: notes || undefined,
				});

				const partName = selectedPart?.name ?? partResult?.name ?? "units";
				toast.success(
					"Inventory moved",
					`Moved ${quantity} ${partName} to new location`,
				);

				// Reset form
				if (!preselectedPartId) {
					setSelectedPartId("");
					setShowPartSearch(true);
				}
				setSourceCompartmentId("");
				setDestCompartmentId("");
				setDestLocation({});
				setQuantity(1);
				setNotes("");
				setPartSearchQuery("");

				onOpenChange(false);
				onSuccess?.();
			} catch (error) {
				toast.error(
					"Failed to move inventory",
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
				);
			} finally {
				setIsSubmitting(false);
			}
		},
		[
			selectedPartId,
			sourceCompartmentId,
			destCompartmentId,
			quantity,
			maxQuantity,
			notes,
			selectedPart,
			partResult,
			move,
			preselectedPartId,
			onOpenChange,
			onSuccess,
			toast,
			authContext,
			getFreshAuthContext,
		],
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<ArrowRightLeft className="w-5 h-5 text-blue-600" />
							Move Inventory
						</DialogTitle>
						<DialogDescription>
							Move parts from one location to another
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-4">
						{/* Part Selection */}
						{!preselectedPartId && (
							<div className="space-y-2">
								<Label>Select Part</Label>
								{showPartSearch ? (
									<div className="relative">
										<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
										<Input
											placeholder="Search parts by name or SKU..."
											value={partSearchQuery}
											onChange={(e) => setPartSearchQuery(e.target.value)}
											onFocus={() => setIsPartSearchFocused(true)}
											onBlur={() =>
												setTimeout(() => setIsPartSearchFocused(false), 200)
											}
											className="pl-10"
										/>
										{(partSearchQuery || isPartSearchFocused) && (
											<div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-auto">
												{filteredParts.length === 0 ? (
													<p className="p-3 text-sm text-gray-500">
														No parts found
													</p>
												) : (
													filteredParts.map((part: any) => (
														<button
															key={part._id}
															type="button"
															onClick={() => {
																setSelectedPartId(part._id);
																setShowPartSearch(false);
																setPartSearchQuery("");
																setSourceCompartmentId("");
																setDestCompartmentId("");
																setDestLocation({});
																setQuantity(1);
															}}
															className="w-full px-3 py-2 text-left hover:bg-gray-50"
														>
															<p className="font-medium">{part.name}</p>
															<p className="text-sm text-gray-500">
																{part.sku}
															</p>
														</button>
													))
												)}
											</div>
										)}
									</div>
								) : (
									<div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
										<div>
											<p className="font-medium">{selectedPart?.name}</p>
											<p className="text-sm text-gray-500">
												{selectedPart?.sku}
											</p>
										</div>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => {
												setSelectedPartId("");
												setShowPartSearch(true);
												setSourceCompartmentId("");
												setDestCompartmentId("");
												setDestLocation({});
												setQuantity(1);
											}}
										>
											Change
										</Button>
									</div>
								)}
							</div>
						)}

						{/* Part info (if preselected) */}
						{preselectedPartId && partResult && (
							<div className="p-3 bg-gray-50 rounded-lg">
								<p className="text-sm text-gray-500">Moving:</p>
								<p className="font-medium">{partResult.name}</p>
								<p className="text-sm text-gray-500">{partResult.sku}</p>
							</div>
						)}

						{/* Source Location Selection */}
						{selectedPartId && (
							<div className="space-y-2">
								<Label>From Location</Label>
								{sourceLocations.length === 0 ? (
									<p className="text-sm text-gray-500 p-3 bg-gray-50 rounded-lg">
										No inventory available for this part
									</p>
								) : (
									<div className="space-y-2">
										{sourceLocations.map((location) => (
											<button
												key={location.compartmentId}
												type="button"
												onClick={() => {
													setSourceCompartmentId(location.compartmentId);
													setQuantity(Math.min(quantity, location.quantity));
													setDestCompartmentId("");
													setDestLocation({});
												}}
												className={`w-full p-3 rounded-lg border text-left transition-colors ${
													sourceCompartmentId === location.compartmentId
														? "border-red-500 bg-red-50"
														: "border-gray-200 hover:border-gray-300"
												}`}
											>
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-2 min-w-0">
														<MapPin className="w-4 h-4 text-gray-400 shrink-0" />
														<div className="min-w-0">
															<span className="font-medium block truncate">
																{location.compartmentLabel}
															</span>
															{(location.blueprintName ||
																location.drawerLabel) && (
																<span className="text-xs text-gray-500 block truncate">
																	{[
																		location.blueprintName,
																		location.drawerLabel,
																	]
																		.filter(Boolean)
																		.join(" \u2022 ")}
																</span>
															)}
														</div>
													</div>
													<div className="flex items-center gap-1 text-sm text-gray-600 shrink-0">
														<Package className="w-4 h-4" />
														{location.quantity} units
													</div>
												</div>
											</button>
										))}
									</div>
								)}
							</div>
						)}

						{/* Destination Selection */}
						{sourceCompartmentId && (
							<div className="space-y-2">
								<Label className="flex items-center gap-2">
									<ArrowRight className="w-4 h-4" />
									To Location
								</Label>
								<LocationPicker2D
									orgId={authContext?.orgId}
									selectedLocation={destLocation}
									onLocationChange={(location) => {
										setDestLocation(location);
										setDestCompartmentId(location.compartmentId ?? "");
									}}
									disabledCompartmentIds={[sourceCompartmentId]}
									allowSkip={false}
								/>
							</div>
						)}

						{/* Quantity */}
						{selectedSource && destCompartmentId && (
							<div className="space-y-2">
								<Label htmlFor={quantityInputId}>
									Quantity (max: {maxQuantity})
								</Label>
								<div className="flex items-center gap-2">
									<Input
										id={quantityInputId}
										type="number"
										min={1}
										max={maxQuantity}
										value={quantity}
										onChange={(e) => setQuantity(Number(e.target.value))}
										className="w-32"
									/>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() =>
											setQuantity(Math.max(1, Math.floor(maxQuantity / 2)))
										}
										disabled={maxQuantity < 2}
									>
										Half
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => setQuantity(maxQuantity)}
									>
										Max
									</Button>
								</div>
								{quantity > maxQuantity && (
									<p className="text-sm text-red-500">
										Cannot exceed available quantity of {maxQuantity}
									</p>
								)}
							</div>
						)}

						{/* Notes */}
						{destCompartmentId && (
							<div className="space-y-2">
								<Label htmlFor={notesInputId}>Notes (optional)</Label>
								<Textarea
									id={notesInputId}
									value={notes}
									onChange={(e) => setNotes(e.target.value)}
									placeholder="Add any additional information..."
									rows={2}
								/>
							</div>
						)}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={
								isSubmitting ||
								!selectedPartId ||
								!sourceCompartmentId ||
								!destCompartmentId ||
								quantity <= 0 ||
								quantity > maxQuantity ||
								sourceCompartmentId === destCompartmentId
							}
						>
							{isSubmitting ? (
								<>
									<Loader2 className="w-4 h-4 mr-2 animate-spin" />
									Moving...
								</>
							) : (
								<>
									<ArrowRightLeft className="w-4 h-4 mr-2" />
									Move Inventory
								</>
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
