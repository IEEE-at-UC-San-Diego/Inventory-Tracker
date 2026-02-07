import type { AuthContext } from "@/types/auth";
import type { Id } from "../../../../convex/_generated/dataModel";

interface HistoryMutationsInput {
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
}

export function buildHistoryMutations({
	createDrawer,
	updateDrawer,
	deleteDrawer,
	createCompartment,
	updateCompartment,
	deleteCompartment,
	updateBlueprint,
}: HistoryMutationsInput) {
	return {
		createDrawer: async (args: {
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
		}) => {
			return await createDrawer(args);
		},
		updateDrawer: async (args: {
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
		}) => {
			await updateDrawer(args);
		},
		deleteDrawer: async (args: {
			authContext: AuthContext;
			drawerId: Id<"drawers">;
		}) => {
			await deleteDrawer(args);
		},
		createCompartment: async (args: {
			authContext: AuthContext;
			drawerId: Id<"drawers">;
			x: number;
			y: number;
			width: number;
			height: number;
			rotation?: number;
			zIndex?: number;
			label?: string;
		}) => {
			return await createCompartment(args);
		},
		updateCompartment: async (args: {
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
		}) => {
			await updateCompartment(args);
		},
		deleteCompartment: async (args: {
			authContext: AuthContext;
			compartmentId: Id<"compartments">;
		}) => {
			await deleteCompartment(args);
		},
	updateBlueprint: async (args: {
		authContext: AuthContext;
		blueprintId: Id<"blueprints">;
		name: string;
	}) => {
		await updateBlueprint(args);
	},
	};
}
