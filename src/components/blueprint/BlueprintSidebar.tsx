import { useCallback, useId, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
	useMutation as useConvexMutation,
	useQuery as useConvexQuery,
} from "@/integrations/convex/react-query";
import {
	sanitizeFileName,
	validateImageContentType,
	validateImageFileSize,
} from "@/lib/fileValidation";
import type {
	Blueprint,
	CanvasMode,
	Compartment,
	Drawer,
	DrawerWithCompartments,
	SelectedElement,
} from "@/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	BlueprintOverviewPanel,
	DrawerDetailsPanel,
} from "./BlueprintSidebarPanels";
import { CompartmentDetailsPanel } from "./BlueprintSidebarCompartmentPanel";

interface BlueprintSidebarProps {
	blueprint: Blueprint;
	drawers: DrawerWithCompartments[];
	selectedElement: SelectedElement;
	mode: CanvasMode;
	isLockedByMe: boolean;
	onSelectElement: (element: SelectedElement) => void;
	onCreateDrawer: (drawer: Partial<Drawer>) => void;
	onCreateCompartment: (
		compartment: Partial<Compartment>,
		drawerId: string,
	) => void;
	onUpdateDrawer: (drawerId: string, updates: Partial<Drawer>) => void;
	onUpdateCompartment: (
		compartmentId: string,
		updates: Partial<Compartment>,
	) => void;
	onDeleteDrawer: (drawerId: string) => void;
	onDeleteCompartment: (compartmentId: string) => void;
}

