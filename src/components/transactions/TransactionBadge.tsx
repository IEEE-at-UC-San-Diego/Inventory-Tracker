import {
	ArrowDownCircle,
	ArrowLeftRight,
	ArrowUpCircle,
	Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionType } from "@/types";

interface TransactionBadgeProps {
	actionType: ActionType;
	showIcon?: boolean;
	showLabel?: boolean;
	size?: "sm" | "md" | "lg";
	className?: string;
}

const actionConfig: Record<
	ActionType,
	{
		label: string;
		icon: React.ReactNode;
		color: string;
		bgColor: string;
		borderColor: string;
	}
> = {
	Add: {
		label: "Check In",
		icon: <ArrowUpCircle className="w-4 h-4" />,
		color: "text-green-700",
		bgColor: "bg-green-50",
		borderColor: "border-green-200",
	},
	Remove: {
		label: "Check Out",
		icon: <ArrowDownCircle className="w-4 h-4" />,
		color: "text-red-700",
		bgColor: "bg-red-50",
		borderColor: "border-red-200",
	},
	Move: {
		label: "Move",
		icon: <ArrowLeftRight className="w-4 h-4" />,
		color: "text-blue-700",
		bgColor: "bg-blue-50",
		borderColor: "border-blue-200",
	},
	Adjust: {
		label: "Adjust",
		icon: <Zap className="w-4 h-4" />,
		color: "text-yellow-700",
		bgColor: "bg-yellow-50",
		borderColor: "border-yellow-200",
	},
};

const sizeClasses = {
	sm: {
		container: "px-2 py-0.5 text-xs gap-1",
		icon: "w-3 h-3",
	},
	md: {
		container: "px-2.5 py-1 text-sm gap-1.5",
		icon: "w-4 h-4",
	},
	lg: {
		container: "px-3 py-1.5 text-base gap-2",
		icon: "w-5 h-5",
	},
};

export function TransactionBadge({
	actionType,
	showIcon = true,
	showLabel = true,
	size = "md",
	className,
}: TransactionBadgeProps) {
	const config = actionConfig[actionType];
	const sizeClass = sizeClasses[size];

	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full border font-medium",
				config.color,
				config.bgColor,
				config.borderColor,
				sizeClass.container,
				className,
			)}
		>
			{showIcon && (
				<span className={cn("flex-shrink-0", sizeClass.icon)}>
					{config.icon}
				</span>
			)}
			{showLabel && <span>{config.label}</span>}
		</span>
	);
}

// Simpler dot indicator for compact views
interface TransactionDotProps {
	actionType: ActionType;
	size?: "sm" | "md" | "lg";
	className?: string;
}

const dotSizeClasses = {
	sm: "w-2 h-2",
	md: "w-3 h-3",
	lg: "w-4 h-4",
};

const dotColors: Record<ActionType, string> = {
	Add: "bg-green-500",
	Remove: "bg-red-500",
	Move: "bg-blue-500",
	Adjust: "bg-yellow-500",
};

export function TransactionDot({
	actionType,
	size = "md",
	className,
}: TransactionDotProps) {
	return (
		<span
			className={cn(
				"inline-block rounded-full",
				dotColors[actionType],
				dotSizeClasses[size],
				className,
			)}
			title={actionConfig[actionType].label}
		/>
	);
}

// Quantity delta display with color coding
interface QuantityDeltaProps {
	delta: number;
	showSign?: boolean;
	className?: string;
}

export function QuantityDelta({
	delta,
	showSign = true,
	className,
}: QuantityDeltaProps) {
	const isPositive = delta > 0;
	const isNegative = delta < 0;
	const isZero = delta === 0;

	return (
		<span
			className={cn(
				"font-medium",
				isPositive && "text-green-600",
				isNegative && "text-red-600",
				isZero && "text-gray-500",
				className,
			)}
		>
			{showSign && isPositive && "+"}
			{delta}
		</span>
	);
}
