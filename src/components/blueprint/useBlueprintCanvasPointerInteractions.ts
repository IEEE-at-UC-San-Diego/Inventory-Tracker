import type { KonvaEventObject, Node as KonvaNode } from "konva/lib/Node";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type {
	DraftDrawer,
	DraftSplit,
	SelectionBox,
	UseBlueprintCanvasPointerInteractionsParams,
	UseBlueprintCanvasPointerInteractionsResult,
} from "./useBlueprintCanvasPointerInteractions.types";

const PAN_DRAG_THRESHOLD_PX = 3;

export function useBlueprintCanvasPointerInteractions({
	stageRef,
	drawers,
	viewport,
	mode,
	tool,
	isLockedByMe,
	selectedElement,
	selectedDrawerIdSet,
	dragStateActive,
	gridSize,
	snapToGrid,
	zoom,
	pan,
	findDrawerAtWorldPoint,
	findCompartmentAtWorldPoint,
	checkBulkMoveCollision,
	onSelectionChange,
	onCreateDrawerFromTool,
	onSplitDrawerFromTool,
	onUpdateDrawers,
}: UseBlueprintCanvasPointerInteractionsParams): UseBlueprintCanvasPointerInteractionsResult {
	const [isPanning, setIsPanning] = useState(false);
	const lastPointerPosition = useRef<{ x: number; y: number } | null>(null);
	const panCandidate = useRef<{ x: number; y: number; button: 0 | 2 } | null>(
		null,
	);
	const clickCandidate = useRef(false);

	const [draftDrawer, setDraftDrawer] = useState<DraftDrawer | null>(null);
	const [draftSplit, setDraftSplit] = useState<DraftSplit | null>(null);
	const [hoverSplit, setHoverSplit] = useState<DraftSplit | null>(null);
	const [splitOrientation, setSplitOrientation] = useState<
		"vertical" | "horizontal"
	>("vertical");

	const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

	const movingSelectionRef = useRef<{
		startWorldX: number;
		startWorldY: number;
		drawerIds: string[];
		startPositions: Record<string, { x: number; y: number }>;
		lastSnappedDx: number;
		lastSnappedDy: number;
	} | null>(null);

	const [drawerPositionOverrides, setDrawerPositionOverrides] = useState<Record<
		string,
		{ x: number; y: number }
	> | null>(null);
	const [invalidDrop, setInvalidDrop] = useState<boolean>(false);

	const setHoverSplitIfChanged = useCallback(
		(next: DraftSplit | null) => {
			setHoverSplit((prev) => {
				if (
					prev?.drawerId === next?.drawerId &&
					prev?.orientation === next?.orientation &&
					prev?.position === next?.position &&
					(prev?.targetCompartmentId ?? null) ===
						(next?.targetCompartmentId ?? null)
				) {
					return prev;
				}
				return next;
			});
		},
		[],
	);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === "Escape") {
				setDraftDrawer(null);
				setDraftSplit(null);
				onSelectionChange({ selectedElement: null, selectedDrawerIds: [] });
			}

			if (
				tool === "split" &&
				isLockedByMe &&
				(e.key === "r" || e.key === "R")
			) {
				e.preventDefault();
				setSplitOrientation((prev) =>
					prev === "vertical" ? "horizontal" : "vertical",
				);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [isLockedByMe, onSelectionChange, tool]);

	const getWorldPointer = useCallback((): { x: number; y: number } | null => {
		const stage = stageRef.current;
		if (!stage) return null;
		const pointer = stage.getPointerPosition();
		if (!pointer) return null;
		return {
			x: (pointer.x - viewport.x) / viewport.zoom,
			y: (pointer.y - viewport.y) / viewport.zoom,
		};
	}, [stageRef, viewport.x, viewport.y, viewport.zoom]);

	const getDrawerNodeFromEvent = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
			const target = e.target as KonvaNode;
			const compartmentNode = target.findAncestor(".compartment", true);
			if (compartmentNode) return null;
			return target.findAncestor(".drawer", true);
		},
		[],
	);

	const getDrawerIdFromEvent = useCallback(
		(e: KonvaEventObject<MouseEvent>): string | null => {
			const drawerNode = getDrawerNodeFromEvent(e);
			const drawerId = drawerNode?.getAttr("drawerId") as string | undefined;
			return drawerId ?? null;
		},
		[getDrawerNodeFromEvent],
	);

	const handleWheel = useCallback(
		(e: KonvaEventObject<WheelEvent>) => {
			e.evt.preventDefault();

			const stage = stageRef.current;
			if (!stage) return;

			const pointer = stage.getPointerPosition();
			if (!pointer) return;

			const delta = e.evt.deltaY;
			const factor = delta > 0 ? 0.9 : 1.1;

			zoom(factor, { x: pointer.x, y: pointer.y });
		},
		[stageRef, zoom],
	);

	const handleMouseDown = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
			const stage = e.target.getStage();
			if (!stage) return;

			const isStage = e.target === stage;
			clickCandidate.current = false;

			if (e.evt.button === 2) {
				panCandidate.current = {
					x: e.evt.clientX,
					y: e.evt.clientY,
					button: 2,
				};
				lastPointerPosition.current = { x: e.evt.clientX, y: e.evt.clientY };
				return;
			}

			if (e.evt.button !== 0) return;
			const world = getWorldPointer();

			if (tool === "drawer" && isLockedByMe && isStage && world) {
				const startX = snapToGrid(world.x);
				const startY = snapToGrid(world.y);
				setDraftDrawer({ startX, startY, endX: startX, endY: startY });
				return;
			}

			if (tool === "split" && isLockedByMe && world) {
				const drawer =
					(hoverSplit
						? (drawers.find((d) => d._id === hoverSplit.drawerId) ?? null)
						: selectedElement?.type === "drawer"
							? (drawers.find((d) => d._id === selectedElement.id) ?? null)
							: findDrawerAtWorldPoint(world)) ?? null;
				if (!drawer) return;

				const hoveredComp = findCompartmentAtWorldPoint(drawer, world);
				if (drawer.compartments.length > 0 && !hoveredComp) {
					return;
				}

				const halfW = drawer.width / 2;
				const halfH = drawer.height / 2;
				const snappedWorldX = snapToGrid(world.x);
				const snappedWorldY = snapToGrid(world.y);
				const localX = Math.min(
					Math.max(snappedWorldX - drawer.x, -halfW),
					halfW,
				);
				const localY = Math.min(
					Math.max(snappedWorldY - drawer.y, -halfH),
					halfH,
				);

				const position =
					splitOrientation === "vertical"
						? hoverSplit?.orientation === splitOrientation
							? hoverSplit.position
							: localX
						: hoverSplit?.orientation === splitOrientation
							? hoverSplit.position
							: localY;

				setDraftSplit({
					drawerId: drawer._id,
					orientation: splitOrientation,
					position,
					targetCompartmentId: hoveredComp?._id ?? null,
				});
				lastPointerPosition.current = { x: e.evt.clientX, y: e.evt.clientY };
				return;
			}

			if (tool === "pan") {
				panCandidate.current = {
					x: e.evt.clientX,
					y: e.evt.clientY,
					button: 0,
				};
				lastPointerPosition.current = { x: e.evt.clientX, y: e.evt.clientY };
				return;
			}

			if (tool === "select" && world) {
				const drawerId = getDrawerIdFromEvent(e);

				if (isStage && !drawerId) {
					setSelectionBox({
						startClientX: e.evt.clientX,
						startClientY: e.evt.clientY,
						startWorldX: world.x,
						startWorldY: world.y,
						endWorldX: world.x,
						endWorldY: world.y,
					});
					lastPointerPosition.current = { x: e.evt.clientX, y: e.evt.clientY };
					return;
				}

				if (drawerId && mode === "edit" && isLockedByMe) {
					const nextSelectedIds = selectedDrawerIdSet.has(drawerId)
						? [...selectedDrawerIdSet]
						: [drawerId];

					const primaryDrawer = drawers.find((d) => d._id === drawerId) ?? null;
					onSelectionChange({
						selectedDrawerIds: nextSelectedIds,
						selectedElement: primaryDrawer
							? { type: "drawer", id: primaryDrawer._id, data: primaryDrawer }
							: null,
					});

					const startPositions: Record<string, { x: number; y: number }> = {};
					for (const id of nextSelectedIds) {
						const d = drawers.find((dr) => dr._id === id);
						if (d) startPositions[id] = { x: d.x, y: d.y };
					}

					movingSelectionRef.current = {
						startWorldX: world.x,
						startWorldY: world.y,
						drawerIds: nextSelectedIds,
						startPositions,
						lastSnappedDx: 0,
						lastSnappedDy: 0,
					};
					lastPointerPosition.current = { x: e.evt.clientX, y: e.evt.clientY };
					return;
				}
			}

			if (isStage) {
				clickCandidate.current = true;
				lastPointerPosition.current = { x: e.evt.clientX, y: e.evt.clientY };
			}
		},
		[
			drawers,
			findCompartmentAtWorldPoint,
			findDrawerAtWorldPoint,
			getDrawerIdFromEvent,
			getWorldPointer,
			hoverSplit,
			isLockedByMe,
			mode,
			onSelectionChange,
			selectedDrawerIdSet,
			selectedElement,
			snapToGrid,
			splitOrientation,
			tool,
		],
	);

	const handleMouseMove = useCallback(
		(e: KonvaEventObject<MouseEvent>) => {
			if (selectionBox) {
				const world = getWorldPointer();
				if (!world) return;
				setSelectionBox((prev) => {
					if (!prev) return prev;
					return { ...prev, endWorldX: world.x, endWorldY: world.y };
				});
				return;
			}

			if (movingSelectionRef.current) {
				const world = getWorldPointer();
				if (!world) return;

				const rawDx = world.x - movingSelectionRef.current.startWorldX;
				const rawDy = world.y - movingSelectionRef.current.startWorldY;
				const snappedDx = snapToGrid(rawDx);
				const snappedDy = snapToGrid(rawDy);

				if (
					snappedDx === movingSelectionRef.current.lastSnappedDx &&
					snappedDy === movingSelectionRef.current.lastSnappedDy
				) {
					return;
				}

				movingSelectionRef.current.lastSnappedDx = snappedDx;
				movingSelectionRef.current.lastSnappedDy = snappedDy;

				const nextOverrides: Record<string, { x: number; y: number }> = {};
				for (const drawerId of movingSelectionRef.current.drawerIds) {
					const start = movingSelectionRef.current.startPositions[drawerId];
					if (!start) continue;
					nextOverrides[drawerId] = {
						x: start.x + snappedDx,
						y: start.y + snappedDy,
					};
				}

				const hasCollision = checkBulkMoveCollision(
					movingSelectionRef.current.drawerIds,
					nextOverrides,
					drawers,
				);
				setInvalidDrop(hasCollision);
				setDrawerPositionOverrides(nextOverrides);
				return;
			}

			if (
				tool === "split" &&
				isLockedByMe &&
				!draftSplit &&
				!draftDrawer &&
				!isPanning &&
				!dragStateActive
			) {
				const world = getWorldPointer();
				if (!world) {
					setHoverSplitIfChanged(null);
				} else {
					const drawer =
						selectedElement?.type === "drawer"
							? (drawers.find((d) => d._id === selectedElement.id) ?? null)
							: findDrawerAtWorldPoint(world);

					if (!drawer) {
						setHoverSplitIfChanged(null);
					} else {
						const hoveredComp = findCompartmentAtWorldPoint(drawer, world);
						if (drawer.compartments.length > 0 && !hoveredComp) {
							setHoverSplitIfChanged(null);
							return;
						}

						const halfW = drawer.width / 2;
						const halfH = drawer.height / 2;
						const snappedWorldX = snapToGrid(world.x);
						const snappedWorldY = snapToGrid(world.y);
						const localX = Math.min(
							Math.max(snappedWorldX - drawer.x, -halfW),
							halfW,
						);
						const localY = Math.min(
							Math.max(snappedWorldY - drawer.y, -halfH),
							halfH,
						);

						setHoverSplitIfChanged({
							drawerId: drawer._id,
							orientation: splitOrientation,
							position: splitOrientation === "vertical" ? localX : localY,
							targetCompartmentId: hoveredComp?._id ?? null,
						});
					}
				}
			} else if (hoverSplit) {
				setHoverSplitIfChanged(null);
			}

			if (draftDrawer) {
				const world = getWorldPointer();
				if (!world) return;
				setDraftDrawer((prev) => {
					if (!prev) return prev;
					return {
						...prev,
						endX: snapToGrid(world.x),
						endY: snapToGrid(world.y),
					};
				});
				return;
			}

			if (draftSplit && lastPointerPosition.current) {
				const world = getWorldPointer();
				if (!world) return;
				const drawer = drawers.find((d) => d._id === draftSplit.drawerId);
				if (!drawer) return;

				const halfW = drawer.width / 2;
				const halfH = drawer.height / 2;
				const snappedWorldX = snapToGrid(world.x);
				const snappedWorldY = snapToGrid(world.y);
				const localX = Math.min(
					Math.max(snappedWorldX - drawer.x, -halfW),
					halfW,
				);
				const localY = Math.min(
					Math.max(snappedWorldY - drawer.y, -halfH),
					halfH,
				);

				setDraftSplit({
					drawerId: drawer._id,
					orientation: draftSplit.orientation,
					position: draftSplit.orientation === "vertical" ? localX : localY,
					targetCompartmentId: draftSplit.targetCompartmentId ?? null,
				});
				return;
			}

			if (!panCandidate.current || !lastPointerPosition.current) return;

			const totalDx = e.evt.clientX - panCandidate.current.x;
			const totalDy = e.evt.clientY - panCandidate.current.y;
			const movedEnough =
				Math.abs(totalDx) > PAN_DRAG_THRESHOLD_PX ||
				Math.abs(totalDy) > PAN_DRAG_THRESHOLD_PX;

			if (!isPanning && movedEnough) {
				setIsPanning(true);
			}

			if (!isPanning && !movedEnough) return;

			const dx = e.evt.clientX - lastPointerPosition.current.x;
			const dy = e.evt.clientY - lastPointerPosition.current.y;

			pan(dx, dy);

			lastPointerPosition.current = {
				x: e.evt.clientX,
				y: e.evt.clientY,
			};
		},
		[
			checkBulkMoveCollision,
			draftDrawer,
			draftSplit,
			dragStateActive,
			drawers,
			findCompartmentAtWorldPoint,
			findDrawerAtWorldPoint,
			getWorldPointer,
			hoverSplit,
			isLockedByMe,
			isPanning,
			pan,
			selectedElement,
			selectionBox,
			setHoverSplitIfChanged,
			snapToGrid,
			splitOrientation,
			tool,
		],
	);

	const handleMouseUp = useCallback(() => {
		if (selectionBox) {
			const movedEnough =
				Math.abs(selectionBox.endWorldX - selectionBox.startWorldX) >
					gridSize / 4 ||
				Math.abs(selectionBox.endWorldY - selectionBox.startWorldY) >
					gridSize / 4;

			const x1 = Math.min(selectionBox.startWorldX, selectionBox.endWorldX);
			const y1 = Math.min(selectionBox.startWorldY, selectionBox.endWorldY);
			const x2 = Math.max(selectionBox.startWorldX, selectionBox.endWorldX);
			const y2 = Math.max(selectionBox.startWorldY, selectionBox.endWorldY);

			setSelectionBox(null);

			if (!movedEnough) {
				onSelectionChange({ selectedElement: null, selectedDrawerIds: [] });
				panCandidate.current = null;
				setIsPanning(false);
				lastPointerPosition.current = null;
				return;
			}

			const nextSelected: string[] = [];
			for (const drawer of drawers) {
				const halfW = drawer.width / 2;
				const halfH = drawer.height / 2;
				const dLeft = drawer.x - halfW;
				const dRight = drawer.x + halfW;
				const dTop = drawer.y - halfH;
				const dBottom = drawer.y + halfH;

				const overlaps =
					dLeft <= x2 && dRight >= x1 && dTop <= y2 && dBottom >= y1;
				if (overlaps) nextSelected.push(drawer._id);
			}

			if (nextSelected.length === 1) {
				const only = drawers.find((d) => d._id === nextSelected[0]) ?? null;
				onSelectionChange({
					selectedDrawerIds: nextSelected,
					selectedElement: only
						? { type: "drawer", id: only._id, data: only }
						: null,
				});
			} else {
				onSelectionChange({
					selectedElement: null,
					selectedDrawerIds: nextSelected,
				});
			}

			panCandidate.current = null;
			setIsPanning(false);
			lastPointerPosition.current = null;
			return;
		}

		if (movingSelectionRef.current) {
			const move = movingSelectionRef.current;
			const movedEnough =
				Math.abs(move.lastSnappedDx) > 0 || Math.abs(move.lastSnappedDy) > 0;

			const overrides = drawerPositionOverrides;
			movingSelectionRef.current = null;
			setDrawerPositionOverrides(null);
			setInvalidDrop(false);

			if (
				movedEnough &&
				overrides &&
				onUpdateDrawers &&
				!checkBulkMoveCollision(move.drawerIds, overrides, drawers)
			) {
				const updates = Object.entries(overrides).map(([drawerId, pos]) => ({
					drawerId,
					x: pos.x,
					y: pos.y,
				}));
				onUpdateDrawers(updates);
			}

			panCandidate.current = null;
			setIsPanning(false);
			lastPointerPosition.current = null;
			return;
		}

		if (draftDrawer && isLockedByMe) {
			const x1 = Math.min(draftDrawer.startX, draftDrawer.endX);
			const y1 = Math.min(draftDrawer.startY, draftDrawer.endY);
			const x2 = Math.max(draftDrawer.startX, draftDrawer.endX);
			const y2 = Math.max(draftDrawer.startY, draftDrawer.endY);
			const w = x2 - x1;
			const h = y2 - y1;
			const centerX = x1 + w / 2;
			const centerY = y1 + h / 2;

			setDraftDrawer(null);

			if (w >= gridSize && h >= gridSize) {
				onCreateDrawerFromTool?.({
					x: centerX,
					y: centerY,
					width: w,
					height: h,
				});
			}

			panCandidate.current = null;
			setIsPanning(false);
			lastPointerPosition.current = null;
			return;
		}

		if (draftSplit && isLockedByMe) {
			const split = draftSplit;
			setDraftSplit(null);
			onSplitDrawerFromTool?.(split);

			panCandidate.current = null;
			setIsPanning(false);
			lastPointerPosition.current = null;
			return;
		}

		if (clickCandidate.current && !isPanning && tool !== "pan") {
			onSelectionChange({ selectedElement: null, selectedDrawerIds: [] });
		}
		clickCandidate.current = false;
		panCandidate.current = null;
		setIsPanning(false);
		lastPointerPosition.current = null;
	}, [
		checkBulkMoveCollision,
		draftDrawer,
		draftSplit,
		drawerPositionOverrides,
		drawers,
		gridSize,
		isLockedByMe,
		isPanning,
		onCreateDrawerFromTool,
		onSelectionChange,
		onSplitDrawerFromTool,
		onUpdateDrawers,
		selectionBox,
		tool,
	]);

	return {
		isPanning,
		draftDrawer,
		draftSplit,
		hoverSplit,
		splitOrientation,
		selectionBox,
		drawerPositionOverrides,
		invalidDrop,
		handleWheel,
		handleMouseDown,
		handleMouseMove,
		handleMouseUp,
	};
}
