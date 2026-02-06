import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasBounds, CanvasPoint, Drawer, Viewport } from "@/types";
import {
	clampZoom,
	getDefaultViewport,
	getElementsBounds,
	zoomAtPoint,
} from "@/types";

interface UseCanvasViewportOptions {
	containerWidth: number;
	containerHeight: number;
	drawers?: Drawer[];
	minZoom?: number;
	maxZoom?: number;
}

interface UseCanvasViewportReturn {
	viewport: Viewport;
	setViewport: (viewport: Viewport) => void;
	zoom: (factor: number, center?: CanvasPoint) => void;
	zoomIn: () => void;
	zoomOut: () => void;
	zoomToFit: () => void;
	resetView: () => void;
	zoomToLocation: (
		targetX: number,
		targetY: number,
		targetWidth?: number,
		targetHeight?: number,
		options?: { animate?: boolean; duration?: number },
	) => void;
	pan: (deltaX: number, deltaY: number) => void;
	panTo: (x: number, y: number) => void;
	screenToBlueprint: (screenPoint: CanvasPoint) => CanvasPoint;
	blueprintToScreen: (blueprintPoint: CanvasPoint) => CanvasPoint;
	isDragging: boolean;
	startDrag: (point: CanvasPoint) => void;
	drag: (point: CanvasPoint) => void;
	endDrag: () => void;
	bounds: CanvasBounds;
}

const ZOOM_STEP = 1.2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

