import type { HistoryStep } from "@/hooks/useBlueprintHistory.types";
import type { Compartment, DrawerWithCompartments } from "@/types";
import type { AuthContext } from "@/types/auth";
import type { Id } from "../../../../../convex/_generated/dataModel";

interface ToastLike {
	error: (title: string, description?: string) => void;
}

interface SwapCompartmentsWithHistoryArgs {
	aCompartmentId: string;
	bCompartmentId: string;
	drawers: DrawerWithCompartments[];
	getRequiredAuthContext: () => Promise<AuthContext>;
	swapCompartments: (args: {
		authContext: AuthContext;
		aCompartmentId: Id<"compartments">;
		bCompartmentId: Id<"compartments">;
	}) => Promise<boolean | void>;
	pushHistoryEntry: (entry: {
		label: string;
		requiresLock: boolean;
		steps: HistoryStep[];
		timestamp: number;
	}) => void;
}

export async function swapCompartmentsWithHistory({
	aCompartmentId,
	bCompartmentId,
	drawers,
	getRequiredAuthContext,
	swapCompartments,
	pushHistoryEntry,
}: SwapCompartmentsWithHistoryArgs): Promise<boolean> {
	let a: Compartment | null = null;
	let b: Compartment | null = null;
	for (const d of drawers) {
		a = a ?? d.compartments.find((c) => c._id === aCompartmentId) ?? null;
		b = b ?? d.compartments.find((c) => c._id === bCompartmentId) ?? null;
		if (a && b) break;
	}
	if (!a || !b) return false;

	const context = await getRequiredAuthContext();
	await swapCompartments({
		authContext: context,
		aCompartmentId: aCompartmentId as Id<"compartments">,
		bCompartmentId: bCompartmentId as Id<"compartments">,
	});
	pushHistoryEntry({
		label: "Swap compartments",
		requiresLock: true,
		steps: [
			{
				type: "updateCompartment",
				compartmentId: aCompartmentId,
				prev: {
					drawerId: a.drawerId,
					x: a.x,
					y: a.y,
					width: a.width,
					height: a.height,
					rotation: a.rotation,
				},
				next: {
					drawerId: b.drawerId,
					x: b.x,
					y: b.y,
					width: b.width,
					height: b.height,
					rotation: b.rotation,
				},
			},
			{
				type: "updateCompartment",
				compartmentId: bCompartmentId,
				prev: {
					drawerId: b.drawerId,
					x: b.x,
					y: b.y,
					width: b.width,
					height: b.height,
					rotation: b.rotation,
				},
				next: {
					drawerId: a.drawerId,
					x: a.x,
					y: a.y,
					width: a.width,
					height: a.height,
					rotation: a.rotation,
				},
			},
		],
		timestamp: Date.now(),
	});

	return true;
}

interface DeleteCompartmentWithHistoryArgs {
	compartmentId: string;
	drawers: DrawerWithCompartments[];
	getRequiredAuthContext: () => Promise<AuthContext>;
	deleteCompartment: (args: {
		authContext: AuthContext;
		compartmentId: Id<"compartments">;
	}) => Promise<boolean | void>;
	setGridForDrawer?: (args: {
		authContext: AuthContext;
		drawerId: Id<"drawers">;
		rows: number;
		cols: number;
	}) => Promise<boolean | void>;
	toast: ToastLike;
	pushHistoryEntry: (entry: {
		label: string;
		requiresLock: boolean;
		steps: HistoryStep[];
		timestamp: number;
	}) => void;
}

function pickGridDimensions(
	count: number,
	drawerWidth: number,
	drawerHeight: number,
): { rows: number; cols: number } {
	if (count <= 0) return { rows: 1, cols: 1 };
	const targetAspect = drawerHeight === 0 ? 1 : drawerWidth / drawerHeight;
	let bestRows = 1;
	let bestCols = count;
	let bestScore = Number.POSITIVE_INFINITY;

	for (let rows = 1; rows <= count; rows++) {
		if (count % rows !== 0) continue;
		const cols = count / rows;
		const gridAspect = cols / rows;
		const aspectScore = Math.abs(Math.log(gridAspect / targetAspect));
		const shapeScore = Math.abs(cols - rows) * 0.01;
		const score = aspectScore + shapeScore;
		if (score < bestScore) {
			bestScore = score;
			bestRows = rows;
			bestCols = cols;
		}
	}

	return { rows: bestRows, cols: bestCols };
}

