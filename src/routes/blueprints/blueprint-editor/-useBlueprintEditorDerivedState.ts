import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { BlueprintTool } from "@/components/blueprint/BlueprintControls";
import type {
	Compartment,
	DrawerWithCompartments,
	SelectedElement,
} from "@/types";
import type { AuthContext } from "@/types/auth";
import type { Id } from "../../../../convex/_generated/dataModel";

interface ToastLike {
	success: (title: string, description?: string) => void;
}

interface UseBlueprintEditorDerivedStateParams {
	blueprintData:
		| {
				name: string;
		  }
		| null
		| undefined;
	drawers: DrawerWithCompartments[];
	selectedElement: SelectedElement;
	selectedDrawerIds: string[];
	setSelectedElement: (next: SelectedElement) => void;
	setSelectedDrawerIds: (next: string[]) => void;
	setNameValue: (value: string) => void;
	tool: BlueprintTool;
	setTool: (tool: BlueprintTool) => void;
	isLockedByMe: boolean;
	highlightPartId?: string;
	partCompartmentsQuery?: Array<{
		_id: string;
		drawerId: string;
		x: number;
		y: number;
		width: number;
		height: number;
	}>;
	setHighlightedCompartmentIds: (ids: string[]) => void;
	inventoryData?: Array<{
		compartmentId: string;
		quantity: number;
	}>;
	getRequiredAuthContext: () => Promise<AuthContext>;
	setGridForDrawer: (args: {
		authContext: AuthContext;
		drawerId: Id<"drawers">;
		rows: number;
		cols: number;
	}) => Promise<boolean | undefined>;
	setHasChanges: (value: boolean) => void;
	toast: ToastLike;
}

interface UseBlueprintEditorDerivedStateReturn {
	canvasSize: { width: number; height: number };
	selectedDrawer: DrawerWithCompartments | null;
	selectedCompartment: Compartment | null;
	applySelection: (next: {
		selectedElement: SelectedElement;
		selectedDrawerIds: string[];
	}) => void;
	drawerLabelDraft: string;
	setDrawerLabelDraft: (value: string) => void;
	compartmentLabelDraft: string;
	setCompartmentLabelDraft: (value: string) => void;
	gridRows: number;
	setGridRows: (value: number) => void;
	gridCols: number;
	setGridCols: (value: number) => void;
	showGridWarning: boolean;
	setShowGridWarning: (open: boolean) => void;
	pendingGridRef: React.MutableRefObject<{ rows: number; cols: number } | null>;
	applyGrid: (rows: number, cols: number) => Promise<void>;
	requestApplyGrid: (rows: number, cols: number) => void;
	compartmentsWithInventory: Map<string, number>;
}

