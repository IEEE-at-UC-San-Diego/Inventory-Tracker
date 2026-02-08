/**
 * Centralized History Management System
 *
 * This module provides a robust, reliable undo/redo mechanism for the blueprint editor.
 * It addresses the following critical issues found in the previous implementation:
 *
 * 1. ID Stability: Uses stable logical IDs mapped to physical IDs
 * 2. Complete Snapshots: Stores complete state for accurate restoration
 * 3. Transaction Safety: All history operations are atomic
 * 4. Reference Integrity: Properly handles cascading changes
 */

import type { Drawer, Compartment } from "@/types";

// =============================================================================
// Types
// =============================================================================

/** Unique identifier for history entries */
export type HistoryEntryId = string;

/** Stable logical ID used within history (independent of database IDs) */
export type LogicalId = string;

/** Physical database ID */
export type PhysicalId = string;

/**
 * Maps logical IDs to physical IDs.
 * This is crucial because when we recreate entities (undo delete, redo create),
 * the database assigns new IDs, but history entries still reference the old logical IDs.
 */
export interface IdMapping {
	logicalToPhysical: Map<LogicalId, PhysicalId>;
	physicalToLogical: Map<PhysicalId, LogicalId>;
}

/** Complete snapshot of a drawer with all its compartments */
export interface DrawerSnapshot {
	logicalId: LogicalId;
	blueprintId: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	zIndex: number;
	gridRows?: number;
	gridCols?: number;
	label?: string;
	compartments: CompartmentSnapshot[];
}

/** Complete snapshot of a compartment */
export interface CompartmentSnapshot {
	logicalId: LogicalId;
	parentDrawerLogicalId: LogicalId;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	zIndex: number;
	label?: string;
}

/** Complete snapshot of a divider line */
export interface DividerSnapshot {
	logicalId: LogicalId;
	blueprintId: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	thickness: number;
}

/** Snapshot of a grid operation (before/after full compartment state) */
export interface GridOperationSnapshot {
	drawerLogicalId: LogicalId;
	beforeGridRows?: number;
	beforeGridCols?: number;
	afterGridRows: number;
	afterGridCols: number;
	beforeCompartments: CompartmentSnapshot[];
	afterCompartments: CompartmentSnapshot[];
	deletedCompartments: CompartmentSnapshot[];
	createdCompartments: CompartmentSnapshot[];
}

/** Complete snapshot of blueprint state for history */
export interface BlueprintStateSnapshot {
	name: string;
	drawers: Map<LogicalId, DrawerSnapshot>;
}

/** Types of history operations */
export type HistoryOperationType =
	| "createDrawer"
	| "deleteDrawer"
	| "updateDrawer"
	| "createCompartment"
	| "deleteCompartment"
	| "updateCompartment"
	| "bulkUpdate"
	| "updateBlueprintName"
	| "createDivider"
	| "deleteDivider"
	| "updateDivider"
	| "setGrid";

/** A single atomic change within a history entry */
export interface HistoryChange {
	/** Type of operation */
	type: HistoryOperationType;
	/** Logical ID of the affected entity */
	logicalId: LogicalId;
	/** Entity type */
	entityType: "drawer" | "compartment" | "blueprint" | "divider";
	/** State before the change (for undo) */
	before: unknown;
	/** State after the change (for redo) */
	after: unknown;
}

/** A history entry represents a user action that can be undone/redone */
export interface HistoryEntry {
	/** Unique identifier for this entry */
	id: HistoryEntryId;
	/** Human-readable description */
	label: string;
	/** Timestamp when the action occurred */
	timestamp: number;
	/** Whether this action requires an edit lock */
	requiresLock: boolean;
	/** The atomic changes that make up this entry */
	changes: HistoryChange[];
	/** Selection state before the action */
	selectionBefore: SelectionSnapshot;
	/** Selection state after the action */
	selectionAfter: SelectionSnapshot;
}

