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
	}) => Promise<void>;
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
		toast.error(
			"Failed to delete drawer",
			error instanceof Error ? error.message : "An error occurred",
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

		if (willScaleCompartments) {
			const scaleX = newW / drawer.width;
			const scaleY = newH / drawer.height;
			for (const comp of drawer.compartments) {
				const scaledW = Math.max(
					DRAWER_GRID_SIZE,
					snapToGrid(comp.width * scaleX),
				);
				const scaledH = Math.max(
					DRAWER_GRID_SIZE,
					snapToGrid(comp.height * scaleY),
				);
				const scaledX = comp.x * scaleX;
				const scaledY = comp.y * scaleY;

				const absCenterX = (updates.x ?? drawer.x) + scaledX;
				const absCenterY = (updates.y ?? drawer.y) + scaledY;
				const snappedAbsX = snapCenterToGridEdges(absCenterX, scaledW);
				const snappedAbsY = snapCenterToGridEdges(absCenterY, scaledH);
				const finalRelX = snappedAbsX - (updates.x ?? drawer.x);
				const finalRelY = snappedAbsY - (updates.y ?? drawer.y);

				const halfW = newW / 2;
				const halfH = newH / 2;
				const halfCW = scaledW / 2;
				const halfCH = scaledH / 2;
				const clampedX = Math.max(
					-halfW + halfCW,
					Math.min(halfW - halfCW, finalRelX),
				);
				const clampedY = Math.max(
					-halfH + halfCH,
					Math.min(halfH - halfCH, finalRelY),
				);

				const compPrev: Partial<Compartment> = {
					x: comp.x,
					y: comp.y,
					width: comp.width,
					height: comp.height,
				};
				const compNext: Partial<Compartment> = {
					x: clampedX,
					y: clampedY,
					width: scaledW,
					height: scaledH,
				};

				await updateCompartment({
					authContext: context,
					compartmentId: comp._id as Id<"compartments">,
					x: compNext.x,
					y: compNext.y,
					width: compNext.width,
					height: compNext.height,
				});

				steps.push({
					type: "updateCompartment",
					compartmentId: comp._id,
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
