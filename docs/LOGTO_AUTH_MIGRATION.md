# Logto Authentication Migration

## Overview

This migration replaced Convex's built-in authentication (`ctx.auth.getUserIdentity()`) with a custom Logto-based implementation using TanStack Router API routes.

**What Changed:**
- **Old:** Convex auth with tokens passed via `client.setAuth()`, functions called `ctx.auth.getUserIdentity()`
- **New:** Logto JWT tokens verified at `/api/verify-token`, auth context passed as arguments to all Convex queries/mutations

**Why This Change:**
- Convex authentication is not supported in self-hosted deployments
- Need full control over auth flow for custom requirements
- Decouple auth logic from Convex for better portability

**Migration Scope:**
- 6 new files created
- 40+ files modified (Convex functions, React components, auth hooks)
- 2 Convex HTTP endpoints deprecated (kept for compatibility)
- 1 file removed (client-side verify-logto-token.tsx)

---

## Architecture Changes

### Old Auth Flow (Convex Auth)

```
User → Logto → Frontend (getAccessToken)
  → client.setAuth(token) → Convex functions
  → ctx.auth.getUserIdentity() → Database lookup
```

### New Auth Flow

```
User → Logto (JWT tokens)
  → Frontend (useAuth hook)
  → POST /api/verify-token (JWT verification with jose)
  → Sync user to Convex (internal mutation)
  → Return auth context {userId, logtoUserId, orgId, role, timestamp}
  → Store in localStorage
  → Every Convex call includes authContext argument
  → Convex functions validate auth context against database
```

### Auth Context Structure

```typescript
interface AuthContext {
  userId: string        // Convex user document ID
  logtoUserId: string   // Logto subject (for verification)
  orgId: string         // Convex org ID
  role: UserRole        // 'Admin' | 'Editor' | 'Member' | 'Viewer'
  timestamp: number     // When context was created (staleness check)
}
```

### Token Verification Flow

1. Frontend calls `POST /api/verify-token` with access token
2. Server verifies JWT signature using Logto's JWKS (via `jose` library)
3. Extracts user info: `sub`, `email`, `name`, `roles`, `organization_id`
4. Calls `convex.mutation(api.auth_helpers.syncUserFromLogtoToken, ...)`
5. Returns auth context and user data to frontend
6. Frontend stores context in `localStorage` for subsequent calls

---

## File Changes Summary

### New Files Created (6)

| File | Purpose |
|------|---------|
| `src/routes/api/verify-token.ts` | API route for JWT verification and user sync |
| `src/types/auth.ts` | AuthContext and related type definitions |
| `src/lib/convex-wrapper.ts` | Helper utilities for authenticated Convex calls |
| `convex/types/auth.ts` | AuthContext interface for Convex functions |
| `convex/auth_helpers.ts` | Updated auth helpers (validateAuthContext, getCurrentUser, etc.) |
| `docs/LOGTO_AUTH_MIGRATION.md` | This documentation file |

### Modified Files (40+)

**Convex Functions (all queries/mutations now accept authContext):**
- `convex/blueprints/queries.ts`
- `convex/blueprints/mutations.ts`
- `convex/compartments/queries.ts`
- `convex/compartments/mutations.ts`
- `convex/drawers/queries.ts`
- `convex/drawers/mutations.ts`
- `convex/inventory/queries.ts`
- `convex/inventory/mutations.ts`
- `convex/organizations/queries.ts`
- `convex/organizations/mutations.ts`
- `convex/parts/queries.ts`
- `convex/parts/mutations.ts`
- `convex/blueprint_revisions/queries.ts`
- `convex/blueprint_revisions/mutations.ts`
- `convex/transactions/queries.ts`
- `convex/role_sync_queue/queries.ts`
- `convex/role_sync_queue/mutations.ts`

