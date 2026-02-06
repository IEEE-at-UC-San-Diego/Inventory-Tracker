const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export function validateImageContentType(contentType: string): boolean {
	const allowedTypes = [
		"image/jpeg",
		"image/jpg",
		"image/png",
		"image/gif",
		"image/webp",
	];
	return allowedTypes.includes(contentType.toLowerCase());
}

export function validateImageFileSize(sizeInBytes: number): boolean {
	return sizeInBytes <= MAX_IMAGE_SIZE_BYTES;
}

export function sanitizeFileName(fileName: string): string {
	// Remove path components and special characters (keeps extension).
	return fileName
		.replace(/^.*[\\/]/, "")
		.replace(/[^a-zA-Z0-9.-]/g, "_")
		.substring(0, 100);
}

