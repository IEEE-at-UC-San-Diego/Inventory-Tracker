import {
	Boxes,
	Check,
	ChevronRight,
	FileText,
	Hash,
	MapPin,
	Package,
	RotateCcw,
} from "lucide-react";
import { useCallback } from "react";
import { Button } from "../ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import { PartImageUpload } from "./PartImage";
import { LocationPicker2D } from "./LocationPicker2D";
// ============================================
// Types
// ============================================

export type WizardStep = "basic" | "location" | "quantity" | "review";

export interface PartWizardData {
	// Step 1: Basic Info
	name: string;
	sku: string;
	category: string;
	description: string;
	unit: string;
	imageId?: string;

	// Step 2: Location
	location?: {
		blueprintId: string;
		drawerId: string;
		compartmentId: string;
	};

	// Step 3: Initial Quantity
	initialQuantity: number;
	notes?: string;
}

export const UNITS = [
	{ value: "pcs", label: "Pieces (pcs)" },
	{ value: "m", label: "Meters (m)" },
	{ value: "ft", label: "Feet (ft)" },
	{ value: "kg", label: "Kilograms (kg)" },
	{ value: "g", label: "Grams (g)" },
	{ value: "lbs", label: "Pounds (lbs)" },
	{ value: "L", label: "Liters (L)" },
	{ value: "mL", label: "Milliliters (mL)" },
	{ value: "sets", label: "Sets" },
	{ value: "rolls", label: "Rolls" },
	{ value: "boxes", label: "Boxes" },
	{ value: "sheets", label: "Sheets" },
	{ value: "meters", label: "Meters (linear)" },
	{ value: "yards", label: "Yards" },
	{ value: "inches", label: "Inches" },
];
export const LOCATION_PICKER_STORAGE_KEY = "inventory-tracker.location-picker";

// ============================================
// Step Indicator Component
// ============================================

interface StepIndicatorProps {
	steps: { id: WizardStep; label: string; icon: React.ReactNode }[];
	currentStep: WizardStep;
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
	const currentIndex = steps.findIndex((s) => s.id === currentStep);

