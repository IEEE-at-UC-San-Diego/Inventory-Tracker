import type React from "react";
import type { HistoryState } from "@/lib/history";
import type { BlueprintTool } from "@/components/blueprint/BlueprintControls";
import type {
	Compartment,
	DrawerWithCompartments,
	SelectedElement,
} from "@/types";

export interface BlueprintEditorViewProps {
	blueprintId: string;
	blueprint: {
		name: string;
		updatedAt: number;
	};
	canvasSize: { width: number; height: number };
	drawers: DrawerWithCompartments[];
	selectedElement: SelectedElement;
	selectedDrawerIds: string[];
	selectedDrawer: DrawerWithCompartments | null;
	selectedCompartment: Compartment | null;
	mode: "view" | "edit";
	tool: BlueprintTool;
	isLocked: boolean;
	isLockedByMe: boolean;
	zoomLevel: number;
	highlightedCompartmentIds: string[];
	compartmentsWithInventory: Map<string, number>;
	dividers: Array<{
		_id: string;
		x1: number;
		y1: number;
		x2: number;
		y2: number;
		thickness: number;
	}>;
	isInspectorOpen: boolean;
	isEditingName: boolean;
	nameValue: string;
	drawerLabelDraft: string;
	compartmentLabelDraft: string;
	gridRows: number;
	gridCols: number;
	showDeleteDialog: boolean;
	showGridWarning: boolean;
	showDeleteDrawerDialog: boolean;
	showDeleteCompartmentDialog: boolean;
	showVersionHistory: boolean;
	showActionHistory: boolean;
	pendingDeleteDrawerIds: string[];
	pendingDeleteCompartmentId: string | null;
	lockLoading: boolean;
	canEdit: () => boolean;
	canUndoNow: boolean;
	canRedoNow: boolean;
	isApplyingHistory: boolean;
	historyState: HistoryState;
	zoomInRef: React.MutableRefObject<(() => void) | null>;
	zoomOutRef: React.MutableRefObject<(() => void) | null>;
	zoomToFitRef: React.MutableRefObject<(() => void) | null>;
	resetViewRef: React.MutableRefObject<(() => void) | null>;
	zoomToLocationRef: React.MutableRefObject<
		((x: number, y: number, w?: number, h?: number) => void) | null
	>;
	splitOrientation: "vertical" | "horizontal";
	onSplitOrientationChange: () => void;
	onSplitOrientationSync: (orientation: "vertical" | "horizontal") => void;
	toggleSplitOrientationRef: React.MutableRefObject<(() => void) | null>;
	onSelectionChange: (next: {
		selectedElement: SelectedElement;
		selectedDrawerIds: string[];
	}) => void;
	onCreateDrawerFromTool: (drawer: {
		x: number;
		y: number;
		width: number;
		height: number;
	}) => void;
	onSplitDrawerFromTool: (split: {
		drawerId: string;
		orientation: "vertical" | "horizontal";
		position: number;
		targetCompartmentId?: string | null;
	}) => void;
	onSwapCompartments: (
		aCompartmentId: string,
		bCompartmentId: string,
	) => Promise<void>;
	onUpdateDrawers: (
		updates: Array<{ drawerId: string; x: number; y: number }>,
	) => Promise<void>;
	onUpdateCompartment: (
		compartmentId: string,
		updates: Partial<Compartment>,
	) => Promise<void>;
	onResizeDrawer: (
		drawerId: string,
		updates: { x: number; y: number; width: number; height: number },
	) => void;
	onCreateDivider: (divider: {
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	}) => void;
	onUpdateDivider: (dividerId: string, updates: { x1: number; y1: number; x2: number; y2: number }) => void;
	onViewportChange: (viewport: { zoom: number; x: number; y: number }) => void;
	onToolChange: (tool: BlueprintTool) => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onZoomToFit: () => void;
	onResetView: () => void;
	onNavigateBack: () => void;
	onNameChange: (value: string) => void;
	onNameEditStart: () => void;
	onNameEditCancel: () => void;
	onSaveName: () => void;
	onUndo: () => Promise<void>;
	onRedo: () => Promise<void>;
	onDeleteSelected: () => void;
	onAcquireLock: () => void;
	onReleaseLock: () => void;
	onOpenDeleteBlueprint: () => void;
	onCloseDeleteBlueprint: (open: boolean) => void;
	onConfirmDeleteBlueprint: () => void;
	onOpenInspector: () => void;
	onCloseInspector: () => void;
	onOpenDeleteDrawers: (drawerIds: string[]) => void;
	onCloseDeleteDrawers: (open: boolean) => void;
	onConfirmDeleteDrawers: () => void;
	onForceDeleteDrawers: () => void;
	onOpenDeleteCompartment: (compartmentId: string) => void;
	onCloseDeleteCompartment: (open: boolean) => void;
	onConfirmDeleteCompartment: () => void;
	onForceDeleteCompartment: () => void;
	onDrawerLabelDraftChange: (value: string) => void;
	onCompartmentLabelDraftChange: (value: string) => void;
	onSaveDrawerLabel: () => void;
	onSaveCompartmentLabel: () => void;
	onGridRowsChange: (value: number) => void;
	onGridColsChange: (value: number) => void;
	onRequestApplyGrid: (rows: number, cols: number) => void;
	onOpenGridWarning: (open: boolean) => void;
	onConfirmGridWarning: () => Promise<void>;
	onClearHighlight: () => void;
	onShowVersionHistory: (open: boolean) => void;
	onShowActionHistory: (open: boolean) => void;
}
