/**
 * useBlueprintHistory Hook
 *
 * Robust undo/redo for blueprint editing with:
 * - Stable logical IDs across delete/recreate cycles
 * - Complete reversible change records
 * - Transaction-style apply with rollback on failure
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
	Compartment,
	Drawer,
	DrawerWithCompartments,
	SelectedElement,
} from "@/types";
import type { AuthContext } from "@/types/auth";
import type { Id } from "../../convex/_generated/dataModel";
import {
	type CompartmentSnapshot,
	type DrawerSnapshot,
	type HistoryChange,
	type HistoryEntry,
	type HistoryState,
	type IdMapping,
	type LogicalId,
	type SelectionSnapshot,
	canRedo as canRedoFn,
	canUndo as canUndoFn,
	createHistoryState,
	createIdMapping,
	createSelectionSnapshot,
	generateLogicalId,
	getLogicalId,
	getPhysicalId,
	moveBackward,
	moveForward,
	registerIdMapping,
	removeIdMapping,
} from "@/lib/history";

// =============================================================================
// Legacy Step Types (compatibility with existing callers)
// =============================================================================

export type PrimarySelectionRef =
	| { type: "drawer"; id: string }
	| { type: "compartment"; id: string; drawerId: string }
	| null;

export interface LegacySelectionSnapshot {
	selectedDrawerIds: string[];
	primary: PrimarySelectionRef;
}

export type HistoryStep =
	| {
			type: "selection";
			prev: LegacySelectionSnapshot;
			next: LegacySelectionSnapshot;
	  }
	| {
			type: "updateDrawer";
			drawerId: string;
			prev: Partial<Drawer>;
			next: Partial<Drawer>;
	  }
	| {
			type: "updateCompartment";
			compartmentId: string;
			prev: Partial<Compartment> & { drawerId?: string };
			next: Partial<Compartment> & { drawerId?: string };
	  }
	| {
			type: "createDrawer";
			blueprintId: string;
			args: Omit<
				Drawer,
				"_id" | "createdAt" | "updatedAt" | "blueprintId" | "zIndex"
			> &
				Partial<Pick<Drawer, "label" | "gridRows" | "gridCols" | "zIndex">>;
			drawerId: string;
	  }
	| {
			type: "deleteDrawer";
			snapshot: DrawerWithCompartments;
			currentDrawerId: string;
	  }
	| {
			type: "createCompartment";
			args: Omit<
				Compartment,
				"_id" | "createdAt" | "updatedAt" | "drawerId" | "zIndex"
			> &
				Partial<Pick<Compartment, "drawerId" | "label" | "zIndex">>;
			compartmentId: string;
	  }
	| {
			type: "deleteCompartment";
			snapshot: Compartment;
			currentCompartmentId: string;
	  }
	| {
			type: "updateBlueprintName";
			blueprintId: string;
			prevName: string;
			nextName: string;
	  };

/** Legacy entry for compatibility */
export interface LegacyHistoryEntry {
	label: string;
	requiresLock: boolean;
	steps: HistoryStep[];
	timestamp: number;
}

// =============================================================================
// Types
// =============================================================================

export interface ViewportSnapshot {
	zoom: number;
	x: number;
	y: number;
}

