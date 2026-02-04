# User Invitations

## Overview

User invitations in the Inventory Tracker are handled through **Logto**, the integrated identity provider. This approach ensures secure user management and role-based access control.

## How Invitations Work

### Admin UI Flow

1. Admin clicks "Invite User" on the `/admin/users` page
2. Admin fills in the invitation form:
   - **Name**: User's full name
   - **Email**: User's email address
   - **Role**: Admin, Editor, Member, or Viewer
3. The system creates a user record in the application with the specified role
4. The user receives an invitation via Logto (email invitation)
5. User clicks the invitation link and signs up/signs in
6. Upon first login, the user is associated with their application role

### Logto Integration

The application uses Logto for authentication and user management:

- **Authentication**: Users sign in through Logto's SSO
- **User Directory**: Logto manages user profiles (name, email, etc.)
- **Role Sync**: The application syncs Logto users with internal user records

### Role Sync Queue

When role changes are made in the application, they are synced with Logto:

- A background queue processes role同步
- Failed syncs are retried with exponential backoff
- Admins can monitor the sync queue status on the users page
- Admins can manually retry failed syncs

### See sync queue details:

1. Go to `/admin/users`
2. Click "View Sync Queue" button
3. View pending, retrying, and failed syncs
4. Click "Retry" for failed items to attempt immediate resync

## Direct Logto Admin Console

For advanced invitation scenarios, admins can also use the **Logto Admin Console**:

1. Access your Logto admin console at your Logto domain
2. Navigate to **Users** → **Invitations**
3. Send email invitations directly through Logto
4. After users sign up, assign them roles in the application (`/admin/users`)

## Role-Based Access

Invited users receive permissions based on their assigned role:

| Role | Permissions |
|------|-------------|
| **Admin** | Full access including user management, role changes, system settings |
| **Editor** | Create/edit parts, manage inventory, create blueprints |
| **Member** | Check-in/out inventory, move items, view and comment |
| **Viewer** | Read-only access to parts, inventory, transactions |

## Troubleshooting

### User Not Receiving Invitation

1. Check Logto Admin Console for invitation status
2. Verify email address is correct
3. Check spam folder
4. Ensure Logto email service is configured correctly

### Role Sync Failed

1. Check sync queue in `/admin/users` → "View Sync Queue"
2. Review error messages in failed items
3. Click "Retry" to attempt resync
4. If persistent, verify Logto API credentials in `.env.local`

### User Can't Sign In

1. Verify user exists in Logto
2. Check if user is in the application's user list
3. Ensure organization membership is set correctly
4. Check role assignment in `/admin/users`

## Related Files

- [`convex/role_sync_queue/queries.ts`](../convex/role_sync_queue/queries.ts) - Role sync queue queries
- [`convex/role_sync_queue/mutations.ts`](../convex/role_sync_queue/mutations.ts) - Role sync queue mutations
- [`src/routes/admin/users/index.tsx`](../src/routes/admin/users/index.tsx) - User management UI
- [`src/components/admin/RoleSyncQueueDialog.tsx`](../src/components/admin/RoleSyncQueueDialog.tsx) - Sync queue dialog
- [`convex/organization_helpers.ts`](../convex/organization_helpers.ts) - Organization helper functions
