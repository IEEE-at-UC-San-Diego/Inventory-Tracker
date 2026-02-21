import {
	Loader2,
	MapPin,
	Package,
	Plus,
	PlusCircle,
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

interface CheckInDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	preselectedPartId?: string | null;
	preselectedCompartmentId?: string | null;
	onSuccess?: () => void;
}

export function CheckInDialog({
	open,
	onOpenChange,
	preselectedPartId,
	preselectedCompartmentId,
	onSuccess,
}: CheckInDialogProps) {
	const { authContext, getFreshAuthContext } = useAuth();
	const { toast } = useToast();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const quantityInputId = useId();
	const notesInputId = useId();

	// Form state
	const [selectedPartId, setSelectedPartId] = useState<string>(
		preselectedPartId ?? "",
	);
	const [selectedCompartmentId, setSelectedCompartmentId] = useState<string>(
		preselectedCompartmentId ?? "",
	);
	const [selectedLocation, setSelectedLocation] = useState<{
		blueprintId?: string;
		drawerId?: string;
		compartmentId?: string;
	}>({});
	const [quantity, setQuantity] = useState(1);
	const [notes, setNotes] = useState("");
	const [partSearchQuery, setPartSearchQuery] = useState("");
	const [showPartSearch, setShowPartSearch] = useState(!preselectedPartId);
	const [isPartSearchFocused, setIsPartSearchFocused] = useState(false);
	const [showNewLocation, setShowNewLocation] = useState(false);

	// Fetch data
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

	// Fetch existing inventory locations for the selected part
	const availableInventory = useQuery(
		api.inventory.queries.getAvailable,
		selectedPartId && authContext
			? { authContext, partId: selectedPartId as Id<"parts"> }
			: undefined,
	);

	const existingLocations = useMemo(() => {
		if (!availableInventory) return [];
		return availableInventory
			.filter((item: any) => item.quantity > 0)
			.map((item: any) => ({
				compartmentId: item.compartmentId as string,
				compartmentLabel:
					item.compartment?.label ||
					`Compartment ${item.compartmentId.slice(-4)}`,
				drawerLabel:
					item.drawer?.label ||
					(item.drawer ? `Drawer ${item.drawer._id.slice(-4)}` : ""),
				blueprintName: item.blueprint?.name || "",
				quantity: item.quantity as number,
			}));
	}, [availableInventory]);

	// Check-in mutation
	const checkIn = useMutation(api.inventory.mutations.checkIn as any);

	// Filter parts based on search
	const filteredParts = parts.filter(
		(part: any) =>
			part.name.toLowerCase().includes(partSearchQuery.toLowerCase()) ||
			part.sku.toLowerCase().includes(partSearchQuery.toLowerCase()),
	);

	// Get selected part details
	const selectedPart = parts.find((p: any) => p._id === selectedPartId);

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

			setIsSubmitting(true);

			try {
				const context =
					(await getFreshAuthContext()) ?? authContext ?? undefined;
				await checkIn({
					authContext: context,
					partId: selectedPartId as Id<"parts">,
					compartmentId: selectedCompartmentId as Id<"compartments">,
					quantity,
					notes: notes || undefined,
				});

				toast.success(
					"Inventory checked in",
					`Added ${quantity} ${selectedPart?.name ?? "units"} to inventory`,
				);

				// Reset form
				if (!preselectedPartId) {
					setSelectedPartId("");
					setShowPartSearch(true);
				}
				if (!preselectedCompartmentId) {
					setSelectedCompartmentId("");
					setSelectedLocation({});
				}
				setQuantity(1);
				setNotes("");
				setPartSearchQuery("");
				setShowNewLocation(false);

				onOpenChange(false);
				onSuccess?.();
			} catch (error) {
				toast.error(
					"Failed to check in inventory",
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
			notes,
			selectedPart,
			checkIn,
			preselectedPartId,
			preselectedCompartmentId,
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
							<Plus className="w-5 h-5 text-green-600" />
							Check In Inventory
						</DialogTitle>
						<DialogDescription>
							Add parts to your inventory at a specific location
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
													filteredParts.map((part) => (
														<button
															key={part._id}
															type="button"
															onClick={() => {
																setSelectedPartId(part._id);
																setShowPartSearch(false);
																setPartSearchQuery("");
																setSelectedCompartmentId("");
																setSelectedLocation({});
																setShowNewLocation(false);
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
												setSelectedLocation({});
												setShowNewLocation(false);
											}}
										>
											Change
										</Button>
									</div>
								)}
							</div>
						)}

						{/* Selected part display (if preselected) */}
						{preselectedPartId && selectedPart && (
							<div className="p-3 bg-gray-50 rounded-lg">
								<p className="text-sm text-gray-500">Checking in:</p>
								<p className="font-medium">{selectedPart.name}</p>
								<p className="text-sm text-gray-500">{selectedPart.sku}</p>
							</div>
						)}

						{/* Location Selection */}
						{!preselectedCompartmentId && selectedPartId && (
							<div className="space-y-2">
								<Label>Select Location</Label>

								{/* Existing locations */}
								{existingLocations.length > 0 && !showNewLocation && (
									<div className="space-y-2">
										<p className="text-sm text-gray-500">
											Existing locations for this part:
										</p>
										{existingLocations.map((location) => (
											<button
												key={location.compartmentId}
												type="button"
												onClick={() => {
													setSelectedCompartmentId(location.compartmentId);
													setShowNewLocation(false);
												}}
												className={`w-full p-3 rounded-lg border text-left transition-colors ${
													selectedCompartmentId === location.compartmentId
														? "border-green-500 bg-green-50"
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
										<button
											type="button"
											onClick={() => {
												setShowNewLocation(true);
												setSelectedCompartmentId("");
												setSelectedLocation({});
											}}
											className="w-full p-3 rounded-lg border border-dashed border-gray-300 text-left transition-colors hover:border-green-400 hover:bg-green-50/50 flex items-center gap-2 text-gray-600"
										>
											<PlusCircle className="w-4 h-4" />
											<span className="font-medium">Add to a new location</span>
										</button>
									</div>
								)}

								{/* New location picker (shown when no existing locations or user clicks "new location") */}
								{(existingLocations.length === 0 || showNewLocation) && (
									<div className="space-y-2">
										{showNewLocation && existingLocations.length > 0 && (
											<div className="flex items-center justify-between">
												<p className="text-sm text-gray-500">
													Pick a new location:
												</p>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => {
														setShowNewLocation(false);
														setSelectedCompartmentId("");
														setSelectedLocation({});
													}}
												>
													Back to existing
												</Button>
											</div>
										)}
										<LocationPicker2D
											orgId={authContext?.orgId}
											selectedLocation={selectedLocation}
											onLocationChange={(location) => {
												setSelectedLocation(location);
												setSelectedCompartmentId(location.compartmentId ?? "");
											}}
											allowSkip={false}
										/>
									</div>
								)}
							</div>
						)}

						{/* Quantity */}
						{selectedCompartmentId && (
							<div className="space-y-2">
								<Label htmlFor={quantityInputId}>Quantity</Label>
								<Input
									id={quantityInputId}
									type="number"
									min={1}
									value={quantity}
									onChange={(e) => setQuantity(Number(e.target.value))}
									className="w-32"
								/>
							</div>
						)}

						{/* Notes */}
						{selectedCompartmentId && (
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
								isSubmitting || !selectedPartId || !selectedCompartmentId
							}
						>
							{isSubmitting ? (
								<>
									<Loader2 className="w-4 h-4 mr-2 animate-spin" />
									Checking in...
								</>
							) : (
								<>
									<Plus className="w-4 h-4 mr-2" />
									Check In
								</>
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
