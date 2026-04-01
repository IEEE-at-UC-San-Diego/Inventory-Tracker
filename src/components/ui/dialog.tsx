import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Overlay
		ref={ref}
		className={cn(
			"fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
			className,
		)}
		{...props}
	/>
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	title?: string;
}

const DialogContent = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Content>,
	DialogContentProps
>(({ className, children, title, ...props }, ref) => (
	<DialogPortal>
		<DialogOverlay />
		<DialogPrimitive.Content
			ref={ref}
			className={cn(
				"fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border/60 bg-background p-6 shadow-xl duration-[var(--duration-normal)]",
				className,
			)}
			{...props}
		>
			{title ? <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title> : null}
			{children}
		</DialogPrimitive.Content>
	</DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

interface DialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
}

function DialogHeader({ className, ...props }: DialogHeaderProps) {
	return (
		<div
			className={cn(
				"flex flex-col space-y-1.5 text-center sm:text-left",
				className,
			)}
			{...props}
		/>
	);
}

interface DialogTitleProps
	extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> {
	children: React.ReactNode;
}

function DialogTitle({ className, ...props }: DialogTitleProps) {
	return (
		<DialogPrimitive.Title
			className={cn(
				"text-lg font-semibold leading-none tracking-tight",
				className,
			)}
			{...props}
		/>
	);
}

interface DialogDescriptionProps
	extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> {
	children: React.ReactNode;
}

function DialogDescription({ className, ...props }: DialogDescriptionProps) {
	return (
		<DialogPrimitive.Description
			className={cn("text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
}

function DialogFooter({ className, ...props }: DialogFooterProps) {
	return (
		<div
			className={cn(
				"flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
				className,
			)}
			{...props}
		/>
	);
}

interface DialogCloseProps {
	onClose: () => void;
	className?: string;
}

function DialogClose({ onClose, className }: DialogCloseProps) {
	return (
		<DialogPrimitive.Close
			onClick={onClose}
			className={cn(
				"absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
				className,
			)}
		>
			<X className="h-4 w-4 text-muted-foreground" />
			<span className="sr-only">Close</span>
		</DialogPrimitive.Close>
	);
}

interface DialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: React.ReactNode;
}

// Alert Dialog for confirmations
interface AlertDialogProps extends Omit<DialogProps, "children"> {
	title: string;
	description: string;
	confirmLabel?: string;
	cancelLabel?: string;
	onConfirm: () => void;
	variant?: "default" | "destructive";
	extraActionLabel?: string;
	onExtraAction?: () => void;
}

function AlertDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	onConfirm,
	variant = "default",
	extraActionLabel,
	onExtraAction,
}: AlertDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogClose onClose={() => onOpenChange(false)} />
				<DialogHeader className="pr-10">
					<DialogTitle
						className={
							variant === "destructive" ? "text-destructive" : undefined
						}
					>
						{title}
					</DialogTitle>
					<DialogDescription>
						{description}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="mt-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						{cancelLabel}
					</Button>
					{extraActionLabel && onExtraAction && (
						<Button
							type="button"
							variant="secondary"
							className="bg-warning text-warning-foreground hover:bg-warning/90"
							onClick={() => {
								onExtraAction();
								onOpenChange(false);
							}}
						>
							{extraActionLabel}
						</Button>
					)}
					<Button
						type="button"
						variant={variant === "destructive" ? "destructive" : "default"}
						onClick={() => {
							onConfirm();
							onOpenChange(false);
						}}
					>
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// Form Dialog for creating/editing items
interface FormDialogProps extends DialogProps {
	title: string;
	description?: string;
	children: React.ReactNode;
	onSubmit: () => void;
	submitLabel?: string;
	cancelLabel?: string;
	isSubmitting?: boolean;
}

function FormDialog({
	open,
	onOpenChange,
	title,
	description,
	children,
	onSubmit,
	submitLabel = "Save",
	cancelLabel = "Cancel",
	isSubmitting = false,
}: FormDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogClose onClose={() => onOpenChange(false)} />
				<form
					onSubmit={(e) => {
						e.preventDefault();
						onSubmit();
					}}
				>
					<DialogHeader className="mb-4">
						<DialogTitle>{title}</DialogTitle>
						{description && (
							<DialogDescription>{description}</DialogDescription>
						)}
					</DialogHeader>
					<div className="space-y-4 py-4">{children}</div>
					<DialogFooter className="mt-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={isSubmitting}
						>
							{cancelLabel}
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Saving..." : submitLabel}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
	AlertDialog,
	FormDialog,
};
