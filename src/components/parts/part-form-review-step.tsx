import { Check, Hash, Loader2, MapPin, Package } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { UNITS, type PartWizardData, type WizardStep } from "./part-form-steps";

interface ReviewStepProps {
	data: PartWizardData;
	onEdit: (step: WizardStep) => void;
	onSubmit: () => void;
	isSubmitting: boolean;
	submitProgress: number;
}

export function ReviewStep({
	data,
	onEdit,
	isSubmitting,
	submitProgress,
}: ReviewStepProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Check className="w-5 h-5 text-cyan-600" />
					Review and Confirm
				</CardTitle>
				<CardDescription>
					Review all details before creating the part
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="border rounded-lg p-4">
					<div className="flex items-center justify-between mb-3">
						<h4 className="font-medium text-gray-900 flex items-center gap-2">
							<Package className="w-4 h-4 text-cyan-600" />
							Basic Information
						</h4>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => onEdit("basic")}
							disabled={isSubmitting}
						>
							Edit
						</Button>
					</div>
					<dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
						<div>
							<dt className="text-gray-500">Name</dt>
							<dd className="font-medium">{data.name}</dd>
						</div>
						<div>
							<dt className="text-gray-500">SKU</dt>
							<dd className="font-medium">{data.sku}</dd>
						</div>
						<div>
							<dt className="text-gray-500">Category</dt>
							<dd className="font-medium">{data.category}</dd>
						</div>
						<div>
							<dt className="text-gray-500">Unit</dt>
							<dd className="font-medium">
								{UNITS.find((u) => u.value === data.unit)?.label || data.unit}
							</dd>
						</div>
						{data.tags.length > 0 && (
							<div className="sm:col-span-2">
								<dt className="text-gray-500">Tags</dt>
								<dd className="flex flex-wrap gap-1 mt-1">
									{data.tags.map((tag) => (
										<Badge key={tag} variant="secondary">
											{tag}
										</Badge>
									))}
								</dd>
							</div>
						)}
						{data.description && (
							<div className="sm:col-span-2">
								<dt className="text-gray-500">Description</dt>
								<dd className="text-gray-700 mt-1">{data.description}</dd>
							</div>
						)}
					</dl>
				</div>

				<div className="border rounded-lg p-4">
					<div className="flex items-center justify-between mb-3">
						<h4 className="font-medium text-gray-900 flex items-center gap-2">
							<MapPin className="w-4 h-4 text-cyan-600" />
							Location
						</h4>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => onEdit("location")}
							disabled={isSubmitting}
						>
							Edit
						</Button>
					</div>
					{data.location ? (
						<div className="flex items-center gap-2 text-sm">
							<Badge variant="default" className="bg-green-100 text-green-800">
								Assigned
							</Badge>
							<span className="text-gray-600">
								Part will be stored in the selected compartment
							</span>
						</div>
					) : (
						<div className="flex items-center gap-2 text-sm">
							<Badge variant="secondary">Not Assigned</Badge>
							<span className="text-gray-600">
								You can assign a location later
							</span>
						</div>
					)}
				</div>

				<div className="border rounded-lg p-4">
					<div className="flex items-center justify-between mb-3">
						<h4 className="font-medium text-gray-900 flex items-center gap-2">
							<Hash className="w-4 h-4 text-cyan-600" />
							Initial Quantity
						</h4>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => onEdit("quantity")}
							disabled={isSubmitting}
						>
							Edit
						</Button>
					</div>
					<div className="text-sm">
						<p className="font-medium text-lg">
							{data.initialQuantity} {data.unit}
						</p>
						{data.notes && <p className="text-gray-600 mt-1">{data.notes}</p>}
					</div>
				</div>

				{isSubmitting && submitProgress > 0 && (
					<div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
						<div className="flex items-center gap-3">
							<Loader2 className="w-5 h-5 animate-spin text-blue-600" />
							<div className="flex-1">
								<p className="font-medium text-blue-800">
									{submitProgress < 30
										? "Uploading image..."
										: submitProgress < 60
											? "Creating part..."
											: submitProgress < 90
												? "Adding to inventory..."
												: "Finishing up..."}
								</p>
								<div className="w-full h-2 bg-blue-200 rounded-full mt-2 overflow-hidden">
									<div
										className="h-full bg-blue-600 transition-all duration-300"
										style={{ width: `${submitProgress}%` }}
									/>
								</div>
							</div>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
