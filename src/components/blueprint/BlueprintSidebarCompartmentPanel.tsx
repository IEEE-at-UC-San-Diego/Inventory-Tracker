import { Link } from "@tanstack/react-router";
import { Grid3X3, Minus, Package, Plus, Trash2 } from "lucide-react";
import type { SetStateAction } from "react";
import { MemberOnly } from "@/components/auth/ProtectedRoute";
import { CheckInDialog } from "@/components/inventory/CheckInDialog";
import { CheckOutDialog } from "@/components/inventory/CheckOutDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Compartment, DrawerWithCompartments } from "@/types";

interface CompartmentDetailsPanelProps {
	compartment: Compartment;
	drawers: DrawerWithCompartments[];
	selectedCompartmentDrawerId: string | null;
	compartmentLabelId: string;
	isLockedByMe: boolean;
	compartmentInventory: Array<{
		_id: string;
		partId: string;
		quantity: number;
		part?: { name?: string; sku?: string };
	}>;
	totalInCompartment: number;
	showCheckIn: boolean;
	showCheckOut: boolean;
	selectedCompartmentId: string | null;
	onUpdateCompartment: (
		compartmentId: string,
		updates: Partial<Compartment>,
	) => void;
	onDeleteCompartment: (compartmentId: string) => void;
	onCheckIn: (compartmentId: string) => void;
	onCheckOut: (compartmentId: string) => void;
	onSetShowCheckIn: React.Dispatch<SetStateAction<boolean>>;
	onSetShowCheckOut: React.Dispatch<SetStateAction<boolean>>;
}

export function CompartmentDetailsPanel({
	compartment,
	drawers,
	selectedCompartmentDrawerId,
	compartmentLabelId,
	isLockedByMe,
	compartmentInventory,
	totalInCompartment,
	showCheckIn,
	showCheckOut,
	selectedCompartmentId,
	onUpdateCompartment,
	onDeleteCompartment,
	onCheckIn,
	onCheckOut,
	onSetShowCheckIn,
	onSetShowCheckOut,
}: CompartmentDetailsPanelProps) {
	const compartmentDisplayLabel =
		compartment.label || `Compartment ${compartment._id.slice(-4)}`;
	const parentDrawer = selectedCompartmentDrawerId
		? drawers.find((d) => d._id === selectedCompartmentDrawerId)
		: undefined;

	return (
		<div className="space-y-4">
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
							In drawer: {parentDrawer.label || `Drawer ${parentDrawer._id.slice(-4)}`}
						</div>
					)}

					<div className="space-y-1.5">
						<Label htmlFor={compartmentLabelId} className="text-xs text-gray-500">
							Label
						</Label>
						<Input
							id={compartmentLabelId}
							value={compartment.label || ""}
							onChange={(e) =>
								onUpdateCompartment(compartment._id, { label: e.target.value })
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
									onClick={() => onCheckOut(compartment._id)}
									disabled={totalInCompartment <= 0}
									title="Check Out"
								>
									<Minus className="w-4 h-4" />
								</Button>
								<Button
									size="sm"
									className="h-8"
									onClick={() => onCheckIn(compartment._id)}
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
									onClick={() => onCheckIn(compartment._id)}
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
											<p className="text-xs text-gray-500">{item.part?.sku}</p>
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
												onClick={() => onCheckOut(compartment._id)}
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

			<CheckInDialog
				open={showCheckIn}
				onOpenChange={onSetShowCheckIn}
				preselectedCompartmentId={selectedCompartmentId}
				onSuccess={() => {
					// Refetch will happen automatically
				}}
			/>

			<CheckOutDialog
				open={showCheckOut}
				onOpenChange={onSetShowCheckOut}
				preselectedPartId={selectedCompartmentId ?? undefined}
				onSuccess={() => {
					// Refetch will happen automatically
				}}
			/>
		</div>
	);
}
