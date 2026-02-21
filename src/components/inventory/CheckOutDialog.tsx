import {
	AlertTriangle,
	Loader2,
	MapPin,
	Minus,
	Package,
	Search,
} from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQuery } from "@/integrations/convex/react-query";
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

interface CheckOutDialogProps {
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

function buildLocationLabel(item: any): {
	compartmentLabel: string;
	drawerLabel: string;
	blueprintName: string;
} {
	return {
		compartmentLabel:
			item.compartment?.label || `Compartment ${item.compartmentId.slice(-4)}`,
		drawerLabel:
			item.drawer?.label ||
			(item.drawer ? `Drawer ${item.drawer._id.slice(-4)}` : ""),
		blueprintName: item.blueprint?.name || "",
	};
}

export function CheckOutDialog({
	open,
	onOpenChange,
	preselectedPartId,
	onSuccess,
}: CheckOutDialogProps) {
	const { authContext, getFreshAuthContext } = useAuth();
	const { toast } = useToast();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const quantityInputId = useId();
	const notesInputId = useId();

	// Form state
	const [selectedPartId, setSelectedPartId] = useState<string>(
		preselectedPartId ?? "",
	);
	const [selectedCompartmentId, setSelectedCompartmentId] = useState("");
	const [quantity, setQuantity] = useState(1);
	const [notes, setNotes] = useState("");
	const [partSearchQuery, setPartSearchQuery] = useState("");
	const [showPartSearch, setShowPartSearch] = useState(!preselectedPartId);
	const [isPartSearchFocused, setIsPartSearchFocused] = useState(false);

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

	// Get selected part details
	const selectedPart = parts.find((p: any) => p._id === selectedPartId);

	// Fetch available inventory
	const availableInventory = useQuery(
		api.inventory.queries.getAvailable,
		selectedPartId && authContext
			? { authContext, partId: selectedPartId as Id<"parts"> }
			: undefined,
	);

	// Group inventory by location
	const locations: LocationWithInventory[] = useMemo(() => {
		if (!availableInventory) return [];
		return availableInventory
			.filter((item: any) => item.quantity > 0)
			.map((item: any) => {
				const labels = buildLocationLabel(item);
				return {
					inventoryId: item._id,
					compartmentId: item.compartmentId,
					compartmentLabel: labels.compartmentLabel,
					drawerLabel: labels.drawerLabel,
					blueprintName: labels.blueprintName,
					quantity: item.quantity,
				};
			});
	}, [availableInventory]);

	// Get selected location
	const selectedLocation = locations.find(
		(l) => l.compartmentId === selectedCompartmentId,
	);
	const maxQuantity = selectedLocation?.quantity ?? 0;

	// Fetch part details (for preselected case)
	const partResult = useQuery(
		api.parts.queries.get,
		selectedPartId && authContext && preselectedPartId
			? { authContext, partId: selectedPartId as Id<"parts"> }
			: undefined,
	);

	// Check-out mutation
	const checkOut = useMutation(api.inventory.mutations.checkOut);

	// Handle submit
	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();

			if (!selectedPartId) {
				toast.error("Please select a part");
				return;
			}

			if (!selectedCompartmentId) {
				toast.error("Please select a location");
				return;
			}

			if (quantity <= 0) {
				toast.error("Quantity must be greater than 0");
				return;
			}

			if (quantity > maxQuantity) {
				toast.error(`Cannot check out more than ${maxQuantity} units`);
				return;
			}

			setIsSubmitting(true);

			try {
				const context = (await getFreshAuthContext()) || authContext;
				if (!context) {
					throw new Error("Auth context is required");
				}
				await checkOut({
					authContext: context,
					partId: selectedPartId as Id<"parts">,
					compartmentId: selectedCompartmentId as Id<"compartments">,
					quantity,
					notes: notes || undefined,
				});

				const partName = selectedPart?.name ?? partResult?.name ?? "units";
				toast.success(
					"Inventory checked out",
					`Removed ${quantity} ${partName} from inventory`,
				);

				// Reset form
				if (!preselectedPartId) {
					setSelectedPartId("");
					setShowPartSearch(true);
				}
				setSelectedCompartmentId("");
				setQuantity(1);
				setNotes("");
				setPartSearchQuery("");

				onOpenChange(false);
				onSuccess?.();
			} catch (error) {
				toast.error(
					"Failed to check out inventory",
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
			selectedCompartmentId,
			quantity,
			maxQuantity,
			notes,
			selectedPart,
			partResult,
			checkOut,
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
			<DialogContent className="max-w-lg">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Minus className="w-5 h-5 text-red-600" />
							Check Out Inventory
						</DialogTitle>
						<DialogDescription>
							Remove parts from your inventory
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
																setSelectedCompartmentId("");
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
												setSelectedCompartmentId("");
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
								<p className="text-sm text-gray-500">Checking out:</p>
								<p className="font-medium">{partResult.name}</p>
								<p className="text-sm text-gray-500">{partResult.sku}</p>
							</div>
						)}

						{/* Location Selection */}
						{selectedPartId && (
							<div className="space-y-2">
								<Label>Select Location</Label>
								{locations.length === 0 ? (
									<div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
										<AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
										<div>
											<p className="font-medium text-yellow-800">
												No inventory available
											</p>
											<p className="text-sm text-yellow-700">
												This part is not currently stored in any location.
											</p>
										</div>
									</div>
								) : (
									<div className="space-y-2">
										{locations.map((location) => (
											<button
												key={location.compartmentId}
												type="button"
												onClick={() =>
													setSelectedCompartmentId(location.compartmentId)
												}
												className={`w-full p-3 rounded-lg border text-left transition-colors ${
													selectedCompartmentId === location.compartmentId
														? "border-cyan-500 bg-cyan-50"
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

						{/* Quantity */}
						{selectedLocation && (
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
							variant="destructive"
							disabled={
								isSubmitting ||
								!selectedPartId ||
								!selectedCompartmentId ||
								quantity <= 0 ||
								quantity > maxQuantity
							}
						>
							{isSubmitting ? (
								<>
									<Loader2 className="w-4 h-4 mr-2 animate-spin" />
									Checking out...
								</>
							) : (
								<>
									<Minus className="w-4 h-4 mr-2" />
									Check Out
								</>
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
