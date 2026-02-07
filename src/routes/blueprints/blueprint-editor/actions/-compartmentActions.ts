import type { HistoryStep } from "@/hooks/useBlueprintHistory.types";
import type { Compartment, DrawerWithCompartments } from "@/types";
import type { AuthContext } from "@/types/auth";
import type { Id } from "../../../../../convex/_generated/dataModel";

interface SwapCompartmentsWithHistoryArgs {
	aCompartmentId: string;
	bCompartmentId: string;
	drawers: DrawerWithCompartments[];
	getRequiredAuthContext: () => Promise<AuthContext>;
	swapCompartments: (args: {
		authContext: AuthContext;
		aCompartmentId: Id<"compartments">;
		bCompartmentId: Id<"compartments">;
	}) => Promise<void>;
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
	}) => Promise<void>;
	pushHistoryEntry: (entry: {
		label: string;
		requiresLock: boolean;
		steps: HistoryStep[];
		timestamp: number;
	}) => void;
}

export async function deleteCompartmentWithHistory({
	compartmentId,
	drawers,
	getRequiredAuthContext,
	deleteCompartment,
	pushHistoryEntry,
}: DeleteCompartmentWithHistoryArgs): Promise<boolean> {
	let snapshot: Compartment | null = null;
	for (const d of drawers) {
		snapshot = d.compartments.find((c) => c._id === compartmentId) ?? null;
		if (snapshot) break;
	}
	if (!snapshot) return false;

	const context = await getRequiredAuthContext();
	await deleteCompartment({
		authContext: context,
		compartmentId: compartmentId as Id<"compartments">,
	});
	pushHistoryEntry({
		label: "Delete compartment",
		requiresLock: true,
		steps: [
			{
				type: "deleteCompartment",
				snapshot,
				currentCompartmentId: compartmentId,
			},
		],
		timestamp: Date.now(),
	});

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
	}) => Promise<void>;
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