/** Snapshot of selection state */
export interface SelectionSnapshot {
	selectedDrawerIds: LogicalId[];
	selectedCompartmentId: LogicalId | null;
	viewportZoom: number;
	viewportX: number;
	viewportY: number;
}

/** Current state of the history system */
export interface HistoryState {
	/** All history entries */
	entries: HistoryEntry[];
	/** Current position in history (-1 means at beginning, before any actions) */
	currentIndex: number;
	/** Maximum number of entries to keep */
	maxEntries: number;
}

/** Result of applying a history entry */
export interface ApplyResult {
	success: boolean;
	error?: string;
	/** New ID mappings created during the operation */
	newMappings?: Map<LogicalId, PhysicalId>;
}

// =============================================================================
// ID Management
// =============================================================================

let logicalIdCounter = 0;

/**
 * Generate a new unique logical ID.
 * These IDs are stable across undo/redo operations.
 */
export function generateLogicalId(): LogicalId {
	return `hist-${Date.now()}-${++logicalIdCounter}`;
}

/**
 * Create a new empty ID mapping.
 */
export function createIdMapping(): IdMapping {
	return {
		logicalToPhysical: new Map(),
		physicalToLogical: new Map(),
	};
}

/**
 * Register a mapping between a logical ID and a physical ID.
 */
export function registerIdMapping(
	mapping: IdMapping,
	logicalId: LogicalId,
	physicalId: PhysicalId,
): void {
	mapping.logicalToPhysical.set(logicalId, physicalId);
	mapping.physicalToLogical.set(physicalId, logicalId);
}

/**
 * Get the physical ID for a logical ID.
 * Returns the logical ID itself if no mapping exists (for entities not yet persisted).
 */
export function getPhysicalId(
	mapping: IdMapping,
	logicalId: LogicalId,
): PhysicalId | undefined {
	return mapping.logicalToPhysical.get(logicalId);
}

/**
 * Get the logical ID for a physical ID.
 */
export function getLogicalId(
	mapping: IdMapping,
	physicalId: PhysicalId,
): LogicalId | undefined {
	return mapping.physicalToLogical.get(physicalId);
}

/**
 * Remove a mapping.
 */
export function removeIdMapping(
	mapping: IdMapping,
	logicalId: LogicalId,
): void {
	const physicalId = mapping.logicalToPhysical.get(logicalId);
	if (physicalId) {
		mapping.physicalToLogical.delete(physicalId);
	}
	mapping.logicalToPhysical.delete(logicalId);
}

// =============================================================================
// Snapshot Creation
// =============================================================================

/**
 * Create a complete snapshot of a drawer and its compartments.
 */
export function createDrawerSnapshot(
	drawer: Drawer & { compartments: Compartment[] },
	mapping: IdMapping,
): DrawerSnapshot {
	let logicalId = getLogicalId(mapping, drawer._id);
	if (!logicalId) {
		logicalId = generateLogicalId();
		registerIdMapping(mapping, logicalId, drawer._id);
	}

	return {
		logicalId,
		blueprintId: drawer.blueprintId,
		x: drawer.x,
		y: drawer.y,
		width: drawer.width,
		height: drawer.height,
		rotation: drawer.rotation,
		zIndex: drawer.zIndex,
		gridRows: drawer.gridRows,
		gridCols: drawer.gridCols,
		label: drawer.label,
		compartments: drawer.compartments.map((comp) =>
			createCompartmentSnapshot(comp, logicalId, mapping),
		),
	};
}

/**
 * Create a complete snapshot of a compartment.
 */
export function createCompartmentSnapshot(
	compartment: Compartment,
	parentDrawerLogicalId: LogicalId,
	mapping: IdMapping,
): CompartmentSnapshot {
	let logicalId = getLogicalId(mapping, compartment._id);
	if (!logicalId) {
		logicalId = generateLogicalId();
		registerIdMapping(mapping, logicalId, compartment._id);
	}

	return {
		logicalId,
		parentDrawerLogicalId,
		x: compartment.x,
		y: compartment.y,
		width: compartment.width,
		height: compartment.height,
		rotation: compartment.rotation,
		zIndex: compartment.zIndex,
		label: compartment.label,
	};
}

