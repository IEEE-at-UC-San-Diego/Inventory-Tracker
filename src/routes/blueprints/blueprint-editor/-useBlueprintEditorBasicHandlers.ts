import type { NavigateFn } from "@tanstack/react-router";
import { useCallback } from "react";
import type { BlueprintTool } from "@/components/blueprint/BlueprintControls";
import type { HistoryStep } from "@/hooks/useBlueprintHistory.types";
import type { Drawer, DrawerWithCompartments } from "@/types";
import type { AuthContext } from "@/types/auth";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
	deleteBlueprintById,
	saveBlueprintNameWithHistory,
} from "./actions/-blueprintActions";
import { createDrawerWithHistory } from "./actions/-drawerActions";

interface ToastLike {
	success: (title: string, description?: string) => void;
	error: (title: string, description?: string) => void;
	info: (title: string, description?: string) => void;
}

interface UseBlueprintEditorBasicHandlersParams {
	blueprintId: string;
	blueprint: {
		name: string;
	} | null;
	nameValue: string;
	drawers: DrawerWithCompartments[];
	getRequiredAuthContext: () => Promise<AuthContext>;
	updateBlueprint: (args: {
		authContext: AuthContext;
		blueprintId: Id<"blueprints">;
		name: string;
	}) => Promise<boolean | void>;
	deleteBlueprint: (args: {
		authContext: AuthContext;
		blueprintId: Id<"blueprints">;
	}) => Promise<boolean | void>;
	createDrawer: (args: {
		authContext: AuthContext;
		blueprintId: Id<"blueprints">;
		x: number;
		y: number;
		width: number;
		height: number;
		rotation?: number;
		label?: string;
	}) => Promise<Id<"drawers">>;
	pushHistoryEntry: (entry: {
		label: string;
		requiresLock: boolean;
		steps: HistoryStep[];
		timestamp: number;
	}) => void;
	toast: ToastLike;
	navigate: NavigateFn;
	setIsEditingName: (editing: boolean) => void;
	setTool: (tool: BlueprintTool) => void;
}

interface UseBlueprintEditorBasicHandlersReturn {
	handleSaveName: () => Promise<void>;
	handleDelete: () => Promise<void>;
	handleCreateDrawer: (drawerData: Partial<Drawer>) => Promise<void>;
}

export function useBlueprintEditorBasicHandlers({
	blueprintId,
	blueprint,
	nameValue,
	drawers,
	getRequiredAuthContext,
	updateBlueprint,
	deleteBlueprint,
	createDrawer,
	pushHistoryEntry,
	toast,
	navigate,
	setIsEditingName,
	setTool,
}: UseBlueprintEditorBasicHandlersParams): UseBlueprintEditorBasicHandlersReturn {
	const handleSaveName = useCallback(async () => {
		try {
			if (!blueprint) return;
			await saveBlueprintNameWithHistory({
				blueprintId: blueprintId as Id<"blueprints">,
				prevName: blueprint.name,
				nextName: nameValue,
				getRequiredAuthContext,
				updateBlueprint,
				pushHistoryEntry,
			});
			toast.success("Blueprint name updated");
			setIsEditingName(false);
		} catch (error) {
			toast.error(
				"Failed to update name",
				error instanceof Error ? error.message : "An error occurred",
			);
		}
	}, [
		blueprint,
		blueprintId,
		getRequiredAuthContext,
		nameValue,
		pushHistoryEntry,
		setIsEditingName,
		toast,
		updateBlueprint,
	]);

	const handleDelete = useCallback(async () => {
		try {
			await deleteBlueprintById({
				blueprintId: blueprintId as Id<"blueprints">,
				getRequiredAuthContext,
				deleteBlueprint,
			});
			toast.success("Blueprint deleted successfully");
			navigate({ to: "/blueprints" });
		} catch (error) {
			toast.error(
				"Failed to delete blueprint",
				error instanceof Error ? error.message : "An error occurred",
			);
		}
	}, [blueprintId, deleteBlueprint, getRequiredAuthContext, navigate, toast]);

	const handleCreateDrawer = useCallback(
		async (drawerData: Partial<Drawer>) => {
			const created = await createDrawerWithHistory({
				drawerData,
				drawers,
				blueprintId: blueprintId as Id<"blueprints">,
				getRequiredAuthContext,
				createDrawer,
				pushHistoryEntry,
				toast,
			});
			if (created) {
				// Tool persistence: keep the drawer tool active for repeated use
			}
		},
		[
			blueprintId,
			createDrawer,
			drawers,
			getRequiredAuthContext,
			pushHistoryEntry,
			setTool,
			toast,
		],
	);

	return {
		handleSaveName,
		handleDelete,
		handleCreateDrawer,
	};
}
