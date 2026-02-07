import {
	ArrowLeft,
	Crosshair,
	History,
	Lock,
	PanelRightOpen,
	Redo2,
	Save,
	Trash2,
	Undo2,
	Unlock,
	X,
} from "lucide-react";
import {
	ActionHistoryPanel,
	BlueprintCanvas,
	BlueprintControls,
	VersionHistoryPanel,
} from "@/components/blueprint";
import { Button } from "@/components/ui/button";
import { AlertDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { BlueprintEditorViewProps } from "./-BlueprintEditorView.types";

export function BlueprintEditorView({
	blueprintId,
	blueprint,
	canvasSize,
	drawers,
	selectedElement,
	selectedDrawerIds,
	selectedDrawer,
	selectedCompartment,
	mode,
	tool,
	isLocked,
	isLockedByMe,
	zoomLevel,
	highlightedCompartmentIds,
	compartmentsWithInventory,
	isInspectorOpen,
	isEditingName,
	nameValue,
	drawerLabelDraft,
	compartmentLabelDraft,
	gridRows,
	gridCols,
	showDeleteDialog,
	showGridWarning,
	showDeleteDrawerDialog,
	showDeleteCompartmentDialog,
	showVersionHistory,
	showActionHistory,
	pendingDeleteDrawerIds,
	pendingDeleteCompartmentId,
	lockLoading,
	canEdit,
	canUndoNow,
	canRedoNow,
	isApplyingHistory,
	historyState,
	zoomInRef,
	zoomOutRef,
	zoomToFitRef,
	resetViewRef,
	zoomToLocationRef,
	onSelectionChange,
	onCreateDrawerFromTool,
	onSplitDrawerFromTool,
	onSwapCompartments,
	onUpdateDrawers,
	onUpdateCompartment,
	onViewportChange,
	onToolChange,
	onZoomIn,
	onZoomOut,
	onZoomToFit,
	onResetView,
	onNavigateBack,
	onNameChange,
	onNameEditStart,
	onNameEditCancel,
	onSaveName,
	onUndo,
	onRedo,
	onDeleteSelected,
	onAcquireLock,
	onReleaseLock,
	onOpenDeleteBlueprint,
	onCloseDeleteBlueprint,
	onConfirmDeleteBlueprint,
	onOpenInspector,
	onCloseInspector,
	onOpenDeleteDrawers,
	onCloseDeleteDrawers,
	onConfirmDeleteDrawers,
	onOpenDeleteCompartment,
	onCloseDeleteCompartment,
	onConfirmDeleteCompartment,
	onDrawerLabelDraftChange,
	onCompartmentLabelDraftChange,
	onSaveDrawerLabel,
	onSaveCompartmentLabel,
	onGridRowsChange,
	onGridColsChange,
	onRequestApplyGrid,
	onOpenGridWarning,
	onConfirmGridWarning,
	onClearHighlight,
	onShowVersionHistory,
	onShowActionHistory,
}: BlueprintEditorViewProps) {
	return (
		<div className="fixed inset-0 overflow-hidden bg-white">
			<div className="absolute inset-0">
				<BlueprintCanvas
					width={canvasSize.width}
					height={canvasSize.height}
					drawers={drawers}
					selectedElement={selectedElement}
					selectedDrawerIds={selectedDrawerIds}
					mode={mode}
					tool={tool}
					isLocked={isLocked}
					isLockedByMe={isLockedByMe}
					onSelectionChange={onSelectionChange}
					onCreateDrawerFromTool={onCreateDrawerFromTool}
					onSplitDrawerFromTool={onSplitDrawerFromTool}
					onSwapCompartments={onSwapCompartments}
					onUpdateDrawers={onUpdateDrawers}
					onUpdateCompartment={onUpdateCompartment}
					onViewportChange={onViewportChange}
					zoomInRef={zoomInRef}
					zoomOutRef={zoomOutRef}
					zoomToFitRef={zoomToFitRef}
					resetViewRef={resetViewRef}
					zoomToLocationRef={zoomToLocationRef}
					compartmentsWithInventory={compartmentsWithInventory}
					highlightedCompartmentIds={highlightedCompartmentIds}
				/>

				<BlueprintControls
					tool={tool}
					onToolChange={onToolChange}
					onZoomIn={onZoomIn}
					onZoomOut={onZoomOut}
					onZoomToFit={onZoomToFit}
					onResetView={onResetView}
					zoomLevel={zoomLevel}
					canEditTools={isLockedByMe}
				/>

				<div className="absolute top-4 left-4 right-4 z-20 pointer-events-none">
					<div className="flex items-center justify-between gap-3 pointer-events-auto">
						<div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white/95 backdrop-blur-sm shadow-lg px-3 py-2">
							<Button
								variant="ghost"
								size="icon"
								onClick={onNavigateBack}
								className="h-9 w-9"
								title="Back"
							>
								<ArrowLeft className="w-5 h-5" />
							</Button>

							<div className="flex items-center gap-2">
								{isEditingName ? (
									<>
										<Input
											value={nameValue}
											onChange={(e) => onNameChange(e.target.value)}
											className="h-9 w-64"
											autoFocus
										/>
										<Button size="sm" onClick={onSaveName}>
											<Save className="w-4 h-4" />
										</Button>
										<Button size="sm" variant="ghost" onClick={onNameEditCancel}>
											<X className="w-4 h-4" />
										</Button>
									</>
								) : (
									<button
										type="button"
										onClick={onNameEditStart}
										className="text-left"
										title={canEdit() ? "Rename" : undefined}
									>
										<div className="text-sm font-semibold text-gray-900 leading-tight">
											{blueprint.name}
										</div>
										<div className="text-xs text-gray-500 leading-tight">
											Last updated {new Date(blueprint.updatedAt).toLocaleString()}
										</div>
									</button>
								)}
							</div>
						</div>

						<div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white/95 backdrop-blur-sm shadow-lg px-3 py-2">
							<Button
								variant="ghost"
								size="icon"
								onClick={() => void onUndo()}
								disabled={!canUndoNow}
								title="Undo (Ctrl/Cmd+Z)"
							>
								<Undo2 className="w-4 h-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => void onRedo()}
								disabled={!canRedoNow}
								title="Redo (Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z)"
							>
								<Redo2 className="w-4 h-4" />
							</Button>
							{isLockedByMe &&
								(selectedDrawerIds.length > 1 || selectedElement) && (
									<Button
										variant="outline"
										size="sm"
										onClick={onDeleteSelected}
										className="text-red-700 hover:text-red-800"
									>
										<Trash2 className="w-4 h-4 mr-2" />
										{selectedDrawerIds.length > 1
											? `Delete ${selectedDrawerIds.length}`
											: "Delete Selected"}
									</Button>
								)}
							<Button
								variant="outline"
								size="sm"
								onClick={() => onShowActionHistory(true)}
							>
								<History className="w-4 h-4 mr-2" />
								History
							</Button>
							{canEdit() && !isLockedByMe && !isLocked && (
								<Button onClick={onAcquireLock} disabled={lockLoading}>
									<Lock className="w-4 h-4 mr-2" />
									Edit
								</Button>
							)}
							{isLockedByMe && (
								<Button
									variant="outline"
									onClick={onReleaseLock}
									disabled={lockLoading}
								>
									<Unlock className="w-4 h-4 mr-2" />
									Done
								</Button>
							)}
							{canEdit() && (
								<Button
									variant="ghost"
									size="icon"
									onClick={onOpenDeleteBlueprint}
									className="text-red-600 hover:text-red-700 hover:bg-red-50"
									title="Delete blueprint"
								>
									<Trash2 className="w-4 h-4" />
								</Button>
							)}
						</div>
					</div>
				</div>

				{(selectedDrawer || selectedCompartment) && !isInspectorOpen && (
					<div className="absolute top-20 right-4 z-20">
						<Button
							variant="secondary"
							size="sm"
							className="shadow-lg"
							onClick={onOpenInspector}
						>
							<PanelRightOpen className="mr-2 h-4 w-4" />
							Details
						</Button>
					</div>
				)}
				{selectedDrawerIds.length > 1 && (
					<div className="absolute top-32 right-4 z-20">
						<Button
							variant="destructive"
							size="sm"
							className="shadow-lg"
							onClick={() => onOpenDeleteDrawers(selectedDrawerIds)}
							disabled={!isLockedByMe}
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete Selected ({selectedDrawerIds.length})
						</Button>
					</div>
				)}
				{(selectedDrawer || selectedCompartment) && isInspectorOpen && (
					<div className="absolute top-20 right-4 z-20 w-85 max-h-[70vh] overflow-auto rounded-xl border border-gray-200 bg-white/95 backdrop-blur-sm shadow-lg p-3">
						<div className="flex items-center justify-between gap-2 mb-2">
							<div className="text-sm font-semibold text-gray-900">
								{selectedCompartment ? "Compartment" : "Drawer"} Details
							</div>
							<Button
								variant="ghost"
								size="icon"
								className="h-8 w-8"
								onClick={onCloseInspector}
								title="Collapse"
							>
								<X className="w-4 h-4" />
							</Button>
						</div>

						{selectedDrawer && (
							<div className="space-y-2">
								<div className="space-y-1">
									<Label>Label</Label>
									<div className="flex items-center gap-2">
										<Input
											value={drawerLabelDraft}
											onChange={(e) => onDrawerLabelDraftChange(e.target.value)}
											onKeyDown={(e) => {
												if (e.key !== "Enter") return;
												e.preventDefault();
												onSaveDrawerLabel();
											}}
											disabled={!isLockedByMe || tool !== "select"}
											placeholder="Drawer name"
										/>
										<Button
											size="sm"
											variant="outline"
											onClick={onSaveDrawerLabel}
											disabled={!isLockedByMe || tool !== "select"}
										>
											Save
										</Button>
									</div>
								</div>

								<div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
									<div className="text-xs font-medium text-gray-900">
										Grid Layout (Rows x Columns)
									</div>
									<div className="mt-2 grid grid-cols-2 gap-2">
										<div className="space-y-1">
											<Label>Rows</Label>
											<Input
												type="number"
												min={1}
												value={gridRows}
												onChange={(e) => onGridRowsChange(Number(e.target.value))}
												disabled={!isLockedByMe}
											/>
										</div>
										<div className="space-y-1">
											<Label>Columns</Label>
											<Input
												type="number"
												min={1}
												value={gridCols}
												onChange={(e) => onGridColsChange(Number(e.target.value))}
												disabled={!isLockedByMe}
											/>
										</div>
									</div>
									<div className="mt-2 grid grid-cols-2 gap-2">
										<Button
											size="sm"
											variant="outline"
											onClick={() => onRequestApplyGrid(gridRows + 1, gridCols)}
											disabled={!isLockedByMe}
										>
											Add Row
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => onRequestApplyGrid(gridRows, gridCols + 1)}
											disabled={!isLockedByMe}
										>
											Add Column
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => onRequestApplyGrid(gridRows - 1, gridCols)}
											disabled={!isLockedByMe || gridRows <= 1}
										>
											Remove Row
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => onRequestApplyGrid(gridRows, gridCols - 1)}
											disabled={!isLockedByMe || gridCols <= 1}
										>
											Remove Column
										</Button>
									</div>
									<div className="mt-2 flex items-center justify-between gap-2">
										<div className="text-xs text-gray-600">
											Reducing rows/cols may delete compartments.
										</div>
										<Button
											size="sm"
											variant="outline"
											onClick={() => onRequestApplyGrid(gridRows, gridCols)}
											disabled={!isLockedByMe}
										>
											Apply
										</Button>
									</div>
								</div>

								<div className="flex gap-2 pt-2">
									<Button
										variant="destructive"
										className="flex-1"
										onClick={() => onOpenDeleteDrawers([selectedDrawer._id])}
										disabled={!isLockedByMe}
									>
										Delete Drawer
									</Button>
								</div>
							</div>
						)}

						{selectedCompartment && selectedDrawer && (
							<div className="space-y-2 mt-3 border-t border-gray-200 pt-3">
								<div className="text-xs text-gray-500">
									In drawer: {selectedDrawer.label || `#${selectedDrawer._id.slice(-4)}`}
								</div>
								<div className="space-y-1">
									<Label>Label</Label>
									<div className="flex items-center gap-2">
										<Input
											value={compartmentLabelDraft}
											onChange={(e) => onCompartmentLabelDraftChange(e.target.value)}
											onKeyDown={(e) => {
												if (e.key !== "Enter") return;
												e.preventDefault();
												onSaveCompartmentLabel();
											}}
											disabled={!isLockedByMe || tool !== "select"}
											placeholder="Compartment name"
										/>
										<Button
											size="sm"
											variant="outline"
											onClick={onSaveCompartmentLabel}
											disabled={!isLockedByMe || tool !== "select"}
										>
											Save
										</Button>
									</div>
								</div>

								<div className="flex gap-2 pt-2">
									<Button
										variant="destructive"
										className="flex-1"
										onClick={() => onOpenDeleteCompartment(selectedCompartment._id)}
										disabled={!isLockedByMe}
									>
										Delete Compartment
									</Button>
								</div>
							</div>
						)}
					</div>
				)}

				{highlightedCompartmentIds.length > 0 && (
					<div className="absolute top-4 right-4 z-10">
						<div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 shadow-sm">
							<div className="flex items-center gap-2">
								<Crosshair className="w-4 h-4 text-green-600" />
								<div className="text-sm">
									<span className="font-medium text-green-800">
										{highlightedCompartmentIds.length}
									</span>
									<span className="text-green-700">
										 compartment
										{highlightedCompartmentIds.length > 1 ? "s" : ""} highlighted
									</span>
								</div>
								<button
									type="button"
									onClick={onClearHighlight}
									className="ml-2 p-1 hover:bg-green-100 rounded text-green-600"
									title="Clear highlight"
								>
									<X className="w-4 h-4" />
								</button>
							</div>
						</div>
					</div>
				)}
			</div>

			<AlertDialog
				open={showDeleteDialog}
				onOpenChange={onCloseDeleteBlueprint}
				title="Delete Blueprint"
				description={`Are you sure you want to delete "${blueprint.name}"? This will remove all associated drawers and compartments.`}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={onConfirmDeleteBlueprint}
				variant="destructive"
			/>

			<AlertDialog
				open={showGridWarning}
				onOpenChange={onOpenGridWarning}
				title="Reduce Grid Size?"
				description="Reducing rows/columns may delete compartments. If any removed compartments contain inventory, this operation will fail until you move that inventory out."
				confirmLabel="Reduce"
				cancelLabel="Cancel"
				onConfirm={() => void onConfirmGridWarning()}
				variant="destructive"
			/>

			<AlertDialog
				open={showDeleteDrawerDialog}
				onOpenChange={onCloseDeleteDrawers}
				title={pendingDeleteDrawerIds.length > 1 ? "Delete Drawers" : "Delete Drawer"}
				description={
					pendingDeleteDrawerIds.length > 1
						? `Are you sure you want to delete ${pendingDeleteDrawerIds.length} drawers? All compartments inside them will also be deleted.`
						: "Are you sure you want to delete this drawer? All compartments inside it will also be deleted."
				}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={() => void onConfirmDeleteDrawers()}
				variant="destructive"
			/>

			<AlertDialog
				open={showDeleteCompartmentDialog}
				onOpenChange={onCloseDeleteCompartment}
				title="Delete Compartment"
				description="Are you sure you want to delete this compartment? This cannot be undone."
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={() => void onConfirmDeleteCompartment()}
				variant="destructive"
			/>

			{showVersionHistory && (
				<Sheet open={showVersionHistory} onOpenChange={onShowVersionHistory}>
					<SheetContent side="right" className="w-96 overflow-y-auto">
						<VersionHistoryPanel
							blueprintId={blueprintId as Id<"blueprints">}
							onClose={() => onShowVersionHistory(false)}
						/>
					</SheetContent>
				</Sheet>
			)}

			{showActionHistory && (
				<Sheet open={showActionHistory} onOpenChange={onShowActionHistory}>
					<SheetContent side="right" className="w-96 overflow-y-auto" showCloseButton={false}>
						<ActionHistoryPanel
							historyState={historyState}
							onUndo={onUndo}
							onRedo={onRedo}
							onClose={() => onShowActionHistory(false)}
							canUndo={canUndoNow}
							canRedo={canRedoNow}
							isApplying={isApplyingHistory}
						/>
					</SheetContent>
				</Sheet>
			)}
		</div>
	);
}