export function BlueprintSidebar({
	blueprint,
	drawers,
	selectedElement,
	mode: _mode,
	isLockedByMe,
	onSelectElement,
	onCreateDrawer: _onCreateDrawer,
	onCreateCompartment: _onCreateCompartment,
	onUpdateDrawer,
	onUpdateCompartment,
	onDeleteDrawer,
	onDeleteCompartment,
}: BlueprintSidebarProps) {
	const { authContext, getFreshAuthContext } = useAuth();
	const drawerLabelId = useId();
	const compartmentLabelId = useId();
	const selectedCompartment =
		selectedElement?.type === "compartment" ? selectedElement.data : null;
	const selectedCompartmentDrawerId =
		selectedElement?.type === "compartment" ? selectedElement.drawerId : null;

	const [expandedDrawers, setExpandedDrawers] = useState<Set<string>>(
		new Set(),
	);
	const [_showCreateDrawer, setShowCreateDrawer] = useState(false);
	const [_showCreateCompartment, setShowCreateCompartment] = useState(false);
	const [_createTargetDrawer, setCreateTargetDrawer] = useState<string | null>(
		null,
	);

	// Background image upload state
	const [isUploading, setIsUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Inventory dialog state
	const [showCheckIn, setShowCheckIn] = useState(false);
	const [showCheckOut, setShowCheckOut] = useState(false);
	const [selectedCompartmentId, setSelectedCompartmentId] = useState<
		string | null
	>(null);

	// Get background image URL if exists
	const backgroundImageUrl = useConvexQuery(
		api.storage.getImageUrl,
		authContext && blueprint.backgroundImageId
			? {
					authContext: authContext ?? undefined,
					storageId: blueprint.backgroundImageId as Id<"_storage">,
				}
			: undefined,
		{ enabled: !!blueprint.backgroundImageId && !!authContext },
	);

	// Fetch inventory for the selected compartment (must be declared unconditionally to obey Rules of Hooks).
	const compartmentInventoryResult = useConvexQuery(
		api.inventory.queries.getByCompartment,
		authContext && selectedCompartment
			? {
					authContext,
					compartmentId: selectedCompartment._id as Id<"compartments">,
				}
			: undefined,
		{ enabled: !!authContext && !!selectedCompartment },
	);

	// Generate upload URL mutation
	const generateUploadUrl = useConvexMutation(
		api.storage.generateBlueprintBackgroundUploadUrl,
	);

	// Confirm upload mutation
	const confirmUpload = useConvexMutation(
		api.storage.confirmBlueprintBackgroundUpload,
	);

	// Delete background mutation
	const deleteBackground = useConvexMutation(
		api.storage.deleteBlueprintBackgroundImage,
	);

	const toggleDrawerExpanded = useCallback((drawerId: string) => {
		setExpandedDrawers((prev) => {
			const next = new Set(prev);
			if (next.has(drawerId)) {
				next.delete(drawerId);
			} else {
				next.add(drawerId);
			}
			return next;
		});
	}, []);

	const totalCompartments = drawers.reduce(
		(sum, d) => sum + d.compartments.length,
		0,
	);

	// Handle check in for compartment
	const handleCheckIn = useCallback((compartmentId: string) => {
		setSelectedCompartmentId(compartmentId);
		setShowCheckIn(true);
	}, []);

	// Handle check out for compartment
	const handleCheckOut = useCallback((compartmentId: string) => {
		setSelectedCompartmentId(compartmentId);
		setShowCheckOut(true);
	}, []);

	// Handle background image file selection
	const handleBackgroundFileSelect = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;

			// Validate file type
			if (!validateImageContentType(file.type)) {
				alert("Please select a valid image file (JPEG, PNG, GIF, or WebP).");
				return;
			}

			// Validate file size (5MB)
			if (!validateImageFileSize(file.size)) {
				alert("Image file is too large. Maximum size is 5MB.");
				return;
			}

			const context = (await getFreshAuthContext()) ?? authContext ?? undefined;
			setIsUploading(true);
			try {
				if (!context) {
					throw new Error("Authentication required");
				}
				// Generate upload URL
				const { uploadUrl } = await (generateUploadUrl as any).mutateAsync({
					authContext: context,
					blueprintId: blueprint._id as Id<"blueprints">,
					fileName: sanitizeFileName(file.name),
					contentType: file.type,
				});

				// Upload the file
				const response = await fetch(uploadUrl, {
					method: "PUT",
					headers: { "Content-Type": file.type },
					body: file,
				});

				if (!response.ok) {
					throw new Error("Failed to upload image");
				}

				// Get the storage ID from the response
				const storageId = (await response.text()) as Id<"_storage">;

				// Confirm the upload
				await (confirmUpload as any).mutateAsync({
					authContext: context,
					blueprintId: blueprint._id as Id<"blueprints">,
					storageId,
				});

				// Reset file input
				if (fileInputRef.current) {
					fileInputRef.current.value = "";
				}
			} catch (error) {
				console.error("Failed to upload background image:", error);
				alert("Failed to upload background image. Please try again.");
			} finally {
				setIsUploading(false);
			}
		},
		[
			blueprint._id,
			generateUploadUrl,
			confirmUpload,
			getFreshAuthContext,
			authContext,
		],
	);

	// Handle delete background image
	const handleDeleteBackground = useCallback(async () => {
		if (!blueprint.backgroundImageId) return;

		if (!confirm("Are you sure you want to remove the background image?")) {
			return;
		}

		const context = (await getFreshAuthContext()) ?? authContext ?? undefined;
		if (!context) {
			alert("Authentication required");
			return;
		}
		try {
			await (deleteBackground as any).mutateAsync({
				authContext: context,
				blueprintId: blueprint._id as Id<"blueprints">,
			});
		} catch (error) {
			console.error("Failed to delete background image:", error);
			alert("Failed to remove background image. Please try again.");
		}
	}, [
		blueprint._id,
		blueprint.backgroundImageId,
		deleteBackground,
		getFreshAuthContext,
		authContext,
	]);

	// Handle upload button click
	const handleUploadClick = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	// Nothing selected - show blueprint info
	if (!selectedElement) {
		return (
			<BlueprintOverviewPanel
				blueprint={blueprint}
				drawers={drawers}
				totalCompartments={totalCompartments}
				isLockedByMe={isLockedByMe}
				backgroundImageUrl={backgroundImageUrl}
				isUploading={isUploading}
				expandedDrawers={expandedDrawers}
				fileInputRef={fileInputRef}
				onBackgroundFileSelect={handleBackgroundFileSelect}
				onDeleteBackground={handleDeleteBackground}
				onUploadClick={handleUploadClick}
				onToggleDrawerExpanded={toggleDrawerExpanded}
				onSelectElement={onSelectElement}
				onShowCreateDrawer={setShowCreateDrawer}
				onCreateTargetDrawer={setCreateTargetDrawer}
				onShowCreateCompartment={setShowCreateCompartment}
			/>
		);
	}

	// Drawer selected
	if (selectedElement.type === "drawer") {
		const drawer = selectedElement.data;
		return (
			<DrawerDetailsPanel
				drawer={drawer}
				drawerLabelId={drawerLabelId}
				isLockedByMe={isLockedByMe}
				onUpdateDrawer={onUpdateDrawer}
				onDeleteDrawer={onDeleteDrawer}
				onCreateTargetDrawer={setCreateTargetDrawer}
				onShowCreateCompartment={setShowCreateCompartment}
			/>
		);
	}

	// Compartment selected - show properties and inventory
	if (selectedElement.type === "compartment") {
		const compartment = selectedElement.data;
		const compartmentInventory = compartmentInventoryResult ?? [];
		const totalInCompartment = compartmentInventory.reduce(
			(sum, item) => sum + item.quantity,
			0,
		);

		return (
			<CompartmentDetailsPanel
				compartment={compartment}
				drawers={drawers}
				selectedCompartmentDrawerId={selectedCompartmentDrawerId}
				compartmentLabelId={compartmentLabelId}
				isLockedByMe={isLockedByMe}
				compartmentInventory={compartmentInventory}
				totalInCompartment={totalInCompartment}
				showCheckIn={showCheckIn}
				showCheckOut={showCheckOut}
				selectedCompartmentId={selectedCompartmentId}
				onUpdateCompartment={onUpdateCompartment}
				onDeleteCompartment={onDeleteCompartment}
				onCheckIn={handleCheckIn}
				onCheckOut={handleCheckOut}
				onSetShowCheckIn={setShowCheckIn}
				onSetShowCheckOut={setShowCheckOut}
			/>
		);
	}

	return null;
}
