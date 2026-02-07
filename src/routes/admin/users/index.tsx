import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/users/")({
	component: AdminUsersPage,
});

function AdminUsersPage() {
	return <Navigate to="/home" />;
}
