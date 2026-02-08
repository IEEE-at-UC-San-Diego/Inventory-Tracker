import type { HistoryStep } from "@/hooks/useBlueprintHistory.types";
import type { Compartment, Drawer, DrawerWithCompartments } from "@/types";
import type { AuthContext } from "@/types/auth";
import type { Id } from "../../../../../convex/_generated/dataModel";

export interface ToastLike {
	success: (title: string, description?: string) => void;
	error: (title: string, description?: string) => void;
	info: (title: string, description?: string) => void;
}

export interface PushHistoryEntryFn {
	(entry: {
		label: string;
		requiresLock: boolean;
		steps: HistoryStep[];
		timestamp: number;
	}): void;
}

export interface DrawerMutationFns {
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
	}) => Promise<boolean | void>;
	deleteDrawer: (args: {
		authContext: AuthContext;
		drawerId: Id<"drawers">;
	}) => Promise<boolean | void>;
	createCompartment: (args: {
		authContext: AuthContext;
		drawerId: Id<"drawers">;
		x: number;
		y: number;
		width: number;
		height: number;
		rotation?: number;
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
		label?: string;
	}) => Promise<boolean | void>;
}

export const DRAWER_GRID_SIZE = 50;

export function snapToGrid(value: number): number {
	return Math.round(value / DRAWER_GRID_SIZE) * DRAWER_GRID_SIZE;
}

export function snapCenterToGridEdges(center: number, size: number): number {
	const half = size / 2;
	const snappedTopLeft = snapToGrid(center - half);
	return snappedTopLeft + half;
}

interface CreateDrawerWithHistoryArgs {
	drawerData: Partial<Drawer>;
	drawers: DrawerWithCompartments[];
	blueprintId: Id<"blueprints">;
	getRequiredAuthContext: () => Promise<AuthContext>;
	createDrawer: DrawerMutationFns["createDrawer"];
	pushHistoryEntry: PushHistoryEntryFn;
	toast: ToastLike;
}

export async function createDrawerWithHistory({
	drawerData,
	drawers,
	blueprintId,
	getRequiredAuthContext,
	createDrawer,
	pushHistoryEntry,
	toast,
}: CreateDrawerWithHistoryArgs): Promise<boolean> {
	try {
		const context = await getRequiredAuthContext();
		const rawX = drawerData.x ?? 100;
		const rawY = drawerData.y ?? 100;
		const rawWidth = drawerData.width ?? 150;
		const rawHeight = drawerData.height ?? 100;
		const rotation = drawerData.rotation ?? 0;
		const label = drawerData.label;

		const width = Math.max(DRAWER_GRID_SIZE, snapToGrid(rawWidth));
		const height = Math.max(DRAWER_GRID_SIZE, snapToGrid(rawHeight));
		const x = snapCenterToGridEdges(rawX, width);
		const y = snapCenterToGridEdges(rawY, height);

		const overlapsExisting = drawers.some((other) => {
			const overlapX = Math.abs(x - other.x) < width / 2 + other.width / 2;
			const overlapY = Math.abs(y - other.y) < height / 2 + other.height / 2;
			return overlapX && overlapY;
		});
		if (overlapsExisting) {
			toast.error("Cannot create drawer", "New drawers cannot overlap");
			return false;
		}

		const drawerId = await createDrawer({
			authContext: context,
			blueprintId,
			x,
			y,
			width,
			height,
			rotation,
			label,
		});
		pushHistoryEntry({
			label: "Create drawer",
			requiresLock: true,
			steps: [
				{
					type: "createDrawer",
					blueprintId: blueprintId as string,
					args: {
						x,
						y,
						width,
						height,
						rotation,
						label,
					},
					drawerId: drawerId as unknown as string,
				},
			],
			timestamp: Date.now(),
		});
		toast.success("Drawer created");
		return true;
	} catch (error) {
		toast.error(
			"Failed to create drawer",
			error instanceof Error ? error.message : "An error occurred",
		);
		return false;
	}
}

interface DeleteDrawersWithHistoryArgs {
	drawerIds: string[];
	drawers: DrawerWithCompartments[];
	getRequiredAuthContext: () => Promise<AuthContext>;
	deleteDrawer: DrawerMutationFns["deleteDrawer"];
	pushHistoryEntry: PushHistoryEntryFn;
	setSelectionCleared: () => void;
	setHasChanges: (value: boolean) => void;
	toast: ToastLike;
}

