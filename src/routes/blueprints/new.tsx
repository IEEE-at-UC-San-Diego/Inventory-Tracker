import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useMutation } from "@/integrations/convex/react-query";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/blueprints/new")({
	component: NewBlueprintPage,
});

function NewBlueprintPage() {
	return (
		<ProtectedRoute requiredRole="Executive Officers">
			<NewBlueprintContent />
		</ProtectedRoute>
	);
}

function NewBlueprintContent() {
	const navigate = useNavigate();
	const { toast } = useToast();
	const { authContext } = useAuth();

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
						search: { partId: undefined, mode: undefined },
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
		<div className="p-6 max-w-3xl mx-auto">
			{/* Header */}
			<div className="flex items-center gap-4 mb-6">
				<button
					onClick={handleCancel}
					className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
				>
					<ArrowLeft className="w-5 h-5" />
				</button>
				<div>
					<h1 className="text-3xl font-bold text-gray-900">
						Create New Blueprint
					</h1>
					<p className="text-gray-600 mt-1">
						Create a new storage layout blueprint
					</p>
				</div>
			</div>

			{/* Form */}
			<div className="bg-white rounded-lg shadow-sm border p-6">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						const formData = new FormData(e.currentTarget);
						const name = formData.get("name") as string;
						if (name?.trim()) {
							handleCreateBlueprint(name.trim());
						}
					}}
					className="space-y-4"
				>
					<div>
						<label
							htmlFor="name"
							className="block text-sm font-medium text-gray-700 mb-2"
						>
							Blueprint Name
						</label>
						<input
							type="text"
							id="name"
							name="name"
							required
							placeholder="Enter blueprint name..."
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
						/>
					</div>

					<div className="flex gap-3 pt-4">
						<button
							type="submit"
							className="px-4 py-2 bg-cyan-600 text-white rounded-md hover:bg-cyan-700 transition-colors"
						>
							Create Blueprint
						</button>
						<button
							type="button"
							onClick={handleCancel}
							className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
