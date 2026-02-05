import { Loader2, Package, Trash2, X, ZoomIn } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "../ui/dialog";

interface PartImageProps {
	imageId?: string;
	name: string;
	size?: "sm" | "md" | "lg" | "xl";
	className?: string;
	clickable?: boolean;
	onDelete?: () => void;
	uploadProgress?: number;
	isUploading?: boolean;
}

const sizeClasses = {
	sm: "w-12 h-12",
	md: "w-20 h-20",
	lg: "w-32 h-32",
	xl: "w-48 h-48",
};

export function PartImage({
	imageId,
	name,
	size = "md",
	className,
	clickable = true,
	onDelete,
	uploadProgress,
	isUploading,
}: PartImageProps) {
	const [isEnlarged, setIsEnlarged] = useState(false);
	const [imageError, setImageError] = useState(false);

	const handleImageError = useCallback(() => {
		setImageError(true);
	}, []);

	const handleClick = useCallback(() => {
		if (clickable && imageId && !imageError) {
			setIsEnlarged(true);
		}
	}, [clickable, imageId, imageError]);

	const imageUrl = imageId ? `/api/storage/${imageId}` : undefined;

	// Placeholder when no image or error
	if (!imageUrl || imageError) {
		return (
			<div
				className={cn(
					"relative flex items-center justify-center bg-gray-100 rounded-lg border-2 border-dashed border-gray-300",
					sizeClasses[size],
					className,
				)}
			>
				<Package
					className="text-gray-400"
					style={{
						width: size === "sm" ? 20 : size === "md" ? 28 : 40,
						height: size === "sm" ? 20 : size === "md" ? 28 : 40,
					}}
				/>
				{isUploading && (
					<div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg">
						<Loader2 className="w-5 h-5 animate-spin text-cyan-600" />
					</div>
				)}
			</div>
		);
	}

	return (
		<>
			<div className={cn("relative group", sizeClasses[size], className)}>
				<img
					src={imageUrl}
					alt={name}
					className={cn(
						"w-full h-full object-cover rounded-lg border border-gray-200",
						clickable && "cursor-pointer hover:opacity-90 transition-opacity",
					)}
					onClick={handleClick}
					onError={handleImageError}
				/>

				{/* Hover overlay with actions */}
				{clickable && (
					<div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
						<button
							onClick={(e) => {
								e.stopPropagation();
								setIsEnlarged(true);
							}}
							className="p-2 bg-white rounded-full hover:bg-gray-100 transition-colors"
						>
							<ZoomIn className="w-4 h-4 text-gray-700" />
						</button>
						{onDelete && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									onDelete();
								}}
								className="p-2 bg-red-500 rounded-full hover:bg-red-600 transition-colors"
							>
								<Trash2 className="w-4 h-4 text-white" />
							</button>
						)}
					</div>
				)}

				{/* Upload progress overlay */}
				{isUploading && uploadProgress !== undefined && (
					<div className="absolute inset-0 bg-black/50 rounded-lg flex flex-col items-center justify-center">
						<Loader2 className="w-6 h-6 animate-spin text-white mb-2" />
						<span className="text-xs text-white font-medium">
							{uploadProgress}%
						</span>
						<div className="absolute bottom-2 left-2 right-2 h-1 bg-gray-600 rounded-full overflow-hidden">
							<div
								className="h-full bg-cyan-500 transition-all duration-300"
								style={{ width: `${uploadProgress}%` }}
							/>
						</div>
					</div>
				)}
			</div>

			{/* Enlarged image modal */}
			<Dialog open={isEnlarged} onOpenChange={setIsEnlarged}>
				<DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/95 border-none">
					<div className="relative flex items-center justify-center min-h-[300px] max-h-[80vh]">
						<img
							src={imageUrl}
							alt={name}
							className="max-w-full max-h-[80vh] object-contain"
							onError={handleImageError}
						/>
						<button
							onClick={() => setIsEnlarged(false)}
							className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
						>
							<X className="w-5 h-5 text-white" />
						</button>
					</div>
					<div className="p-4 bg-black text-white">
						<p className="font-medium">{name}</p>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

interface PartImageUploadProps {
	onFileSelect: (file: File) => void;
	previewUrl?: string | null;
	onClearPreview?: () => void;
	isUploading?: boolean;
	uploadProgress?: number;
	className?: string;
	existingImageId?: string;
}

export function PartImageUpload({
	onFileSelect,
	previewUrl,
	onClearPreview,
	isUploading,
	uploadProgress,
	className,
	existingImageId,
}: PartImageUploadProps) {
	const [isDragging, setIsDragging] = useState(false);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragging(false);

			const file = e.dataTransfer.files[0];
			if (file?.type.startsWith("image/")) {
				onFileSelect(file);
			}
		},
		[onFileSelect],
	);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				onFileSelect(file);
			}
		},
		[onFileSelect],
	);

	const existingImageUrl = existingImageId ? `/api/storage/${existingImageId}` : undefined;
	const displayUrl = previewUrl || existingImageUrl;

	if (displayUrl) {
		return (
			<div className={cn("relative w-32 h-32", className)}>
				<img
					src={displayUrl}
					alt="Preview"
					className="w-full h-full object-cover rounded-lg"
				/>
				{isUploading ? (
					<div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 rounded-lg">
						<Loader2 className="w-6 h-6 animate-spin text-white mb-2" />
						<span className="text-xs text-white font-medium">
							{uploadProgress}%
						</span>
					</div>
				) : (
					<button
						type="button"
						onClick={onClearPreview}
						className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				)}
			</div>
		);
	}

	return (
		<label
			className={cn(
				"flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
				isDragging
					? "border-cyan-500 bg-cyan-50"
					: "border-gray-300 hover:border-cyan-500 hover:bg-cyan-50",
				className,
			)}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<div className="flex flex-col items-center">
				<Package className="w-8 h-8 text-gray-400 mb-2" />
				<span className="text-xs text-gray-500 text-center px-2">
					Drop image or click
				</span>
				<span className="text-[10px] text-gray-400 mt-1">Max 5MB</span>
			</div>
			<input
				type="file"
				accept="image/*"
				onChange={handleFileChange}
				className="hidden"
			/>
		</label>
	);
}