export async function deleteDrawersWithHistory({
	drawerIds,
	drawers,
	getRequiredAuthContext,
	deleteDrawer,
	pushHistoryEntry,
	setSelectionCleared,
	setHasChanges,
	toast,
}: DeleteDrawersWithHistoryArgs): Promise<boolean> {
	const uniqueDrawerIds = Array.from(new Set(drawerIds));
	if (uniqueDrawerIds.length === 0) return false;

	try {
		const context = await getRequiredAuthContext();
		const steps: HistoryStep[] = [];

		for (const drawerId of uniqueDrawerIds) {
			const snapshot = drawers.find((d) => d._id === drawerId) ?? null;
			if (!snapshot) continue;

			await deleteDrawer({
				authContext: context,
				drawerId: drawerId as Id<"drawers">,
			});
			steps.push({
				type: "deleteDrawer",
				snapshot,
				currentDrawerId: drawerId,
			});
		}

		if (steps.length === 0) return false;

		setSelectionCleared();
		pushHistoryEntry({
			label:
				steps.length === 1 ? "Delete drawer" : `Delete ${steps.length} drawers`,
			requiresLock: true,
			steps,
			timestamp: Date.now(),
		});
		setHasChanges(true);
		toast.success(
			steps.length === 1 ? "Drawer deleted" : `${steps.length} drawers deleted`,
		);
		return true;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "An error occurred";
		const inventoryBlockedDelete =
			errorMessage.includes("Cannot delete drawer") &&
			errorMessage.includes("contains inventory");
		if (inventoryBlockedDelete) {
			toast.error(
				"Cannot delete drawer",
				"Inventory must be removed or reassigned from this drawer's compartments before deletion.",
			);
			return false;
		}
		toast.error(
			"Failed to delete drawer",
			errorMessage,
		);
		return false;
	}
}

interface UpdateDrawerWithHistoryArgs {
	drawerId: string;
	updates: Partial<Drawer>;
	drawers: DrawerWithCompartments[];
	getRequiredAuthContext: () => Promise<AuthContext>;
	updateDrawer: DrawerMutationFns["updateDrawer"];
	updateCompartment: DrawerMutationFns["updateCompartment"];
	pushHistoryEntry: PushHistoryEntryFn;
	setHasChanges: (value: boolean) => void;
	toast: ToastLike;
}