	return (
		<div className="flex items-center justify-center mb-8">
			<div className="flex items-center space-x-2">
				{steps.map((step, index) => {
					const isCompleted = index < currentIndex;
					const isCurrent = index === currentIndex;

					return (
						<div key={step.id} className="flex items-center">
							<div
								className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
									isCompleted
										? "bg-green-100 text-green-700"
										: isCurrent
											? "bg-cyan-100 text-cyan-700 ring-2 ring-cyan-500"
											: "bg-gray-100 text-gray-500"
								}`}
							>
								<span className="flex items-center justify-center w-6 h-6 rounded-full text-sm font-medium bg-white/50">
									{isCompleted ? <Check className="w-4 h-4" /> : index + 1}
								</span>
								<span className="text-sm font-medium hidden sm:inline">
									{step.label}
								</span>
							</div>
							{index < steps.length - 1 && (
								<ChevronRight className="w-4 h-4 text-gray-400 mx-2" />
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ============================================
// Step 1: Basic Info
// ============================================

interface BasicInfoStepProps {
	data: PartWizardData;
	onUpdate: (updates: Partial<PartWizardData>) => void;
	existingCategories: string[];
	errors: Record<string, string>;
	imageFile: File | null;
	imagePreview: string | null;
	onImageSelect: (file: File) => void;
	onClearImage: () => void;
}

export function BasicInfoStep({
	data,
	onUpdate,
	existingCategories,
	errors,
	imagePreview,
	onImageSelect,
	onClearImage,
}: BasicInfoStepProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Package className="w-5 h-5 text-cyan-600" />
					Basic Information
				</CardTitle>
				<CardDescription>
					Enter the essential details about this part
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Name and SKU */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label htmlFor="name">
							Part Name <span className="text-red-500">*</span>
						</Label>
						<Input
							id="name"
							value={data.name}
							onChange={(e) => onUpdate({ name: e.target.value })}
							placeholder="e.g., Resistor 10kΩ"
							className={errors.name ? "border-red-500" : ""}
						/>
						{errors.name && (
							<p className="text-sm text-red-500">{errors.name}</p>
						)}
					</div>
					<div className="space-y-2">
						<Label htmlFor="sku">
							SKU <span className="text-red-500">*</span>
						</Label>
						<Input
							id="sku"
							value={data.sku}
							onChange={(e) => onUpdate({ sku: e.target.value })}
							placeholder="e.g., RES-10K-001"
							className={errors.sku ? "border-red-500" : ""}
						/>
						{errors.sku && <p className="text-sm text-red-500">{errors.sku}</p>}
					</div>
				</div>

				{/* Category */}
				<div className="space-y-2">
					<Label htmlFor="category">
						Category <span className="text-red-500">*</span>
					</Label>
					<div className="relative">
						<Input
							id="category"
							list="categories"
							value={data.category}
							onChange={(e) => onUpdate({ category: e.target.value })}
							placeholder="e.g., Electronics, Mechanical, Fasteners"
							className={errors.category ? "border-red-500" : ""}
						/>
						<datalist id="categories">
							{existingCategories.map((cat) => (
								<option key={cat} value={cat} />
							))}
						</datalist>
					</div>
					{errors.category && (
						<p className="text-sm text-red-500">{errors.category}</p>
					)}
					<p className="text-xs text-gray-500">
						Categories help organize your parts. Use existing categories or
						create new ones.
					</p>
				</div>

				{/* Unit */}
				<div className="space-y-2">
					<Label htmlFor="unit">
						Unit of Measurement <span className="text-red-500">*</span>
					</Label>
					<Select
						value={data.unit}
						onValueChange={(value) => onUpdate({ unit: value })}
					>
						<SelectTrigger className={errors.unit ? "border-red-500" : ""}>
							<SelectValue placeholder="Select a unit" />
						</SelectTrigger>
						<SelectContent>
							{UNITS.map((unit) => (
								<SelectItem key={unit.value} value={unit.value}>
									{unit.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{errors.unit && <p className="text-sm text-red-500">{errors.unit}</p>}
				</div>

				{/* Description */}
				<div className="space-y-2">
					<Label htmlFor="description" className="flex items-center gap-2">
						<FileText className="w-4 h-4" />
						Description
					</Label>
					<Textarea
						id="description"
						value={data.description}
						onChange={(e) => onUpdate({ description: e.target.value })}
						placeholder="Optional description of the part..."
						rows={3}
					/>
				</div>

				{/* Image Upload */}
				<div className="space-y-2">
					<Label className="flex items-center gap-2">
						<RotateCcw className="w-4 h-4" />
						Part Image
					</Label>
					<div className="flex items-center gap-6">
						<PartImageUpload
							onFileSelect={onImageSelect}
							previewUrl={imagePreview}
							onClearPreview={onClearImage}
						/>
						<div className="flex-1">
							<p className="text-sm text-gray-600">
								Recommended: Square image, at least 200x200 pixels.
							</p>
							<p className="text-sm text-gray-500 mt-1">
								Max file size: 5MB. Supported formats: JPG, PNG, GIF.
							</p>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

// ============================================
// Step 2: Location Assignment
// ============================================

interface LocationStepProps {
	data: PartWizardData;
	onUpdate: (updates: Partial<PartWizardData>) => void;
	onSkip: () => void;
	orgId?: string;
}

export function LocationStep({ data, onUpdate, onSkip, orgId }: LocationStepProps) {
	const handleLocationChange = useCallback(
		(location: {
			blueprintId?: string;
			drawerId?: string;
			compartmentId?: string;
		}) => {
			if (location.compartmentId) {
				onUpdate({
					location: {
						blueprintId: location.blueprintId!,
						drawerId: location.drawerId!,
						compartmentId: location.compartmentId,
					},
				});
			} else {
				onUpdate({ location: undefined });
			}
		},
		[onUpdate],
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<MapPin className="w-5 h-5 text-cyan-600" />
					Location Assignment
				</CardTitle>
				<CardDescription>
					Optionally assign this part to a storage location
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Skip Button - Prominent */}
				{!data.location && (
					<div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">
						<div className="flex items-center gap-3">
							<div className="p-2 bg-white rounded-full">
								<MapPin className="w-5 h-5 text-gray-400" />
							</div>
							<div>
								<p className="font-medium text-gray-700">
									Don't know the location yet?
								</p>
								<p className="text-sm text-gray-500">
									You can skip this step and assign a location later
								</p>
							</div>
						</div>
						<Button type="button" variant="outline" onClick={onSkip}>
							Skip Location Assignment
						</Button>
					</div>
				)}

				{/* Location Picker */}
				<LocationPicker2D
					orgId={orgId}
					selectedLocation={{
						blueprintId: data.location?.blueprintId,
						drawerId: data.location?.drawerId,
						compartmentId: data.location?.compartmentId,
					}}
					onLocationChange={handleLocationChange}
					allowSkip={false}
				/>

				{/* Location Summary */}
				{data.location && (
					<div className="p-4 bg-green-50 border border-green-200 rounded-lg">
						<div className="flex items-center gap-2 text-green-800">
							<Check className="w-5 h-5" />
							<span className="font-medium">
								Location assigned successfully
							</span>
						</div>
						<p className="text-sm text-green-700 mt-1">
							This part will be stored in the selected compartment
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// ============================================
// Step 3: Initial Quantity
// ============================================

interface QuantityStepProps {
	data: PartWizardData;
	onUpdate: (updates: Partial<PartWizardData>) => void;
	errors: Record<string, string>;
}

export function QuantityStep({ data, onUpdate, errors }: QuantityStepProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Hash className="w-5 h-5 text-cyan-600" />
					Initial Quantity
				</CardTitle>
				<CardDescription>
					Set the starting quantity for this part
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Location Summary */}
				{data.location && (
					<div className="p-4 bg-cyan-50 border border-cyan-200 rounded-lg">
						<div className="flex items-center gap-2 text-cyan-800">
							<MapPin className="w-4 h-4" />
							<span className="font-medium">Storage Location Assigned</span>
						</div>
						<p className="text-sm text-cyan-700 mt-1">
							The initial quantity will be added to the selected compartment
						</p>
					</div>
				)}

				{/* Quantity Input */}
				<div className="space-y-2">
					<Label htmlFor="initialQuantity">
						Initial Quantity <span className="text-red-500">*</span>
					</Label>
					<div className="flex items-center gap-4">
						<Input
							id="initialQuantity"
							type="number"
							min={0}
							value={data.initialQuantity}
							onChange={(e) =>
								onUpdate({ initialQuantity: parseInt(e.target.value) || 0 })
							}
							placeholder="0"
							className={`max-w-[200px] ${errors.initialQuantity ? "border-red-500" : ""}`}
						/>
						<span className="text-gray-600 font-medium">{data.unit}</span>
					</div>
					{errors.initialQuantity && (
						<p className="text-sm text-red-500">{errors.initialQuantity}</p>
					)}
					<p className="text-xs text-gray-500">
						Enter the number of {data.unit} you have in stock. You can set this
						to 0 if you're adding the part without inventory.
					</p>
				</div>

				{/* Notes */}
				<div className="space-y-2">
					<Label htmlFor="notes" className="flex items-center gap-2">
						<FileText className="w-4 h-4" />
						Notes (Optional)
					</Label>
					<Textarea
						id="notes"
						value={data.notes || ""}
						onChange={(e) => onUpdate({ notes: e.target.value })}
						placeholder="Add any notes about this initial quantity (e.g., received from supplier, initial stock count, etc.)"
						rows={3}
					/>
				</div>

				{/* Info Box */}
				<div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
					<div className="flex items-start gap-3">
						<Boxes className="w-5 h-5 text-blue-600 mt-0.5" />
						<div>
							<p className="font-medium text-blue-800">What happens next?</p>
							<ul className="text-sm text-blue-700 mt-1 space-y-1">
								<li>• The part will be created with the basic information</li>
								{data.location ? (
									<li>
										• {data.initialQuantity} {data.unit} will be checked into
										the selected location
									</li>
								) : (
									<li>
										• No inventory will be added (part exists without stock)
									</li>
								)}
								<li>
									• You can adjust quantities later from the inventory page
								</li>
							</ul>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
