import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Compartment, DrawerWithCompartments } from "@/types";

interface UseBlueprintCanvasCompartmentDragParams {
	drawers: DrawerWithCompartments[];
	snapToGrid: (value: number) => number;
	findDrawerAtWorldPoint: (point: {
		x: number;
		y: number;
	}) => DrawerWithCompartments | null;
	findCompartmentAtWorldPoint: (
		drawer: DrawerWithCompartments,
		point: { x: number; y: number },
	) => Compartment | null;
	onSwapCompartments?: (
		aCompartmentId: string,
		bCompartmentId: string,
	) => Promise<void> | void;
	onUpdateCompartment: (
		compartmentId: string,
		updates: Partial<Compartment>,
	) => Promise<void> | void;
}

interface DragOverlayRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

function getNearestCompartmentInDrawer(
	drawer: DrawerWithCompartments,
	point: { x: number; y: number },
	excludeCompartmentId: string,
): Compartment | null {
	let nearest: { compartment: Compartment; distanceSq: number } | null = null;
	for (const compartment of drawer.compartments) {
		if (compartment._id === excludeCompartmentId) continue;
		const centerX = drawer.x + compartment.x;
		const centerY = drawer.y + compartment.y;
		const dx = point.x - centerX;
		const dy = point.y - centerY;
		const distanceSq = dx * dx + dy * dy;
		if (!nearest || distanceSq < nearest.distanceSq) {
			nearest = { compartment, distanceSq };
		}
	}
	return nearest?.compartment ?? null;
}

interface UseBlueprintCanvasCompartmentDragResult {
	dragState: {
		compartmentId: string;
		fromDrawerId: string;
	} | null;
	dragHover: {
		targetDrawerId: string | null;
		targetCompartmentId: string | null;
	} | null;
	dragOverlays: {
		origin: DragOverlayRect | null;
		target: DragOverlayRect | null;
	} | null;
	handleCompartmentDragStart: (next: {
		compartmentId: string;
		fromDrawerId: string;
		worldX: number;
		worldY: number;
	}) => void;
	handleCompartmentDragMove: (next: {
		compartmentId: string;
		fromDrawerId: string;
		worldX: number;
		worldY: number;
	}) => void;
	handleCompartmentDragEnd: (next: {
		compartmentId: string;
		fromDrawerId: string;
		worldX: number;
		worldY: number;
	}) => Promise<void>;
}

