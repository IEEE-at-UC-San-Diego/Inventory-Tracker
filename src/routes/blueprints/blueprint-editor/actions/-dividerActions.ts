import type { AuthContext } from "@/types/auth";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { PushHistoryEntryFn, ToastLike } from "./-drawerActions";

export interface DividerMutationFns {
	createDivider: (args: {
		authContext: AuthContext;
		blueprintId: Id<"blueprints">;
		x1: number;
		y1: number;
		x2: number;
		y2: number;
		thickness?: number;
	}) => Promise<Id<"dividers">>;
	updateDivider: (args: {
		authContext: AuthContext;
		dividerId: Id<"dividers">;
		x1?: number;
		y1?: number;
		x2?: number;
		y2?: number;
		thickness?: number;
	}) => Promise<boolean | void>;
	deleteDivider: (args: {
		authContext: AuthContext;
		dividerId: Id<"dividers">;
	}) => Promise<boolean | void>;
}

export interface DividerData {
	_id: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	thickness: number;
}

interface CreateDividerWithHistoryArgs {
	dividerData: { x1: number; y1: number; x2: number; y2: number; thickness?: number };
	blueprintId: Id<"blueprints">;
	getRequiredAuthContext: () => Promise<AuthContext>;
	createDivider: DividerMutationFns["createDivider"];
	pushHistoryEntry: PushHistoryEntryFn;
	setHasChanges: (value: boolean) => void;
	toast: ToastLike;
}

export async function createDividerWithHistory({
	dividerData,
	blueprintId,
	getRequiredAuthContext,
	createDivider,
	pushHistoryEntry,
	setHasChanges,
	toast,
}: CreateDividerWithHistoryArgs): Promise<boolean> {
	try {
		const context = await getRequiredAuthContext();
		const dividerId = await createDivider({
			authContext: context,
			blueprintId,
			x1: dividerData.x1,
			y1: dividerData.y1,
			x2: dividerData.x2,
			y2: dividerData.y2,
			thickness: dividerData.thickness,
		});

		pushHistoryEntry({
			label: "Create divider",
			requiresLock: true,
			steps: [
				{
					type: "createDivider",
					blueprintId: blueprintId as string,
					dividerId: dividerId as unknown as string,
					args: {
						x1: dividerData.x1,
						y1: dividerData.y1,
						x2: dividerData.x2,
						y2: dividerData.y2,
						thickness: dividerData.thickness,
					},
				},
			],
			timestamp: Date.now(),
		});

		setHasChanges(true);
		return true;
	} catch (error) {
		toast.error(
			"Failed to create divider",
			error instanceof Error ? error.message : "An error occurred",
		);
		return false;
	}
}

interface UpdateDividerWithHistoryArgs {
	dividerId: string;
	updates: { x1: number; y1: number; x2: number; y2: number };
	dividers: DividerData[];
	getRequiredAuthContext: () => Promise<AuthContext>;
	updateDivider: DividerMutationFns["updateDivider"];
	pushHistoryEntry: PushHistoryEntryFn;
	setHasChanges: (value: boolean) => void;
	toast: ToastLike;
}

export async function updateDividerWithHistory({
	dividerId,
	updates,
	dividers,
	getRequiredAuthContext,
	updateDivider,
	pushHistoryEntry,
	setHasChanges,
	toast,
}: UpdateDividerWithHistoryArgs): Promise<boolean> {
	const divider = dividers.find((d) => d._id === dividerId);
	if (!divider) return false;

	const prev = {
		x1: divider.x1,
		y1: divider.y1,
		x2: divider.x2,
		y2: divider.y2,
		thickness: divider.thickness,
	};

	try {
		const context = await getRequiredAuthContext();
		await updateDivider({
			authContext: context,
			dividerId: dividerId as Id<"dividers">,
			...updates,
		});

		pushHistoryEntry({
			label: "Update divider",
			requiresLock: true,
			steps: [
				{
					type: "updateDivider",
					dividerId,
					prev,
					next: {
						x1: updates.x1,
						y1: updates.y1,
						x2: updates.x2,
						y2: updates.y2,
						thickness: divider.thickness,
					},
				},
			],
			timestamp: Date.now(),
		});

		setHasChanges(true);
		return true;
	} catch (error) {
		toast.error(
			"Failed to update divider",
			error instanceof Error ? error.message : "An error occurred",
		);
		return false;
	}
}

interface DeleteDividerWithHistoryArgs {
	dividerId: string;
	dividers: DividerData[];
	blueprintId: Id<"blueprints">;
	getRequiredAuthContext: () => Promise<AuthContext>;
	deleteDivider: DividerMutationFns["deleteDivider"];
	pushHistoryEntry: PushHistoryEntryFn;
	setHasChanges: (value: boolean) => void;
	toast: ToastLike;
}

export async function deleteDividerWithHistory({
	dividerId,
	dividers,
	blueprintId,
	getRequiredAuthContext,
	deleteDivider,
	pushHistoryEntry,
	setHasChanges,
	toast,
}: DeleteDividerWithHistoryArgs): Promise<boolean> {
	const divider = dividers.find((d) => d._id === dividerId);
	if (!divider) return false;

	try {
		const context = await getRequiredAuthContext();
		await deleteDivider({
			authContext: context,
			dividerId: dividerId as Id<"dividers">,
		});

		pushHistoryEntry({
			label: "Delete divider",
			requiresLock: true,
			steps: [
				{
					type: "deleteDivider",
					dividerId,
					snapshot: {
						_id: dividerId,
						blueprintId: blueprintId as string,
						x1: divider.x1,
						y1: divider.y1,
						x2: divider.x2,
						y2: divider.y2,
						thickness: divider.thickness,
					},
				},
			],
			timestamp: Date.now(),
		});

		setHasChanges(true);
		toast.success("Divider deleted");
		return true;
	} catch (error) {
		toast.error(
			"Failed to delete divider",
			error instanceof Error ? error.message : "An error occurred",
		);
		return false;
	}
}
