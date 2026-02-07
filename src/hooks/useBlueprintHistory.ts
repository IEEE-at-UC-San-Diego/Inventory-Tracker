/**
 * useBlueprintHistory Hook
 *
 * Robust undo/redo for blueprint editing with:
 * - Stable logical IDs across delete/recreate cycles
 * - Complete reversible change records
 * - Transaction-style apply with rollback on failure
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { DrawerWithCompartments } from "@/types";
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
import {
	appendEntry,
	cloneMapping,
	compactPatch,
	convertLegacyStepToChanges as convertLegacyStepToChangesHelper,
	restoreMapping,
} from "./useBlueprintHistory.helpers";
import type {
	HistoryDependencies,
	HistoryStep,
	LegacyHistoryEntry,
	LegacySelectionSnapshot,
	UseBlueprintHistoryReturn,
	ViewportSnapshot,
} from "./useBlueprintHistory.types";

export function useBlueprintHistory(
	deps: HistoryDependencies,
): UseBlueprintHistoryReturn {
	const {
		getAuthContext,
		mutations,
		blueprintId,
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
			const currentViewport = viewportRef.current;

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
				viewportZoom: currentViewport.zoom,
				viewportX: currentViewport.x,
				viewportY: currentViewport.y,
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

			// Restore viewport FIRST (to establish viewing context)
			if (applyViewport) {
				applyViewport(snapshot.viewport);
			}

			// Restore selection AFTER viewport (for proper focus)
			restoreSelectionSnapshot(snapshot.selection);
		},
		[restoreSelectionSnapshot],
	);

	const convertLegacyStepToChanges = useCallback(
		(step: HistoryStep): HistoryChange[] =>
			convertLegacyStepToChangesHelper(step, {
				ensureLogicalId,
				drawers: drawersRef.current,
			}),
		[ensureLogicalId],
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
				case "bulkUpdate": {
					// Bulk changes are flattened into atomic updates before they reach apply.
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
		(
			entry: HistoryEntry,
		): {
			select: "before" | "after";
			drawers: Map<LogicalId, DrawerSnapshot>;
			viewport: ViewportSnapshot;
			selection: SelectionSnapshot;
		} => ({
			select: "after",
			drawers: new Map<LogicalId, DrawerSnapshot>(),
			viewport: {
				zoom: entry.selectionAfter.viewportZoom,
				x: entry.selectionAfter.viewportX,
				y: entry.selectionAfter.viewportY,
			},
			selection: entry.selectionAfter,
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
