import type { Id } from "../../../../../convex/_generated/dataModel";
import type { HistoryStep } from "@/hooks/useBlueprintHistory.types";
import type { AuthContext } from "@/types/auth";

interface SaveBlueprintNameWithHistoryArgs {
	blueprintId: Id<"blueprints">;
	prevName: string;
	nextName: string;
	getRequiredAuthContext: () => Promise<AuthContext>;
	updateBlueprint: (args: {
		authContext: AuthContext;
		blueprintId: Id<"blueprints">;
		name?: string;
	}) => Promise<void>;
	pushHistoryEntry: (entry: {
		label: string;
		requiresLock: boolean;
		steps: HistoryStep[];
		timestamp: number;
	}) => void;
}

export async function saveBlueprintNameWithHistory({
	blueprintId,
	prevName,
	nextName,
	getRequiredAuthContext,
	updateBlueprint,
	pushHistoryEntry,
}: SaveBlueprintNameWithHistoryArgs): Promise<void> {
	const context = await getRequiredAuthContext();
	await updateBlueprint({
		authContext: context,
		blueprintId,
		name: nextName,
	});
	pushHistoryEntry({
		label: "Rename blueprint",
		requiresLock: true,
		steps: [
			{
				type: "updateBlueprintName",
				blueprintId: blueprintId as string,
				prevName,
				nextName,
			},
		],
		timestamp: Date.now(),
	});
}

interface DeleteBlueprintArgs {
	blueprintId: Id<"blueprints">;
	getRequiredAuthContext: () => Promise<AuthContext>;
	deleteBlueprint: (args: {
		authContext: AuthContext;
		blueprintId: Id<"blueprints">;
	}) => Promise<void>;
}

export async function deleteBlueprintById({
	blueprintId,
	getRequiredAuthContext,
	deleteBlueprint,
}: DeleteBlueprintArgs): Promise<void> {
	const context = await getRequiredAuthContext();
	await deleteBlueprint({
		authContext: context,
		blueprintId,
	});
}
