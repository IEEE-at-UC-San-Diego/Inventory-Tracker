import { useEffect } from "react";
import type { SelectedElement } from "@/types";

interface ToastLike {
	info: (title: string, description?: string) => void;
}

interface UseBlueprintEditorShortcutsParams {
	selectedDrawerIds: string[];
	selectedElement: SelectedElement;
	isLockedByMe: boolean;
	handleUndo: () => Promise<void>;
	handleRedo: () => Promise<void>;
	setPendingDeleteDrawerIds: (ids: string[]) => void;
	setShowDeleteDrawerDialog: (open: boolean) => void;
	setPendingDeleteCompartmentId: (id: string | null) => void;
	setShowDeleteCompartmentDialog: (open: boolean) => void;
	toast: ToastLike;
}

export function useBlueprintEditorShortcuts({
	selectedDrawerIds,
	selectedElement,
	isLockedByMe,
	handleUndo,
	handleRedo,
	setPendingDeleteDrawerIds,
	setShowDeleteDrawerDialog,
	setPendingDeleteCompartmentId,
	setShowDeleteCompartmentDialog,
	toast,
}: UseBlueprintEditorShortcutsParams): void {
	useEffect(() => {
		const handleKeyDown = async (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			const isTypingTarget =
				tag === "input" ||
				tag === "textarea" ||
				tag === "select" ||
				(target?.isContentEditable ?? false);

			if (
				!isTypingTarget &&
				(e.key === "Delete" || e.key === "Backspace") &&
				isLockedByMe
			) {
				e.preventDefault();
				if (selectedDrawerIds.length > 1) {
					setPendingDeleteDrawerIds(selectedDrawerIds);
					setShowDeleteDrawerDialog(true);
				} else if (selectedElement?.type === "drawer") {
					setPendingDeleteDrawerIds([selectedElement.id]);
					setShowDeleteDrawerDialog(true);
				} else if (selectedElement?.type === "compartment") {
					setPendingDeleteCompartmentId(selectedElement.id);
					setShowDeleteCompartmentDialog(true);
				}
			}

			if (
				!isTypingTarget &&
				(e.ctrlKey || e.metaKey) &&
				e.key === "z" &&
				!e.shiftKey
			) {
				e.preventDefault();
				await handleUndo();
			}

			if (
				!isTypingTarget &&
				(e.ctrlKey || e.metaKey) &&
				e.key === "z" &&
				e.shiftKey
			) {
				e.preventDefault();
				await handleRedo();
			}

			if (
				!isTypingTarget &&
				(e.ctrlKey || e.metaKey) &&
				(e.key === "y" || e.key === "Y")
			) {
				e.preventDefault();
				await handleRedo();
			}

			if ((e.ctrlKey || e.metaKey) && e.key === "s" && isLockedByMe) {
				e.preventDefault();
				toast.info("All changes are saved automatically");
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		handleRedo,
		handleUndo,
		isLockedByMe,
		selectedDrawerIds,
		selectedElement,
		setPendingDeleteCompartmentId,
		setPendingDeleteDrawerIds,
		setShowDeleteCompartmentDialog,
		setShowDeleteDrawerDialog,
		toast,
	]);
}