**Frontend Components (now include authContext in Convex calls):**
- `src/hooks/useAuth.tsx` - Added auth context state management
- `src/lib/auth.ts` - Added auth context storage helpers
- `src/integrations/convex/provider.tsx` - Removed `client.setAuth()` call
- `src/routes/dashboard.tsx`
- `src/routes/parts/index.tsx`
- `src/routes/parts/$partId.tsx`
- `src/routes/blueprints/index.tsx`
- `src/routes/blueprints/$blueprintId.tsx`
- `src/routes/inventory/index.tsx`
- `src/routes/transactions/index.tsx`
- `src/routes/admin/users/index.tsx`
- `src/components/inventory/*.tsx` (Inventory dialogs)
- `src/components/blueprint/*.tsx` (Blueprint components)

### Deprecated Files (2)

| File | Status | Notes |
|------|--------|-------|
| `convex/auth.ts` (verifyLogtoToken) | Deprecated | Replaced by `/api/verify-token` route, kept for compatibility |
| `convex/auth.ts` (logout) | Deprecated | No longer needed, Logto SDK handles signOut() client-side |

### Removed Files (1)

| File | Reason |
|------|--------|
| `src/routes/api/verify-logto-token.tsx` | Replaced by SSR route `src/routes/api/verify-token.ts` |

---

## Testing Checklist

### 1. User Login Flow

**Steps:**
1. Navigate to application root (`/`)
2. Click "Sign In" button
3. Redirect to Logto login page
4. Authenticate with Logto (email/password or social)
5. Redirect back to application (`/callback`)
6. Verify user is redirected to dashboard
7. Check localStorage for:
   - `inventory_tracker_convex_user` (user data)
   - `inventory_tracker_auth_context` (auth context)

**Expected Result:**
- User successfully logged in
- User profile displayed in header
- localStorage contains valid auth context
- No console errors

**Debug Commands:**
```javascript
// Check localStorage
console.log('User:', JSON.parse(localStorage.getItem('inventory_tracker_convex_user')))
console.log('Auth Context:', JSON.parse(localStorage.getItem('inventory_tracker_auth_context')))
```

---

### 2. Protected Routes Access

**Steps:**
1. While logged out, try to access:
   - `/dashboard` → Should redirect to `/login`
   - `/parts` → Should redirect to `/login`
   - `/blueprints` → Should redirect to `/login`
2. While logged in, try to access same routes → Should load successfully
3. Log out and try accessing protected routes again → Should redirect to `/login`

**Expected Result:**
- Unauthorized users redirected to login
- Authenticated users can access protected routes
- Logout clears auth state and enforces redirects

**Debug Commands:**
```javascript
// Check auth state
const { isAuthenticated, user, authContext } = useAuth()
console.log('Is Authenticated:', isAuthenticated)
console.log('User:', user)
console.log('Auth Context:', authContext)
```

---

### 3. Role-Based Permissions

**Steps:**

**Admin Role:**
1. Log in as Admin (via Logto or dev mode)
2. Access admin routes (`/admin/users`)
3. Verify admin functions are available
4. Try to access other role-specific features

**Editor Role:**
1. Log in as Editor (via Logto or dev mode)
2. Try to access admin routes (`/admin/users`) → Should show "Forbidden" or redirect
3. Verify can edit inventory and parts
4. Verify cannot delete organizations

**Viewer Role:**
1. Log in as Viewer (via Logto or dev mode)
2. Try to create/edit parts → Should show "Forbidden" or disabled UI
3. Verify can only view data

**Expected Result:**
- Role-based permissions enforced correctly
- Appropriate error messages or UI state changes
- No unauthorized data access

**Debug Commands:**
```javascript
// Check role helpers
const { hasRole } = useAuth()
console.log('Has Admin role:', hasRole('Admin'))
console.log('Has Editor role:', hasRole('Editor'))
console.log('Has Viewer role:', hasRole('Viewer'))
```

---

### 4. Query/Mutation Execution

**Steps:**
1. Log in as a user
2. Navigate to parts list (`/parts`)
3. Verify parts load successfully (query execution)
4. Create a new part (mutation execution)
5. Edit an existing part (mutation execution)
6. Delete a part (if role allows)
7. Check browser DevTools Network tab for:
   - All Convex calls include `authContext` in payload
   - No `Authorization` headers (tokens passed as arguments)

**Expected Result:**
- All queries and mutations execute successfully
- Auth context included in every Convex request
- No auth-related errors in console

