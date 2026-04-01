import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		className={cn(
			"rounded-lg border border-border/80 bg-card text-card-foreground shadow-sm",
			className,
		)}
		{...props}
	/>
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		className={cn("flex flex-col space-y-1.5 p-6", className)}
		{...props}
	/>
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
	HTMLParagraphElement,
	React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
	<h3
		ref={ref}
		className={cn(
			"text-2xl font-semibold leading-none tracking-tight",
			className,
		)}
		{...props}
	/>
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
	HTMLParagraphElement,
	React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
	<p
		ref={ref}
		className={cn("text-sm text-muted-foreground", className)}
		{...props}
	/>
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		className={cn("flex items-center p-6 pt-0", className)}
		{...props}
	/>
));
CardFooter.displayName = "CardFooter";

// Stats card for dashboard
interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
	title: string;
	value: string | number;
	description?: string;
	trend?: {
		value: number;
		isPositive: boolean;
	};
	icon?: React.ReactNode;
}

function StatCard({
	title,
	value,
	description,
	trend,
	icon,
	className,
	...props
}: StatCardProps) {
	return (
		<Card className={className} {...props}>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">{title}</CardTitle>
				{icon && <div className="h-4 w-4 text-muted-foreground">{icon}</div>}
			</CardHeader>
			<CardContent>
				<div className="text-2xl font-bold">{value}</div>
				{(description || trend) && (
					<p className="text-xs text-muted-foreground">
						{trend && (
							<span
								className={
									trend.isPositive ? "text-success" : "text-destructive"
								}
							>
								{trend.isPositive ? "+" : ""}
								{trend.value}%
							</span>
						)}{" "}
						{description}
					</p>
				)}
			</CardContent>
		</Card>
	);
}

// Action card with button
interface ActionCardProps extends React.HTMLAttributes<HTMLDivElement> {
	title: string;
	description: string;
	actionLabel: string;
	onAction: () => void;
	disabled?: boolean;
}

function ActionCard({
	title,
	description,
	actionLabel,
	onAction,
	disabled,
	className,
	...props
}: ActionCardProps) {
	return (
		<Card className={className} {...props}>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardFooter>
				<Button type="button" onClick={onAction} disabled={disabled}>
					{actionLabel}
				</Button>
			</CardFooter>
		</Card>
	);
}

export {
	Card,
	CardHeader,
	CardFooter,
	CardTitle,
	CardDescription,
	CardContent,
	StatCard,
	ActionCard,
};
