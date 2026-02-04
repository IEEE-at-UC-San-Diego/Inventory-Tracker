# Logto Auth Migration - Quick Verification Checklist

Use this checklist to verify the Logto authentication migration is working correctly.

---

## Quick Start

**Prerequisites:**
- `.env.local` configured with Logto and Convex variables (see [`.LOGTO_ENV.md`](.LOGTO_ENV.md))
- Dev server running: `bun run dev`
- Logto admin console accessible

**Time estimate:** 20-30 minutes

---

## Test Cases

### ✅ 1. Login Flow

**Steps:**
1. Open browser to `http://localhost:3000`
2. Click "Sign In"
3. Authenticate with Logto
4. Verify redirect to `/callback` → `/dashboard`

**Checks:**
- [ ] User redirected to Logto login
- [ ] Login successful
- [ ] Redirected to dashboard
- [ ] User name/email displayed in header
- [ ] No console errors

**Debug:**
```javascript
// In browser console
JSON.parse(localStorage.getItem('inventory_tracker_convex_user'))
JSON.parse(localStorage.getItem('inventory_tracker_auth_context'))
```

---

### ✅ 2. Protected Routes

**Steps:**
1. Log out (if logged in)
2. Try to access `/dashboard`, `/parts`, `/blueprints`

**Checks:**
- [ ] Redirected to `/login`
- [ ] Can't access protected routes while logged out
- [ ] After login, all routes accessible

---

### ✅ 3. Role-Based Access

**Steps for each role (Admin, Editor, Viewer):**

**Admin:**
1. Log in as Admin
2. Access `/admin/users`
3. Check all features are available

**Editor:**
1. Log in as Editor
2. Access `/admin/users` → Should be forbidden/redirected
3. Create/edit parts → Should work
4. Check limited features

**Viewer:**
1. Log in as Viewer
2. Try to create/edit parts → Should be forbidden/disabled
3. Verify read-only access

**Checks:**
- [ ] Admin can access everything
- [ ] Editor can edit but not access admin
- [ ] Viewer is read-only
- [ ] Appropriate error messages

---

### ✅ 4. Data Loading (Queries)

**Steps:**
1. Log in as any user
2. Navigate to `/parts`
3. Verify parts list loads
4. Navigate to `/blueprints`
5. Verify blueprints list loads

**Checks:**
- [ ] Parts load successfully
- [ ] Blueprints load successfully
- [ ] No "Auth context required" errors
- [ ] Network tab shows authContext in request payload

**Debug:**
```javascript
// Check Network tab for POST requests to Convex
// Verify authContext is in request body
```

---

### ✅ 5. Data Operations (Mutations)

**Steps:**
1. Navigate to `/parts`
2. Click "New Part"
3. Fill form and submit
4. Verify part is created
5. Edit existing part
6. Delete part (if role allows)

**Checks:**
- [ ] Part creation works
- [ ] Part editing works
- [ ] Part deletion works (with appropriate role)
- [ ] No mutation errors
- [ ] UI updates correctly

---

### ✅ 6. Session Persistence

**Steps:**
1. Log in
2. Refresh page (F5)
3. Verify user still logged in
4. Close and reopen browser tab
5. Verify user still logged in

**Checks:**
- [ ] Session persists after refresh
- [ ] Session persists after tab close
- [ ] Auth context restored from localStorage
- [ ] No login prompt

---

### ✅ 7. Logout

**Steps:**
1. Log in
2. Click "Sign Out"
3. Verify redirect to Logto logout
4. Verify redirect back to app
5. Try to access protected route

**Checks:**
- [ ] Logout successful
- [ ] Redirected to Logto
- [ ] Redirected back to app
- [ ] Protected routes redirect to login
- [ ] localStorage cleared

**Debug:**
```javascript
// Check localStorage after logout
localStorage.getItem('inventory_tracker_convex_user') // Should be null
localStorage.getItem('inventory_tracker_auth_context') // Should be null
```

