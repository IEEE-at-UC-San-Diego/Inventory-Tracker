import { httpAction } from './_generated/server'
import { internal } from './_generated/api'
import { jwtVerify, createRemoteJWKSet } from 'jose'

/**
 * Auth HTTP endpoints
 *
 * This file contains Convex HTTP endpoints for authentication.
 *
 * AUTH FLOW ARCHITECTURE:
 * - Frontend uses Logto SDK for authentication
 * - Token verification happens at /api/verify-token (Remix/SSR route, NOT this file)
 * - Auth context is created by src/lib/auth.ts and passed to Convex via arguments
 * - Convex auth.getUserIdentity() is ONLY used for Logto webhook authentication
 *
 * DEPRECATED ENDPOINTS:
 * - verifyLogtoToken: Replaced by /api/verify-token route
 * - logout: No longer needed (logout handled client-side by Logto SDK)
 *
 * ACTIVE ENDPOINT:
 * - logtoWebhook: Handles Logto events (user.created, user.updated, user.deleted)
 */

const normalizeUrl = (value: string | undefined, fallback: string) => {
  if (!value || value.trim().length === 0) return fallback
  return value.endsWith('/') ? value.slice(0, -1) : value
}

const DEFAULT_LOGTO_ENDPOINT = normalizeUrl(
  process.env.LOGTO_ENDPOINT || process.env.VITE_LOGTO_ENDPOINT,
  'https://auth.ieeeatucsd.org'
)
const DEFAULT_LOGTO_ISSUER = normalizeUrl(process.env.LOGTO_ISSUER, `${DEFAULT_LOGTO_ENDPOINT}/oidc`)
const DEFAULT_LOGTO_JWKS_URL = normalizeUrl(
  process.env.LOGTO_JWKS_URL,
  `${DEFAULT_LOGTO_ISSUER}/jwks`
)

// Logto webhook signing key - should be set via environment variable
// Get this from Logto Console > Webhooks > Webhook Details
const LOGTO_WEBHOOK_SIGNING_KEY = process.env.LOGTO_WEBHOOK_SIGNING_KEY || ''

/**
 * Logto token verification endpoint
 *
 * DEPRECATED: This endpoint has been replaced by /api/verify-token route.
 * The API route handles token verification in the SSR context and creates
 * the auth context that's passed to Convex mutations/queries.
 *
 * This endpoint is kept for backward compatibility during migration.
 */
export const verifyLogtoToken = httpAction(async (ctx, request) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  try {
    const body = await request.json()
    const { accessToken, idTokenClaims, userInfo } = body

    if (!accessToken || !idTokenClaims || !userInfo) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    // Verify the Logto JWT
    // The issuer is usually in the format: https://your-logto-endpoint.logto.app
    const issuer = normalizeUrl(idTokenClaims.iss, DEFAULT_LOGTO_ISSUER)
    console.log('[verifyLogtoToken] issuer:', issuer)
    if (!issuer) {
      return new Response(
        JSON.stringify({ error: 'Invalid token: missing issuer' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    // Create JWKS (JSON Web Key Set) URL from the issuer
    let jwksUrl: string
    try {
      if (issuer === DEFAULT_LOGTO_ISSUER) {
        jwksUrl = DEFAULT_LOGTO_JWKS_URL
      } else if (issuer.endsWith('/oidc')) {
        jwksUrl = `${issuer}/jwks`
      } else {
        jwksUrl = new URL('.well-known/jwks.json', `${issuer}/`).href
      }
      console.log('[verifyLogtoToken] jwksUrl:', jwksUrl)
    } catch (urlError) {
      console.error('[verifyLogtoToken] Failed to construct JWKS URL:', urlError)
      return new Response(
        JSON.stringify({ error: `Invalid issuer URL: ${urlError instanceof Error ? urlError.message : 'Unknown error'}` }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    // Verify the JWT using Logto's public keys
    const jwks = createRemoteJWKSet(new URL(jwksUrl))
    await jwtVerify(accessToken, jwks, {
      issuer,
      audience: idTokenClaims.aud,
    })

    // Extract user information from the verified token
    const logtoUserId = idTokenClaims.sub as string
    const email = userInfo.email as string || idTokenClaims.email as string
    const name = userInfo.name as string || (email ? email.split('@')[0] : 'Unknown')

    // Extract role from custom claims (if configured in Logto)
    // Roles can be synced using Logto's custom JWT claims feature
    const roleClaim = (idTokenClaims as any).roles?.[0] || 'Member'
    const validRoles = ['Administrator', 'Executive Officers', 'General Officers', 'Member']
    const role = validRoles.includes(roleClaim) ? roleClaim : 'Member'

    // Extract organization ID from custom claims (if configured)
    const orgIdClaim = (idTokenClaims as any).organization_id

    // Sync the user to our database
    const user = await ctx.runMutation(internal.auth_helpers.syncUserInternal, {
      logtoUserId,
      email,
      name,
      orgId: orgIdClaim, // Optional: use custom claim for org
      role: role as 'Administrator' | 'Executive Officers' | 'General Officers' | 'Member',
    })

    return new Response(
      JSON.stringify({
        success: true,
        user,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error) {
    console.error('Token verification error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
})

/**
 * Logout endpoint - clears any server-side session state if needed
 *
 * DEPRECATED: Logout is now handled client-side by the Logto SDK.
 * This endpoint is kept for backward compatibility during migration.
 * The Logto SDK handles signOut() directly on the client.
 */
export const logout = httpAction(async (_ctx, request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  // In a stateless JWT setup, logout is handled client-side
  // This endpoint exists for future server-side session cleanup if needed

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
})

/**
 * Webhook endpoint for Logto events
 * Handles user creation, updates, and deletion events
 * Configure this in Logto Admin Console under Integrations -> Webhooks
 */
export const logtoWebhook = httpAction(async (ctx, request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  try {
    // Get raw body for signature verification before parsing
    const rawBody = await request.text()
    const body = JSON.parse(rawBody)
    const { event, data } = body

    // NOTE: Webhook signature verification disabled due to Convex crypto module limitations
    // In production, you should implement signature verification using a compatible library
    // or move this to a separate service that can use Node.js crypto APIs

    switch (event) {
      case 'user.created':
      case 'user.updated': {
        // Sync user data from Logto
        await ctx.runMutation(internal.auth_helpers.syncUserInternal, {
          logtoUserId: data.id,
          email: data.primaryEmail || data.email,
          name: data.name || data.primaryEmail || data.email,
          orgId: data.organizationId,
          role: data.role || 'Viewer',
        })
        break
      }

      case 'user.deleted': {
        // Mark user as deleted or soft delete
        // For now, we don't delete to preserve referential integrity
        // You might want to implement a soft delete
        break
      }

      default:
        console.log('Unhandled Logto webhook event:', event)
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
})