export function useCanvasViewport({
	containerWidth,
	containerHeight,
	drawers = [],
	minZoom = MIN_ZOOM,
	maxZoom = MAX_ZOOM,
}: UseCanvasViewportOptions): UseCanvasViewportReturn {
	const [viewport, setViewport] = useState<Viewport>(() =>
		getDefaultViewport(containerWidth, containerHeight),
	);
	const [isDragging, setIsDragging] = useState(false);
	const dragStartRef = useRef<CanvasPoint | null>(null);
	const viewportStartRef = useRef<Viewport | null>(null);
	const pendingPanRef = useRef<{ dx: number; dy: number } | null>(null);
	const panRafRef = useRef<number | null>(null);

	// Reset viewport when container size changes
	useEffect(() => {
		if (containerWidth > 0 && containerHeight > 0) {
			setViewport(getDefaultViewport(containerWidth, containerHeight));
		}
	}, [containerWidth, containerHeight]);

	useEffect(() => {
		return () => {
			if (panRafRef.current != null) {
				cancelAnimationFrame(panRafRef.current);
				panRafRef.current = null;
			}
		};
	}, []);

	const bounds = useMemo(() => {
		return getElementsBounds(drawers, 100);
	}, [drawers]);

	const zoom = useCallback(
		(factor: number, center?: CanvasPoint) => {
			setViewport((prev) => {
				const zoomPoint = center || {
					x: containerWidth / 2,
					y: containerHeight / 2,
				};
				const newZoom = clampZoom(prev.zoom * factor, minZoom, maxZoom);
				return zoomAtPoint(prev, zoomPoint, newZoom);
			});
		},
		[containerWidth, containerHeight, minZoom, maxZoom],
	);

	const zoomIn = useCallback(() => {
		zoom(ZOOM_STEP);
	}, [zoom]);

	const zoomOut = useCallback(() => {
		zoom(1 / ZOOM_STEP);
	}, [zoom]);

	const resetView = useCallback(() => {
		setViewport(getDefaultViewport(containerWidth, containerHeight));
	}, [containerWidth, containerHeight]);

	const zoomToFit = useCallback(() => {
		if (drawers.length === 0) {
			resetView();
			return;
		}

		const bounds = getElementsBounds(drawers, 50);
		const boundsWidth = bounds.maxX - bounds.minX;
		const boundsHeight = bounds.maxY - bounds.minY;

		// Calculate zoom to fit with padding
		const padding = 50;
		const availableWidth = containerWidth - padding * 2;
		const availableHeight = containerHeight - padding * 2;

		const zoom = Math.min(
			availableWidth / boundsWidth,
			availableHeight / boundsHeight,
			maxZoom,
		);

		const clampedZoom = Math.max(zoom, minZoom);

		// Center the bounds
		const scaledWidth = boundsWidth * clampedZoom;
		const scaledHeight = boundsHeight * clampedZoom;

		setViewport({
			x: (containerWidth - scaledWidth) / 2 - bounds.minX * clampedZoom,
			y: (containerHeight - scaledHeight) / 2 - bounds.minY * clampedZoom,
			zoom: clampedZoom,
		});
	}, [drawers, containerWidth, containerHeight, minZoom, maxZoom, resetView]);

	const zoomToLocation = useCallback(
		(
			targetX: number,
			targetY: number,
			targetWidth?: number,
			targetHeight?: number,
			options: { animate?: boolean; duration?: number } = {},
		) => {
			const { animate = false, duration = 0.5 } = options;
			const padding = 60; // pixels of padding around target

			// Calculate zoom if target size is provided
			let newZoom = viewport.zoom;
			if (targetWidth && targetHeight) {
				const availableWidth = containerWidth - padding * 2;
				const availableHeight = containerHeight - padding * 2;
				newZoom = Math.min(
					availableWidth / targetWidth,
					availableHeight / targetHeight,
					maxZoom,
				);
				newZoom = Math.max(newZoom, minZoom);
			} else {
				// Default zoom to 1.5x for compartment focus
				newZoom = Math.min(1.5, maxZoom, viewport.zoom * 1.2);
			}

			// Calculate position to center the target
			const scaledTargetX = targetX * newZoom;
			const scaledTargetY = targetY * newZoom;

			const newX = (containerWidth - scaledTargetX) / 2;
			const newY = (containerHeight - scaledTargetY) / 2;

			if (animate) {
				// Animated transition using requestAnimationFrame for smooth zoom
				const startTime = performance.now();
				const startViewport = { ...viewport };

				const animateViewport = (currentTime: number) => {
					const elapsed = (currentTime - startTime) / 1000; // convert to seconds
					const progress = Math.min(elapsed / duration, 1);

					// Ease out cubic
					const easeProgress = 1 - (1 - progress) ** 3;

					setViewport({
						x: startViewport.x + (newX - startViewport.x) * easeProgress,
						y: startViewport.y + (newY - startViewport.y) * easeProgress,
						zoom:
							startViewport.zoom +
							(newZoom - startViewport.zoom) * easeProgress,
					});

					if (progress < 1) {
						requestAnimationFrame(animateViewport);
					}
				};

				requestAnimationFrame(animateViewport);
			} else {
				// Instant zoom
				setViewport({
					x: newX,
					y: newY,
					zoom: newZoom,
				});
			}
		},
		[containerWidth, containerHeight, minZoom, maxZoom, viewport],
	);

	const pan = useCallback((deltaX: number, deltaY: number) => {
		// Throttle pan updates to animation frames for smoother canvas interaction.
		const prev = pendingPanRef.current;
		pendingPanRef.current = prev
			? { dx: prev.dx + deltaX, dy: prev.dy + deltaY }
			: { dx: deltaX, dy: deltaY };

		if (panRafRef.current != null) return;
		panRafRef.current = requestAnimationFrame(() => {
			panRafRef.current = null;
			const pending = pendingPanRef.current;
			pendingPanRef.current = null;
			if (!pending) return;
			setViewport((vp) => ({
				...vp,
				x: vp.x + pending.dx,
				y: vp.y + pending.dy,
			}));
		});
	}, []);

	const panTo = useCallback((x: number, y: number) => {
		setViewport((prev) => ({
			...prev,
			x,
			y,
		}));
	}, []);

	const screenToBlueprint = useCallback(
		(screenPoint: CanvasPoint): CanvasPoint => ({
			x: (screenPoint.x - viewport.x) / viewport.zoom,
			y: (screenPoint.y - viewport.y) / viewport.zoom,
		}),
		[viewport],
	);

	const blueprintToScreen = useCallback(
		(blueprintPoint: CanvasPoint): CanvasPoint => ({
			x: blueprintPoint.x * viewport.zoom + viewport.x,
			y: blueprintPoint.y * viewport.zoom + viewport.y,
		}),
		[viewport],
	);

	const startDrag = useCallback(
		(point: CanvasPoint) => {
			setIsDragging(true);
			dragStartRef.current = point;
			viewportStartRef.current = { ...viewport };
		},
		[viewport],
	);

	const drag = useCallback(
		(point: CanvasPoint) => {
			if (!isDragging || !dragStartRef.current || !viewportStartRef.current)
				return;

			const deltaX = point.x - dragStartRef.current.x;
			const deltaY = point.y - dragStartRef.current.y;

			setViewport({
				...viewportStartRef.current,
				x: viewportStartRef.current.x + deltaX,
				y: viewportStartRef.current.y + deltaY,
			});
		},
		[isDragging],
	);

	const endDrag = useCallback(() => {
		setIsDragging(false);
		dragStartRef.current = null;
		viewportStartRef.current = null;
	}, []);

	return {
		viewport,
		setViewport,
		zoom,
		zoomIn,
		zoomOut,
		zoomToFit,
		resetView,
		zoomToLocation,
		pan,
		panTo,
		screenToBlueprint,
		blueprintToScreen,
		isDragging,
		startDrag,
		drag,
		endDrag,
		bounds,
	};
}