**Debug Commands:**
```javascript
// Check authContext in Convex calls
// In components, verify authContext is passed:
const convex = useConvexQueryClient()
const parts = useQuery({
  queryKey: ['parts'],
  queryFn: () => convex.query(api.parts.queries.list, { orgId, authContext })
})
```

---

### 5. Token Refresh

**Steps:**
1. Log in and note the auth context timestamp
2. Wait 4-5 minutes (auth context expires after 5 minutes)
3. Perform a Convex operation (load data, create item)
4. Verify operation succeeds (token should auto-refresh)
5. Check localStorage for updated timestamp

**Expected Result:**
- Token refresh works automatically
- No auth context expired errors
- User experience is seamless

**Debug Commands:**
```javascript
// Manually trigger refresh
const { getFreshAuthContext } = useAuth()
const freshContext = await getFreshAuthContext()
console.log('Fresh Context:', freshContext)
```

---

### 6. Session Persistence

**Steps:**
1. Log in as a user
2. Refresh the page (F5 or Cmd+R)
3. Verify user remains logged in
4. Check localStorage persists
5. Verify auth context is restored from storage
6. Close browser tab and reopen
7. Verify user remains logged in (if using localStorage)

**Expected Result:**
- Session persists across page refreshes
- Auth state restored from localStorage
- No need to re-authenticate

**Debug Commands:**
```javascript
// Check if auth context is valid
const authContext = JSON.parse(localStorage.getItem('inventory_tracker_auth_context'))
const age = Date.now() - authContext.timestamp
console.log('Auth context age:', age / 1000, 'seconds')
console.log('Is expired:', age > 5 * 60 * 1000)
```

---

### 7. Logout Flow

**Steps:**
1. Log in as a user
2. Click "Sign Out" button
3. Verify redirect to Logto logout page
4. Verify redirect back to application root
5. Check localStorage is cleared:
   - `inventory_tracker_convex_user` should be removed
   - `inventory_tracker_auth_context` should be removed
6. Try to access protected routes → Should redirect to login

**Expected Result:**
- Clean logout from both Logto and app
- All local storage cleared
- Protected routes enforce authentication

**Debug Commands:**
```javascript
// Check localStorage after logout
console.log('User:', localStorage.getItem('inventory_tracker_convex_user'))
console.log('Auth Context:', localStorage.getItem('inventory_tracker_auth_context'))
// Both should be null
```

---

### 8. Error Handling - Invalid Auth Context

**Steps:**
1. Log in as a user
2. Open DevTools Application tab
3. Modify `inventory_tracker_auth_context` in localStorage:
   - Change `userId` to invalid value
   - Change `timestamp` to old value (e.g., `Date.now() - 10 * 60 * 1000`)
4. Try to perform a Convex operation
5. Verify error message appears

**Expected Result:**
- Appropriate error message displayed
- Graceful fallback (e.g., redirect to login or show error toast)
- No console errors that crash the app

**Expected Error Messages:**
- "User not found" (invalid userId)
- "Auth context expired" (stale timestamp)
- "Invalid auth context" (mismatched logtoUserId, orgId, or role)

---

### 9. Error Handling - Missing Auth Context

**Steps:**
1. Log in as a user
2. Remove `inventory_tracker_auth_context` from localStorage
3. Refresh the page
4. Try to perform a Convex operation

**Expected Result:**
- App detects missing auth context
- Re-verifies token and refreshes auth context
- OR redirects to login if verification fails
- No indefinite loading states

---

### 10. Cross-Origin Tests (if applicable)

**Steps:**
1. Configure `ALLOWED_ORIGINS` environment variable
2. Test from different origins:
   - `http://localhost:3000`
   - `http://localhost:5173` (if using Vite dev server)
   - Production domain
3. Verify CORS headers are set correctly
4. Verify preflight OPTIONS requests succeed

**Expected Result:**
- CORS configured correctly
- API calls work from allowed origins
- Requests from blocked origins return 403

---

## Common Issues and Solutions

### Issue: "Auth context expired" errors

**Cause:** Auth context timestamp older than 5 minutes

**Solution:**
```typescript
// In useAuth hook, auth context auto-refreshes
const { getFreshAuthContext } = useAuth()
const freshContext = await getFreshAuthContext()

// Or manually clear localStorage and re-auth
localStorage.removeItem('inventory_tracker_auth_context')
window.location.reload()
```

