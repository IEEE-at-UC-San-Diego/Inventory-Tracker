import type { HistoryStep } from "@/hooks/useBlueprintHistory.types";
import type { DrawerWithCompartments } from "@/types";
import type { AuthContext } from "@/types/auth";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type {
	DrawerMutationFns,
	PushHistoryEntryFn,
	ToastLike,
} from "./-drawerActions";
import { DRAWER_GRID_SIZE } from "./-drawerActions";

interface SplitDrawerWithHistoryArgs {
	split: {
		drawerId: string;
		orientation: "vertical" | "horizontal";
		position: number;
		targetCompartmentId?: string | null;
	};
	drawers: DrawerWithCompartments[];
	compartmentsWithInventory: Map<string, number>;
	isLockedByMe: boolean;
	getRequiredAuthContext: () => Promise<AuthContext>;
	createCompartment: DrawerMutationFns["createCompartment"];
	updateCompartment: DrawerMutationFns["updateCompartment"];
	pushHistoryEntry: PushHistoryEntryFn;
	setHasChanges: (value: boolean) => void;
	toast: ToastLike;
}

export async function splitDrawerWithHistory({
	split,
	drawers,
	compartmentsWithInventory,
	isLockedByMe,
	getRequiredAuthContext,
	createCompartment,
	updateCompartment,
	pushHistoryEntry,
	setHasChanges,
	toast,
}: SplitDrawerWithHistoryArgs): Promise<boolean> {
	try {
		const drawer = drawers.find((d) => d._id === split.drawerId);
		if (!drawer) return false;

		if (!isLockedByMe) {
			toast.error("You must be editing to split drawers");
			return false;
		}

		if (drawer.rotation !== 0) {
			toast.error("Splitting rotated drawers isn't supported yet");
			return false;
		}

		const candidates = [...drawer.compartments].sort((a, b) => b.zIndex - a.zIndex);
		const position = split.position;
		const minEdge = DRAWER_GRID_SIZE;

		const hintedTarget = split.targetCompartmentId
			? (candidates.find((c) => c._id === split.targetCompartmentId) ?? null)
			: null;

		const targetCompartment =
			hintedTarget ??
			candidates.find((c) => {
				if (split.orientation === "vertical") {
					const left = c.x - c.width / 2;
					const right = c.x + c.width / 2;
					return position >= left + minEdge && position <= right - minEdge;
				}
				const top = c.y - c.height / 2;
				const bottom = c.y + c.height / 2;
				return position >= top + minEdge && position <= bottom - minEdge;
			}) ??
			null;

		if (!targetCompartment && drawer.compartments.length > 0) {
			toast.info("Hover a compartment to split it");
			return false;
		}

		const target = targetCompartment
			? {
					_id: targetCompartment._id,
					x: targetCompartment.x,
					y: targetCompartment.y,
					width: targetCompartment.width,
					height: targetCompartment.height,
				}
			: {
					_id: null as string | null,
					x: 0,
					y: 0,
					width: drawer.width,
					height: drawer.height,
				};

		if (target._id) {
			const qty = compartmentsWithInventory.get(target._id) ?? 0;
			if (qty > 0) {
				toast.error(
					"Can't split a compartment that contains inventory. Move inventory out first.",
				);
				return false;
			}
		}

		if (split.orientation === "vertical") {
			const leftEdge = target.x - target.width / 2;
			const rightEdge = target.x + target.width / 2;
			const leftW = position - leftEdge;
			const rightW = rightEdge - position;
			if (leftW < DRAWER_GRID_SIZE || rightW < DRAWER_GRID_SIZE) {
				toast.error("Split too close to the edge");
				return false;
			}

			const leftCenterX = leftEdge + leftW / 2;
			const rightCenterX = position + rightW / 2;
			const context = await getRequiredAuthContext();
			const steps: HistoryStep[] = [];

			if (target._id && targetCompartment) {
				await updateCompartment({
					authContext: context,
					compartmentId: target._id as Id<"compartments">,
					x: leftCenterX,
					y: target.y,
					width: leftW,
					height: target.height,
				});
				steps.push({
					type: "updateCompartment",
					compartmentId: target._id,
					prev: {
						x: targetCompartment.x,
						y: targetCompartment.y,
						width: targetCompartment.width,
						height: targetCompartment.height,
					},
					next: {
						x: leftCenterX,
						y: target.y,
						width: leftW,
						height: target.height,
					},
				});
			}

			const rightId = await createCompartment({
				authContext: context,
				drawerId: drawer._id as Id<"drawers">,
				x: rightCenterX,
				y: target.y,
				width: rightW,
				height: target.height,
				rotation: 0,
			});
			steps.push({
				type: "createCompartment",
				compartmentId: rightId as unknown as string,
				args: {
					drawerId: drawer._id,
					x: rightCenterX,
					y: target.y,
					width: rightW,
					height: target.height,
					rotation: 0,
				},
			});

			if (!target._id) {
				const leftId = await createCompartment({
					authContext: context,
					drawerId: drawer._id as Id<"drawers">,
					x: leftCenterX,
					y: target.y,
					width: leftW,
					height: target.height,
					rotation: 0,
				});
				steps.splice(steps.length - 1, 0, {
					type: "createCompartment",
					compartmentId: leftId as unknown as string,
					args: {
						drawerId: drawer._id,
						x: leftCenterX,
						y: target.y,
						width: leftW,
						height: target.height,
						rotation: 0,
					},
				});
			}

			if (steps.length > 0) {
				pushHistoryEntry({
					label: "Split compartment",
					requiresLock: true,
					steps,
					timestamp: Date.now(),
				});
			}
		} else {
			const topEdge = target.y - target.height / 2;
			const bottomEdge = target.y + target.height / 2;
			const topH = position - topEdge;
			const bottomH = bottomEdge - position;
			if (topH < DRAWER_GRID_SIZE || bottomH < DRAWER_GRID_SIZE) {
				toast.error("Split too close to the edge");
				return false;
			}

			const topCenterY = topEdge + topH / 2;
			const bottomCenterY = position + bottomH / 2;
			const context = await getRequiredAuthContext();
			const steps: HistoryStep[] = [];

			if (target._id && targetCompartment) {
				await updateCompartment({
					authContext: context,
					compartmentId: target._id as Id<"compartments">,
					x: target.x,
					y: topCenterY,
					width: target.width,
					height: topH,
					rotation: 0,
				});
				steps.push({
					type: "updateCompartment",
					compartmentId: target._id,
					prev: {
						x: targetCompartment.x,
						y: targetCompartment.y,
						width: targetCompartment.width,
						height: targetCompartment.height,
					},
					next: {
						x: target.x,
						y: topCenterY,
						width: target.width,
						height: topH,
					},
				});
			}

			const bottomId = await createCompartment({
				authContext: context,
				drawerId: drawer._id as Id<"drawers">,
				x: target.x,
				y: bottomCenterY,
				width: target.width,
				height: bottomH,
				rotation: 0,
			});
			steps.push({
				type: "createCompartment",
				compartmentId: bottomId as unknown as string,
				args: {
					drawerId: drawer._id,
					x: target.x,
					y: bottomCenterY,
					width: target.width,
					height: bottomH,
					rotation: 0,
				},
			});

			if (!target._id) {
				const topId = await createCompartment({
					authContext: context,
					drawerId: drawer._id as Id<"drawers">,
					x: target.x,
					y: topCenterY,
					width: target.width,
					height: topH,
					rotation: 0,
				});
				steps.splice(steps.length - 1, 0, {
					type: "createCompartment",
					compartmentId: topId as unknown as string,
					args: {
						drawerId: drawer._id,
						x: target.x,
						y: topCenterY,
						width: target.width,
						height: topH,
						rotation: 0,
					},
				});
			}

			if (steps.length > 0) {
				pushHistoryEntry({
					label: "Split compartment",
					requiresLock: true,
					steps,
					timestamp: Date.now(),
				});
			}
		}

		toast.success("Drawer split");
		setHasChanges(true);
		return true;
	} catch (error) {
		toast.error(
			"Failed to split drawer",
			error instanceof Error ? error.message : "An error occurred",
		);
		return false;
	}
}