export function useBlueprintCanvasCompartmentDrag({
	drawers,
	snapToGrid,
	findDrawerAtWorldPoint,
	findCompartmentAtWorldPoint,
	onSwapCompartments,
	onUpdateCompartment,
}: UseBlueprintCanvasCompartmentDragParams): UseBlueprintCanvasCompartmentDragResult {
	const [dragState, setDragState] = useState<{
		compartmentId: string;
		fromDrawerId: string;
	} | null>(null);
	const [dragHover, setDragHover] = useState<{
		targetDrawerId: string | null;
		targetCompartmentId: string | null;
	} | null>(null);

	const pendingDragMove = useRef<{
		compartmentId: string;
		fromDrawerId: string;
		worldX: number;
		worldY: number;
	} | null>(null);
	const dragMoveRaf = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (dragMoveRaf.current != null) {
				cancelAnimationFrame(dragMoveRaf.current);
				dragMoveRaf.current = null;
			}
		};
	}, []);

	const handleCompartmentDragStart = useCallback(
		(next: {
			compartmentId: string;
			fromDrawerId: string;
			worldX: number;
			worldY: number;
		}) => {
			setDragState({
				compartmentId: next.compartmentId,
				fromDrawerId: next.fromDrawerId,
			});
			setDragHover({
				targetDrawerId: next.fromDrawerId,
				targetCompartmentId: next.compartmentId,
			});
		},
		[],
	);

	const handleCompartmentDragMove = useCallback(
		(next: {
			compartmentId: string;
			fromDrawerId: string;
			worldX: number;
			worldY: number;
		}) => {
			if (!dragState || dragState.compartmentId !== next.compartmentId) return;

			pendingDragMove.current = next;
			if (dragMoveRaf.current != null) return;
			dragMoveRaf.current = requestAnimationFrame(() => {
				dragMoveRaf.current = null;
				const pending = pendingDragMove.current;
				if (!pending) return;
				const point = { x: pending.worldX, y: pending.worldY };
				const targetDrawer = findDrawerAtWorldPoint(point);
				if (!targetDrawer) {
					setDragHover({ targetDrawerId: null, targetCompartmentId: null });
					return;
				}
				const directTargetComp = findCompartmentAtWorldPoint(
					targetDrawer,
					point,
				);
				const targetComp =
					directTargetComp && directTargetComp._id !== pending.compartmentId
						? directTargetComp
						: getNearestCompartmentInDrawer(
								targetDrawer,
								point,
								pending.compartmentId,
							);
				setDragHover({
					targetDrawerId: targetDrawer._id,
					targetCompartmentId: targetComp?._id ?? null,
				});
			});
		},
		[dragState, findCompartmentAtWorldPoint, findDrawerAtWorldPoint],
	);

	const handleCompartmentDragEnd = useCallback(
		async (next: {
			compartmentId: string;
			fromDrawerId: string;
			worldX: number;
			worldY: number;
		}) => {
			pendingDragMove.current = null;
			if (dragMoveRaf.current != null) {
				cancelAnimationFrame(dragMoveRaf.current);
				dragMoveRaf.current = null;
			}
			setDragState(null);
			setDragHover(null);

			const point = { x: next.worldX, y: next.worldY };
			const fromDrawer =
				drawers.find((d) => d._id === next.fromDrawerId) ?? null;
			if (!fromDrawer || fromDrawer.rotation !== 0) return;

			const movingComp =
				fromDrawer.compartments.find((c) => c._id === next.compartmentId) ??
				null;
			if (!movingComp) return;

			const targetDrawer = findDrawerAtWorldPoint(point);
			if (!targetDrawer || targetDrawer.rotation !== 0) return;

			const directTargetComp = findCompartmentAtWorldPoint(targetDrawer, point);
			const targetComp =
				directTargetComp && directTargetComp._id !== movingComp._id
					? directTargetComp
					: getNearestCompartmentInDrawer(targetDrawer, point, movingComp._id);

			if (targetComp) {
				await onSwapCompartments?.(movingComp._id, targetComp._id);
				return;
			}

			const isTargetEmpty =
				targetDrawer.compartments.length === 0 ||
				(targetDrawer._id === fromDrawer._id &&
					targetDrawer.compartments.length === 1);

			if (!isTargetEmpty) {
				return;
			}

			const halfW = targetDrawer.width / 2;
			const halfH = targetDrawer.height / 2;
			const halfCompW = movingComp.width / 2;
			const halfCompH = movingComp.height / 2;

			const snappedTopLeftWorldX = snapToGrid(point.x - halfCompW);
			const snappedTopLeftWorldY = snapToGrid(point.y - halfCompH);
			const snappedCenterWorldX = snappedTopLeftWorldX + halfCompW;
			const snappedCenterWorldY = snappedTopLeftWorldY + halfCompH;

			const rawRelX = snappedCenterWorldX - targetDrawer.x;
			const rawRelY = snappedCenterWorldY - targetDrawer.y;

			const clampedRelX = Math.max(
				-halfW + halfCompW,
				Math.min(halfW - halfCompW, rawRelX),
			);
			const clampedRelY = Math.max(
				-halfH + halfCompH,
				Math.min(halfH - halfCompH, rawRelY),
			);

			const clampedCenterWorldX = targetDrawer.x + clampedRelX;
			const clampedCenterWorldY = targetDrawer.y + clampedRelY;
			const finalTopLeftWorldX = snapToGrid(clampedCenterWorldX - halfCompW);
			const finalTopLeftWorldY = snapToGrid(clampedCenterWorldY - halfCompH);
			const finalRelX = Math.max(
				-halfW + halfCompW,
				Math.min(
					halfW - halfCompW,
					finalTopLeftWorldX + halfCompW - targetDrawer.x,
				),
			);
			const finalRelY = Math.max(
				-halfH + halfCompH,
				Math.min(
					halfH - halfCompH,
					finalTopLeftWorldY + halfCompH - targetDrawer.y,
				),
			);

			await onUpdateCompartment(movingComp._id, {
				drawerId: targetDrawer._id,
				x: finalRelX,
				y: finalRelY,
			});
		},
		[
			drawers,
			findCompartmentAtWorldPoint,
			findDrawerAtWorldPoint,
			onSwapCompartments,
			onUpdateCompartment,
			snapToGrid,
		],
	);

	const dragOverlays = useMemo(() => {
		if (!dragState) return null;
		const fromDrawer =
			drawers.find((d) => d._id === dragState.fromDrawerId) ?? null;
		const originComp =
			fromDrawer?.compartments.find((c) => c._id === dragState.compartmentId) ??
			null;

		const origin =
			fromDrawer && originComp
				? {
						x: fromDrawer.x + originComp.x - originComp.width / 2,
						y: fromDrawer.y + originComp.y - originComp.height / 2,
						width: originComp.width,
						height: originComp.height,
					}
				: null;

		const target =
			dragHover?.targetDrawerId && dragHover.targetCompartmentId
				? (() => {
						const td =
							drawers.find((d) => d._id === dragHover.targetDrawerId) ?? null;
						const tc =
							td?.compartments.find(
								(c) => c._id === dragHover.targetCompartmentId,
							) ?? null;
						if (!td || !tc) return null;
						return {
							x: td.x + tc.x - tc.width / 2,
							y: td.y + tc.y - tc.height / 2,
							width: tc.width,
							height: tc.height,
						};
					})()
				: null;

		return { origin, target };
	}, [
		dragHover?.targetCompartmentId,
		dragHover?.targetDrawerId,
		dragState,
		drawers,
	]);

	return {
		dragState,
		dragHover,
		dragOverlays,
		handleCompartmentDragStart,
		handleCompartmentDragMove,
		handleCompartmentDragEnd,
	};
}
