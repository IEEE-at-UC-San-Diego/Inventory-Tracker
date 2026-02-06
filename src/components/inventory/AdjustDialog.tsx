import { AlertTriangle, Loader2, Package, Settings } from "lucide-react";
import { useCallback, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
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

interface AdjustDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	inventoryId?: string | null;
	preselectedPartId?: string | null;
	preselectedCompartmentId?: string | null;
	onSuccess?: () => void;
}

export function AdjustDialog({
	open,
	onOpenChange,
	inventoryId,
	preselectedPartId,
	preselectedCompartmentId,
	onSuccess,
}: AdjustDialogProps) {
	const { authContext, getFreshAuthContext } = useAuth();
	const { toast } = useToast();
	const { canManage } = useRole();
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Form state
	const [selectedPartId, _setSelectedPartId] = useState<string>(
		preselectedPartId ?? "",
	);
	const [selectedCompartmentId, _setSelectedCompartmentId] = useState<string>(
		preselectedCompartmentId ?? "",
	);
	const [newQuantity, setNewQuantity] = useState(0);
	const [notes, setNotes] = useState("");

	// Fetch available inventory for the part
	const availableInventory = useQuery(
		api.inventory.queries.getAvailable,
		selectedPartId && authContext
			? { authContext, partId: selectedPartId as Id<"parts"> }
			: undefined,
	);

	// Get current inventory item
	const currentInventory = inventoryId
		? availableInventory?.find(
				(item: { _id: string; compartmentId: string }) =>
					item._id === inventoryId,
			)
		: availableInventory?.find(
				(item: { compartmentId: string }) =>
					item.compartmentId === selectedCompartmentId,
			);

	const currentQuantity = currentInventory?.quantity ?? 0;

	// Fetch part details
	const partResult = useQuery(
		api.parts.queries.get,
		selectedPartId && authContext
			? { authContext, partId: selectedPartId as Id<"parts"> }
			: undefined,
	);

	// Adjust mutation (Admin only)
	const adjust = useMutation(api.inventory.mutations.adjust);

	// Handle submit
	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();

			if (!canManage()) {
				toast.error("Only administrators can adjust inventory");
				return;
			}

			if (!selectedPartId) {
				toast.error("Please select a part");
				return;
			}

			if (!selectedCompartmentId && !currentInventory) {
				toast.error("Please select a location");
				return;
			}

			if (!notes.trim()) {
				toast.error("Please provide a reason for the adjustment");
				return;
			}

			setIsSubmitting(true);

			try {
				const compartmentId =
					selectedCompartmentId || currentInventory?.compartmentId;

				if (!compartmentId) {
					throw new Error("No compartment selected");
				}

				const context = (await getFreshAuthContext()) || authContext;
				if (!context) {
					throw new Error("Auth context is required");
				}
				await adjust({
					authContext: context,
					partId: selectedPartId as Id<"parts">,
					compartmentId: compartmentId as Id<"compartments">,
					quantity: newQuantity,
					notes: notes.trim(),
				});

				const delta = newQuantity - currentQuantity;
				toast.success(
					"Inventory adjusted",
					`Changed from ${currentQuantity} to ${newQuantity} (${delta > 0 ? "+" : ""}${delta})`,
				);

				// Reset form
				setNewQuantity(0);
				setNotes("");

				onOpenChange(false);
				onSuccess?.();
			} catch (error) {
				toast.error(
					"Failed to adjust inventory",
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
			currentInventory,
			newQuantity,
			currentQuantity,
			notes,
			canManage,
			adjust,
			onOpenChange,
			onSuccess,
			toast,
			authContext,
			getFreshAuthContext,
		],
	);

	// Pre-fill quantity when dialog opens with existing inventory
	const handleOpenChange = useCallback(
		(open: boolean) => {
			if (!open) {
				onOpenChange(false);
			} else {
				// Pre-fill with current quantity
				if (currentQuantity > 0) {
					setNewQuantity(currentQuantity);
				}
			}
		},
		[onOpenChange, currentQuantity],
	);

	if (!canManage()) {
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="max-w-md">
					<div className="flex flex-col items-center py-6 text-center">
						<AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
						<h3 className="text-lg font-semibold text-gray-900">
							Admin Access Required
						</h3>
						<p className="text-sm text-gray-500 mt-2">
							Only administrators can perform manual inventory adjustments.
						</p>
						<Button className="mt-4" onClick={() => onOpenChange(false)}>
							Close
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-lg">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Settings className="w-5 h-5 text-purple-600" />
							Adjust Inventory
						</DialogTitle>
						<DialogDescription>
							Manually adjust inventory quantity (Admin only)
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-4">
						{/* Warning */}
						<div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
							<AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
							<div>
								<p className="font-medium text-amber-800">Admin Operation</p>
								<p className="text-sm text-amber-700">
									This creates an adjustment transaction. A reason is required
									for audit purposes.
								</p>
							</div>
						</div>

						{/* Part info (if preselected) */}
						{preselectedPartId && partResult && (
							<div className="p-3 bg-gray-50 rounded-lg">
								<p className="text-sm text-gray-500">Adjusting:</p>
								<p className="font-medium">{partResult.name}</p>
								<p className="text-sm text-gray-500">{partResult.sku}</p>
							</div>
						)}

						{/* Current Quantity */}
						{currentInventory && (
							<div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
								<div className="flex items-center gap-3">
									<Package className="w-8 h-8 text-blue-600" />
									<div>
										<p className="text-sm text-blue-600">Current Quantity</p>
										<p className="text-2xl font-bold text-blue-700">
											{currentQuantity}
										</p>
									</div>
								</div>
							</div>
						)}

						{/* New Quantity */}
						<div className="space-y-2">
							<Label htmlFor="newQuantity">New Quantity</Label>
							<Input
								id="newQuantity"
								type="number"
								min={0}
								value={newQuantity}
								onChange={(e) => setNewQuantity(Number(e.target.value))}
								className="w-32"
							/>
							<p className="text-sm text-gray-500">
								Difference:{" "}
								<span
									className={
										newQuantity - currentQuantity >= 0
											? "text-green-600"
											: "text-red-600"
									}
								>
									{newQuantity - currentQuantity >= 0 ? "+" : ""}
									{newQuantity - currentQuantity}
								</span>
							</p>
						</div>

						{/* Reason / Notes */}
						<div className="space-y-2">
							<Label htmlFor="reason">
								Reason <span className="text-red-500">*</span>
							</Label>
							<Textarea
								id="reason"
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								placeholder="Explain why this adjustment is necessary (e.g., 'Physical count correction', 'Damaged items', etc.)"
								rows={3}
								required
							/>
							<p className="text-xs text-gray-500">
								This will be recorded in the transaction log for audit purposes.
							</p>
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
						<Button type="submit" disabled={isSubmitting || !notes.trim()}>
							{isSubmitting ? (
								<>
									<Loader2 className="w-4 h-4 mr-2 animate-spin" />
									Adjusting...
								</>
							) : (
								<>
									<Settings className="w-4 h-4 mr-2" />
									Adjust Inventory
								</>
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
