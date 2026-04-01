import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useId } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useMutation } from "@/integrations/convex/react-query";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/blueprints/new")({
	component: NewBlueprintPage,
});

function NewBlueprintPage() {
	return (
		<ProtectedRoute requiredRole="General Officer">
			<NewBlueprintContent />
		</ProtectedRoute>
	);
}

function NewBlueprintContent() {
	const navigate = useNavigate();
	const { toast } = useToast();
	const { authContext } = useAuth();
	const blueprintNameInputId = useId();

	const createBlueprint = useMutation(api.blueprints.mutations.create);

	const handleCreateBlueprint = async (name: string) => {
		if (!authContext) return;

		try {
			const result = await createBlueprint({
				name,
				authContext,
			});

			if (result) {
				toast.success("Blueprint created successfully");
				navigate({
					to: "/blueprints/$blueprintId",
					params: { blueprintId: result },
					search: {
						partId: undefined,
						drawerId: undefined,
						compartmentId: undefined,
						mode: undefined,
					},
				});
			}
		} catch (error) {
			toast.error("Failed to create blueprint");
			console.error("Create blueprint error:", error);
		}
	};

	const handleCancel = () => {
		navigate({ to: "/blueprints" });
	};

	return (
		<div className="min-h-full bg-gradient-to-b from-surface via-background to-background">
			<div className="page-shell page-enter max-w-3xl space-y-8 pb-12">
				<div className="flex items-start gap-4">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="mt-0.5 shrink-0"
						onClick={handleCancel}
						aria-label="Go back to blueprints"
					>
						<ArrowLeft className="h-5 w-5" aria-hidden />
					</Button>
					<div>
						<h1 className="text-3xl font-bold tracking-tight text-foreground">
							Create New Blueprint
						</h1>
						<p className="mt-1 text-muted-foreground">
							Create a new storage layout blueprint
						</p>
					</div>
				</div>

				<Card className="border-border/80 shadow-md">
					<CardHeader>
						<CardTitle>Blueprint details</CardTitle>
						<CardDescription>
							Choose a clear name so your team can find this layout quickly.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								const formData = new FormData(e.currentTarget);
								const name = formData.get("name") as string;
								if (name?.trim()) {
									handleCreateBlueprint(name.trim());
								}
							}}
							className="space-y-6"
						>
							<div className="space-y-2">
								<Label htmlFor={blueprintNameInputId}>Blueprint name</Label>
								<Input
									type="text"
									id={blueprintNameInputId}
									name="name"
									required
									placeholder="e.g. Main storage — Rack A"
									autoComplete="off"
								/>
							</div>

							<div className="flex flex-wrap gap-3 pt-2">
								<Button type="submit">Create blueprint</Button>
								<Button
									type="button"
									variant="outline"
									onClick={handleCancel}
								>
									Cancel
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
