import {
	FileQuestion,
	FolderOpen,
	Inbox,
	Package,
	Plus,
	Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
	icon?: React.ReactNode;
	title: string;
	description?: string;
	action?: {
		label: string;
		onClick: () => void;
	};
	secondaryAction?: {
		label: string;
		onClick: () => void;
	};
	className?: string;
}

export function EmptyState({
	icon,
	title,
	description,
	action,
	secondaryAction,
	className,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center py-12 px-4 text-center",
				className,
			)}
		>
			{icon && (
				<div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface-subtle">
					<div className="text-muted-foreground">{icon}</div>
				</div>
			)}
			<h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
			{description && (
				<p className="mb-6 max-w-md text-muted-foreground">{description}</p>
			)}
			{(action || secondaryAction) && (
				<div className="flex flex-wrap items-center justify-center gap-3">
					{action && (
						<button
							type="button"
							onClick={action.onClick}
							className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
						>
							<Plus className="w-4 h-4" />
							{action.label}
						</button>
					)}
					{secondaryAction && (
						<button
							type="button"
							onClick={secondaryAction.onClick}
							className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-4 py-2 transition-colors hover:bg-accent"
						>
							{secondaryAction.label}
						</button>
					)}
				</div>
			)}
		</div>
	);
}

// Preset empty states for common scenarios
export function NoResultsState({
	searchQuery,
	onClear,
}: {
	searchQuery: string;
	onClear: () => void;
}) {
	return (
		<EmptyState
			icon={<Search className="w-8 h-8" />}
			title="No results found"
			description={`We couldn't find any results for "${searchQuery}". Try adjusting your search terms or filters.`}
			action={{ label: "Clear Search", onClick: onClear }}
		/>
	);
}

export function NoDataState({
	itemName,
	onCreate,
}: {
	itemName: string;
	onCreate?: () => void;
}) {
	return (
		<EmptyState
			icon={<FolderOpen className="w-8 h-8" />}
			title={`No ${itemName}s yet`}
			description={`Get started by creating your first ${itemName.toLowerCase()}.`}
			action={
				onCreate
					? { label: `Create ${itemName}`, onClick: onCreate }
					: undefined
			}
		/>
	);
}

export function NoItemsState({
	title = "It's empty here",
	description = "No items to display at the moment.",
	onRefresh,
}: {
	title?: string;
	description?: string;
	onRefresh?: () => void;
}) {
	return (
		<EmptyState
			icon={<Inbox className="w-8 h-8" />}
			title={title}
			description={description}
			action={onRefresh ? { label: "Refresh", onClick: onRefresh } : undefined}
		/>
	);
}

export function NotFoundState({
	itemName,
	onBack,
}: {
	itemName: string;
	onBack?: () => void;
}) {
	return (
		<EmptyState
			icon={<FileQuestion className="w-8 h-8" />}
			title={`${itemName} not found`}
			description={`The ${itemName.toLowerCase()} you're looking for doesn't exist or has been removed.`}
			action={onBack ? { label: "Go Back", onClick: onBack } : undefined}
		/>
	);
}

export function NoSearchResultsState({
	searchQuery,
	onClear,
	itemName = "items",
}: {
	searchQuery: string;
	onClear: () => void;
	itemName?: string;
}) {
	return (
		<EmptyState
			icon={<Search className="w-8 h-8" />}
			title={`No ${itemName} match your search`}
			description={`We couldn't find any ${itemName} matching "${searchQuery}". Try different keywords or clear your filters.`}
			action={{ label: "Clear Filters", onClick: onClear }}
		/>
	);
}

// Empty state for parts
export function NoPartsState({ onCreate }: { onCreate: () => void }) {
	return (
		<EmptyState
			icon={<Package className="w-8 h-8" />}
			title="No parts in inventory"
			description="Start building your inventory by adding your first part."
			action={{ label: "Add Part", onClick: onCreate }}
		/>
	);
}

// Empty state for transactions
export function NoTransactionsState() {
	return (
		<EmptyState
			icon={<Inbox className="w-8 h-8" />}
			title="No transactions yet"
			description="Transactions will appear here when inventory changes occur. Check in, check out, or move items to create transactions."
		/>
	);
}

// Empty state for blueprints
export function NoBlueprintsState({ onCreate }: { onCreate: () => void }) {
	return (
		<EmptyState
			icon={<FolderOpen className="w-8 h-8" />}
			title="No blueprints created"
			description="Create a blueprint to visualize your storage layout and organize your inventory."
			action={{ label: "Create Blueprint", onClick: onCreate }}
		/>
	);
}