---

### ✅ 8. Token Refresh

**Steps:**
1. Log in and note auth context timestamp
2. Wait 4-5 minutes
3. Perform any Convex operation
4. Verify operation succeeds

**Checks:**
- [ ] Operations work after 5 minutes
- [ ] No "Auth context expired" errors
- [ ] Auth context timestamp updated

**Debug:**
```javascript
// Check auth context age
const ctx = JSON.parse(localStorage.getItem('inventory_tracker_auth_context'))
const age = (Date.now() - ctx.timestamp) / 1000
console.log('Auth context age:', age, 'seconds')
```

---

## Common Issues & Quick Fixes

### Issue: "Auth context expired"

**Fix:**
```javascript
localStorage.removeItem('inventory_tracker_auth_context')
window.location.reload()
```

---

### Issue: "Missing authContext argument"

**Fix:**
```typescript
// Check component includes authContext in Convex calls
convex.query(api.parts.queries.list, { orgId, authContext })
```

---

### Issue: CORS errors on `/api/verify-token`

**Fix:**
```bash
# Add to .env.local
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Restart server
bun run dev
```

---

### Issue: User not syncing to Convex

**Fix:**
1. Check `VITE_CONVEX_URL` is set
2. Check Convex dashboard for errors
3. Verify `syncUserFromLogtoToken` mutation succeeded

---

### Issue: Role mismatch

**Fix:**
1. Configure custom JWT claims in Logto Admin Console
2. Create `roles` claim (array of strings)
3. Add script to return user roles
4. Verify token includes roles:
   ```javascript
   const claims = await getIdTokenClaims()
   console.log('Roles:', claims.roles)
   ```

---

## Success Criteria

All items must pass for migration to be considered successful:

- [ ] Users can log in via Logto
- [ ] Auth context created and stored
- [ ] Protected routes enforce auth
- [ ] Role-based permissions work
- [ ] All queries execute successfully
- [ ] All mutations execute successfully
- [ ] Token refresh works automatically
- [ ] Session persists across refreshes
- [ ] Logout clears all auth state
- [ ] No console errors
- [ ] No auth-related network errors

---

## Performance Checks

After passing all test cases, verify:

- [ ] Login completes in < 3 seconds
- [ ] Page loads in < 2 seconds
- [ ] Data queries complete in < 500ms
- [ ] Mutations complete in < 1 second
- [ ] No visible lag during token refresh

---

## Additional Verification (Optional)

### Browser Compatibility

Test in:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)

### Mobile Testing

Test on:
- [ ] iOS Safari
- [ ] Android Chrome

### Network Conditions

Test with:
- [ ] Fast connection (WiFi)
- [ ] Slow connection (3G throttling)

---

## Rollback Decision

**Roll back to Convex auth if:**

- ❌ More than 3 critical issues found
- ❌ Performance degraded significantly
- ❌ Security concerns identified
- ❌ Cannot resolve issues within 2 hours

**Otherwise:**
- ✅ Document non-critical issues
- ✅ Schedule fixes for next sprint
- ✅ Proceed with production deployment

---

## Next Steps After Successful Verification

1. **Remove deprecated endpoints** (optional):
   - Delete `verifyLogtoToken` from [`convex/auth.ts`](convex/auth.ts)
   - Delete `logout` from [`convex/auth.ts`](convex/auth.ts)

2. **Monitor production**:
   - Track auth failure rates
   - Monitor token verification latency
   - Set up error alerts

3. **Plan improvements**:
   - Implement `/api/refresh-token` endpoint
   - Add rate limiting
   - Enhance error messages

---

## References

- Full documentation: [`docs/LOGTO_AUTH_MIGRATION.md`](docs/LOGTO_AUTH_MIGRATION.md)
- Architecture: [`plans/logto-auth-migration-architecture.md`](plans/logto-auth-migration-architecture.md)
- Environment setup: [`.LOGTO_ENV.md`](.LOGTO_ENV.md)
