import { History, Undo2, Redo2, X, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HistoryState } from "@/lib/history";

interface ActionHistoryPanelProps {
	historyState: HistoryState;
	onUndo: () => void;
	onRedo: () => void;
	onClose: () => void;
	canUndo: boolean;
	canRedo: boolean;
	isApplying?: boolean;
}

export function ActionHistoryPanel({
	historyState,
	onUndo,
	onRedo,
	onClose,
	canUndo,
	canRedo,
	isApplying = false,
}: ActionHistoryPanelProps) {
	const { entries, currentIndex } = historyState;

	const formatTime = (timestamp: number) => {
		const date = new Date(timestamp);
		return date.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		});
	};

	const getActionIcon = (label: string) => {
		if (label.toLowerCase().includes("split")) return "✂️";
		if (
			label.toLowerCase().includes("create") ||
			label.toLowerCase().includes("add")
		)
			return "➕";
		if (
			label.toLowerCase().includes("delete") ||
			label.toLowerCase().includes("remove")
		)
			return "🗑️";
		if (
			label.toLowerCase().includes("update") ||
			label.toLowerCase().includes("move")
		)
			return "✏️";
		if (label.toLowerCase().includes("swap")) return "🔄";
		if (label.toLowerCase().includes("rename")) return "🏷️";
		return "•";
	};

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
				<div className="flex items-center gap-2">
					<History className="w-4 h-4 text-cyan-600" />
					<h2 className="font-semibold text-sm">Action History</h2>
				</div>
				<Button
					variant="ghost"
					size="icon"
					onClick={onClose}
					className="h-8 w-8 shrink-0"
				>
					<X className="w-4 h-4" />
				</Button>
			</div>

			{/* Undo/Redo Controls */}
			<div className="flex items-center gap-2 px-4 py-3 border-b">
				<Button
					variant="outline"
					size="sm"
					onClick={onUndo}
					disabled={!canUndo || isApplying}
					className="flex-1"
				>
					<Undo2 className="w-4 h-4 mr-2" />
					Undo
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={onRedo}
					disabled={!canRedo || isApplying}
					className="flex-1"
				>
					<Redo2 className="w-4 h-4 mr-2" />
					Redo
				</Button>
			</div>
			{isApplying && (
				<div className="px-4 py-2 border-b text-xs text-cyan-700 bg-cyan-50">
					Applying history operation...
				</div>
			)}

			{/* History List */}
			<div className="flex-1 overflow-y-auto">
				{entries.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full p-8 text-center">
						<History className="w-12 h-12 text-slate-300 mb-3" />
						<p className="text-sm text-slate-500">No actions yet</p>
						<p className="text-xs text-slate-400 mt-1">
							Your actions will appear here as you edit the blueprint
						</p>
					</div>
				) : (
					<div className="divide-y">
						{entries.map((entry, i) => {
							const isCurrent = i === currentIndex;
							const isPast = i <= currentIndex;
							const isFuture = i > currentIndex;

							return (
								<div
									key={entry.id}
									className={`px-4 py-3 flex items-start gap-3 ${
										isCurrent
											? "bg-cyan-50 border-l-4 border-l-cyan-600"
											: isFuture
												? "opacity-50"
												: ""
									}`}
								>
									{/* Status indicator */}
									<div className="shrink-0 mt-0.5">
										{isCurrent ? (
											<CheckCircle2 className="w-4 h-4 text-cyan-600" />
										) : (
											<div
												className={`w-4 h-4 rounded-full ${
													isPast ? "bg-slate-300" : "bg-slate-200"
												}`}
											/>
										)}
									</div>

									{/* Content */}
									<div className="flex-1 min-w-0">
										<div className="flex items-center justify-between mb-0.5">
											<span
												className={`font-medium text-sm ${
													isCurrent ? "text-cyan-900" : "text-slate-900"
												}`}
											>
												{getActionIcon(entry.label)} {entry.label}
											</span>
											<span className="text-xs text-slate-500 flex items-center gap-1">
												<Clock className="w-3 h-3" />
												{formatTime(entry.timestamp)}
											</span>
										</div>
										<div className="text-xs text-slate-500">
											{entry.changes.length} change
											{entry.changes.length !== 1 ? "s" : ""}
											{entry.requiresLock && " • Requires edit lock"}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{/* Footer stats */}
			{entries.length > 0 && (
				<div className="px-4 py-2 bg-slate-50 border-t text-xs text-slate-600">
					<div className="flex items-center justify-between">
						<span>
							{currentIndex + 1} of {entries.length} actions
						</span>
						<span>
							{entries.filter((_, i) => i <= currentIndex).length} applied
						</span>
					</div>
				</div>
			)}
		</div>
	);
}
