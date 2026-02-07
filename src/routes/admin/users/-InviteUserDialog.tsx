import {
	Edit,
	Edit2,
	Loader2,
	ShieldAlert,
	UserPlus,
	Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { UserRole } from "@/types";

interface InviteForm {
	email: string;
	name: string;
	role: UserRole;
}

interface InviteUserDialogProps {
	open: boolean;
	inviteForm: InviteForm;
	inviteInProgress: boolean;
	onInviteFormChange: (updater: (prev: InviteForm) => InviteForm) => void;
	onClose: () => void;
	onInvite: () => void;
}

export function InviteUserDialog({
	open,
	inviteForm,
	inviteInProgress,
	onInviteFormChange,
	onClose,
	onInvite,
}: InviteUserDialogProps) {
	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
			<Card className="w-full max-w-md">
				<CardContent className="p-6">
					<div className="flex items-center gap-3 mb-4">
						<div className="p-2 bg-cyan-100 rounded-lg">
							<UserPlus className="w-5 h-5 text-cyan-600" />
						</div>
						<div>
							<h2 className="text-xl font-semibold text-gray-900">Invite User</h2>
							<p className="text-sm text-gray-500">
								The user will receive an invitation via Logto. They can sign in and
								access the organization based on their assigned role.
							</p>
						</div>
					</div>

					<div className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Name
							</label>
							<Input
								placeholder="Enter full name"
								value={inviteForm.name}
								onChange={(e) =>
									onInviteFormChange((prev) => ({
										...prev,
										name: e.target.value,
									}))
								}
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Email
							</label>
							<Input
								type="email"
								placeholder="user@example.com"
								value={inviteForm.email}
								onChange={(e) =>
									onInviteFormChange((prev) => ({
										...prev,
										email: e.target.value,
									}))
								}
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Role
							</label>
							<Select
								value={inviteForm.role}
								onValueChange={(value) =>
									onInviteFormChange((prev) => ({
										...prev,
										role: value as UserRole,
									}))
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="Administrator">
										<div className="flex items-center gap-2">
											<ShieldAlert className="w-4 h-4" />
											<div>
												<p className="font-medium">Administrator</p>
												<p className="text-xs text-gray-500">Full access</p>
											</div>
										</div>
									</SelectItem>
									<SelectItem value="Executive Officers">
										<div className="flex items-center gap-2">
											<Edit className="w-4 h-4" />
											<div>
												<p className="font-medium">Executive Officers</p>
												<p className="text-xs text-gray-500">
													Can edit inventory
												</p>
											</div>
										</div>
									</SelectItem>
									<SelectItem value="General Officers">
										<div className="flex items-center gap-2">
											<Edit2 className="w-4 h-4" />
											<div>
												<p className="font-medium">General Officers</p>
												<p className="text-xs text-gray-500">
													Check in/out items
												</p>
											</div>
										</div>
									</SelectItem>
									<SelectItem value="Member">
										<div className="flex items-center gap-2">
											<Users className="w-4 h-4" />
											<div>
												<p className="font-medium">Member</p>
												<p className="text-xs text-gray-500">Read-only access</p>
											</div>
										</div>
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="flex gap-3 mt-6">
						<Button variant="outline" onClick={onClose} className="flex-1">
							Cancel
						</Button>
						<Button onClick={onInvite} disabled={inviteInProgress} className="flex-1">
							{inviteInProgress ? (
								<>
									<Loader2 className="w-4 h-4 mr-2 animate-spin" />
									Inviting...
								</>
							) : (
								"Send Invite"
							)}
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