export function useBlueprintEditorDerivedState({
	blueprintData,
	drawers,
	selectedElement,
	selectedDrawerIds,
	setSelectedElement,
	setSelectedDrawerIds,
	setNameValue,
	tool,
	setTool,
	isLockedByMe,
	highlightPartId,
	partCompartmentsQuery,
	setHighlightedCompartmentIds,
	inventoryData,
	getRequiredAuthContext,
	setGridForDrawer,
	setHasChanges,
	toast,
}: UseBlueprintEditorDerivedStateParams): UseBlueprintEditorDerivedStateReturn {
	const [canvasSize, setCanvasSize] = useState(() => ({
		width: typeof window !== "undefined" ? window.innerWidth : 800,
		height: typeof window !== "undefined" ? window.innerHeight : 600,
	}));

	const selectedDrawer = useMemo(() => {
		if (selectedElement?.type === "drawer") {
			return drawers.find((d) => d._id === selectedElement.id) ?? null;
		}
		if (selectedElement?.type === "compartment") {
			return drawers.find((d) => d._id === selectedElement.drawerId) ?? null;
		}
		return null;
	}, [drawers, selectedElement]);

	const selectedCompartment = useMemo(() => {
		return selectedElement?.type === "compartment"
			? selectedElement.data
			: null;
	}, [selectedElement]);

	const applySelection = useCallback(
		(next: {
			selectedElement: SelectedElement;
			selectedDrawerIds: string[];
		}) => {
			setSelectedElement(next.selectedElement);
			setSelectedDrawerIds(next.selectedDrawerIds);
		},
		[setSelectedDrawerIds, setSelectedElement],
	);

	useEffect(() => {
		if (!selectedElement && selectedDrawerIds.length === 0) return;
		const drawerById = new Map(drawers.map((d) => [d._id, d]));
		const nextSelectedDrawerIds = selectedDrawerIds.filter((id) =>
			drawerById.has(id),
		);

		let nextSelectedElement: SelectedElement = selectedElement;
		if (selectedElement?.type === "drawer") {
			const drawer = drawerById.get(selectedElement.id) ?? null;
			nextSelectedElement = drawer
				? { type: "drawer", id: drawer._id, data: drawer }
				: null;
			if (drawer && nextSelectedDrawerIds.length === 0) {
				nextSelectedDrawerIds.push(drawer._id);
			}
		} else if (selectedElement?.type === "compartment") {
			const drawer = drawerById.get(selectedElement.drawerId) ?? null;
			const compartment =
				drawer?.compartments.find((c) => c._id === selectedElement.id) ?? null;
			nextSelectedElement =
				drawer && compartment
					? {
							type: "compartment",
							id: compartment._id,
							data: compartment,
							drawerId: drawer._id,
						}
					: null;
		}

		const selectionChanged =
			nextSelectedElement?.type !== selectedElement?.type ||
			(nextSelectedElement?.type === "drawer" &&
				selectedElement?.type === "drawer" &&
				nextSelectedElement.id !== selectedElement.id) ||
			(nextSelectedElement?.type === "compartment" &&
				selectedElement?.type === "compartment" &&
				(nextSelectedElement.id !== selectedElement.id ||
					nextSelectedElement.drawerId !== selectedElement.drawerId)) ||
			(nextSelectedElement === null && selectedElement !== null) ||
			nextSelectedDrawerIds.length !== selectedDrawerIds.length ||
			nextSelectedDrawerIds.some((id, i) => id !== selectedDrawerIds[i]);

		if (!selectionChanged) return;
		applySelection({
			selectedElement: nextSelectedElement,
			selectedDrawerIds: nextSelectedDrawerIds,
		});
	}, [applySelection, drawers, selectedDrawerIds, selectedElement]);

	const [drawerLabelDraft, setDrawerLabelDraft] = useState("");
	const [compartmentLabelDraft, setCompartmentLabelDraft] = useState("");
	useEffect(() => {
		setDrawerLabelDraft(selectedDrawer?.label ?? "");
	}, [selectedDrawer?.label]);
	useEffect(() => {
		setCompartmentLabelDraft(selectedCompartment?.label ?? "");
	}, [selectedCompartment?.label]);

	useEffect(() => {
		if (!isLockedByMe && (tool === "drawer" || tool === "split")) {
			setTool("select");
		}
	}, [isLockedByMe, setTool, tool]);

	const [gridRows, setGridRows] = useState(1);
	const [gridCols, setGridCols] = useState(1);
	const [showGridWarning, setShowGridWarning] = useState(false);
	const pendingGridRef = useRef<{ rows: number; cols: number } | null>(null);

	useEffect(() => {
		if (!selectedDrawer) return;
		if (selectedDrawer.gridRows && selectedDrawer.gridCols) {
			setGridRows(Math.max(1, Math.floor(selectedDrawer.gridRows)));
			setGridCols(Math.max(1, Math.floor(selectedDrawer.gridCols)));
			return;
		}
		const n = selectedDrawer.compartments.length;
		if (n <= 0) {
			setGridRows(1);
			setGridCols(1);
			return;
		}
		const approx = Math.max(1, Math.round(Math.sqrt(n)));
		setGridRows(Math.max(1, Math.floor(n / approx)));
		setGridCols(
			Math.max(1, Math.ceil(n / Math.max(1, Math.floor(n / approx)))),
		);
	}, [selectedDrawer]);

	const applyGrid = useCallback(
		async (rows: number, cols: number) => {
			if (!selectedDrawer) return;
			const context = await getRequiredAuthContext();
			await setGridForDrawer({
				authContext: context,
				drawerId: selectedDrawer._id as Id<"drawers">,
				rows,
				cols,
			});
			setHasChanges(true);
			toast.success("Grid updated");
		},
		[
			getRequiredAuthContext,
			selectedDrawer,
			setGridForDrawer,
			setHasChanges,
			toast,
		],
	);

	const requestApplyGrid = useCallback(
		(rows: number, cols: number) => {
			if (!selectedDrawer) return;
			const safeRows = Number.isFinite(rows)
				? Math.max(1, Math.floor(rows))
				: 1;
			const safeCols = Number.isFinite(cols)
				? Math.max(1, Math.floor(cols))
				: 1;
			const newCells = safeRows * safeCols;
			const existing = selectedDrawer.compartments.length;
			if (newCells < existing) {
				pendingGridRef.current = { rows: safeRows, cols: safeCols };
				setShowGridWarning(true);
				return;
			}
			void applyGrid(safeRows, safeCols);
		},
		[applyGrid, selectedDrawer],
	);

	useEffect(() => {
		if (blueprintData) {
			setNameValue(blueprintData.name);
		}
	}, [blueprintData, setNameValue]);

	useLayoutEffect(() => {
		const vv = window.visualViewport ?? null;
		const updateSize = () => {
			const width = Math.floor(vv?.width ?? window.innerWidth);
			const height = Math.floor(vv?.height ?? window.innerHeight);
			if (width <= 0 || height <= 0) return;
			setCanvasSize({ width, height });
		};
		updateSize();
		window.addEventListener("resize", updateSize);
		vv?.addEventListener("resize", updateSize);
		vv?.addEventListener("scroll", updateSize);
		return () => {
			window.removeEventListener("resize", updateSize);
			vv?.removeEventListener("resize", updateSize);
			vv?.removeEventListener("scroll", updateSize);
		};
	}, []);

	useEffect(() => {
		const prevBodyOverflow = document.body.style.overflow;
		const prevHtmlOverflow = document.documentElement.style.overflow;
		document.body.style.overflow = "hidden";
		document.documentElement.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = prevBodyOverflow;
			document.documentElement.style.overflow = prevHtmlOverflow;
		};
	}, []);

	const compartmentsWithInventory = useMemo(() => {
		const map = new Map<string, number>();
		inventoryData?.forEach((item) => {
			const existing = map.get(item.compartmentId) ?? 0;
			map.set(item.compartmentId, existing + item.quantity);
		});
		return map;
	}, [inventoryData]);

	useEffect(() => {
		if (highlightPartId && partCompartmentsQuery) {
			const compartments = partCompartmentsQuery;
			if (compartments.length > 0) {
				setHighlightedCompartmentIds(compartments.map((c) => c._id));
			}
		}
	}, [highlightPartId, partCompartmentsQuery, setHighlightedCompartmentIds]);

	return {
		canvasSize,
		selectedDrawer,
		selectedCompartment,
		applySelection,
		drawerLabelDraft,
		setDrawerLabelDraft,
		compartmentLabelDraft,
		setCompartmentLabelDraft,
		gridRows,
		setGridRows,
		gridCols,
		setGridCols,
		showGridWarning,
		setShowGridWarning,
		pendingGridRef,
		applyGrid,
		requestApplyGrid,
		compartmentsWithInventory,
	};
}