export async function updateDrawerWithHistory({
	drawerId,
	updates,
	drawers,
	getRequiredAuthContext,
	updateDrawer,
	updateCompartment,
	pushHistoryEntry,
	setHasChanges,
	toast,
}: UpdateDrawerWithHistoryArgs): Promise<boolean> {
	const drawer = drawers.find((d) => d._id === drawerId);
	if (!drawer) return false;

	const prev: Partial<Drawer> = {};
	const next: Partial<Drawer> = {};
	for (const [key, value] of Object.entries(updates) as Array<
		[keyof Drawer, Drawer[keyof Drawer]]
	>) {
		if (value === undefined) continue;
		prev[key] = drawer[key] as never;
		next[key] = value as never;
	}

	const newW = updates.width ?? drawer.width;
	const newH = updates.height ?? drawer.height;
	const willScaleCompartments = newW !== drawer.width || newH !== drawer.height;

	try {
		const context = await getRequiredAuthContext();
		const steps: HistoryStep[] = [];
		if (Object.keys(next).length > 0) {
			await updateDrawer({
				authContext: context,
				drawerId: drawerId as Id<"drawers">,
				...next,
			});
			steps.push({
				type: "updateDrawer",
				drawerId,
				prev,
				next,
			});
		}

		if (willScaleCompartments && drawer.compartments.length > 0) {
			const halfW = newW / 2;
			const halfH = newH / 2;

			// Detect grid structure by finding unique column/row boundaries
			// Compartment coordinates are relative to drawer center
			const SNAP_TOLERANCE = 2;
			const snapGroup = (values: number[]) => {
				const sorted = [...values].sort((a, b) => a - b);
				const groups: number[] = [];
				for (const v of sorted) {
					if (groups.length === 0 || Math.abs(v - groups[groups.length - 1]) > SNAP_TOLERANCE) {
						groups.push(v);
					}
				}
				return groups;
			};

			// Collect left edges and top edges of compartments in drawer-local coords
			const leftEdges = drawer.compartments.map((c) => c.x - c.width / 2);
			const topEdges = drawer.compartments.map((c) => c.y - c.height / 2);
			const rightEdges = drawer.compartments.map((c) => c.x + c.width / 2);
			const bottomEdges = drawer.compartments.map((c) => c.y + c.height / 2);

			// Find unique column start positions and row start positions
			const colStarts = snapGroup(leftEdges);
			const rowStarts = snapGroup(topEdges);

			// For each column, find its right edge (max right edge of compartments starting in that column)
			const colEnds: number[] = colStarts.map((cs) => {
				let maxRight = cs + DRAWER_GRID_SIZE;
				for (let k = 0; k < drawer.compartments.length; k++) {
					if (Math.abs(leftEdges[k] - cs) <= SNAP_TOLERANCE) {
						maxRight = Math.max(maxRight, rightEdges[k]);
					}
				}
				return maxRight;
			});

			// For each row, find its bottom edge
			const rowEnds: number[] = rowStarts.map((rs) => {
				let maxBottom = rs + DRAWER_GRID_SIZE;
				for (let k = 0; k < drawer.compartments.length; k++) {
					if (Math.abs(topEdges[k] - rs) <= SNAP_TOLERANCE) {
						maxBottom = Math.max(maxBottom, bottomEdges[k]);
					}
				}
				return maxBottom;
			});

			// Compute proportional widths for each column and heights for each row
			const totalOldW = drawer.width;
			const totalOldH = drawer.height;
			const colWidths = colStarts.map((cs, i) => colEnds[i] - cs);
			const rowHeights = rowStarts.map((rs, i) => rowEnds[i] - rs);
			const colWidthSum = colWidths.reduce((a, b) => a + b, 0);
			const rowHeightSum = rowHeights.reduce((a, b) => a + b, 0);

			// Distribute new drawer dimensions across columns/rows proportionally
			// Each column gets at least DRAWER_GRID_SIZE
			const newColWidths = colWidths.map((w) =>
				Math.max(DRAWER_GRID_SIZE, Math.floor((w / (colWidthSum || totalOldW)) * newW / DRAWER_GRID_SIZE) * DRAWER_GRID_SIZE),
			);
			const newRowHeights = rowHeights.map((h) =>
				Math.max(DRAWER_GRID_SIZE, Math.floor((h / (rowHeightSum || totalOldH)) * newH / DRAWER_GRID_SIZE) * DRAWER_GRID_SIZE),
			);

			// Distribute any remaining space to the last column/row
			const usedW = newColWidths.reduce((a, b) => a + b, 0);
			const usedH = newRowHeights.reduce((a, b) => a + b, 0);
			if (newColWidths.length > 0) {
				newColWidths[newColWidths.length - 1] += newW - usedW;
			}
			if (newRowHeights.length > 0) {
				newRowHeights[newRowHeights.length - 1] += newH - usedH;
			}

			// Compute new column start positions (left edges in new drawer-local coords)
			const newColStarts: number[] = [];
			let cx = -halfW;
			for (const w of newColWidths) {
				newColStarts.push(cx);
				cx += w;
			}
			const newRowStarts: number[] = [];
			let cy = -halfH;
			for (const h of newRowHeights) {
				newRowStarts.push(cy);
				cy += h;
			}

			// Map each compartment to its grid cell and compute new position/size
			const scaled: Array<{
				comp: Compartment;
				x: number;
				y: number;
				width: number;
				height: number;
			}> = [];

			for (const comp of drawer.compartments) {
				const compLeft = comp.x - comp.width / 2;
				const compTop = comp.y - comp.height / 2;

				// Find which column and row this compartment belongs to
				let colIdx = 0;
				for (let k = 0; k < colStarts.length; k++) {
					if (Math.abs(compLeft - colStarts[k]) <= SNAP_TOLERANCE) {
						colIdx = k;
						break;
					}
				}
				let rowIdx = 0;
				for (let k = 0; k < rowStarts.length; k++) {
					if (Math.abs(compTop - rowStarts[k]) <= SNAP_TOLERANCE) {
						rowIdx = k;
						break;
					}
				}

				// Determine how many columns/rows this compartment spans
				const compRight = comp.x + comp.width / 2;
				const compBottom = comp.y + comp.height / 2;
				let colSpan = 1;
				for (let k = colIdx + 1; k < colStarts.length; k++) {
					if (colStarts[k] < compRight - SNAP_TOLERANCE) {
						colSpan++;
					} else {
						break;
					}
				}
				let rowSpan = 1;
				for (let k = rowIdx + 1; k < rowStarts.length; k++) {
					if (rowStarts[k] < compBottom - SNAP_TOLERANCE) {
						rowSpan++;
					} else {
						break;
					}
				}

				// Compute new size from spanned columns/rows
				let newCompW = 0;
				for (let k = colIdx; k < colIdx + colSpan && k < newColWidths.length; k++) {
					newCompW += newColWidths[k];
				}
				let newCompH = 0;
				for (let k = rowIdx; k < rowIdx + rowSpan && k < newRowHeights.length; k++) {
					newCompH += newRowHeights[k];
				}
				newCompW = Math.max(DRAWER_GRID_SIZE, newCompW);
				newCompH = Math.max(DRAWER_GRID_SIZE, newCompH);

				// Compute new center position
				const newLeft = newColStarts[colIdx] ?? -halfW;
				const newTop = newRowStarts[rowIdx] ?? -halfH;
				const newCenterX = newLeft + newCompW / 2;
				const newCenterY = newTop + newCompH / 2;

				// Clamp within drawer bounds
				const clampedX = Math.max(
					-halfW + newCompW / 2,
					Math.min(halfW - newCompW / 2, newCenterX),
				);
				const clampedY = Math.max(
					-halfH + newCompH / 2,
					Math.min(halfH - newCompH / 2, newCenterY),
				);

				scaled.push({
					comp,
					x: clampedX,
					y: clampedY,
					width: newCompW,
					height: newCompH,
				});
			}

			// Persist all compartment updates
			for (const entry of scaled) {
				const compPrev: Partial<Compartment> = {
					x: entry.comp.x,
					y: entry.comp.y,
					width: entry.comp.width,
					height: entry.comp.height,
				};
				const compNext: Partial<Compartment> = {
					x: entry.x,
					y: entry.y,
					width: entry.width,
					height: entry.height,
				};

				await updateCompartment({
					authContext: context,
					compartmentId: entry.comp._id as Id<"compartments">,
					x: compNext.x,
					y: compNext.y,
					width: compNext.width,
					height: compNext.height,
				});

				steps.push({
					type: "updateCompartment",
					compartmentId: entry.comp._id,
					prev: compPrev,
					next: compNext,
				});
			}
		}

		if (steps.length > 0) {
			pushHistoryEntry({
				label: "Update drawer",
				requiresLock: true,
				steps,
				timestamp: Date.now(),
			});
		}

		setHasChanges(true);
		return true;
	} catch (error) {
		toast.error(
			"Failed to update drawer",
			error instanceof Error ? error.message : "An error occurred",
		);
		return false;
	}
}

