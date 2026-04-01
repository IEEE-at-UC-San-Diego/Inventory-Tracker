import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PartForm } from "@/components/parts/PartForm";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export const Route = createFileRoute("/parts/new")({
	component: NewPartPage,
});

function NewPartPage() {
	return (
		<ProtectedRoute requiredRole="General Officer">
			<NewPartContent />
		</ProtectedRoute>
	);
}

function NewPartContent() {
	const navigate = useNavigate();
	const { toast } = useToast();

	const handleSubmit = (partId: string) => {
		toast.success("Part created successfully");
		navigate({ to: "/parts/$partId", params: { partId } });
	};

	const handleCancel = () => {
		navigate({ to: "/parts" });
	};

	return (
		<div className="min-h-full bg-gradient-to-b from-surface via-background to-background">
			<div className="page-shell page-enter max-w-4xl space-y-8 pb-12">
				<div className="flex items-start gap-4">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="mt-0.5 shrink-0"
						onClick={handleCancel}
						aria-label="Go back to inventory"
					>
						<ArrowLeft className="h-5 w-5" aria-hidden />
					</Button>
					<div>
						<h1 className="text-3xl font-bold tracking-tight text-foreground">
							Create New Part
						</h1>
						<p className="mt-1 text-muted-foreground">
							Add a new part to your inventory with location and quantity
						</p>
					</div>
				</div>

				<PartForm onSubmit={handleSubmit} onCancel={handleCancel} />
			</div>
		</div>
	);
}
