import { Link } from "@tanstack/react-router";
import {
	Archive,
	Edit,
	MapPin,
	MoreVertical,
	Package,
	Trash2,
} from "lucide-react";
import type { Part } from "@/types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { PartImage } from "./PartImage";

interface PartCardProps {
	part: Part & { totalQuantity?: number; locationCount?: number };
	onArchive?: (partId: string, archived: boolean) => void;
	onDelete?: (part: Part) => void;
	canEdit?: boolean;
	viewMode?: "grid" | "list";
	onHighlightParts?: (partId: string) => void;
}

export function PartCard({
	part,
	onArchive,
	onDelete,
	canEdit = false,
	viewMode = "grid",
	onHighlightParts,
}: PartCardProps) {
	const totalQuantity = part.totalQuantity ?? 0;
	const locationCount = part.locationCount ?? 0;

	if (viewMode === "list") {
		return (
			<div className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
				<PartImage
					imageId={part.imageId}
					name={part.name}
					size="sm"
					clickable={false}
				/>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<h3 className="font-medium text-gray-900 truncate">{part.name}</h3>
						{part.archived && (
							<Badge variant="secondary" className="text-xs">
								<Archive className="w-3 h-3 mr-1" />
								Archived
							</Badge>
						)}
					</div>
					<p className="text-sm text-gray-500">{part.sku}</p>
				</div>
				<Badge variant="outline">{part.category}</Badge>
				<div className="flex items-center gap-4 text-sm text-gray-500">
					<span className="flex items-center gap-1">
						<Package className="w-4 h-4" />
						{totalQuantity} units
					</span>
					<span className="flex items-center gap-1">
						<MapPin className="w-4 h-4" />
						{locationCount} {locationCount === 1 ? "location" : "locations"}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<Link to="/parts/$partId" params={{ partId: part._id }} preload="intent">
						<Button variant="ghost" size="sm">
							View
						</Button>
					</Link>
					{canEdit && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="sm">
									<MoreVertical className="w-4 h-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<Link
									to="/parts/$partId"
									params={{ partId: part._id }}
									preload="intent"
								>
									<DropdownMenuItem>
										<Edit className="w-4 h-4 mr-2" />
										Edit
									</DropdownMenuItem>
								</Link>
								<DropdownMenuItem
									onClick={() => onArchive?.(part._id, !part.archived)}
								>
									<Archive className="w-4 h-4 mr-2" />
									{part.archived ? "Unarchive" : "Archive"}
								</DropdownMenuItem>
								<DropdownMenuItem
									className="text-red-600"
									onClick={() => onDelete?.(part)}
								>
									<Trash2 className="w-4 h-4 mr-2" />
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			</div>
		);
	}

	return (
		<Link
			to="/parts/$partId"
			params={{ partId: part._id }}
			preload="intent"
			className="block w-full"
		>
			<Card className="group overflow-hidden hover:shadow-md transition-shadow cursor-pointer h-full">
				<div className="relative aspect-video bg-gray-100">
					<PartImage
						imageId={part.imageId}
						name={part.name}
						size="xl"
						className="w-full h-full"
						clickable={false}
					/>
					{part.archived && (
						<div className="absolute top-2 left-2">
							<Badge variant="secondary">
								<Archive className="w-3 h-3 mr-1" />
								Archived
							</Badge>
						</div>
					)}
				</div>
				<CardContent className="p-4">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0 flex-1">
							<h3 className="font-medium text-gray-900 truncate">
								{part.name}
							</h3>
							<p className="text-sm text-gray-500">{part.sku}</p>
						</div>
					</div>
					<div className="mt-3 flex items-center justify-between">
						<Badge variant="outline" className="text-xs">
							{part.category}
						</Badge>
						<div className="flex items-center gap-3 text-sm text-gray-500">
							<span
								className="flex items-center gap-1"
								title="Total quantity"
							>
								<Package className="w-4 h-4" />
								{totalQuantity}
							</span>
							<span
								className={`flex items-center gap-1 ${onHighlightParts ? "cursor-pointer hover:text-cyan-600" : ""}`}
								title="Storage locations"
								role={onHighlightParts ? "button" : undefined}
								tabIndex={onHighlightParts ? 0 : undefined}
								onKeyDown={(e) => {
									if (onHighlightParts && (e.key === 'Enter' || e.key === ' ')) {
										e.preventDefault();
										e.stopPropagation();
										onHighlightParts(part._id);
									}
								}}
								onClick={(e) => {
									if (onHighlightParts) {
										e.preventDefault();
										e.stopPropagation();
										onHighlightParts(part._id);
									}
								}}
							>
								<MapPin className="w-4 h-4" />
								{locationCount}
							</span>
						</div>
					</div>
					{part.description && (
						<p className="mt-2 text-sm text-gray-600 line-clamp-2">
							{part.description}
						</p>
					)}
				</CardContent>
			</Card>
		</Link>
	);
}

// Skeleton loader for part cards
export function PartCardSkeleton({
	viewMode = "grid",
}: {
	viewMode?: "grid" | "list";
}) {
	if (viewMode === "list") {
		return (
			<div className="flex items-center gap-4 p-4">
				<div className="w-12 h-12 bg-gray-200 rounded-lg animate-pulse" />
				<div className="flex-1">
					<div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
					<div className="h-3 w-20 bg-gray-200 rounded mt-1 animate-pulse" />
				</div>
				<div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
				<div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
			</div>
		);
	}

	return (
		<Card className="overflow-hidden">
			<div className="aspect-video bg-gray-200 animate-pulse" />
			<CardContent className="p-4 space-y-3">
				<div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
				<div className="h-3 w-1/2 bg-gray-200 rounded animate-pulse" />
				<div className="flex items-center justify-between pt-2">
					<div className="h-5 w-16 bg-gray-200 rounded animate-pulse" />
					<div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
				</div>
			</CardContent>
		</Card>
	);
}
