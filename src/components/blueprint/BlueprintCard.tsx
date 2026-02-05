import { Check, Grid3X3, Layers } from "lucide-react";
import type { Blueprint } from "@/types";
import { Card, CardContent } from "../ui/card";

interface BlueprintCardProps {
	blueprint: Blueprint;
	drawerCount?: number;
	compartmentCount?: number;
	backgroundImageUrl?: string | null;
	isSelected?: boolean;
	onClick?: () => void;
}

export function BlueprintCard({
	blueprint,
	drawerCount = 0,
	compartmentCount = 0,
	backgroundImageUrl,
	isSelected = false,
	onClick,
}: BlueprintCardProps) {
	return (
		<Card
			onClick={onClick}
			className={`cursor-pointer transition-all hover:shadow-lg ${
				isSelected
					? "ring-2 ring-cyan-500 border-cyan-500 bg-cyan-50"
					: "border-gray-200 hover:border-cyan-300"
			}`}
		>
			<CardContent className="p-4">
				{isSelected && (
					<div className="absolute top-2 right-2 bg-cyan-600 rounded-full p-1">
						<Check className="w-4 h-4 text-white" />
					</div>
				)}

				{backgroundImageUrl ? (
					<img
						src={backgroundImageUrl}
						alt={blueprint.name}
						className="w-full h-32 object-cover rounded-md mb-3"
					/>
				) : (
					<div className="w-full h-32 bg-gradient-to-br from-gray-100 to-gray-200 rounded-md mb-3 flex items-center justify-center border-2 border-dashed border-gray-300">
						<Grid3X3 className="w-12 h-12 text-gray-400" />
					</div>
				)}

				<h3 className="font-semibold text-gray-900 mb-2 truncate pr-6">
					{blueprint.name}
				</h3>

				<div className="flex items-center gap-4 text-sm text-gray-600">
					<div className="flex items-center gap-1.5">
						<Grid3X3 className="w-4 h-4 text-cyan-600" />
						<span>
							{drawerCount} drawer{drawerCount !== 1 ? "s" : ""}
						</span>
					</div>
					<div className="flex items-center gap-1.5">
						<Layers className="w-4 h-4 text-cyan-600" />
						<span>
							{compartmentCount} compartment
							{compartmentCount !== 1 ? "s" : ""}
						</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