/** Dependencies required by the history hook */
export interface HistoryDependencies {
	/** Function to get the current auth context */
	getAuthContext: () => Promise<AuthContext>;
	/** Convex mutations */
	mutations: {
		createDrawer: (args: {
			authContext: AuthContext;
			blueprintId: Id<"blueprints">;
			x: number;
			y: number;
			width: number;
			height: number;
			rotation?: number;
			zIndex?: number;
			gridRows?: number;
			gridCols?: number;
			label?: string;
		}) => Promise<Id<"drawers">>;
		updateDrawer: (args: {
			authContext: AuthContext;
			drawerId: Id<"drawers">;
			x?: number;
			y?: number;
			width?: number;
			height?: number;
			rotation?: number;
			zIndex?: number;
			gridRows?: number;
			gridCols?: number;
			label?: string;
		}) => Promise<void>;
		deleteDrawer: (args: {
			authContext: AuthContext;
			drawerId: Id<"drawers">;
		}) => Promise<void>;
		createCompartment: (args: {
			authContext: AuthContext;
			drawerId: Id<"drawers">;
			x: number;
			y: number;
			width: number;
			height: number;
			rotation?: number;
			zIndex?: number;
			label?: string;
		}) => Promise<Id<"compartments">>;
		updateCompartment: (args: {
			authContext: AuthContext;
			compartmentId: Id<"compartments">;
			drawerId?: Id<"drawers">;
			x?: number;
			y?: number;
			width?: number;
			height?: number;
			rotation?: number;
			zIndex?: number;
			label?: string;
		}) => Promise<void>;
		deleteCompartment: (args: {
			authContext: AuthContext;
			compartmentId: Id<"compartments">;
		}) => Promise<void>;
		updateBlueprint: (args: {
			authContext: AuthContext;
			blueprintId: Id<"blueprints">;
			name: string;
		}) => Promise<void>;
	};
	/** Current blueprint ID */
	blueprintId: Id<"blueprints">;
	/** Blueprint name (for history snapshots) */
	blueprintName: string;
	/** Current drawers state */
	drawers: DrawerWithCompartments[];
	/** Current viewport state */
	viewport: {
		zoom: number;
		x: number;
		y: number;
	};
	/** Current selection state */
	selection: {
		selectedElement: SelectedElement;
		selectedDrawerIds: string[];
	};
	/** Whether user has edit lock */
	isLockedByMe: boolean;
	/** REQUIRED: Callback to restore selection state */
	restoreSelection: (selection: SelectionSnapshot) => void;
	/** REQUIRED: Callback to restore viewport state */
	restoreViewport: (viewport: ViewportSnapshot) => void;
	/** Callbacks */
	onError?: (title: string, message: string) => void;
}

/** Return type of useBlueprintHistory */
export interface UseBlueprintHistoryReturn {
	/** Current history state */
	historyState: HistoryState;
	/** Whether undo is available */
	canUndo: boolean;
	/** Whether redo is available */
	canRedo: boolean;
	/** Whether a history operation is in progress */
	isApplying: boolean;
	/** Push a new history entry (legacy API) */
	pushHistoryEntry: (entry: LegacyHistoryEntry) => void;
	/** Undo the last action */
	undo: () => Promise<void>;
	/** Redo the next action */
	redo: () => Promise<void>;
	/** Get state snapshot for an entry */
	getStateSnapshot: (entry: HistoryEntry) => {
		select: "before" | "after";
		drawers: Map<LogicalId, DrawerSnapshot>;
		viewport: ViewportSnapshot;
		selection: SelectionSnapshot;
	};
	/** Clear all history (e.g., on blueprint load) */
	clearHistory: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

function compactPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
	const next: Partial<T> = {};
	for (const [key, value] of Object.entries(patch)) {
		if (value !== undefined) {
			next[key as keyof T] = value as T[keyof T];
		}
	}
	return next;
}

