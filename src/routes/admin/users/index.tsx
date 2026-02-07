import { createFileRoute } from "@tanstack/react-router";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useConvex } from "convex/react";
import {
	AlertCircle,
	CheckCircle2,
	Download,
	Edit,
	Edit2,
	Loader2,
	Mail,
	RefreshCw,
	ShieldAlert,
	Trash2,
	UserPlus,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { InviteUserDialog } from "@/routes/admin/users/-InviteUserDialog";
import { RoleSyncQueueDialog } from "@/components/admin";
import { AdminOnly, ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@/integrations/convex/react-query";
import { createCSV, downloadCSV, generateTimestamp } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

export const Route = createFileRoute("/admin/users/")({
	component: AdminUsersPage,
});

function AdminUsersPage() {
	return (
		<ProtectedRoute>
			<AdminOnly>
				<AdminUsersContent />
			</AdminOnly>
		</ProtectedRoute>
	);
}

interface User {
	_id: string;
	_creationTime: number;
	logtoUserId: string;
	name: string;
	email: string;
	orgId: string;
	role: UserRole;
	createdAt: number;
}

interface InviteForm {
	email: string;
	name: string;
	role: UserRole;
}

function AdminUsersContent() {
	const { authContext, getFreshAuthContext, isLoading } = useAuth();
	const { toast } = useToast();
	const [searchQuery, setSearchQuery] = useState("");
	const [showInviteDialog, setShowInviteDialog] = useState(false);
	const [showSyncQueueDialog, setShowSyncQueueDialog] = useState(false);
	const [inviteForm, setInviteForm] = useState<InviteForm>({
		email: "",
		name: "",
		role: "Member",
	});
	const [deletingUser, setDeletingUser] = useState<User | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [inviteInProgress, setInviteInProgress] = useState(false);

	const convex = useConvex();

	// Fetch organization users
	const usersResult = useQuery(
		api.organizations.queries.getOrgMembers,
		authContext
			? {
					authContext,
					organizationId: authContext.orgId as Id<"organizations">,
				}
			: undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const users = usersResult ?? [];

	// Fetch role sync queue for status indicators
	const syncQueueResult = useQuery(
		api.role_sync_queue.queries.getSummary,
		authContext ? { authContext } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const syncQueueSummary = syncQueueResult || {
		pending: 0,
		retry: 0,
		failed: 0,
		total: 0,
	};

	// Fetch individual sync statuses per user
	const [userSyncStatuses, setUserSyncStatuses] = useState<
		Map<string, "pending" | "retry" | "failed">
	>(new Map());
	const syncQueueItems = useQuery(
		api.role_sync_queue.queries.list,
		authContext ? { authContext } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);

	useEffect(() => {
		if (syncQueueItems) {
			const statuses = new Map<string, "pending" | "retry" | "failed">();
			syncQueueItems.forEach(
				(item: { userId: string; status: "pending" | "retry" | "failed" }) => {
					statuses.set(item.userId, item.status);
				},
			);
			setUserSyncStatuses(statuses);
		}
	}, [syncQueueItems]);

	// Get current user to prevent self-modification
	const [currentUser, setCurrentUser] = useState<User | null>(null);

	useEffect(() => {
		const fetchCurrentUser = async () => {
			try {
				if (!authContext) return;
				const result = await convex.query(api.auth_helpers.getMyProfile, {
					authContext,
				});
				setCurrentUser(result?.user || null);
			} catch (error) {
				console.error("Failed to fetch current user:", error);
			}
		};
		fetchCurrentUser();
	}, [convex, authContext]);

	// Filter users by search
	const filteredUsers = useMemo(() => {
		if (!searchQuery) return users;

		const lowerQuery = searchQuery.toLowerCase();
		return users.filter(
			(user) =>
				user.name.toLowerCase().includes(lowerQuery) ||
				user.email.toLowerCase().includes(lowerQuery) ||
				user.role.toLowerCase().includes(lowerQuery),
		);
	}, [users, searchQuery]);

	// Count users by role
	const roleCounts = useMemo(() => {
		const counts = {
			Administrator: 0,
			"Executive Officers": 0,
			"General Officers": 0,
			Member: 0,
		};
		users.forEach((user) => {
			counts[user.role]++;
		});
		return counts;
	}, [users]);

	// Invite user mutation - using direct convex mutation call
	const handleInviteMutation = async () => {
		const context = (await getFreshAuthContext()) || authContext;
		if (!context) {
			throw new Error("Not authenticated");
		}
		await convex.mutation(api.organization_helpers.inviteUser, {
			authContext: context,
			email: inviteForm.email,
			name: inviteForm.name,
			role: inviteForm.role,
		});
	};

	const handleInvite = useCallback(async () => {
		if (!inviteForm.email || !inviteForm.name) {
			toast.error("Missing information", "Please fill in all fields");
			return;
		}

		setInviteInProgress(true);
		try {
			await handleInviteMutation();
			toast.success(
				"User invited",
				`${inviteForm.name} has been invited to the organization`,
			);
			setInviteForm({ email: "", name: "", role: "Member" });
			setShowInviteDialog(false);
		} catch (error) {
			toast.error(
				"Failed to invite user",
				error instanceof Error ? error.message : "An error occurred",
			);
		} finally {
			setInviteInProgress(false);
		}
	}, [inviteForm, toast, handleInviteMutation]);

	const handleRoleChange = useCallback(
		async (userId: string, newRole: UserRole) => {
			try {
				const context = (await getFreshAuthContext()) || authContext;
				if (!context) {
					throw new Error("Not authenticated");
				}
				await convex.mutation(api.organization_helpers.updateUserRole, {
					authContext: context,
					userId: userId as Id<"users">,
					newRole,
				});
				toast.success(
					"Role updated",
					`User role has been changed to ${newRole}`,
				);
			} catch (error) {
				toast.error(
					"Failed to update role",
					error instanceof Error ? error.message : "An error occurred",
				);
			}
		},
		[convex, toast, authContext, getFreshAuthContext],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingUser) return;

		setIsDeleting(true);
		try {
			const context = (await getFreshAuthContext()) || authContext;
			if (!context) {
				throw new Error("Not authenticated");
			}
			await convex.mutation(api.organization_helpers.removeUser, {
				authContext: context,
				userId: deletingUser._id as Id<"users">,
			});
			toast.success(
				"User removed",
				`${deletingUser.name} has been removed from the organization`,
			);
			setDeletingUser(null);
		} catch (error) {
			toast.error(
				"Failed to remove user",
				error instanceof Error ? error.message : "An error occurred",
			);
		} finally {
			setIsDeleting(false);
		}
	}, [deletingUser, convex, toast, authContext, getFreshAuthContext]);

	// Export users to CSV
	const handleExportUsers = useCallback(() => {
		const headers = [
			"Name",
			"Email",
			"Role",
			"Logto User ID",
			"Created At",
			"Sync Status",
		];

		const rows = filteredUsers.map((user) => {
			const syncStatus = userSyncStatuses.get(user._id) || "synced";
			return [
				user.name,
				user.email,
				user.role,
				user.logtoUserId,
				new Date(user.createdAt).toISOString(),
				syncStatus,
			];
		});

		const csvContent = createCSV(headers, rows);
		const timestamp = generateTimestamp();
		downloadCSV(csvContent, `users_${timestamp}.csv`);

		toast.success(
			"Export Complete",
			`Downloaded ${filteredUsers.length} users to CSV`,
		);
	}, [filteredUsers, userSyncStatuses, toast]);

	const getRoleBadgeColor = (role: UserRole) => {
		switch (role) {
			case "Administrator":
				return "bg-red-100 text-red-800 border-red-200";
			case "Executive Officers":
				return "bg-blue-100 text-blue-800 border-blue-200";
			case "General Officers":
				return "bg-green-100 text-green-800 border-green-200";
			case "Member":
				return "bg-gray-100 text-gray-800 border-gray-200";
			default:
				return "bg-gray-100 text-gray-800 border-gray-200";
		}
	};

	const getRoleIcon = (role: UserRole) => {
		switch (role) {
			case "Administrator":
				return <ShieldAlert className="w-3.5 h-3.5" />;
			case "Executive Officers":
				return <Edit className="w-3.5 h-3.5" />;
			case "General Officers":
				return <Edit2 className="w-3.5 h-3.5" />;
			case "Member":
				return <Users className="w-3.5 h-3.5" />;
			default:
				return <Users className="w-3.5 h-3.5" />;
		}
	};

	const getSyncStatusIcon = (userId: string) => {
		const status = userSyncStatuses.get(userId);
		if (!status) return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;

		switch (status) {
			case "pending":
				return <RefreshCw className="w-3.5 h-3.5 text-blue-500" />;
			case "retry":
				return <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />;
			case "failed":
				return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
		}
	};

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<h1 className="text-3xl font-bold text-gray-900">Users</h1>
					<p className="text-gray-600 mt-1">
						Manage organization members and their roles
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						onClick={() => setShowSyncQueueDialog(true)}
						className="inline-flex items-center gap-2"
					>
						<RefreshCw className="w-4 h-4" />
						View Sync Queue
						{syncQueueSummary.total > 0 && (
							<Badge className="bg-orange-100 text-orange-800 border-orange-200">
								{syncQueueSummary.total}
							</Badge>
						)}
					</Button>
					<Button
						variant="outline"
						onClick={handleExportUsers}
						disabled={filteredUsers.length === 0}
						className="inline-flex items-center gap-2"
					>
						<Download className="w-4 h-4" />
						Export CSV
					</Button>
					<Button
						onClick={() => setShowInviteDialog(true)}
						className="inline-flex items-center gap-2"
					>
						<UserPlus className="w-4 h-4" />
						Invite User
					</Button>
				</div>
			</div>

			{/* Stats Cards */}
			<div className="grid grid-cols-4 gap-4">
				<Card className="border-l-4 border-l-red-500">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm font-medium text-gray-600">
									Administrators
								</p>
								<p className="text-2xl font-bold text-gray-900 mt-1">
									{roleCounts.Administrator}
								</p>
							</div>
							<div className="p-2 bg-red-50 rounded-lg">
								<ShieldAlert className="w-5 h-5 text-red-600" />
							</div>
						</div>
					</CardContent>
				</Card>
				<Card className="border-l-4 border-l-blue-500">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm font-medium text-gray-600">
									Executive Officers
								</p>
								<p className="text-2xl font-bold text-gray-900 mt-1">
									{roleCounts["Executive Officers"]}
								</p>
							</div>
							<div className="p-2 bg-blue-50 rounded-lg">
								<Edit className="w-5 h-5 text-blue-600" />
							</div>
						</div>
					</CardContent>
				</Card>
				<Card className="border-l-4 border-l-green-500">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm font-medium text-gray-600">
									General Officers
								</p>
								<p className="text-2xl font-bold text-gray-900 mt-1">
									{roleCounts["General Officers"]}
								</p>
							</div>
							<div className="p-2 bg-green-50 rounded-lg">
								<Edit2 className="w-5 h-5 text-green-600" />
							</div>
						</div>
					</CardContent>
				</Card>
				<Card className="border-l-4 border-l-gray-500">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm font-medium text-gray-600">Members</p>
								<p className="text-2xl font-bold text-gray-900 mt-1">
									{roleCounts.Member}
								</p>
							</div>
							<div className="p-2 bg-gray-50 rounded-lg">
								<Users className="w-5 h-5 text-gray-600" />
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Search */}
			<Card>
				<CardContent className="p-4">
					<div className="relative">
						<Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
						<Input
							placeholder="Search users by name, email, or role..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-10"
						/>
					</div>
				</CardContent>
			</Card>

			{/* Users List */}
			<Card>
				<CardContent className="p-0">
					{filteredUsers.length === 0 ? (
						<div className="p-12 text-center">
							<Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
							<h3 className="text-lg font-medium text-gray-900 mb-2">
								{users.length === 0
									? "No users yet"
									: "No users match your search"}
							</h3>
							<p className="text-gray-500">
								{users.length === 0
									? "Invite users to your organization to start managing your inventory."
									: "Try adjusting your search terms."}
							</p>
						</div>
					) : (
						<div className="divide-y divide-gray-200">
							{filteredUsers.map((user) => {
								const isCurrentUser = currentUser?._id === user._id;
								return (
									<div
										key={user._id}
										className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between"
									>
										<div className="flex items-center gap-4">
											<div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center text-white font-medium text-lg">
												{user.name.charAt(0).toUpperCase()}
											</div>
											<div>
												<div className="flex items-center gap-2">
													<h3 className="font-medium text-gray-900">
														{user.name}
													</h3>
													{isCurrentUser && (
														<Badge variant="outline" className="text-xs">
															You
														</Badge>
													)}
													{/* Sync status indicator */}
													<div
														className="flex items-center gap-1"
														title={`Role sync status: ${userSyncStatuses.get(user._id) || "synced"}`}
													>
														{getSyncStatusIcon(user._id)}
													</div>
												</div>
												<p className="text-sm text-gray-500 flex items-center gap-1">
													<Mail className="w-3.5 h-3.5" />
													{user.email}
												</p>
											</div>
										</div>

										<div className="flex items-center gap-3">
											<div className="flex items-center gap-2">
												<span className="text-sm text-gray-600">Role:</span>
												{isCurrentUser ? (
													<Badge
														className={cn(
															"border",
															getRoleBadgeColor(user.role),
														)}
													>
														{getRoleIcon(user.role)}
														<span className="ml-1.5">{user.role}</span>
													</Badge>
												) : (
													<Select
														defaultValue={user.role}
														onValueChange={(value) =>
															handleRoleChange(user._id, value as UserRole)
														}
													>
														<SelectTrigger className="w-32">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="Administrator">
																Administrator
															</SelectItem>
															<SelectItem value="Executive Officers">
																Executive Officers
															</SelectItem>
															<SelectItem value="General Officers">
																General Officers
															</SelectItem>
															<SelectItem value="Member">Member</SelectItem>
														</SelectContent>
													</Select>
												)}
											</div>

											{!isCurrentUser && (
												<Button
													variant="ghost"
													size="icon"
													onClick={() => setDeletingUser(user as User)}
													className="text-red-600 hover:text-red-700 hover:bg-red-50"
												>
													<Trash2 className="w-4 h-4" />
												</Button>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>

				{/* Invite Dialog */}
				<InviteUserDialog
					open={showInviteDialog}
					inviteForm={inviteForm}
					inviteInProgress={inviteInProgress}
					onInviteFormChange={setInviteForm}
					onClose={() => setShowInviteDialog(false)}
					onInvite={handleInvite}
				/>

			{/* Delete Confirmation */}
			<AlertDialog
				open={!!deletingUser}
				onOpenChange={() => !isDeleting && setDeletingUser(null)}
				title="Remove User"
				description={`Are you sure you want to remove "${deletingUser?.name}" from the organization? They will lose access to all inventory data. This action cannot be undone.`}
				confirmLabel={isDeleting ? "Removing..." : "Remove User"}
				cancelLabel="Cancel"
				onConfirm={handleDelete}
				variant="destructive"
			/>

			{/* Role Sync Queue Dialog */}
			<RoleSyncQueueDialog
				open={showSyncQueueDialog}
				onOpenChange={setShowSyncQueueDialog}
			/>
		</div>
	);
}