/**
 * Create a snapshot of the current selection state.
 */
export function createSelectionSnapshot(
	selectedDrawerIds: string[],
	selectedElement: { type: "drawer" | "compartment" | "divider"; id: string } | null,
	mapping: IdMapping,
	viewport?: { zoom: number; x: number; y: number },
): SelectionSnapshot {
	return {
		selectedDrawerIds: selectedDrawerIds
			.map((id) => getLogicalId(mapping, id))
			.filter((id): id is LogicalId => id !== undefined),
		selectedCompartmentId:
			selectedElement?.type === "compartment"
				? (getLogicalId(mapping, selectedElement.id) ?? null)
				: null,
		viewportZoom: viewport?.zoom ?? 1,
		viewportX: viewport?.x ?? 0,
		viewportY: viewport?.y ?? 0,
	};
}

// =============================================================================
// History State Management
// =============================================================================

/**
 * Create initial history state.
 */
export function createHistoryState(maxEntries = 200): HistoryState {
	return {
		entries: [],
		currentIndex: -1,
		maxEntries,
	};
}

/**
 * Check if undo is available.
 */
export function canUndo(state: HistoryState): boolean {
	return state.currentIndex >= 0;
}

/**
 * Check if redo is available.
 */
export function canRedo(state: HistoryState): boolean {
	return state.currentIndex < state.entries.length - 1;
}

/**
 * Push a new entry to history, truncating any redo entries.
 */
