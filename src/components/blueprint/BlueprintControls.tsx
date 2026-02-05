import {
	Hand,
	Maximize,
	MousePointer2,
	RotateCcw,
	Square,
	SquareSplitHorizontal,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export type BlueprintTool = "select" | "pan" | "drawer" | "split";

interface BlueprintControlsProps {
	tool: BlueprintTool;
	onToolChange: (tool: BlueprintTool) => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onZoomToFit: () => void;
	onResetView: () => void;
	zoomLevel?: number;
	canEditTools?: boolean;
}

export function BlueprintControls({
	tool,
	onToolChange,
	onZoomIn,
	onZoomOut,
	onZoomToFit,
	onResetView,
	zoomLevel = 100,
	canEditTools = false,
}: BlueprintControlsProps) {
	return (
		<div className="absolute bottom-6 left-6 z-10">
			<div className="flex items-center gap-2 p-2 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200">
				{/* Tools */}
				<div className="flex items-center gap-1">
					<Button
						variant={tool === "select" ? "default" : "ghost"}
						size="icon"
						onClick={() => onToolChange("select")}
						className="h-9 w-9"
						title="Select"
					>
						<MousePointer2 className="w-4 h-4" />
					</Button>
					<Button
						variant={tool === "pan" ? "default" : "ghost"}
						size="icon"
						onClick={() => onToolChange("pan")}
						className="h-9 w-9"
						title="Pan"
					>
						<Hand className="w-4 h-4" />
					</Button>
					<Button
						variant={tool === "drawer" ? "default" : "ghost"}
						size="icon"
						onClick={() => onToolChange("drawer")}
						className="h-9 w-9"
						disabled={!canEditTools}
						title="Draw Drawer (snap to grid)"
					>
						<Square className="w-4 h-4" />
					</Button>
					<Button
						variant={tool === "split" ? "default" : "ghost"}
						size="icon"
						onClick={() => onToolChange("split")}
						className="h-9 w-9"
						disabled={!canEditTools}
						title="Split Drawer (draw a divider line)"
					>
						<SquareSplitHorizontal className="w-4 h-4" />
					</Button>
				</div>

				<div className="w-px h-6 bg-gray-200 mx-1" />

				{/* View controls */}
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						onClick={onZoomIn}
						className="h-9 w-9"
						title="Zoom In"
					>
						<ZoomIn className="w-4 h-4" />
					</Button>

					<Button
						variant="ghost"
						size="icon"
						onClick={onZoomOut}
						className="h-9 w-9"
						title="Zoom Out"
					>
						<ZoomOut className="w-4 h-4" />
					</Button>

					<Button
						variant="ghost"
						size="icon"
						onClick={onZoomToFit}
						className="h-9 w-9"
						title="Fit to Screen"
					>
						<Maximize className="w-4 h-4" />
					</Button>

					<Button
						variant="ghost"
						size="icon"
						onClick={onResetView}
						className="h-9 w-9"
						title="Reset View"
					>
						<RotateCcw className="w-4 h-4" />
					</Button>

					<div className="px-2 text-xs text-gray-500 font-medium tabular-nums">
						{Math.round(zoomLevel)}%
					</div>
				</div>
			</div>
		</div>
	);
}
