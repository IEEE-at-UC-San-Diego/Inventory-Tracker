import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PartForm } from "@/components/parts/PartForm";
import { useToast } from "@/components/ui/toast";

export const Route = createFileRoute("/parts/new")({
	component: NewPartPage,
});

function NewPartPage() {
	return (
		<ProtectedRoute requiredRole="General Officers">
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
		<div className="p-6 max-w-4xl mx-auto">
			{/* Header */}
			<div className="flex items-center gap-4 mb-6">
				<button
					onClick={handleCancel}
					className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
				>
					<ArrowLeft className="w-5 h-5" />
				</button>
				<div>
					<h1 className="text-3xl font-bold text-gray-900">Create New Part</h1>
					<p className="text-gray-600 mt-1">
						Add a new part to your inventory with location and quantity
					</p>
				</div>
			</div>

			{/* Wizard Form */}
			<PartForm onSubmit={handleSubmit} onCancel={handleCancel} />
		</div>
	);
}