**Prevention:** The `verifyAndRefreshAuthContext` function in [`useAuth.tsx`](src/hooks/useAuth.tsx:45) automatically refreshes tokens.

---

### Issue: "Missing authContext argument" errors

**Cause:** Convex query/mutation called without auth context

**Solution:**
```typescript
// ❌ Wrong
convex.query(api.parts.queries.list, { orgId })

// ✅ Correct
convex.query(api.parts.queries.list, { orgId, authContext })
```

**Prevention:** Use the `withAuth` helper from [`convex-wrapper.ts`](src/lib/convex-wrapper.ts):
```typescript
const { authContext } = useAuthenticatedConvex()
convex.query(api.parts.queries.list, withAuth({ orgId }, authContext))
```

---

### Issue: Stale localStorage data after logout

**Cause:** localStorage not cleared properly on logout

**Solution:**
```javascript
// Manually clear localStorage
localStorage.removeItem('inventory_tracker_convex_user')
localStorage.removeItem('inventory_tracker_auth_context')
window.location.reload()
```

**Prevention:** The `signOutWithCleanup` function in [`useAuth.tsx`](src/hooks/useAuth.tsx:157) clears storage automatically.

---

### Issue: JWT verification fails with "Token expired"

**Cause:** Logto access token expired before refresh

**Solution:**
- Logto SDK automatically handles token refresh
- Verify Logto app configuration includes `offline_access` scope
- Check Logto refresh token configuration

**Debug:**
```javascript
// Check token expiration
const idTokenClaims = await getIdTokenClaims()
console.log('Token expires at:', new Date(idTokenClaims.exp * 1000))
```

---

### Issue: CORS errors on `/api/verify-token`

**Cause:** Origin not in `ALLOWED_ORIGINS`

**Solution:**
```bash
# Set ALLOWED_ORIGINS in .env.local
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,https://yourdomain.com

# Restart dev server
bun run dev
```

---

### Issue: User not syncing to Convex

**Cause:** `syncUserFromLogtoToken` mutation failing

**Solution:**
1. Check Convex connection: Verify `CONVEX_SELF_HOSTED_URL` or `VITE_CONVEX_URL` is set
2. Check Convex logs for errors
3. Verify user exists in Convex database:
   ```typescript
   // In Convex dashboard, run:
   db.query('users').collect()
   ```
4. Verify `by_logtoUserId` index exists

---

### Issue: Role mismatch between Logto and Convex

**Cause:** Custom claims not configured in Logto

**Solution:**
1. Configure custom JWT claims in Logto Admin Console:
   - Go to "Authorization" → "Custom JWT Claims"
   - Create claim `roles` (array of strings)
   - Add script to return user roles
2. Verify claims are included in token:
   ```javascript
   const idTokenClaims = await getIdTokenClaims()
   console.log('Roles:', idTokenClaims.roles)
   ```

---

### Issue: Organization ID not syncing

**Cause:** `organization_id` custom claim not configured

**Solution:**
1. Configure organization claim in Logto:
   - Create claim `organization_id` (string)
   - Add script to return user's primary organization
2. Verify claim in token:
   ```javascript
   const idTokenClaims = await getIdTokenClaims()
   console.log('Organization ID:', idTokenClaims.organization_id)
   ```

---

## Rollback Instructions

If issues arise and you need to revert to Convex auth:

### Step 1: Restore Convex Auth Files

1. Restore [`convex/auth.ts`](convex/auth.ts) from backup (before migration)
2. Restore [`convex/auth_helpers.ts`](convex/auth_helpers.ts) from backup
3. Ensure `ctx.auth.getUserIdentity()` is used instead of auth context

### Step 2: Restore Frontend Auth

1. Restore [`src/integrations/convex/provider.tsx`](src/integrations/convex/provider.tsx):
   ```typescript
   // Add back setAuth call
   client.setAuth(token)
   ```

2. Restore [`src/hooks/useAuth.tsx`](src/hooks/useAuth.tsx):
   - Remove auth context state management
   - Remove calls to `/api/verify-token`
   - Use `client.setAuth()` with Logto access token

