/**
 * Role Sync Queue Dialog
 * Displays pending, retry, and failed role sync operations
 * Allows admin to retry failed syncs
 */

import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	Loader2,
	RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@/integrations/convex/react-query";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { useToast } from "../ui/toast";

interface RoleSyncQueueDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

type RoleSyncStatus = "pending" | "retry" | "failed";

const MAX_RETRY_ATTEMPTS = 5;

export function RoleSyncQueueDialog({
	open,
	onOpenChange,
}: RoleSyncQueueDialogProps) {
	const { toast } = useToast();
	const { authContext, getFreshAuthContext, isLoading } = useAuth();
	const [isRetrying, setIsRetrying] = useState<string | null>(null);

	// Fetch role sync queue items
	const queueResult = useQuery(
		(api as any).role_sync_queue.queries.list,
		authContext ? { authContext: authContext ?? undefined } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const queueItems = (queueResult as any[]) || [];

	// Fetch users to populate names/emails
	const usersResult = useQuery(
		api.organizations.queries.getOrgMembers as any,
		authContext ? { authContext: authContext ?? undefined, organizationId: authContext.orgId } : undefined,
		{
			enabled: !!authContext && !isLoading,
		},
	);
	const users = (usersResult as any[]) || [];

	// Mutation for retrying failed syncs
	const retryMutation = useMutation((api as any).role_sync_queue.mutations.retryRoleSync);

	// Manually retry a failed sync
	const handleRetry = async (queueItemId: string) => {
		setIsRetrying(queueItemId);
		try {
			const context = (await getFreshAuthContext()) ?? authContext ?? undefined;
			await (retryMutation as any).mutateAsync({
				authContext: context,
				queueItemId: queueItemId as Id<"roleSyncQueue">,
			});
			toast.success("Retry queued", "Role sync will be retried shortly");
		} catch (error) {
			toast.error(
				"Retry failed",
				error instanceof Error ? error.message : "An error occurred",
			);
		} finally {
			setIsRetrying(null);
		}
	};

	// Populate queue items with user names and emails
	const queueItemsWithUsers = queueItems.map((item) => {
		const user = users.find((u) => u._id === item.userId);
		return {
			...item,
			userName: user?.name,
			userEmail: user?.email,
		};
	});

	// Group by status
	const groupedItems = {
		pending: queueItemsWithUsers.filter((item) => item.status === "pending"),
		retry: queueItemsWithUsers.filter((item) => item.status === "retry"),
		failed: queueItemsWithUsers.filter((item) => item.status === "failed"),
	};

	// Get status badge styling
	const getStatusBadge = (status: RoleSyncStatus) => {
		switch (status) {
			case "pending":
				return (
					<Badge className="bg-blue-100 text-blue-800 border-blue-200">
						<Clock className="w-3 h-3 mr-1" />
						Pending
					</Badge>
				);
			case "retry":
				return (
					<Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
						<RefreshCw className="w-3 h-3 mr-1" />
						Retrying
					</Badge>
				);
			case "failed":
				return (
					<Badge className="bg-red-100 text-red-800 border-red-200">
						<AlertTriangle className="w-3 h-3 mr-1" />
						Failed
					</Badge>
				);
		}
	};

	// Format timestamp
	const formatTimestamp = (timestamp?: number) => {
		if (!timestamp) return "Never";
		return new Date(timestamp).toLocaleString();
	};

	// Format next attempt in relative time
	const formatNextAttempt = (nextAttemptAt: number) => {
		const now = Date.now();
		const diff = nextAttemptAt - now;

		if (diff <= 0) return "Ready now";

		const minutes = Math.floor(diff / 60000);
		if (minutes < 60) return `In ${minutes} minute${minutes !== 1 ? "s" : ""}`;

		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `In ${hours} hour${hours !== 1 ? "s" : ""}`;

		const days = Math.floor(hours / 24);
		return `In ${days} day${days !== 1 ? "s" : ""}`;
	};

	if (!open) return null;

	const totalCount = queueItems.length;
	const hasAnyItems = totalCount > 0;

	return (
		<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
			<Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
				<div className="p-6 border-b border-gray-200">
					<div className="flex items-center justify-between">
						<div>
							<h2 className="text-xl font-semibold text-gray-900">
								Role Sync Queue
							</h2>
							<p className="text-sm text-gray-500 mt-1">
								Monitor and manage Logto role synchronization
							</p>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onOpenChange(false)}
						>
							Close
						</Button>
					</div>
				</div>

				<CardContent className="p-0 overflow-auto flex-1">
					{!hasAnyItems ? (
						<div className="p-12 text-center flex-1 flex items-center justify-center">
							<div>
								<div className="p-4 bg-green-100 rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-4">
									<CheckCircle2 className="w-8 h-8 text-green-600" />
								</div>
								<h3 className="text-lg font-medium text-gray-900 mb-2">
									All synced up
								</h3>
								<p className="text-gray-500">
									All role syncs have completed successfully. No items in queue.
								</p>
							</div>
						</div>
					) : (
						<div className="p-6 space-y-6">
							{/* Summary Stats */}
							<div className="grid grid-cols-3 gap-4">
								<Card className="border-l-4 border-l-blue-500">
									<CardContent className="p-4">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-sm font-medium text-gray-600">
													Pending
												</p>
												<p className="text-2xl font-bold text-gray-900 mt-1">
													{groupedItems.pending.length}
												</p>
											</div>
											<div className="p-2 bg-blue-50 rounded-lg">
												<Clock className="w-5 h-5 text-blue-600" />
											</div>
										</div>
									</CardContent>
								</Card>
								<Card className="border-l-4 border-l-yellow-500">
									<CardContent className="p-4">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-sm font-medium text-gray-600">
													Retrying
												</p>
												<p className="text-2xl font-bold text-gray-900 mt-1">
													{groupedItems.retry.length}
												</p>
											</div>
											<div className="p-2 bg-yellow-50 rounded-lg">
												<RefreshCw className="w-5 h-5 text-yellow-600" />
											</div>
										</div>
									</CardContent>
								</Card>
								<Card className="border-l-4 border-l-red-500">
									<CardContent className="p-4">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-sm font-medium text-gray-600">
													Failed
												</p>
												<p className="text-2xl font-bold text-gray-900 mt-1">
													{groupedItems.failed.length}
												</p>
											</div>
											<div className="p-2 bg-red-50 rounded-lg">
												<AlertTriangle className="w-5 h-5 text-red-600" />
											</div>
										</div>
									</CardContent>
								</Card>
							</div>

							{/* Pending Items */}
							{groupedItems.pending.length > 0 && (
								<div>
									<h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
										<Clock className="w-4 h-4 text-blue-500" />
										Pending Syncs ({groupedItems.pending.length})
									</h3>
									<div className="space-y-2">
										{groupedItems.pending.map((item) => (
											<div
												key={item._id}
												className="p-4 bg-blue-50 rounded-lg border border-blue-200"
											>
												<div className="flex items-start justify-between">
													<div className="flex-1">
														<div className="flex items-center gap-2 mb-1">
															<span className="font-medium text-gray-900">
																{item.userName || "Unknown User"}
															</span>
															{getStatusBadge(item.status)}
														</div>
														<p className="text-sm text-gray-500">
															{item.userEmail}
														</p>
														<div className="mt-2 text-xs text-gray-600">
															<span className="font-medium">Target Role:</span>{" "}
															{item.targetRole}
															<span className="ml-4 font-medium">
																Next attempt:
															</span>{" "}
															{formatNextAttempt(item.nextAttemptAt)}
														</div>
													</div>
												</div>
											</div>
										))}
									</div>
								</div>
							)}

							{/* Retrying Items */}
							{groupedItems.retry.length > 0 && (
								<div>
									<h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
										<RefreshCw className="w-4 h-4 text-yellow-500" />
										Retrying Syncs ({groupedItems.retry.length})
									</h3>
									<div className="space-y-2">
										{groupedItems.retry.map((item) => (
											<div
												key={item._id}
												className="p-4 bg-yellow-50 rounded-lg border border-yellow-200"
											>
												<div className="flex items-start justify-between">
													<div className="flex-1">
														<div className="flex items-center gap-2 mb-1">
															<span className="font-medium text-gray-900">
																{item.userName || "Unknown User"}
															</span>
															{getStatusBadge(item.status)}
															<Badge variant="outline">
																Attempt {item.attempts + 1}/{MAX_RETRY_ATTEMPTS}
															</Badge>
														</div>
														<p className="text-sm text-gray-500">
															{item.userEmail}
														</p>
														<div className="mt-2 text-xs text-gray-600">
															<span className="font-medium">Target Role:</span>{" "}
															{item.targetRole}
															<span className="ml-4 font-medium">
																Last attempt:
															</span>{" "}
															{formatTimestamp(item.lastAttemptAt)}
															<span className="ml-4 font-medium">
																Next attempt:
															</span>{" "}
															{formatNextAttempt(item.nextAttemptAt)}
														</div>
													</div>
													<Button
														variant="outline"
														size="sm"
														onClick={() => handleRetry(item._id)}
														disabled={isRetrying !== null}
													>
														{isRetrying === item._id ? (
															<>
																<Loader2 className="w-3 h-3 mr-1 animate-spin" />
																Retrying...
															</>
														) : (
															<>
																<RefreshCw className="w-3 h-3 mr-1" />
																Retry Now
															</>
														)}
													</Button>
												</div>
												{item.errorMessage && (
													<div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
														<strong>Error:</strong> {item.errorMessage}
													</div>
												)}
											</div>
										))}
									</div>
								</div>
							)}

							{/* Failed Items */}
							{groupedItems.failed.length > 0 && (
								<div>
									<h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
										<AlertTriangle className="w-4 h-4 text-red-500" />
										Failed Syncs ({groupedItems.failed.length})
									</h3>
									<div className="space-y-2">
										{groupedItems.failed.map((item) => (
											<div
												key={item._id}
												className="p-4 bg-red-50 rounded-lg border border-red-200"
											>
												<div className="flex items-start justify-between">
													<div className="flex-1">
														<div className="flex items-center gap-2 mb-1">
															<span className="font-medium text-gray-900">
																{item.userName || "Unknown User"}
															</span>
															{getStatusBadge(item.status)}
															<Badge variant="outline">
																{item.attempts} attempt
																{item.attempts !== 1 ? "s" : ""}
															</Badge>
														</div>
														<p className="text-sm text-gray-500">
															{item.userEmail}
														</p>
														<div className="mt-2 text-xs text-gray-600">
															<span className="font-medium">Target Role:</span>{" "}
															{item.targetRole}
															<span className="ml-4 font-medium">
																Last attempt:
															</span>{" "}
															{formatTimestamp(item.lastAttemptAt)}
														</div>
													</div>
													<Button
														variant="outline"
														size="sm"
														onClick={() => handleRetry(item._id)}
														disabled={isRetrying !== null}
													>
														{isRetrying === item._id ? (
															<>
																<Loader2 className="w-3 h-3 mr-1 animate-spin" />
																Retrying...
															</>
														) : (
															<>
																<RefreshCw className="w-3 h-3 mr-1" />
																Retry
															</>
														)}
													</Button>
												</div>
												{item.errorMessage && (
													<div className="mt-2 text-xs text-red-600 bg-red-100 p-2 rounded">
														<strong>Error:</strong> {item.errorMessage}
													</div>
												)}
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
