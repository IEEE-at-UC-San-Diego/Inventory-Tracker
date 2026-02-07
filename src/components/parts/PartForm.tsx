import {
	Loader2,
	Save,
	X,
	ChevronRight,
	ChevronLeft,
	Package,
	MapPin,
	Hash,
	FileText,
	Check,
	RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQuery } from "@/integrations/convex/react-query";
import type { Part } from "@/types";
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
import { Textarea } from "../ui/textarea";
import { useToast } from "../ui/toast";
import { PartImageUpload } from "./PartImage";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import {
	BasicInfoStep,
	LOCATION_PICKER_STORAGE_KEY,
	LocationStep,
	type PartWizardData,
	QuantityStep,
	StepIndicator,
	UNITS,
	type WizardStep,
} from "./part-form-steps";
import { ReviewStep } from "./part-form-review-step";

interface PartFormProps {
	part?: Part | null;
	onSubmit: (partId: string) => void;
	onCancel: () => void;
}
export function PartForm({ part, onSubmit, onCancel }: PartFormProps) {
	const { toast } = useToast();
	const { authContext, getFreshAuthContext } = useAuth();
	const isEditing = !!part;

	const [currentStep, setCurrentStep] = useState<WizardStep>(
		isEditing ? "review" : "basic",
	);
	const [wizardData, setWizardData] = useState<PartWizardData>({
		name: part?.name ?? "",
		sku: part?.sku ?? "",
		category: part?.category ?? "",
		description: part?.description ?? "",
		unit: part?.unit ?? "pcs",
		imageId: part?.imageId,
		location: undefined,
		initialQuantity: 0,
		notes: "",
	});

	const [errors, setErrors] = useState<Record<string, string>>({});
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitProgress, setSubmitProgress] = useState(0);

	const partsResult = useQuery(
		api.parts.queries.list,
		authContext ? { authContext } : undefined,
		{ enabled: !!authContext },
	);
	const existingCategories: string[] = Array.from(
		new Set((partsResult ?? []).map((p) => p.category)),
	).sort();

	const createPart = useMutation(api.parts.mutations.create);
	const updatePart = useMutation(api.parts.mutations.update);
	const checkInInventory = useMutation(api.inventory.mutations.checkIn);
	const generateUploadUrl = useMutation(api.storage.generateUploadUrl);

	// Update wizard data helper
	const updateWizardData = useCallback((updates: Partial<PartWizardData>) => {
		setWizardData((prev) => ({ ...prev, ...updates }));
		// Clear errors for updated fields
		setErrors((prev) => {
			const newErrors = { ...prev };
			for (const key of Object.keys(updates)) {
				delete newErrors[key];
			}
			return newErrors;
		});
	}, []);

	useEffect(() => {
		if (isEditing || typeof window === "undefined") return;
		const stored = sessionStorage.getItem(LOCATION_PICKER_STORAGE_KEY);
		if (!stored) return;
		try {
			const parsed = JSON.parse(stored) as {
				blueprintId?: string;
				drawerId?: string;
				compartmentId?: string;
				quantity?: number;
			};
			sessionStorage.removeItem(LOCATION_PICKER_STORAGE_KEY);
			if (parsed.blueprintId && parsed.drawerId && parsed.compartmentId) {
				updateWizardData({
					location: {
						blueprintId: parsed.blueprintId,
						drawerId: parsed.drawerId,
						compartmentId: parsed.compartmentId,
					},
					initialQuantity: parsed.quantity ?? 0,
				});
				setCurrentStep("quantity");
			}
		} catch {
			// Ignore storage errors or malformed data
		}
	}, [isEditing, updateWizardData]);

	// Handle image file selection
	const handleImageSelect = useCallback(
		(file: File) => {
			if (!file.type.startsWith("image/")) {
				toast.error("Invalid file type", "Please select an image file");
				return;
			}
			if (file.size > 5 * 1024 * 1024) {
				toast.error("File too large", "Maximum file size is 5MB");
				return;
			}

			setImageFile(file);
			const reader = new FileReader();
			reader.onloadend = () => {
				setImagePreview(reader.result as string);
			};
			reader.readAsDataURL(file);
		},
		[toast],
	);

	const clearImagePreview = useCallback(() => {
		setImageFile(null);
		setImagePreview(null);
	}, []);

	// Validation
	const validateStep = useCallback(
		(step: WizardStep): boolean => {
			const newErrors: Record<string, string> = {};

			if (step === "basic") {
				if (!wizardData.name.trim()) {
					newErrors.name = "Name is required";
				}
				if (!wizardData.sku.trim()) {
					newErrors.sku = "SKU is required";
				} else if (!/^[a-zA-Z0-9-_]+$/.test(wizardData.sku)) {
					newErrors.sku =
						"SKU can only contain letters, numbers, hyphens, and underscores";
				}
				if (!wizardData.category.trim()) {
					newErrors.category = "Category is required";
				}
				if (!wizardData.unit) {
					newErrors.unit = "Unit is required";
				}
			}

			if (step === "quantity") {
				if (
					wizardData.initialQuantity === undefined ||
					wizardData.initialQuantity < 0
				) {
					newErrors.initialQuantity = "Quantity must be 0 or greater";
				}
			}

			setErrors(newErrors);
			return Object.keys(newErrors).length === 0;
		},
		[wizardData],
	);

	// Navigation handlers
	const handleNext = useCallback(() => {
		if (!validateStep(currentStep)) {
			toast.error("Please fix the errors before continuing");
			return;
		}

		const stepOrder: WizardStep[] = ["basic", "location", "quantity", "review"];
		const currentIndex = stepOrder.indexOf(currentStep);
		if (currentIndex < stepOrder.length - 1) {
			setCurrentStep(stepOrder[currentIndex + 1]);
		}
	}, [currentStep, validateStep, toast]);

	const handleBack = useCallback(() => {
		const stepOrder: WizardStep[] = ["basic", "location", "quantity", "review"];
		const currentIndex = stepOrder.indexOf(currentStep);
		if (currentIndex > 0) {
			setCurrentStep(stepOrder[currentIndex - 1]);
		}
	}, [currentStep]);

	const handleSkipLocation = useCallback(() => {
		updateWizardData({ location: undefined });
		setCurrentStep("quantity");
	}, [updateWizardData]);

	const handleEditStep = useCallback((step: WizardStep) => {
		setCurrentStep(step);
	}, []);

	// Submit handler
	const handleSubmit = useCallback(async () => {
		if (!validateStep("basic")) {
			setCurrentStep("basic");
			toast.error("Please fix the errors in the basic information");
			return;
		}

		setIsSubmitting(true);
		setSubmitProgress(0);

		try {
			let imageId: string | undefined = wizardData.imageId;

			// Upload image if selected
			if (imageFile) {
				const context = (await getFreshAuthContext()) || authContext;
				if (!context) {
					throw new Error("Not authenticated");
				}
				setSubmitProgress(10);
				const uploadUrl = await generateUploadUrl({ authContext: context });
				setSubmitProgress(30);

				const response = await fetch(uploadUrl, {
					method: "POST",
					headers: { "Content-Type": imageFile.type },
					body: imageFile,
				});

				if (!response.ok) {
					throw new Error("Failed to upload image");
				}

				const result = await response.json();
				imageId = result.storageId;
				setSubmitProgress(50);
			}

			const context = (await getFreshAuthContext()) || authContext;
			if (!context) {
				throw new Error("Not authenticated");
			}

			if (isEditing && part) {
				// Update existing part
				await updatePart({
					authContext: context,
					partId: part._id as Id<"parts">,
					name: wizardData.name,
					sku: wizardData.sku,
					category: wizardData.category,
					description: wizardData.description || undefined,
					imageId: imageId as Id<"_storage"> | undefined,
					unit: wizardData.unit,
				});
				setSubmitProgress(100);
				toast.success("Part updated successfully");
				onSubmit(part._id);
			} else {
				// Create new part
				const partId = await createPart({
					authContext: context,
					name: wizardData.name,
					sku: wizardData.sku,
					category: wizardData.category,
					description: wizardData.description || undefined,
					imageId: imageId as Id<"_storage"> | undefined,
					unit: wizardData.unit,
				});
				setSubmitProgress(70);

				// Check in inventory if location and quantity provided
				if (wizardData.location && wizardData.initialQuantity > 0) {
					await checkInInventory({
						authContext: context,
						partId: partId as Id<"parts">,
						compartmentId: wizardData.location
							.compartmentId as Id<"compartments">,
						quantity: wizardData.initialQuantity,
						notes: wizardData.notes,
					});
					setSubmitProgress(90);
				}

				setSubmitProgress(100);
				toast.success("Part created successfully");
				onSubmit(partId);
			}
		} catch (error) {
			toast.error(
				isEditing ? "Failed to update part" : "Failed to create part",
				error instanceof Error ? error.message : "An unexpected error occurred",
			);
			setIsSubmitting(false);
		}
	}, [
		wizardData,
		imageFile,
		isEditing,
		part,
		createPart,
		updatePart,
		checkInInventory,
		generateUploadUrl,
		authContext,
		getFreshAuthContext,
		onSubmit,
		toast,
		validateStep,
	]);

	// Wizard steps configuration
	const steps: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
		{ id: "basic", label: "Basic Info", icon: <Package className="w-4 h-4" /> },
		{ id: "location", label: "Location", icon: <MapPin className="w-4 h-4" /> },
		{ id: "quantity", label: "Quantity", icon: <Hash className="w-4 h-4" /> },
		{ id: "review", label: "Review", icon: <Check className="w-4 h-4" /> },
	];

	// For editing, show a simple form with all fields editable at once
	if (isEditing) {
		return (
			<form
				onSubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
				className="space-y-6"
			>
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Package className="w-5 h-5 text-cyan-600" />
							Edit Part
						</CardTitle>
						<CardDescription>Update the part details below</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						{/* Name and SKU */}
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="edit-name">
									Part Name <span className="text-red-500">*</span>
								</Label>
								<Input
									id="edit-name"
									value={wizardData.name}
									onChange={(e) => updateWizardData({ name: e.target.value })}
									placeholder="e.g., Resistor 10kΩ"
									className={errors.name ? "border-red-500" : ""}
								/>
								{errors.name && (
									<p className="text-sm text-red-500">{errors.name}</p>
								)}
							</div>
							<div className="space-y-2">
								<Label htmlFor="edit-sku">
									SKU <span className="text-red-500">*</span>
								</Label>
								<Input
									id="edit-sku"
									value={wizardData.sku}
									onChange={(e) => updateWizardData({ sku: e.target.value })}
									placeholder="e.g., RES-10K-001"
									className={errors.sku ? "border-red-500" : ""}
								/>
								{errors.sku && (
									<p className="text-sm text-red-500">{errors.sku}</p>
								)}
							</div>
						</div>

						{/* Category */}
						<div className="space-y-2">
							<Label htmlFor="edit-category">
								Category <span className="text-red-500">*</span>
							</Label>
							<div className="relative">
								<Input
									id="edit-category"
									list="edit-categories"
									value={wizardData.category}
									onChange={(e) =>
										updateWizardData({ category: e.target.value })
									}
									placeholder="e.g., Electronics, Mechanical, Fasteners"
									className={errors.category ? "border-red-500" : ""}
								/>
								<datalist id="edit-categories">
									{existingCategories.map((cat: string) => (
										<option key={cat} value={cat} />
									))}
								</datalist>
							</div>
							{errors.category && (
								<p className="text-sm text-red-500">{errors.category}</p>
							)}
						</div>

						{/* Unit */}
						<div className="space-y-2">
							<Label htmlFor="edit-unit">
								Unit of Measurement <span className="text-red-500">*</span>
							</Label>
							<Select
								value={wizardData.unit}
								onValueChange={(value) => updateWizardData({ unit: value })}
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
							{errors.unit && (
								<p className="text-sm text-red-500">{errors.unit}</p>
							)}
						</div>

						{/* Description */}
						<div className="space-y-2">
							<Label
								htmlFor="edit-description"
								className="flex items-center gap-2"
							>
								<FileText className="w-4 h-4" />
								Description
							</Label>
							<Textarea
								id="edit-description"
								value={wizardData.description}
								onChange={(e) =>
									updateWizardData({ description: e.target.value })
								}
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
									onFileSelect={handleImageSelect}
									previewUrl={imagePreview}
									onClearPreview={clearImagePreview}
									existingImageId={part?.imageId}
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

				{/* Submit Progress */}
				{isSubmitting && submitProgress > 0 && (
					<div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
						<div className="flex items-center gap-3">
							<Loader2 className="w-5 h-5 animate-spin text-blue-600" />
							<div className="flex-1">
								<p className="font-medium text-blue-800">
									{submitProgress < 30
										? "Uploading image..."
										: submitProgress < 60
											? "Updating part..."
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

				{/* Actions */}
				<div className="flex items-center justify-end gap-4">
					<Button
						type="button"
						variant="outline"
						onClick={onCancel}
						disabled={isSubmitting}
					>
						<X className="w-4 h-4 mr-2" />
						Cancel
					</Button>
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? (
							<>
								<Loader2 className="w-4 h-4 mr-2 animate-spin" />
								Saving...
							</>
						) : (
							<>
								<Save className="w-4 h-4 mr-2" />
								Update Part
							</>
						)}
					</Button>
				</div>
			</form>
		);
	}

	// Create mode: show wizard
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if (currentStep === "review") {
					handleSubmit();
				}
			}}
			className="space-y-6"
		>
			<StepIndicator steps={steps} currentStep={currentStep} />

			{/* Step Content */}
			{currentStep === "basic" && (
				<BasicInfoStep
					data={wizardData}
					onUpdate={updateWizardData}
					existingCategories={existingCategories}
					errors={errors}
					imageFile={imageFile}
					imagePreview={imagePreview}
					onImageSelect={handleImageSelect}
					onClearImage={clearImagePreview}
				/>
			)}

			{currentStep === "location" && (
				<LocationStep
					data={wizardData}
					onUpdate={updateWizardData}
					onSkip={handleSkipLocation}
					orgId={authContext?.orgId}
				/>
			)}

			{currentStep === "quantity" && (
				<QuantityStep
					data={wizardData}
					onUpdate={updateWizardData}
					errors={errors}
				/>
			)}

			{currentStep === "review" && (
				<ReviewStep
					data={wizardData}
					onEdit={handleEditStep}
					onSubmit={handleSubmit}
					isSubmitting={isSubmitting}
					submitProgress={submitProgress}
				/>
			)}

			{/* Navigation Buttons */}
			<div className="flex items-center justify-between">
				<div>
					{currentStep !== "basic" && currentStep !== "review" && (
						<Button
							type="button"
							variant="outline"
							onClick={handleBack}
							disabled={isSubmitting}
						>
							<ChevronLeft className="w-4 h-4 mr-2" />
							Back
						</Button>
					)}
				</div>

				<div className="flex items-center gap-4">
					<Button
						type="button"
						variant="outline"
						onClick={onCancel}
						disabled={isSubmitting}
					>
						<X className="w-4 h-4 mr-2" />
						Cancel
					</Button>

					{currentStep === "review" ? (
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? (
								<>
									<Loader2 className="w-4 h-4 mr-2 animate-spin" />
									Creating...
								</>
							) : (
								<>
									<Save className="w-4 h-4 mr-2" />
									Create Part
								</>
							)}
						</Button>
					) : (
						<Button type="button" onClick={handleNext} disabled={isSubmitting}>
							Next
							<ChevronRight className="w-4 h-4 ml-2" />
						</Button>
					)}
				</div>
			</div>
		</form>
	);
}