export async function deleteCompartmentWithHistory({
	compartmentId,
	drawers,
	getRequiredAuthContext,
	deleteCompartment,
	setGridForDrawer,
	toast,
	pushHistoryEntry,
}: DeleteCompartmentWithHistoryArgs): Promise<boolean> {
	let snapshot: Compartment | null = null;
	let sourceDrawer: DrawerWithCompartments | null = null;
	for (const d of drawers) {
		snapshot = d.compartments.find((c) => c._id === compartmentId) ?? null;
		if (snapshot) {
			sourceDrawer = d;
			break;
		}
	}
	if (!snapshot || !sourceDrawer) return false;

	const remainingCompartments = sourceDrawer.compartments
		.filter((c) => c._id !== compartmentId)
		.sort((a, b) => {
			if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
			if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
			return a._id.localeCompare(b._id);
		});

	const relayoutSteps: HistoryStep[] = [];
	let targetGrid: { rows: number; cols: number } | null = null;
	if (remainingCompartments.length > 0) {
		const { rows, cols } = pickGridDimensions(
			remainingCompartments.length,
			sourceDrawer.width,
			sourceDrawer.height,
		);
		targetGrid = { rows, cols };
		const cellW = sourceDrawer.width / cols;
		const cellH = sourceDrawer.height / rows;

		if (sourceDrawer.gridRows !== rows || sourceDrawer.gridCols !== cols) {
			relayoutSteps.push({
				type: "updateDrawer",
				drawerId: sourceDrawer._id,
				prev: {
					gridRows: sourceDrawer.gridRows,
					gridCols: sourceDrawer.gridCols,
				},
				next: {
					gridRows: rows,
					gridCols: cols,
				},
			});
		}

		for (const [index, compartment] of remainingCompartments.entries()) {
			const row = Math.floor(index / cols);
			const col = index % cols;
			const nextX = -sourceDrawer.width / 2 + cellW / 2 + col * cellW;
			const nextY = -sourceDrawer.height / 2 + cellH / 2 + row * cellH;
			const nextWidth = cellW;
			const nextHeight = cellH;
			const nextRotation = 0;
			const nextZIndex = index;

			const didChange =
				compartment.x !== nextX ||
				compartment.y !== nextY ||
				compartment.width !== nextWidth ||
				compartment.height !== nextHeight ||
				compartment.rotation !== nextRotation ||
				compartment.zIndex !== nextZIndex;

			if (!didChange) continue;

			relayoutSteps.push({
				type: "updateCompartment",
				compartmentId: compartment._id,
				prev: {
					x: compartment.x,
					y: compartment.y,
					width: compartment.width,
					height: compartment.height,
					rotation: compartment.rotation,
					zIndex: compartment.zIndex,
				},
				next: {
					x: nextX,
					y: nextY,
					width: nextWidth,
					height: nextHeight,
					rotation: nextRotation,
					zIndex: nextZIndex,
				},
			});
		}
	}

	try {
		const context = await getRequiredAuthContext();
		await deleteCompartment({
			authContext: context,
			compartmentId: compartmentId as Id<"compartments">,
		});
		if (targetGrid && setGridForDrawer) {
			await setGridForDrawer({
				authContext: context,
				drawerId: sourceDrawer._id as Id<"drawers">,
				rows: targetGrid.rows,
				cols: targetGrid.cols,
			});
		}
		pushHistoryEntry({
			label: "Delete compartment",
			requiresLock: true,
			steps: [
				{
					type: "deleteCompartment",
					snapshot,
					currentCompartmentId: compartmentId,
				},
				...relayoutSteps,
			],
			timestamp: Date.now(),
		});
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "An error occurred";
		const normalizedError = errorMessage.toLowerCase();
		const inventoryBlockedDelete =
			normalizedError.includes("cannot delete compartment") &&
			normalizedError.includes("inventory");
		if (inventoryBlockedDelete) {
			toast.error(
				"Cannot delete compartment",
				"Inventory must be removed or reassigned from this compartment before deletion.",
			);
			return false;
		}
		toast.error("Failed to delete compartment", errorMessage);
		return false;
	}

	return true;
}

interface UpdateCompartmentWithHistoryArgs {
	compartmentId: string;
	updates: Partial<Compartment>;
	drawers: DrawerWithCompartments[];
	getRequiredAuthContext: () => Promise<AuthContext>;
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
	}) => Promise<boolean | void>;
	pushHistoryEntry: (entry: {
		label: string;
		requiresLock: boolean;
		steps: HistoryStep[];
		timestamp: number;
	}) => void;
}

export async function updateCompartmentWithHistory({
	compartmentId,
	updates,
	drawers,
	getRequiredAuthContext,
	updateCompartment,
	pushHistoryEntry,
}: UpdateCompartmentWithHistoryArgs): Promise<boolean> {
	let foundComp: Compartment | null = null;
	let foundDrawerId: string | null = null;
	for (const d of drawers) {
		const c = d.compartments.find((comp) => comp._id === compartmentId);
		if (c) {
			foundComp = c;
			foundDrawerId = d._id;
			break;
		}
	}

	if (!foundComp || !foundDrawerId) return false;

	const prev: Partial<Compartment> & { drawerId?: string } = {};
	const next: Partial<Compartment> & { drawerId?: string } = {};

	for (const [key, value] of Object.entries(updates) as Array<
		[keyof Compartment, Compartment[keyof Compartment]]
	>) {
		if (value === undefined) continue;
		prev[key] = foundComp[key] as never;
		next[key] = value as never;
	}

	const context = await getRequiredAuthContext();
	const { drawerId, ...rest } = next;
	await updateCompartment({
		authContext: context,
		compartmentId: compartmentId as Id<"compartments">,
		...(drawerId ? { drawerId: drawerId as Id<"drawers"> } : {}),
		...rest,
	});

	pushHistoryEntry({
		label: "Update compartment",
		requiresLock: true,
		steps: [
			{
				type: "updateCompartment",
				compartmentId,
				prev,
				next,
			},
		],
		timestamp: Date.now(),
	});

	return true;
}