3. Restore [`src/lib/auth.ts`](src/lib/auth.ts):
   - Remove auth context storage helpers
   - Restore token-based auth

### Step 3: Restore Convex Function Signatures

1. Remove `authContext` argument from all queries/mutations:
   ```typescript
   // ❌ New format
   args: {
     orgId: v.id('organizations'),
     authContext: v.object({...})
   }

   // ✅ Old format
   args: {
     orgId: v.id('organizations')
   }
   ```

2. Update function calls:
   ```typescript
   // ❌ New format
   getCurrentUser(ctx, args.authContext)

   // ✅ Old format
   getCurrentUser(ctx)
   ```

### Step 4: Remove or Deprecate New Files

1. Delete [`src/routes/api/verify-token.ts`](src/routes/api/verify-token.ts)
2. Delete [`src/types/auth.ts`](src/types/auth.ts)
3. Delete [`src/lib/convex-wrapper.ts`](src/lib/convex-wrapper.ts)
4. Delete [`convex/types/auth.ts`](convex/types/auth.ts)

### Step 5: Update Environment Variables

No changes needed - Logto environment variables remain the same.

### Step 6: Test Rollback

1. Clear localStorage
2. Restart dev server
3. Test login flow with Convex auth
4. Verify all components work correctly

---

## Success Criteria

The migration is considered successful when:

1. ✅ Users can log in via Logto
2. ✅ Auth context is created and stored in localStorage
3. ✅ Protected routes enforce authentication
4. ✅ Role-based permissions work correctly
5. ✅ All Convex queries/mutations execute without auth errors
6. ✅ Token refresh works automatically
7. ✅ Session persists across page refreshes
8. ✅ Logout clears all auth state
9. ✅ Error handling is graceful and informative
10. ✅ No console errors related to authentication
11. ✅ Performance is comparable to pre-migration

---

## Monitoring and Debugging

### Browser DevTools

**Console:**
- Search for `[verify-token]` logs from API route
- Search for `[LogtoAuth]` logs from AuthProvider
- Look for auth-related errors

**Network Tab:**
- Filter for `/api/verify-token` requests
- Check request payload includes `accessToken`
- Check response includes `authContext` and `user`

**Application Tab:**
- Check `localStorage` for auth context
- Verify timestamps are current

### Convex Dashboard

**Logs:**
- Monitor `syncUserFromLogtoToken` mutation calls
- Check for auth validation errors

**Database:**
- Verify users table has correct `logtoUserId` mapping
- Check organizations table for correct org assignments

### Environment Variables Verification

```bash
# Check if all required env vars are set
echo "LOGTO_ENDPOINT: $VITE_LOGTO_ENDPOINT"
echo "LOGTO_APP_ID: $VITE_LOGTO_APP_ID"
echo "CONVEX_URL: $VITE_CONVEX_URL"
echo "ALLOWED_ORIGINS: $ALLOWED_ORIGINS"
```

---

## Next Steps

After successful migration:

1. **Remove deprecated endpoints:**
   - Delete `verifyLogtoToken` and `logout` from [`convex/auth.ts`](convex/auth.ts)
   - Update [`convex/http.ts`](convex/http.ts) to remove route handlers

2. **Implement token refresh (optional):**
   - Add `/api/refresh-token` endpoint
   - Integrate with Logto's refresh token flow

3. **Add monitoring:**
   - Track auth failure rates
   - Monitor token verification latency
   - Set up alerts for unusual activity

4. **Security audit:**
   - Review CORS configuration
   - Verify rate limiting (if implemented)
   - Check for potential security vulnerabilities

---

## References

- [Logto Documentation](https://docs.logto.io/)
- [TanStack Router File-Based Routing](https://tanstack.com/router/latest/docs/guide/file-based-routing)
- [jose JWT Library](https://github.com/panva/jose)
- [Convex Documentation](https://docs.convex.dev/)
- Architecture document: [`plans/logto-auth-migration-architecture.md`](../plans/logto-auth-migration-architecture.md)
- Environment setup: [`.LOGTO_ENV.md`](../.LOGTO_ENV.md)
