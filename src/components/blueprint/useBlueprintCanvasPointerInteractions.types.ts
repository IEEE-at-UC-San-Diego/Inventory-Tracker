import type { KonvaEventObject } from "konva/lib/Node";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import type React from "react";
import type {
	CanvasMode,
	Compartment,
	DrawerWithCompartments,
	SelectedElement,
	Viewport,
} from "@/types";
import type { BlueprintTool } from "./BlueprintControls";

export interface DraftDrawer {
	startX: number;
	startY: number;
	endX: number;
	endY: number;
}

export interface DraftSplit {
	drawerId: string;
	orientation: "vertical" | "horizontal";
	position: number;
	targetCompartmentId?: string | null;
}

export type ResizeHandle =
	| "nw"
	| "n"
	| "ne"
	| "e"
	| "se"
	| "s"
	| "sw"
	| "w";

export interface DraftDivider {
	startX: number;
	startY: number;
	endX: number;
	endY: number;
}

export interface DraftResize {
	drawerId: string;
	handle: ResizeHandle;
	startX: number;
	startY: number;
	startWidth: number;
	startHeight: number;
	currentX: number;
	currentY: number;
	currentWidth: number;
	currentHeight: number;
}

export interface SelectionBox {
	startClientX: number;
	startClientY: number;
	startWorldX: number;
	startWorldY: number;
	endWorldX: number;
	endWorldY: number;
}

export interface UseBlueprintCanvasPointerInteractionsParams {
	stageRef: React.RefObject<KonvaStage | null>;
	drawers: DrawerWithCompartments[];
	viewport: Viewport;
	mode: CanvasMode;
	tool: BlueprintTool;
	isLockedByMe: boolean;
	selectedElement: SelectedElement;
	selectedDrawerIdSet: Set<string>;
	dragStateActive: boolean;
	gridSize: number;
	snapToGrid: (value: number) => number;
	zoom: (factor: number, center: { x: number; y: number }) => void;
	pan: (dx: number, dy: number) => void;
	findDrawerAtWorldPoint: (
		point: { x: number; y: number },
	) => DrawerWithCompartments | null;
	findCompartmentAtWorldPoint: (
		drawer: DrawerWithCompartments,
		point: { x: number; y: number },
	) => Compartment | null;
	checkBulkMoveCollision: (
		drawerIds: string[],
		positionOverrides: Record<string, { x: number; y: number }>,
		allDrawers: DrawerWithCompartments[],
	) => boolean;
	onSelectionChange: (next: {
		selectedElement: SelectedElement;
		selectedDrawerIds: string[];
	}) => void;
	onCreateDrawerFromTool?: (drawer: {
		x: number;
		y: number;
		width: number;
		height: number;
	}) => void;
	onSplitDrawerFromTool?: (split: {
		drawerId: string;
		orientation: "vertical" | "horizontal";
		position: number;
		targetCompartmentId?: string | null;
	}) => void;
	onUpdateDrawers?: (
		updates: Array<{ drawerId: string; x: number; y: number }>,
	) => void;
	onResizeDrawer?: (
		drawerId: string,
		updates: { x: number; y: number; width: number; height: number },
	) => void;
	onCreateDivider?: (divider: {
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	}) => void;
}

export interface UseBlueprintCanvasPointerInteractionsResult {
	isPanning: boolean;
	draftDrawer: DraftDrawer | null;
	draftSplit: DraftSplit | null;
	hoverSplit: DraftSplit | null;
	splitOrientation: "vertical" | "horizontal";
	setSplitOrientation: React.Dispatch<
		React.SetStateAction<"vertical" | "horizontal">
	>;
	draftResize: DraftResize | null;
	draftDivider: DraftDivider | null;
	selectionBox: SelectionBox | null;
	drawerPositionOverrides: Record<string, { x: number; y: number }> | null;
	invalidDrop: boolean;
	handleWheel: (e: KonvaEventObject<WheelEvent>) => void;
	handleMouseDown: (e: KonvaEventObject<MouseEvent>) => void;
	handleMouseMove: (e: KonvaEventObject<MouseEvent>) => void;
	handleMouseUp: () => void;
}
