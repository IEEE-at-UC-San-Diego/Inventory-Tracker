import type { Compartment, Drawer, DrawerWithCompartments, SelectedElement } from "@/types";
import type { AuthContext } from "@/types/auth";
import type {
	DrawerSnapshot,
	HistoryEntry,
	HistoryState,
	LogicalId,
	SelectionSnapshot,
} from "@/lib/history";
import type { Id } from "../../convex/_generated/dataModel";

export type PrimarySelectionRef =
	| { type: "drawer"; id: string }
	| { type: "compartment"; id: string; drawerId: string }
	| null;

export interface LegacySelectionSnapshot {
	selectedDrawerIds: string[];
	primary: PrimarySelectionRef;
}

export type HistoryStep =
	| {
			type: "selection";
			prev: LegacySelectionSnapshot;
			next: LegacySelectionSnapshot;
	  }
	| {
			type: "updateDrawer";
			drawerId: string;
			prev: Partial<Drawer>;
			next: Partial<Drawer>;
	  }
	| {
			type: "updateCompartment";
			compartmentId: string;
			prev: Partial<Compartment> & { drawerId?: string };
			next: Partial<Compartment> & { drawerId?: string };
	  }
	| {
			type: "createDrawer";
			blueprintId: string;
			args: Omit<
				Drawer,
				"_id" | "createdAt" | "updatedAt" | "blueprintId" | "zIndex"
			> &
				Partial<Pick<Drawer, "label" | "gridRows" | "gridCols" | "zIndex">>;
			drawerId: string;
	  }
	| {
			type: "deleteDrawer";
			snapshot: DrawerWithCompartments;
			currentDrawerId: string;
	  }
	| {
			type: "createCompartment";
			args: Omit<
				Compartment,
				"_id" | "createdAt" | "updatedAt" | "drawerId" | "zIndex"
			> &
				Partial<Pick<Compartment, "drawerId" | "label" | "zIndex">>;
			compartmentId: string;
	  }
	| {
			type: "deleteCompartment";
			snapshot: Compartment;
			currentCompartmentId: string;
	  }
	| {
			type: "updateBlueprintName";
			blueprintId: string;
			prevName: string;
			nextName: string;
	  }
	| {
			type: "createDivider";
			blueprintId: string;
			dividerId: string;
			args: {
				x1: number;
				y1: number;
				x2: number;
				y2: number;
				thickness?: number;
			};
	  }
	| {
			type: "deleteDivider";
			dividerId: string;
			snapshot: {
				_id: string;
				blueprintId: string;
				x1: number;
				y1: number;
				x2: number;
				y2: number;
				thickness: number;
			};
	  }
	| {
			type: "updateDivider";
			dividerId: string;
			prev: { x1: number; y1: number; x2: number; y2: number; thickness?: number };
			next: { x1: number; y1: number; x2: number; y2: number; thickness?: number };
	  }
	| {
			type: "setGrid";
			drawerId: string;
			beforeGridRows?: number;
			beforeGridCols?: number;
			afterGridRows: number;
			afterGridCols: number;
			beforeCompartments: Array<{ _id: string; drawerId: string; x: number; y: number; width: number; height: number; rotation: number; zIndex: number; label?: string }>;
			afterCompartments: Array<{ _id: string; drawerId: string; x: number; y: number; width: number; height: number; rotation: number; zIndex: number; label?: string }>;
			deletedCompartments: Array<{ _id: string; drawerId: string; x: number; y: number; width: number; height: number; rotation: number; zIndex: number; label?: string }>;
			createdCompartments: Array<{ _id: string; drawerId: string; x: number; y: number; width: number; height: number; rotation: number; zIndex: number; label?: string }>;
	  };

export interface LegacyHistoryEntry {
	label: string;
	requiresLock: boolean;
	steps: HistoryStep[];
	timestamp: number;
}

export interface ViewportSnapshot {
	zoom: number;
	x: number;
	y: number;
}

export interface HistoryDependencies {
	getAuthContext: () => Promise<AuthContext>;
	mutations: {
		createDrawer: (args: {
			authContext: AuthContext;
			blueprintId: Id<"blueprints">;
			x: number;
			y: number;
			width: number;
			height: number;
			rotation?: number;
			zIndex?: number;
			gridRows?: number;
			gridCols?: number;
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
		}) => Promise<boolean | void>;
		deleteDrawer: (args: {
			authContext: AuthContext;
			drawerId: Id<"drawers">;
		}) => Promise<boolean | void>;
		createCompartment: (args: {
			authContext: AuthContext;
			drawerId: Id<"drawers">;
			x: number;
			y: number;
			width: number;
			height: number;
			rotation?: number;
			zIndex?: number;
			label?: string;
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
			zIndex?: number;
			label?: string;
		}) => Promise<boolean | void>;
		deleteCompartment: (args: {
			authContext: AuthContext;
			compartmentId: Id<"compartments">;
		}) => Promise<boolean | void>;
		updateBlueprint: (args: {
			authContext: AuthContext;
			blueprintId: Id<"blueprints">;
			name: string;
		}) => Promise<boolean | void>;
		createDivider: (args: {
			authContext: AuthContext;
			blueprintId: Id<"blueprints">;
			x1: number;
			y1: number;
			x2: number;
			y2: number;
			thickness?: number;
		}) => Promise<Id<"dividers">>;
		updateDivider: (args: {
			authContext: AuthContext;
			dividerId: Id<"dividers">;
			x1?: number;
			y1?: number;
			x2?: number;
			y2?: number;
			thickness?: number;
		}) => Promise<boolean | void>;
		deleteDivider: (args: {
			authContext: AuthContext;
			dividerId: Id<"dividers">;
		}) => Promise<boolean | void>;
		setGridForDrawer: (args: {
			authContext: AuthContext;
			drawerId: Id<"drawers">;
			rows: number;
			cols: number;
		}) => Promise<boolean | void>;
	};
	blueprintId: Id<"blueprints">;
	blueprintName: string;
	drawers: DrawerWithCompartments[];
	viewport: {
		zoom: number;
		x: number;
		y: number;
	};
	selection: {
		selectedElement: SelectedElement;
		selectedDrawerIds: string[];
	};
	isLockedByMe: boolean;
	restoreSelection: (selection: {
		selectedDrawerIds: string[];
		selectedCompartmentId: string | null;
	}) => void;
	restoreViewport: (viewport: ViewportSnapshot) => void;
	onError?: (title: string, message: string) => void;
}

export interface UseBlueprintHistoryReturn {
	historyState: HistoryState;
	canUndo: boolean;
	canRedo: boolean;
	isApplying: boolean;
	pushHistoryEntry: (entry: LegacyHistoryEntry) => void;
	undo: () => Promise<void>;
	redo: () => Promise<void>;
	getStateSnapshot: (entry: HistoryEntry) => {
		select: "before" | "after";
		drawers: Map<LogicalId, DrawerSnapshot>;
		viewport: ViewportSnapshot;
		selection: SelectionSnapshot;
	};
	clearHistory: () => void;
}
