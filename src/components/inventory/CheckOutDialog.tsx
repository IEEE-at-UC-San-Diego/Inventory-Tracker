import { AlertTriangle, Loader2, MapPin, Minus, Package } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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

export function CheckOutDialog({
	open,
	onOpenChange,
	preselectedPartId,
	onSuccess,
}: CheckOutDialogProps) {
	const { authContext, getFreshAuthContext } = useAuth();
	const { toast } = useToast();
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Form state
	const [selectedPartId, setSelectedPartId] = useState<string>(
		preselectedPartId ?? "",
	);
	const [selectedCompartmentId, setSelectedCompartmentId] = useState("");
	const [quantity, setQuantity] = useState(1);
	const [notes, setNotes] = useState("");

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
			.map((item: any) => ({
				inventoryId: item._id,
				compartmentId: item.compartmentId,
				compartmentLabel:
					item.compartment?.label ||
					`Compartment ${item.compartmentId.slice(-4)}`,
				drawerLabel: "", // Would need to fetch drawer info
				blueprintName: "", // Would need to fetch blueprint info
				quantity: item.quantity,
			}));
	}, [availableInventory]);

	// Get selected location
	const selectedLocation = locations.find(
		(l) => l.compartmentId === selectedCompartmentId,
	);
	const maxQuantity = selectedLocation?.quantity ?? 0;

	// Fetch part details
	const partResult = useQuery(
		api.parts.queries.get,
		selectedPartId && authContext
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

				toast.success(
					"Inventory checked out",
					`Removed ${quantity} ${partResult?.name ?? "units"} from inventory`,
				);

				// Reset form
				if (!preselectedPartId) {
					setSelectedPartId("");
				}
				setSelectedCompartmentId("");
				setQuantity(1);
				setNotes("");

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
						{/* Part info (if preselected) */}
						{preselectedPartId && partResult && (
							<div className="p-3 bg-gray-50 rounded-lg">
								<p className="text-sm text-gray-500">Checking out:</p>
								<p className="font-medium">{partResult.name}</p>
								<p className="text-sm text-gray-500">{partResult.sku}</p>
							</div>
						)}

						{/* Location Selection */}
						<div className="space-y-2">
							<Label>Select Location</Label>
							{locations.length === 0 ? (
								<div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
									<AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
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
												<div className="flex items-center gap-2">
													<MapPin className="w-4 h-4 text-gray-400" />
													<span className="font-medium">
														{location.compartmentLabel}
													</span>
												</div>
												<div className="flex items-center gap-1 text-sm text-gray-600">
													<Package className="w-4 h-4" />
													{location.quantity} units
												</div>
											</div>
										</button>
									))}
								</div>
							)}
						</div>

						{/* Quantity */}
						{selectedLocation && (
							<div className="space-y-2">
								<Label htmlFor="quantity">Quantity (max: {maxQuantity})</Label>
								<Input
									id="quantity"
									type="number"
									min={1}
									max={maxQuantity}
									value={quantity}
									onChange={(e) => setQuantity(Number(e.target.value))}
									className="w-32"
								/>
								{quantity > maxQuantity && (
									<p className="text-sm text-red-500">
										Cannot exceed available quantity of {maxQuantity}
									</p>
								)}
							</div>
						)}

						{/* Notes */}
						<div className="space-y-2">
							<Label htmlFor="notes">Notes (optional)</Label>
							<Textarea
								id="notes"
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