export function pushEntry(
	state: HistoryState,
	entry: Omit<HistoryEntry, "id" | "timestamp">,
): HistoryState {
	// Truncate entries after current index
	const truncatedEntries = state.entries.slice(0, state.currentIndex + 1);

	// Create the new entry
	const newEntry: HistoryEntry = {
		...entry,
		id: generateLogicalId(),
		timestamp: Date.now(),
	};

	// Add new entry
	const newEntries = [...truncatedEntries, newEntry];

	// Enforce max entries limit
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

/**
 * Move to the previous entry (undo).
 */
export function moveBackward(state: HistoryState): HistoryState {
	if (!canUndo(state)) return state;
	return {
		...state,
		currentIndex: state.currentIndex - 1,
	};
}

/**
 * Move to the next entry (redo).
 */
export function moveForward(state: HistoryState): HistoryState {
	if (!canRedo(state)) return state;
	return {
		...state,
		currentIndex: state.currentIndex + 1,
	};
}

// =============================================================================
// History Entry Builders
// =============================================================================

/**
 * Builder for creating history entries with multiple changes.
 */
export class HistoryEntryBuilder {
	private changes: HistoryChange[] = [];
	private label = "";
	private requiresLock = false;
	private selectionBefore: SelectionSnapshot = {
		selectedDrawerIds: [],
		selectedCompartmentId: null,
		viewportZoom: 1,
		viewportX: 0,
		viewportY: 0,
	};
	private selectionAfter: SelectionSnapshot = {
		selectedDrawerIds: [],
		selectedCompartmentId: null,
		viewportZoom: 1,
		viewportX: 0,
		viewportY: 0,
	};

	setLabel(label: string): this {
		this.label = label;
		return this;
	}

	setRequiresLock(requires: boolean): this {
		this.requiresLock = requires;
		return this;
	}

	setSelectionBefore(snapshot: SelectionSnapshot): this {
		this.selectionBefore = snapshot;
		return this;
	}

	setSelectionAfter(snapshot: SelectionSnapshot): this {
		this.selectionAfter = snapshot;
		return this;
	}

	addChange(change: HistoryChange): this {
		this.changes.push(change);
		return this;
	}

	addDrawerCreate(snapshot: DrawerSnapshot, logicalId: LogicalId): this {
		return this.addChange({
			type: "createDrawer",
			logicalId,
			entityType: "drawer",
			before: null,
			after: snapshot,
		});
	}

	addDrawerDelete(snapshot: DrawerSnapshot, logicalId: LogicalId): this {
		return this.addChange({
			type: "deleteDrawer",
			logicalId,
			entityType: "drawer",
			before: snapshot,
			after: null,
		});
	}

	addDrawerUpdate(
		logicalId: LogicalId,
		before: Partial<DrawerSnapshot>,
		after: Partial<DrawerSnapshot>,
	): this {
		return this.addChange({
			type: "updateDrawer",
			logicalId,
			entityType: "drawer",
			before,
			after,
		});
	}

	addCompartmentCreate(
		snapshot: CompartmentSnapshot,
		logicalId: LogicalId,
	): this {
		return this.addChange({
			type: "createCompartment",
			logicalId,
			entityType: "compartment",
			before: null,
			after: snapshot,
		});
	}

	addCompartmentDelete(
		snapshot: CompartmentSnapshot,
		logicalId: LogicalId,
	): this {
		return this.addChange({
			type: "deleteCompartment",
			logicalId,
			entityType: "compartment",
			before: snapshot,
			after: null,
		});
	}

	addCompartmentUpdate(
		logicalId: LogicalId,
		before: Partial<CompartmentSnapshot>,
		after: Partial<CompartmentSnapshot>,
	): this {
		return this.addChange({
			type: "updateCompartment",
			logicalId,
			entityType: "compartment",
			before,
			after,
		});
	}

	addBlueprintNameChange(before: string, after: string): this {
		return this.addChange({
			type: "updateBlueprintName",
			logicalId: "blueprint",
			entityType: "blueprint",
			before,
			after,
		});
	}

	addDividerCreate(snapshot: DividerSnapshot, logicalId: LogicalId): this {
		return this.addChange({
			type: "createDivider",
			logicalId,
			entityType: "divider",
			before: null,
			after: snapshot,
		});
	}

	addDividerDelete(snapshot: DividerSnapshot, logicalId: LogicalId): this {
		return this.addChange({
			type: "deleteDivider",
			logicalId,
			entityType: "divider",
			before: snapshot,
			after: null,
		});
	}

	addDividerUpdate(
		logicalId: LogicalId,
		before: Partial<DividerSnapshot>,
		after: Partial<DividerSnapshot>,
	): this {
		return this.addChange({
			type: "updateDivider",
			logicalId,
			entityType: "divider",
			before,
			after,
		});
	}

	addGridOperation(snapshot: GridOperationSnapshot): this {
		return this.addChange({
			type: "setGrid",
			logicalId: snapshot.drawerLogicalId,
			entityType: "drawer",
			before: snapshot,
			after: snapshot,
		});
	}

	build(): Omit<HistoryEntry, "id" | "timestamp"> {
		if (!this.label) {
			throw new Error("History entry must have a label");
		}
		if (this.changes.length === 0) {
			throw new Error("History entry must have at least one change");
		}
		return {
			label: this.label,
			requiresLock: this.requiresLock,
			changes: this.changes,
			selectionBefore: this.selectionBefore,
			selectionAfter: this.selectionAfter,
		};
	}
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the current entry (the one that would be undone next).
 */
export function getCurrentEntry(state: HistoryState): HistoryEntry | undefined {
	if (!canUndo(state)) return undefined;
	return state.entries[state.currentIndex];
}

/**
 * Get the next entry (the one that would be redone next).
 */
export function getNextEntry(state: HistoryState): HistoryEntry | undefined {
	if (!canRedo(state)) return undefined;
	return state.entries[state.currentIndex + 1];
}

/**
 * Get all entries for display in the history panel.
 */
export function getEntriesForDisplay(state: HistoryState): HistoryEntry[] {
	return state.entries;
}

/**
 * Check if an entry is currently active (has been applied).
 */
export function isEntryActive(
	state: HistoryState,
	entryIndex: number,
): boolean {
	return entryIndex <= state.currentIndex;
}
