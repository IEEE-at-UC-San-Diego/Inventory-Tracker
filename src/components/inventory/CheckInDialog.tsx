import { Loader2, Plus, Search } from "lucide-react";
import { useCallback, useState } from "react";
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

	// Form state
	const [selectedPartId, setSelectedPartId] = useState<string>(
		preselectedPartId ?? "",
	);
	const [selectedCompartmentId, setSelectedCompartmentId] = useState<string>(
		preselectedCompartmentId ?? "",
	);
	const [quantity, setQuantity] = useState(1);
	const [notes, setNotes] = useState("");
	const [partSearchQuery, setPartSearchQuery] = useState("");
	const [showPartSearch, setShowPartSearch] = useState(!preselectedPartId);

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
				await (checkIn as any).mutateAsync({
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
				}
				setQuantity(1);
				setNotes("");
				setPartSearchQuery("");

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
			<DialogContent className="max-w-lg">
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
											placeholder="Search parts..."
											value={partSearchQuery}
											onChange={(e) => setPartSearchQuery(e.target.value)}
											className="pl-10"
										/>
										{partSearchQuery && (
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
						{!preselectedCompartmentId && (
							<div className="space-y-2">
								<Label>Select Location</Label>
								<LocationSelector
									authContext={authContext}
									value={selectedCompartmentId}
									onChange={setSelectedCompartmentId}
								/>
							</div>
						)}

						{/* Quantity */}
						<div className="space-y-2">
							<Label htmlFor="quantity">Quantity</Label>
							<Input
								id="quantity"
								type="number"
								min={1}
								value={quantity}
								onChange={(e) => setQuantity(Number(e.target.value))}
								className="w-32"
							/>
						</div>

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

// Location selector component with cascading dropdowns
interface LocationSelectorProps {
	authContext: any;
	value: string;
	onChange: (value: string) => void;
}

function LocationSelector({
	authContext,
	value,
	onChange,
}: LocationSelectorProps) {
	const [selectedBlueprintId, setSelectedBlueprintId] = useState("");
	const [selectedDrawerId, setSelectedDrawerId] = useState("");

	// Fetch blueprints
	const blueprintsResult = useQuery(
		api.blueprints.queries.list as any,
		authContext ? { authContext } : undefined,
	);
	const blueprints = (blueprintsResult as any[]) ?? [];

	// Fetch drawers for selected blueprint
	const drawersResult = useQuery(
		(api as any)["drawers/queries"].listByBlueprint,
		selectedBlueprintId && authContext
			? { authContext, blueprintId: selectedBlueprintId as Id<"blueprints"> }
			: undefined,
	);
	const drawers = (drawersResult as any[]) ?? [];

	// Fetch compartments for selected drawer
	const compartmentsResult = useQuery(
		(api as any).compartments.queries.listByDrawer,
		selectedDrawerId && authContext
			? { authContext, drawerId: selectedDrawerId as Id<"drawers"> }
			: undefined,
	);
	const compartments = (compartmentsResult as any[]) ?? [];

	return (
		<div className="space-y-2">
			{/* Blueprint */}
			<select
				value={selectedBlueprintId}
				onChange={(e) => {
					setSelectedBlueprintId(e.target.value);
					setSelectedDrawerId("");
					onChange("");
				}}
				className="w-full px-3 py-2 border rounded-lg"
			>
				<option value="">Select Blueprint...</option>
				{blueprints.map((bp: any) => (
					<option key={bp._id} value={bp._id}>
						{bp.name}
					</option>
				))}
			</select>

			{/* Drawer */}
			{selectedBlueprintId && (
				<select
					value={selectedDrawerId}
					onChange={(e) => {
						setSelectedDrawerId(e.target.value);
						onChange("");
					}}
					className="w-full px-3 py-2 border rounded-lg"
				>
					<option value="">Select Drawer...</option>
					{drawers.map((drawer: any) => (
						<option key={drawer._id} value={drawer._id}>
							{drawer.label || `Drawer ${drawer._id.slice(-4)}`}
						</option>
					))}
				</select>
			)}

			{/* Compartment */}
			{selectedDrawerId && (
				<select
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="w-full px-3 py-2 border rounded-lg"
				>
					<option value="">Select Compartment...</option>
					{compartments.map((comp: any) => (
						<option key={comp._id} value={comp._id}>
							{comp.label || `Compartment ${comp._id.slice(-4)}`}
						</option>
					))}
				</select>
			)}
		</div>
	);
}
