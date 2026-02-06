import { ChevronDown, Clock, History, RotateCcw, User } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useMutation, useQuery } from "@/integrations/convex/react-query";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "../ui/button";
import { AlertDialog } from "../ui/dialog";
import { useToast } from "../ui/toast";

interface VersionHistoryPanelProps {
	blueprintId: Id<"blueprints">;
	onClose?: () => void;
}

interface Revision {
	_id: Id<"blueprintRevisions">;
	version: number;
	description?: string;
	createdAt: number;
	createdByUser: {
		_id: string;
		name: string;
		email: string;
	};
}

export function VersionHistoryPanel({
	blueprintId,
	onClose: _onClose,
}: VersionHistoryPanelProps) {
	const { toast } = useToast();
	const { canEdit } = useRole();
	const { authContext, getFreshAuthContext } = useAuth();
	const revisions = useQuery(
		api.blueprint_revisions.queries.listRevisions,
		authContext
			? {
					authContext: authContext as any,
					blueprintId,
				}
			: undefined,
	);
	const revisionCount = useQuery(
		api.blueprint_revisions.queries.getRevisionCount,
		authContext
			? {
					authContext: authContext as any,
					blueprintId,
				}
			: undefined,
	);

	const restoreRevision = useMutation(
		api.blueprint_revisions.mutations.restoreRevision,
	);

	const [expandedRevisionId, setExpandedRevisionId] =
		useState<Id<"blueprintRevisions"> | null>(null);
	const [showRestoreDialog, setShowRestoreDialog] = useState(false);
	const [selectedRevision, setSelectedRevision] = useState<Revision | null>(
		null,
	);

	const handleRestore = async () => {
		if (!selectedRevision) return;

		try {
			const context = (await getFreshAuthContext()) || authContext;
			if (!context) {
				throw new Error("Auth context is required");
			}
			const result = await restoreRevision({
				authContext: context as any,
				revisionId: selectedRevision._id,
				description: `Restored to version ${selectedRevision.version}`,
			});

			if (result.success) {
				toast.success(result.message);
				setShowRestoreDialog(false);
				setExpandedRevisionId(null);
			} else {
				toast.error("Failed to restore", result.message);
			}
		} catch (error) {
			toast.error(
				"Failed to restore revision",
				error instanceof Error ? error.message : "An error occurred",
			);
		}
	};

	const formatDate = (timestamp: number) => {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return "Just now";
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	};

	const formatFullDate = (timestamp: number) => {
		const date = new Date(timestamp);
		return date.toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		});
	};

	const getChangeSummary = (
		revision: Revision,
		index: number,
		allRevisions: Revision[],
	): string => {
		if (revision.description) {
			return revision.description;
		}

		// Generate summary based on position
		if (index === 0) {
			return "Latest version";
		} else if (index === allRevisions.length - 1) {
			return "Initial version";
		} else {
			return `Version ${revision.version}`;
		}
	};

	const sortedRevisions =
		revisions?.sort((a, b) => b.version - a.version) || [];

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
				<div className="flex items-center gap-2">
					<History className="w-4 h-4 text-cyan-600" />
					<h2 className="font-semibold text-sm">Version History</h2>
				</div>
				{revisionCount && (
					<div
						className={`text-xs px-2 py-1 rounded-full ${
							revisionCount.isNearLimit
								? "bg-amber-100 text-amber-800"
								: "bg-slate-100 text-slate-600"
						}`}
					>
						{revisionCount.count}/{revisionCount.maxRevisions}
					</div>
				)}
			</div>

			{/* Revision list */}
			<div className="flex-1 overflow-y-auto">
				{sortedRevisions.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full p-8 text-center">
						<History className="w-12 h-12 text-slate-300 mb-3" />
						<p className="text-sm text-slate-500">No version history yet</p>
						<p className="text-xs text-slate-400 mt-1">
							Revisions are created automatically when you finish editing
						</p>
					</div>
				) : (
					<div className="divide-y">
						{sortedRevisions.map((revision, index) => {
							const isExpanded = expandedRevisionId === revision._id;
							const isLatest = index === 0;

							return (
								<div key={revision._id} className="border-b last:border-b-0">
									<button
										type="button"
										onClick={() =>
											setExpandedRevisionId(isExpanded ? null : revision._id)
										}
										className="w-full px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors text-left"
									>
										{/* Version badge */}
										<div
											className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
												isLatest
													? "bg-cyan-600 text-white"
													: "bg-slate-200 text-slate-700"
											}`}
										>
											{revision.version}
										</div>

										{/* Content */}
										<div className="flex-1 min-w-0">
											<div className="flex items-center justify-between mb-1">
												<span className="font-medium text-sm text-slate-900">
													{getChangeSummary(revision, index, sortedRevisions)}
												</span>
												<span className="text-xs text-slate-500">
													{formatDate(revision.createdAt)}
												</span>
											</div>
											<div className="flex items-center gap-2 text-xs text-slate-500">
												<User className="w-3 h-3" />
												<span className="truncate">
													{revision.createdByUser.name}
												</span>
											</div>

											{isLatest && (
												<span className="inline-block mt-1 px-2 py-0.5 bg-cyan-100 text-cyan-800 text-xs rounded-full">
													Current
												</span>
											)}
										</div>

										{/* Expand/collapse */}
										<ChevronDown
											className={`w-4 h-4 text-slate-400 transition-transform ${
												isExpanded ? "rotate-180" : ""
											}`}
										/>
									</button>

									{/* Expanded details */}
									{isExpanded && (
										<div className="px-4 pb-3 pl-15">
											<div className="ml-11 pl-3 border-l-2 border-slate-200 space-y-2">
												<div className="flex items-center gap-2 text-xs text-slate-500">
													<Clock className="w-3 h-3" />
													<span>{formatFullDate(revision.createdAt)}</span>
												</div>
												{revision.description && (
													<p className="text-sm text-slate-600">
														{revision.description}
													</p>
												)}
												<div className="pt-2 flex flex-wrap gap-2">
													{!isLatest && canEdit() && (
														<Button
															size="sm"
															variant="outline"
															onClick={() => {
																setSelectedRevision(revision);
																setShowRestoreDialog(true);
															}}
															className="text-xs"
														>
															<RotateCcw className="w-3 h-3 mr-1" />
															Restore
														</Button>
													)}
												</div>
											</div>
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>

			{/* Restore confirmation dialog */}
			<AlertDialog
				open={showRestoreDialog}
				onOpenChange={setShowRestoreDialog}
				title="Restore Revision"
				description={
					selectedRevision
						? `Are you sure you want to restore to version ${selectedRevision.version}? A backup of the current state will be created automatically.`
						: ""
				}
				confirmLabel="Restore"
				variant="destructive"
				onConfirm={handleRestore}
			></AlertDialog>

			{/* Footer info */}
			{revisionCount?.isNearLimit && (
				<div className="px-4 py-2 bg-amber-50 border-t text-xs text-amber-800">
					Storage warning: Approaching revision limit. Oldest revisions will be
					deleted.
				</div>
			)}
		</div>
	);
}