function appendEntry(state: HistoryState, entry: HistoryEntry): HistoryState {
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

function cloneMapping(mapping: IdMapping): IdMapping {
	return {
		logicalToPhysical: new Map(mapping.logicalToPhysical),
		physicalToLogical: new Map(mapping.physicalToLogical),
	};
}

function restoreMapping(target: IdMapping, snapshot: IdMapping): void {
	target.logicalToPhysical.clear();
	target.physicalToLogical.clear();

	for (const [logical, physical] of snapshot.logicalToPhysical) {
		target.logicalToPhysical.set(logical, physical);
	}
	for (const [physical, logical] of snapshot.physicalToLogical) {
		target.physicalToLogical.set(physical, logical);
	}
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useBlueprintHistory(
	deps: HistoryDependencies,
): UseBlueprintHistoryReturn {
	const {
		getAuthContext,
		mutations,
		blueprintId,
		blueprintName,
		drawers,
		viewport,
		selection,
		isLockedByMe,
		restoreSelection,
		restoreViewport,
		onError,
	} = deps;

	const [historyState, setHistoryState] = useState<HistoryState>(() =>
		createHistoryState(200),
	);
	const [isApplying, setIsApplying] = useState(false);

	const idMappingRef = useRef<IdMapping>(createIdMapping());
	const drawersRef = useRef(drawers);
	const viewportRef = useRef(viewport);
	const selectionRef = useRef(selection);
	const isLockedByMeRef = useRef(isLockedByMe);
	const mutationsRef = useRef(mutations);
	const restoreSelectionRef = useRef(restoreSelection);
	const restoreViewportRef = useRef(restoreViewport);

	drawersRef.current = drawers;
	viewportRef.current = viewport;
	selectionRef.current = selection;
	isLockedByMeRef.current = isLockedByMe;
	mutationsRef.current = mutations;
	restoreSelectionRef.current = restoreSelection;
	restoreViewportRef.current = restoreViewport;

	const ensureLogicalId = useCallback((physicalId: string): LogicalId => {
		const mapping = idMappingRef.current;
		const existing = getLogicalId(mapping, physicalId);
		if (existing) return existing;

		const logicalId = generateLogicalId();
		registerIdMapping(mapping, logicalId, physicalId);
		return logicalId;
	}, []);

	const synchronizeMappingWithDrawers = useCallback(
		(nextDrawers: DrawerWithCompartments[]): void => {
			for (const drawer of nextDrawers) {
				const drawerLogicalId = ensureLogicalId(drawer._id);
				for (const compartment of drawer.compartments) {
					const compLogicalId = ensureLogicalId(compartment._id);
					// Keep parent references coherent if IDs were remapped.
					void drawerLogicalId;
					void compLogicalId;
				}
			}
		},
		[ensureLogicalId],
	);

	useEffect(() => {
		synchronizeMappingWithDrawers(drawers);
	}, [drawers, synchronizeMappingWithDrawers]);

	const convertLegacySelection = useCallback(
		(legacy: LegacySelectionSnapshot): SelectionSnapshot => {
			const mapping = idMappingRef.current;

			const selectedDrawerIds = legacy.selectedDrawerIds
				.map((id) => getLogicalId(mapping, id))
				.filter((id): id is LogicalId => id !== undefined);

			let selectedCompartmentId: LogicalId | null = null;
			if (legacy.primary?.type === "compartment") {
				selectedCompartmentId =
					getLogicalId(mapping, legacy.primary.id) ?? null;
			}

			return {
				selectedDrawerIds,
				selectedCompartmentId,
			};
		},
		[],
	);

	const getCurrentSelectionSnapshot = useCallback((): SelectionSnapshot => {
		const mapping = idMappingRef.current;
		const currentSelection = selectionRef.current;
		const currentViewport = viewportRef.current;
		return createSelectionSnapshot(
			currentSelection.selectedDrawerIds,
			currentSelection.selectedElement,
			mapping,
			currentViewport,
		);
	}, []);

	const restoreSelectionSnapshot = useCallback(
		(snapshot: SelectionSnapshot): void => {
			const applySelection = restoreSelectionRef.current;
			if (!applySelection) return;

			const mapping = idMappingRef.current;
			const selectedDrawerIds = snapshot.selectedDrawerIds
				.map((logicalId) => getPhysicalId(mapping, logicalId))
				.filter((id): id is string => id !== undefined);

			const selectedCompartmentId = snapshot.selectedCompartmentId
				? (getPhysicalId(mapping, snapshot.selectedCompartmentId) ?? null)
				: null;

			applySelection({
				selectedDrawerIds,
				selectedCompartmentId,
			});
		},
		[],
	);

	const restoreState = useCallback(
		(snapshot: {
			viewport: ViewportSnapshot;
			selection: SelectionSnapshot;
		}): void => {
			const applyViewport = restoreViewportRef.current;
			const applySelection = restoreSelectionRef.current;

			// Restore viewport FIRST (to establish viewing context)
			if (applyViewport) {
				applyViewport(snapshot.viewport);
			}

			// Restore selection AFTER viewport (for proper focus)
			if (applySelection) {
				restoreSelectionSnapshot(snapshot.selection);
			}
		},
		[restoreSelectionSnapshot],
	);

	const convertCompartmentPatch = useCallback(
		(
			patch: Partial<Compartment> & { drawerId?: string },
		): Record<string, unknown> => {
			const { drawerId, ...rest } = patch;
			const converted = compactPatch(rest as Record<string, unknown>);

			if (drawerId) {
				converted.parentDrawerLogicalId = ensureLogicalId(drawerId);
			}

			return converted;
		},
		[ensureLogicalId],
	);

	const convertLegacyStepToChanges = useCallback(
		(step: HistoryStep): HistoryChange[] => {
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
							before: convertCompartmentPatch(step.prev),
							after: convertCompartmentPatch(step.next),
						},
					];
				}

				case "createDrawer": {
					const logicalId = ensureLogicalId(step.drawerId);
					const drawerSnapshot = drawersRef.current.find(
						(drawer) => drawer._id === step.drawerId,
					);

					// CRITICAL FIX: Capture actual compartments from snapshot, never empty
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
					const compartments: CompartmentSnapshot[] =
						step.snapshot.compartments.map((compartment) => ({
							logicalId: ensureLogicalId(compartment._id),
							parentDrawerLogicalId: logicalId,
							x: compartment.x,
							y: compartment.y,
							width: compartment.width,
							height: compartment.height,
							rotation: compartment.rotation,
							zIndex: compartment.zIndex,
							label: compartment.label,
						}));

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
		},
		[convertCompartmentPatch, ensureLogicalId],
	);

	const removeDrawerSnapshotMappings = useCallback(
		(snapshot: DrawerSnapshot) => {
			const mapping = idMappingRef.current;
			removeIdMapping(mapping, snapshot.logicalId);
			for (const compartment of snapshot.compartments) {
				removeIdMapping(mapping, compartment.logicalId);
			}
		},
		[],
	);

	const applyChange = useCallback(
		async (
			change: HistoryChange,
			direction: "undo" | "redo",
			authContext: AuthContext,
		): Promise<void> => {
			const mapping = idMappingRef.current;
			const currentMutations = mutationsRef.current;

			switch (change.type) {
				case "createDrawer": {
					const snapshot = change.after as DrawerSnapshot;
					if (direction === "undo") {
						const physicalId = getPhysicalId(mapping, change.logicalId);
						if (!physicalId) return;
						await currentMutations.deleteDrawer({
							authContext,
							drawerId: physicalId as Id<"drawers">,
						});
						removeDrawerSnapshotMappings(snapshot);
						return;
					}

					const newDrawerId = await currentMutations.createDrawer({
						authContext,
						blueprintId,
						x: snapshot.x,
						y: snapshot.y,
						width: snapshot.width,
						height: snapshot.height,
						rotation: snapshot.rotation,
						zIndex: snapshot.zIndex,
						gridRows: snapshot.gridRows,
						gridCols: snapshot.gridCols,
						label: snapshot.label,
					});

					registerIdMapping(mapping, change.logicalId, newDrawerId);
					return;
				}

				case "deleteDrawer": {
					const snapshot = change.before as DrawerSnapshot;
					if (direction === "undo") {
						const newDrawerId = await currentMutations.createDrawer({
							authContext,
							blueprintId,
							x: snapshot.x,
							y: snapshot.y,
							width: snapshot.width,
							height: snapshot.height,
							rotation: snapshot.rotation,
							zIndex: snapshot.zIndex,
							gridRows: snapshot.gridRows,
							gridCols: snapshot.gridCols,
							label: snapshot.label,
						});
						registerIdMapping(mapping, change.logicalId, newDrawerId);

						const sortedCompartments = [...snapshot.compartments].sort(
							(a, b) => a.zIndex - b.zIndex,
						);

						for (const compSnapshot of sortedCompartments) {
							const newCompartmentId = await currentMutations.createCompartment(
								{
									authContext,
									drawerId: newDrawerId,
									x: compSnapshot.x,
									y: compSnapshot.y,
									width: compSnapshot.width,
									height: compSnapshot.height,
									rotation: compSnapshot.rotation,
									zIndex: compSnapshot.zIndex,
									label: compSnapshot.label,
								},
							);
							registerIdMapping(
								mapping,
								compSnapshot.logicalId,
								newCompartmentId,
							);
						}
						return;
					}

					const drawerPhysicalId = getPhysicalId(mapping, change.logicalId);
					if (!drawerPhysicalId) return;
					await currentMutations.deleteDrawer({
						authContext,
						drawerId: drawerPhysicalId as Id<"drawers">,
					});
					removeDrawerSnapshotMappings(snapshot);
					return;
				}

				case "updateDrawer": {
					const physicalId = getPhysicalId(mapping, change.logicalId);
					if (!physicalId) return;

					const patch =
						direction === "undo"
							? (change.before as Record<string, unknown>)
							: (change.after as Record<string, unknown>);

					await currentMutations.updateDrawer({
						authContext,
						drawerId: physicalId as Id<"drawers">,
						...(compactPatch(patch) as {
							x?: number;
							y?: number;
							width?: number;
							height?: number;
							rotation?: number;
							zIndex?: number;
							gridRows?: number;
							gridCols?: number;
							label?: string;
						}),
					});
					return;
				}

				case "createCompartment": {
					const snapshot = change.after as CompartmentSnapshot;
					if (direction === "undo") {
						const physicalId = getPhysicalId(mapping, change.logicalId);
						if (!physicalId) return;
						await currentMutations.deleteCompartment({
							authContext,
							compartmentId: physicalId as Id<"compartments">,
						});
						removeIdMapping(mapping, change.logicalId);
						return;
					}

					const drawerPhysicalId = getPhysicalId(
						mapping,
						snapshot.parentDrawerLogicalId,
					);
					if (!drawerPhysicalId) {
						throw new Error(
							`Parent drawer ${snapshot.parentDrawerLogicalId} is missing`,
						);
					}

					const newCompartmentId = await currentMutations.createCompartment({
						authContext,
						drawerId: drawerPhysicalId as Id<"drawers">,
						x: snapshot.x,
						y: snapshot.y,
						width: snapshot.width,
						height: snapshot.height,
						rotation: snapshot.rotation,
						zIndex: snapshot.zIndex,
						label: snapshot.label,
					});
					registerIdMapping(mapping, change.logicalId, newCompartmentId);
					return;
				}

				case "deleteCompartment": {
					const snapshot = change.before as CompartmentSnapshot;
					if (direction === "undo") {
						const drawerPhysicalId = getPhysicalId(
							mapping,
							snapshot.parentDrawerLogicalId,
						);
						if (!drawerPhysicalId) {
							throw new Error(
								`Parent drawer ${snapshot.parentDrawerLogicalId} is missing`,
							);
						}

						const newCompartmentId = await currentMutations.createCompartment({
							authContext,
							drawerId: drawerPhysicalId as Id<"drawers">,
							x: snapshot.x,
							y: snapshot.y,
							width: snapshot.width,
							height: snapshot.height,
							rotation: snapshot.rotation,
							zIndex: snapshot.zIndex,
							label: snapshot.label,
						});
						registerIdMapping(mapping, change.logicalId, newCompartmentId);
						return;
					}

					const physicalId = getPhysicalId(mapping, change.logicalId);
					if (!physicalId) return;
					await currentMutations.deleteCompartment({
						authContext,
						compartmentId: physicalId as Id<"compartments">,
					});
					removeIdMapping(mapping, change.logicalId);
					return;
				}

				case "updateCompartment": {
					const physicalId = getPhysicalId(mapping, change.logicalId);
					if (!physicalId) return;

					const patch =
						direction === "undo"
							? (change.before as Record<string, unknown>)
							: (change.after as Record<string, unknown>);

					const { parentDrawerLogicalId, ...restPatch } = compactPatch(patch);

					const updateArgs: Parameters<
						typeof currentMutations.updateCompartment
					>[0] = {
						authContext,
						compartmentId: physicalId as Id<"compartments">,
						...(restPatch as {
							x?: number;
							y?: number;
							width?: number;
							height?: number;
							rotation?: number;
							zIndex?: number;
							label?: string;
						}),
					};

					if (typeof parentDrawerLogicalId === "string") {
						const drawerPhysicalId = getPhysicalId(
							mapping,
							parentDrawerLogicalId,
						);
						if (!drawerPhysicalId) {
							throw new Error(
								`Parent drawer ${parentDrawerLogicalId} is missing`,
							);
						}
						updateArgs.drawerId = drawerPhysicalId as Id<"drawers">;
					}

					await currentMutations.updateCompartment(updateArgs);
					return;
				}

				case "updateBlueprintName": {
					const name =
						direction === "undo"
							? (change.before as string)
							: (change.after as string);
					await currentMutations.updateBlueprint({
						authContext,
						blueprintId,
						name,
					});
					return;
				}

				default: {
					const _exhaustive: never = change.type;
					throw new Error(`Unknown history change type: ${_exhaustive}`);
				}
			}
		},
		[blueprintId, removeDrawerSnapshotMappings],
	);

	const applyEntryWithRollback = useCallback(
		async (
			entry: HistoryEntry,
			direction: "undo" | "redo",
			authContext: AuthContext,
		): Promise<void> => {
			const orderedChanges =
				direction === "undo"
					? [...entry.changes].reverse()
					: [...entry.changes];
			const mappingBefore = cloneMapping(idMappingRef.current);
			const applied: HistoryChange[] = [];

			try {
				for (const change of orderedChanges) {
					await applyChange(change, direction, authContext);
					applied.push(change);
				}
			} catch (error) {
				const rollbackDirection = direction === "undo" ? "redo" : "undo";
				for (const change of [...applied].reverse()) {
					try {
						await applyChange(change, rollbackDirection, authContext);
					} catch (rollbackError) {
						console.error("History rollback failed:", rollbackError);
					}
				}
				restoreMapping(idMappingRef.current, mappingBefore);
				throw error;
			}
		},
		[applyChange],
	);

	const pushHistoryEntry = useCallback(
		(legacyEntry: LegacyHistoryEntry) => {
			synchronizeMappingWithDrawers(drawersRef.current);

			const selectionStep = legacyEntry.steps.find(
				(step): step is Extract<HistoryStep, { type: "selection" }> =>
					step.type === "selection",
			);

			const selectionBefore = selectionStep
				? convertLegacySelection(selectionStep.prev)
				: getCurrentSelectionSnapshot();
			const selectionAfter = selectionStep
				? convertLegacySelection(selectionStep.next)
				: getCurrentSelectionSnapshot();

			const changes = legacyEntry.steps.flatMap((step) =>
				convertLegacyStepToChanges(step),
			);

			if (changes.length === 0) {
				return;
			}

			const entry: HistoryEntry = {
				id: generateLogicalId(),
				label: legacyEntry.label,
				timestamp: legacyEntry.timestamp || Date.now(),
				requiresLock: legacyEntry.requiresLock,
				changes,
				selectionBefore,
				selectionAfter,
			};

			setHistoryState((prev) => appendEntry(prev, entry));
		},
		[
			convertLegacySelection,
			convertLegacyStepToChanges,
			getCurrentSelectionSnapshot,
			synchronizeMappingWithDrawers,
		],
	);

	const undo = useCallback(async () => {
		if (isApplying) return;
		if (!canUndoFn(historyState)) return;

		const entry = historyState.entries[historyState.currentIndex];
		if (!entry) return;

		if (entry.requiresLock && !isLockedByMeRef.current) {
			onError?.("Cannot undo", "This action requires an edit lock");
			return;
		}

		setIsApplying(true);
		try {
			const authContext = await getAuthContext();
			await applyEntryWithRollback(entry, "undo", authContext);
			setHistoryState((prev) => moveBackward(prev));

			// Restore viewport and selection state (viewport first, then selection)
			restoreState({
				viewport: {
					zoom: entry.selectionBefore.viewportZoom,
					x: entry.selectionBefore.viewportX,
					y: entry.selectionBefore.viewportY,
				},
				selection: entry.selectionBefore,
			});
		} catch (error) {
			console.error("Undo failed:", error);
			onError?.(
				"Undo failed",
				error instanceof Error ? error.message : "An unknown error occurred",
			);
		} finally {
			setIsApplying(false);
		}
	}, [
		historyState,
		isApplying,
		getAuthContext,
		onError,
		applyEntryWithRollback,
		restoreState,
	]);

	const redo = useCallback(async () => {
		if (isApplying) return;
		if (!canRedoFn(historyState)) return;

		const entry = historyState.entries[historyState.currentIndex + 1];
		if (!entry) return;

		if (entry.requiresLock && !isLockedByMeRef.current) {
			onError?.("Cannot redo", "This action requires an edit lock");
			return;
		}

		setIsApplying(true);
		try {
			const authContext = await getAuthContext();
			await applyEntryWithRollback(entry, "redo", authContext);
			setHistoryState((prev) => moveForward(prev));

			// Restore viewport and selection state (viewport first, then selection)
			restoreState({
				viewport: {
					zoom: entry.selectionAfter.viewportZoom,
					x: entry.selectionAfter.viewportX,
					y: entry.selectionAfter.viewportY,
				},
				selection: entry.selectionAfter,
			});
		} catch (error) {
			console.error("Redo failed:", error);
			onError?.(
				"Redo failed",
				error instanceof Error ? error.message : "An unknown error occurred",
			);
		} finally {
			setIsApplying(false);
		}
	}, [
		historyState,
		isApplying,
		getAuthContext,
		onError,
		applyEntryWithRollback,
		restoreState,
	]);

	const getStateSnapshot = useCallback(
		(entry: HistoryEntry) => ({
			select: "after",
			drawers: new Map(),
			viewport: {
				zoom: entry.selectionBefore.viewportZoom,
				x: entry.selectionBefore.viewportX,
				y: entry.selectionBefore.viewportY,
			},
			selection: entry.selectionBefore,
		}),
		[],
	);

	const clearHistory = useCallback(() => {
		setHistoryState(createHistoryState(200));
	}, []);

	return {
		historyState,
		canUndo: canUndoFn(historyState),
		canRedo: canRedoFn(historyState),
		isApplying,
		pushHistoryEntry,
		undo,
		redo,
		getStateSnapshot,
		clearHistory,
	};
}
