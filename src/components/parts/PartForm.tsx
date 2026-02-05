import { Loader2, Save, X, ChevronRight, ChevronLeft, Package, MapPin, Hash, FileText, Tag, Boxes, Check, RotateCcw } from "lucide-react";
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
import { LocationPicker2D } from "./LocationPicker2D";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

// ============================================
// Types
// ============================================

type WizardStep = "basic" | "location" | "quantity" | "review";

interface PartWizardData {
  // Step 1: Basic Info
  name: string;
  sku: string;
  category: string;
  description: string;
  unit: string;
  tags: string[];
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

interface PartFormProps {
  part?: Part | null;
  onSubmit: (partId: string) => void;
  onCancel: () => void;
}

const UNITS = [
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
const LOCATION_PICKER_STORAGE_KEY = "inventory-tracker.location-picker";

// ============================================
// Step Indicator Component
// ============================================

interface StepIndicatorProps {
  steps: { id: WizardStep; label: string; icon: React.ReactNode }[];
  currentStep: WizardStep;
}

function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
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
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    index + 1
                  )}
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
// Tag Input Component
// ============================================

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  disabled?: boolean;
}

function TagInput({ tags, onTagsChange, disabled }: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && inputValue.trim()) {
        e.preventDefault();
        const newTag = inputValue.trim().toLowerCase();
        if (!tags.includes(newTag)) {
          onTagsChange([...tags, newTag]);
        }
        setInputValue("");
      } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
        onTagsChange(tags.slice(0, -1));
      }
    },
    [inputValue, tags, onTagsChange],
  );

  const removeTag = useCallback(
    (tagToRemove: string) => {
      onTagsChange(tags.filter((tag) => tag !== tagToRemove));
    },
    [tags, onTagsChange],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 min-h-[32px] p-2 border rounded-md focus-within:ring-2 focus-within:ring-cyan-500 focus-within:border-cyan-500">
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="flex items-center gap-1"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="hover:text-red-500"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </Badge>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "Add tags (press Enter)" : ""}
          disabled={disabled}
          className="flex-1 min-w-[100px] outline-none bg-transparent text-sm"
        />
      </div>
      <p className="text-xs text-gray-500">
        Press Enter to add a tag. Tags help categorize and search for parts.
      </p>
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

function BasicInfoStep({
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
            {errors.sku && (
              <p className="text-sm text-red-500">{errors.sku}</p>
            )}
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
          {errors.unit && (
            <p className="text-sm text-red-500">{errors.unit}</p>
          )}
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label htmlFor="tags" className="flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Tags
          </Label>
          <TagInput
            tags={data.tags}
            onTagsChange={(tags) => onUpdate({ tags })}
          />
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
  orgId: string;
}

function LocationStep({
  data,
  onUpdate,
  onSkip,
  orgId,
}: LocationStepProps) {
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
                <p className="font-medium text-gray-700">Don't know the location yet?</p>
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
              <span className="font-medium">Location assigned successfully</span>
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

function QuantityStep({ data, onUpdate, errors }: QuantityStepProps) {
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
                  <li>• No inventory will be added (part exists without stock)</li>
                )}
                <li>• You can adjust quantities later from the inventory page</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Step 4: Review
// ============================================

interface ReviewStepProps {
  data: PartWizardData;
  onEdit: (step: WizardStep) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitProgress: number;
}

function ReviewStep({
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
        {/* Basic Info Summary */}
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

        {/* Location Summary */}
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

        {/* Quantity Summary */}
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
            {data.notes && (
              <p className="text-gray-600 mt-1">{data.notes}</p>
            )}
          </div>
        </div>

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

// ============================================
// Main Form Component
// ============================================

export function PartForm({ part, onSubmit, onCancel }: PartFormProps) {
  const { toast } = useToast();
  const { authContext, getFreshAuthContext } = useAuth();
  const isEditing = !!part;

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>(
    isEditing ? "review" : "basic",
  );
  const [wizardData, setWizardData] = useState<PartWizardData>({
    name: part?.name ?? "",
    sku: part?.sku ?? "",
    category: part?.category ?? "",
    description: part?.description ?? "",
    unit: part?.unit ?? "pcs",
    tags: part?.tags ?? [],
    imageId: part?.imageId,
    location: undefined,
    initialQuantity: 0,
    notes: "",
  });

  // Form state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);

  // Fetch existing categories for autocomplete
  const partsResult = useQuery(
    api.parts.queries.list,
    authContext ? { authContext } : undefined,
    { enabled: !!authContext },
  );
  const existingCategories: string[] = Array.from(
    new Set((partsResult ?? []).map((p) => p.category)),
  ).sort();

  // Fetch org ID for location picker
  const userResult = useQuery(
    api.users.queries.getCurrentUser,
    authContext ? { authContext } : undefined,
    { enabled: !!authContext },
  );
  const orgId = userResult?.orgId;

  // Mutations
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
          tags: wizardData.tags,
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
          tags: wizardData.tags,
        });
        setSubmitProgress(70);

        // Check in inventory if location and quantity provided
        if (
          wizardData.location &&
          wizardData.initialQuantity > 0
        ) {
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
        error instanceof Error
          ? error.message
          : "An unexpected error occurred",
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
            <CardDescription>
              Update the part details below
            </CardDescription>
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
                  onChange={(e) => updateWizardData({ category: e.target.value })}
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

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="edit-tags" className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Tags
              </Label>
              <TagInput
                tags={wizardData.tags}
                onTagsChange={(tags) => updateWizardData({ tags })}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="edit-description" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Description
              </Label>
              <Textarea
                id="edit-description"
                value={wizardData.description}
                onChange={(e) => updateWizardData({ description: e.target.value })}
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

      {currentStep === "location" && orgId && (
        <LocationStep
          data={wizardData}
          onUpdate={updateWizardData}
          onSkip={handleSkipLocation}
          orgId={orgId}
        />
      )}

      {currentStep === "location" && !orgId && (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-cyan-600" />
            <p className="mt-4 text-gray-600">Loading organization...</p>
          </CardContent>
        </Card>
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
