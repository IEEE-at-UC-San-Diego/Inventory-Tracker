import type {
	CompartmentSnapshot,
	DrawerSnapshot,
	HistoryChange,
	HistoryEntry,
	HistoryState,
	IdMapping,
	LogicalId,
} from "@/lib/history";
import type { Compartment, DrawerWithCompartments } from "@/types";
import type {
	HistoryStep,
} from "./useBlueprintHistory.types";

export function compactPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
	const next: Partial<T> = {};
	for (const [key, value] of Object.entries(patch)) {
		if (value !== undefined) {
			next[key as keyof T] = value as T[keyof T];
		}
	}
	return next;
}

export function appendEntry(state: HistoryState, entry: HistoryEntry): HistoryState {
	const truncatedEntries = state.entries.slice(0, state.currentIndex + 1);
	const newEntries = [...truncatedEntries, entry];

	if (newEntries.length > state.maxEntries) {
		const overflow = newEntries.length - state.maxEntries;
		newEntries.splice(0, overflow);
	}

	return {
		...state,
		entries: newEntries,
		currentIndex: newEntries.length - 1,
	};
}

export function cloneMapping(mapping: IdMapping): IdMapping {
	return {
		logicalToPhysical: new Map(mapping.logicalToPhysical),
		physicalToLogical: new Map(mapping.physicalToLogical),
	};
}

export function restoreMapping(target: IdMapping, snapshot: IdMapping): void {
	target.logicalToPhysical.clear();
	target.physicalToLogical.clear();

	for (const [logical, physical] of snapshot.logicalToPhysical) {
		target.logicalToPhysical.set(logical, physical);
	}
	for (const [physical, logical] of snapshot.physicalToLogical) {
		target.physicalToLogical.set(physical, logical);
	}
}

interface ConvertLegacyStepDeps {
	ensureLogicalId: (physicalId: string) => LogicalId;
	drawers: DrawerWithCompartments[];
}

function convertCompartmentPatch(
	patch: Partial<Compartment> & { drawerId?: string },
	ensureLogicalId: (physicalId: string) => LogicalId,
): Record<string, unknown> {
	const { drawerId, ...rest } = patch;
	const converted = compactPatch(rest as Record<string, unknown>);

	if (drawerId) {
		converted.parentDrawerLogicalId = ensureLogicalId(drawerId);
	}

	return converted;
}

export function convertLegacyStepToChanges(
	step: HistoryStep,
	deps: ConvertLegacyStepDeps,
): HistoryChange[] {
	const { ensureLogicalId, drawers } = deps;

	switch (step.type) {
		case "selection":
			return [];

		case "updateDrawer": {
			const logicalId = ensureLogicalId(step.drawerId);
			return [
				{
					type: "updateDrawer",
					logicalId,
					entityType: "drawer",
					before: compactPatch(step.prev as Record<string, unknown>),
					after: compactPatch(step.next as Record<string, unknown>),
				},
			];
		}

		case "updateCompartment": {
			const logicalId = ensureLogicalId(step.compartmentId);
			return [
				{
					type: "updateCompartment",
					logicalId,
					entityType: "compartment",
					before: convertCompartmentPatch(step.prev, ensureLogicalId),
					after: convertCompartmentPatch(step.next, ensureLogicalId),
				},
			];
		}

		case "createDrawer": {
			const logicalId = ensureLogicalId(step.drawerId);
			const drawerSnapshot = drawers.find((drawer) => drawer._id === step.drawerId);
			const compartments: CompartmentSnapshot[] =
				drawerSnapshot?.compartments.map((comp) => {
					const compLogicalId = ensureLogicalId(comp._id);
					return {
						logicalId: compLogicalId,
						parentDrawerLogicalId: logicalId,
						x: comp.x,
						y: comp.y,
						width: comp.width,
						height: comp.height,
						rotation: comp.rotation,
						zIndex: comp.zIndex,
						label: comp.label,
					};
				}) ?? [];

			const after: DrawerSnapshot = {
				logicalId,
				blueprintId: step.blueprintId,
				x: drawerSnapshot?.x ?? step.args.x,
				y: drawerSnapshot?.y ?? step.args.y,
				width: drawerSnapshot?.width ?? step.args.width,
				height: drawerSnapshot?.height ?? step.args.height,
				rotation: drawerSnapshot?.rotation ?? step.args.rotation ?? 0,
				zIndex: drawerSnapshot?.zIndex ?? step.args.zIndex ?? 0,
				gridRows: drawerSnapshot?.gridRows ?? step.args.gridRows,
				gridCols: drawerSnapshot?.gridCols ?? step.args.gridCols,
				label: drawerSnapshot?.label ?? step.args.label,
				compartments,
			};

			return [
				{
					type: "createDrawer",
					logicalId,
					entityType: "drawer",
					before: null,
					after,
				},
			];
		}

		case "deleteDrawer": {
			const logicalId = ensureLogicalId(step.currentDrawerId);
			const compartments: CompartmentSnapshot[] = step.snapshot.compartments.map(
				(compartment) => ({
					logicalId: ensureLogicalId(compartment._id),
					parentDrawerLogicalId: logicalId,
					x: compartment.x,
					y: compartment.y,
					width: compartment.width,
					height: compartment.height,
					rotation: compartment.rotation,
					zIndex: compartment.zIndex,
					label: compartment.label,
				}),
			);

			const before: DrawerSnapshot = {
				logicalId,
				blueprintId: step.snapshot.blueprintId,
				x: step.snapshot.x,
				y: step.snapshot.y,
				width: step.snapshot.width,
				height: step.snapshot.height,
				rotation: step.snapshot.rotation,
				zIndex: step.snapshot.zIndex,
				gridRows: step.snapshot.gridRows,
				gridCols: step.snapshot.gridCols,
				label: step.snapshot.label,
				compartments,
			};

			return [
				{
					type: "deleteDrawer",
					logicalId,
					entityType: "drawer",
					before,
					after: null,
				},
			];
		}

		case "createCompartment": {
			if (!step.args.drawerId) {
				return [];
			}

			const logicalId = ensureLogicalId(step.compartmentId);
			const parentDrawerLogicalId = ensureLogicalId(step.args.drawerId);

			return [
				{
					type: "createCompartment",
					logicalId,
					entityType: "compartment",
					before: null,
					after: {
						logicalId,
						parentDrawerLogicalId,
						x: step.args.x,
						y: step.args.y,
						width: step.args.width,
						height: step.args.height,
						rotation: step.args.rotation ?? 0,
						zIndex: step.args.zIndex ?? 0,
						label: step.args.label,
					},
				},
			];
		}

		case "deleteCompartment": {
			const logicalId = ensureLogicalId(step.currentCompartmentId);
			const parentDrawerLogicalId = ensureLogicalId(step.snapshot.drawerId);

			return [
				{
					type: "deleteCompartment",
					logicalId,
					entityType: "compartment",
					before: {
						logicalId,
						parentDrawerLogicalId,
						x: step.snapshot.x,
						y: step.snapshot.y,
						width: step.snapshot.width,
						height: step.snapshot.height,
						rotation: step.snapshot.rotation,
						zIndex: step.snapshot.zIndex,
						label: step.snapshot.label,
					},
					after: null,
				},
			];
		}

		case "updateBlueprintName": {
			return [
				{
					type: "updateBlueprintName",
					logicalId: "blueprint",
					entityType: "blueprint",
					before: step.prevName,
					after: step.nextName,
				},
			];
		}

		default: {
			const _exhaustive: never = step;
			throw new Error(
				`Unsupported history step: ${JSON.stringify(_exhaustive)}`,
			);
		}
	}
}
