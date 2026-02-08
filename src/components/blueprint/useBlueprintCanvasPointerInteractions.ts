import type { KonvaEventObject, Node as KonvaNode } from "konva/lib/Node";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	DraftDivider,
	DraftDividerMove,
	DraftDrawer,
	DraftResize,
	DraftSplit,
	ResizeHandle,
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
	onResizeDrawer,
	onCreateDivider,
	onUpdateDivider,
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

	const [draftResize, setDraftResize] = useState<DraftResize | null>(null);
	const [draftDivider, setDraftDivider] = useState<DraftDivider | null>(null);
	const [draftDividerMove, setDraftDividerMove] = useState<DraftDividerMove | null>(null);
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

	const setHoverSplitIfChanged = useCallback((next: DraftSplit | null) => {
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
	}, []);

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

	const snapCenterToGridEdges = useCallback(
		(center: number, size: number): number => {
			const half = size / 2;
			const snappedTopLeft = snapToGrid(center - half);
			return snappedTopLeft + half;
		},
		[snapToGrid],
	);

	const getResizeHandleFromEvent = useCallback(
		(
			e: KonvaEventObject<MouseEvent>,
		): { drawerId: string; handle: ResizeHandle } | null => {
			const target = e.target as KonvaNode;
			const name = target.name?.() ?? "";
			if (!name.startsWith("resize-")) return null;
			const handle = name.replace("resize-", "") as ResizeHandle;
			const drawerNode = target.findAncestor(".drawer", false);
			const drawerId = drawerNode?.getAttr("drawerId") as string | undefined;
			if (!drawerId) return null;
			return { drawerId, handle };
		},
		[],
	);

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

	const getDividerMoveFromEvent = useCallback(
		(e: KonvaEventObject<MouseEvent>): { dividerId: string; handle: "start" | "end" | "line" } | null => {
			const target = e.target as KonvaNode;
			const name = target.name?.() ?? "";
			if (!name.startsWith("divider-move-")) return null;
			const rest = name.slice("divider-move-".length);
			// Format: "{handle}-{dividerId}" where handle is start/end/line
			const firstDash = rest.indexOf("-");
			if (firstDash === -1) return null;
			const handle = rest.slice(0, firstDash) as "start" | "end" | "line";
			if (handle !== "start" && handle !== "end" && handle !== "line") return null;
			const dividerId = rest.slice(firstDash + 1);
			if (!dividerId) return null;
			return { dividerId, handle };
		},
		[],
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

			if (tool === "divider" && isLockedByMe && isStage && world) {
				const startX = snapToGrid(world.x);
				const startY = snapToGrid(world.y);
				setDraftDivider({ startX, startY, endX: startX, endY: startY });
				return;
			}

			if (tool === "drawer" && isLockedByMe && isStage && world) {
				const startX = snapToGrid(world.x);
				const startY = snapToGrid(world.y);
				setDraftDrawer({ startX, startY, endX: startX, endY: startY });
				return;
			}

			if (tool === "split" && isLockedByMe && world) {
				// Prefer hoverSplit drawer, then selected drawer, then drawer under pointer
				const drawer =
					(hoverSplit
						? (drawers.find((d) => d._id === hoverSplit.drawerId) ?? null)
						: selectedElement?.type === "drawer"
							? (drawers.find((d) => d._id === selectedElement.id) ?? null)
							: findDrawerAtWorldPoint(world)) ?? null;
				if (!drawer) return;

				// Use a slightly expanded hit-test to be more forgiving near edges
				let hoveredComp = findCompartmentAtWorldPoint(drawer, world);
				if (!hoveredComp && drawer.compartments.length > 0) {
					// Try snapped position as fallback
					const snappedPt = {
						x: snapToGrid(world.x),
						y: snapToGrid(world.y),
					};
					hoveredComp = findCompartmentAtWorldPoint(drawer, snappedPt);
				}
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

				// Always use the computed local position from the actual click point
				const position = splitOrientation === "vertical" ? localX : localY;

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

			if (tool === "select" && world && mode === "edit" && isLockedByMe) {
				const resizeInfo = getResizeHandleFromEvent(e);
				if (resizeInfo) {
					const drawer = drawers.find((d) => d._id === resizeInfo.drawerId);
					if (drawer) {
						setDraftResize({
							drawerId: drawer._id,
							handle: resizeInfo.handle,
							startX: drawer.x,
							startY: drawer.y,
							startWidth: drawer.width,
							startHeight: drawer.height,
							currentX: drawer.x,
							currentY: drawer.y,
							currentWidth: drawer.width,
							currentHeight: drawer.height,
							mouseStartX: world.x,
							mouseStartY: world.y,
							isValid: true,
						});
						lastPointerPosition.current = {
							x: e.evt.clientX,
							y: e.evt.clientY,
						};
						return;
					}
				}

				// Handle divider endpoint/line dragging
				const dividerMoveInfo = getDividerMoveFromEvent(e);
				if (dividerMoveInfo && selectedElement?.type === "divider" && selectedElement.id === dividerMoveInfo.dividerId) {
					const divider = selectedElement.data;
					if (divider) {
						if (dividerMoveInfo.handle === "line") {
							setDraftDividerMove({
								dividerId: divider._id,
								handle: "line",
								startX: divider.x1,
								startY: divider.y1,
								currentX: divider.x1,
								currentY: divider.y1,
								origX1: divider.x1,
								origY1: divider.y1,
								origX2: divider.x2,
								origY2: divider.y2,
								mouseStartX: world.x,
								mouseStartY: world.y,
							});
						} else {
							const startX = dividerMoveInfo.handle === "start" ? divider.x1 : divider.x2;
							const startY = dividerMoveInfo.handle === "start" ? divider.y1 : divider.y2;
							setDraftDividerMove({
								dividerId: divider._id,
								handle: dividerMoveInfo.handle,
								startX,
								startY,
								currentX: startX,
								currentY: startY,
							});
						}
						lastPointerPosition.current = {
							x: e.evt.clientX,
							y: e.evt.clientY,
						};
						return;
					}
				}
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
			getDividerMoveFromEvent,
			getDrawerIdFromEvent,
			getResizeHandleFromEvent,
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
					const drawer = drawers.find((d) => d._id === drawerId);
					if (!start) continue;
					if (!drawer) continue;
					const rawX = start.x + snappedDx;
					const rawY = start.y + snappedDy;
					nextOverrides[drawerId] = {
						x: snapCenterToGridEdges(rawX, drawer.width),
						y: snapCenterToGridEdges(rawY, drawer.height),
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

			if (draftResize) {
				const world = getWorldPointer();
				if (!world) return;
				const drawer = drawers.find((d) => d._id === draftResize.drawerId);
				if (!drawer) return;

				const handle = draftResize.handle;
				// Compute delta from initial mouse position, not drawer center
				const mouseDx = world.x - draftResize.mouseStartX;
				const mouseDy = world.y - draftResize.mouseStartY;

				let newX = draftResize.startX;
				let newY = draftResize.startY;
				let newW = draftResize.startWidth;
				let newH = draftResize.startHeight;

				const minSize = gridSize;

				if (handle.includes("e")) {
					newW = Math.max(minSize, snapToGrid(draftResize.startWidth + mouseDx * 2));
				}
				if (handle.includes("w")) {
					newW = Math.max(minSize, snapToGrid(draftResize.startWidth - mouseDx * 2));
				}
				if (handle.includes("s")) {
					newH = Math.max(minSize, snapToGrid(draftResize.startHeight + mouseDy * 2));
				}
				if (handle.includes("n")) {
					newH = Math.max(minSize, snapToGrid(draftResize.startHeight - mouseDy * 2));
				}

				newX = snapCenterToGridEdges(draftResize.startX, newW);
				newY = snapCenterToGridEdges(draftResize.startY, newH);

				// Compute minimum dimensions based on compartment grid
				// Each compartment must remain at least gridSize after proportional scaling
				let minW = gridSize;
				let minH = gridSize;
				if (drawer.compartments && drawer.compartments.length > 0) {
					const smallestCompW = Math.min(...drawer.compartments.map((c) => c.width));
					const smallestCompH = Math.min(...drawer.compartments.map((c) => c.height));
					if (smallestCompW > 0) {
						minW = Math.max(minW, snapToGrid(drawer.width * (gridSize / smallestCompW)) || gridSize);
					}
					if (smallestCompH > 0) {
						minH = Math.max(minH, snapToGrid(drawer.height * (gridSize / smallestCompH)) || gridSize);
					}
				}

				const tooSmall = newW < minW || newH < minH;

				// Check for overlap with other drawers
				const halfNewW = newW / 2;
				const halfNewH = newH / 2;
				const overlapsOther = drawers.some((other) => {
					if (other._id === draftResize.drawerId) return false;
					const halfOW = other.width / 2;
					const halfOH = other.height / 2;
					return (
						Math.abs(newX - other.x) < halfNewW + halfOW &&
						Math.abs(newY - other.y) < halfNewH + halfOH
					);
				});

				const isValid = !tooSmall && !overlapsOther;

				setDraftResize((prev) => {
					if (!prev) return prev;
					return {
						...prev,
						currentX: newX,
						currentY: newY,
						currentWidth: newW,
						currentHeight: newH,
						isValid,
					};
				});
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
						let hoveredComp = findCompartmentAtWorldPoint(drawer, world);
						if (!hoveredComp && drawer.compartments.length > 0) {
							const snappedPt = {
								x: snapToGrid(world.x),
								y: snapToGrid(world.y),
							};
							hoveredComp = findCompartmentAtWorldPoint(drawer, snappedPt);
						}
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

			if (draftDivider) {
				const world = getWorldPointer();
				if (!world) return;
				setDraftDivider((prev) => {
					if (!prev) return prev;
					return {
						...prev,
						endX: snapToGrid(world.x),
						endY: snapToGrid(world.y),
					};
				});
				return;
			}

			if (draftDividerMove) {
				const world = getWorldPointer();
				if (!world) return;
				setDraftDividerMove((prev) => {
					if (!prev) return prev;
					return {
						...prev,
						currentX: snapToGrid(world.x),
						currentY: snapToGrid(world.y),
					};
				});
				return;
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
			draftDivider,
			draftDividerMove,
			draftDrawer,
			draftResize,
			draftSplit,
			dragStateActive,
			drawers,
			findCompartmentAtWorldPoint,
			findDrawerAtWorldPoint,
			getWorldPointer,
			gridSize,
			hoverSplit,
			isLockedByMe,
			isPanning,
			pan,
			selectedElement,
			selectionBox,
			setHoverSplitIfChanged,
			snapCenterToGridEdges,
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

		if (draftResize && isLockedByMe) {
			const resize = draftResize;
			setDraftResize(null);

			const changed =
				resize.currentWidth !== resize.startWidth ||
				resize.currentHeight !== resize.startHeight;

			// Only commit if the resize is valid (meets min size, no overlap)
			if (changed && resize.isValid && onResizeDrawer) {
				onResizeDrawer(resize.drawerId, {
					x: resize.currentX,
					y: resize.currentY,
					width: resize.currentWidth,
					height: resize.currentHeight,
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

		if (draftDivider && isLockedByMe) {
			const divider = draftDivider;
			setDraftDivider(null);

			const dx = divider.endX - divider.startX;
			const dy = divider.endY - divider.startY;
			const length = Math.sqrt(dx * dx + dy * dy);

			// Only create if user actually dragged (not just clicked)
			if (length > 0) {
				onCreateDivider?.({
					x1: divider.startX,
					y1: divider.startY,
					x2: divider.endX,
					y2: divider.endY,
				});
			}

			panCandidate.current = null;
			setIsPanning(false);
			lastPointerPosition.current = null;
			return;
		}

		if (draftDividerMove && isLockedByMe) {
			const move = draftDividerMove;
			setDraftDividerMove(null);

			const changed = move.currentX !== move.startX || move.currentY !== move.startY;

			if (changed && onUpdateDivider) {
				if (move.handle === "line" && move.origX1 != null && move.origY1 != null && move.origX2 != null && move.origY2 != null && move.mouseStartX != null && move.mouseStartY != null) {
					const dx = move.currentX - move.mouseStartX;
					const dy = move.currentY - move.mouseStartY;
					onUpdateDivider(move.dividerId, {
						x1: snapToGrid(move.origX1 + dx),
						y1: snapToGrid(move.origY1 + dy),
						x2: snapToGrid(move.origX2 + dx),
						y2: snapToGrid(move.origY2 + dy),
					});
				} else if (selectedElement?.type === "divider" && selectedElement.id === move.dividerId) {
					const divider = selectedElement.data;
					const updates = {
						x1: move.handle === "start" ? move.currentX : divider.x1,
						y1: move.handle === "start" ? move.currentY : divider.y1,
						x2: move.handle === "end" ? move.currentX : divider.x2,
						y2: move.handle === "end" ? move.currentY : divider.y2,
					};
					onUpdateDivider(move.dividerId, updates);
				}
			}

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
		draftDivider,
		draftDividerMove,
		draftDrawer,
		draftResize,
		draftSplit,
		drawerPositionOverrides,
		drawers,
		gridSize,
		isLockedByMe,
		isPanning,
		onCreateDivider,
		onCreateDrawerFromTool,
		onResizeDrawer,
		onSelectionChange,
		onSplitDrawerFromTool,
		onUpdateDrawers,
		onUpdateDivider,
		selectionBox,
		selectedElement,
		snapToGrid,
		tool,
	]);

	return {
		isPanning,
		draftDrawer,
		draftSplit,
		hoverSplit,
		splitOrientation,
		setSplitOrientation,
		draftResize,
		draftDivider,
		draftDividerMove,
		selectionBox,
		drawerPositionOverrides,
		invalidDrop,
		handleWheel,
		handleMouseDown,
		handleMouseMove,
		handleMouseUp,
	};
}