interface UpdateDrawersBulkWithHistoryArgs {
	updates: Array<{ drawerId: string; x: number; y: number }>;
	drawers: DrawerWithCompartments[];
	getRequiredAuthContext: () => Promise<AuthContext>;
	updateDrawer: DrawerMutationFns["updateDrawer"];
	pushHistoryEntry: PushHistoryEntryFn;
	setHasChanges: (value: boolean) => void;
	toast: ToastLike;
}

export async function updateDrawersBulkWithHistory({
	updates,
	drawers,
	getRequiredAuthContext,
	updateDrawer,
	pushHistoryEntry,
	setHasChanges,
	toast,
}: UpdateDrawersBulkWithHistoryArgs): Promise<boolean> {
	if (updates.length === 0) return false;

	const nextById = new Map(
		updates.map((u) => [u.drawerId, { x: u.x, y: u.y }]),
	);

	for (let i = 0; i < drawers.length; i++) {
		const a = drawers[i];
		const ax = nextById.get(a._id)?.x ?? a.x;
		const ay = nextById.get(a._id)?.y ?? a.y;
		const aHalfW = a.width / 2;
		const aHalfH = a.height / 2;

		for (let j = i + 1; j < drawers.length; j++) {
			const b = drawers[j];
			const bx = nextById.get(b._id)?.x ?? b.x;
			const by = nextById.get(b._id)?.y ?? b.y;
			const bHalfW = b.width / 2;
			const bHalfH = b.height / 2;

			const overlapX = Math.abs(ax - bx) < aHalfW + bHalfW;
			const overlapY = Math.abs(ay - by) < aHalfH + bHalfH;
			if (overlapX && overlapY) {
				return false;
			}
		}
	}

	try {
		const context = await getRequiredAuthContext();
		const steps: HistoryStep[] = [];

		for (const update of updates) {
			const drawer = drawers.find((d) => d._id === update.drawerId);
			if (!drawer) continue;

			await updateDrawer({
				authContext: context,
				drawerId: update.drawerId as Id<"drawers">,
				x: update.x,
				y: update.y,
			});

			steps.push({
				type: "updateDrawer",
				drawerId: update.drawerId,
				prev: { x: drawer.x, y: drawer.y },
				next: { x: update.x, y: update.y },
			});
		}

		if (steps.length > 0) {
			pushHistoryEntry({
				label: "Move drawers",
				requiresLock: true,
				steps,
				timestamp: Date.now(),
			});
		}

		setHasChanges(true);
		return true;
	} catch (error) {
		toast.error(
			"Failed to move drawers",
			error instanceof Error ? error.message : "An error occurred",
		);
		return false;
	}
}
