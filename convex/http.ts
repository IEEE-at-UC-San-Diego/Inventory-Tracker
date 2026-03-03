import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { internal } from './_generated/api'
import {
  verifyLogtoToken,
  logout,
  logtoWebhook,
} from './auth'

const http = httpRouter()
const INTERNAL_SYNC_SECRET = process.env.INTERNAL_SYNC_SECRET

// Health check endpoint
http.route({
  path: '/health',
  method: 'GET',
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }),
})

http.route({
  path: '/auth/verifyLogtoToken',
  method: 'POST',
  handler: verifyLogtoToken,
})

http.route({
  path: '/auth/logout',
  method: 'POST',
  handler: logout,
})

http.route({
  path: '/webhooks/logto',
  method: 'POST',
  handler: logtoWebhook,
})

/**
 * HTTP endpoint to sync user from Logto token data
 * Called by /api/verify-token after JWT verification
 */
http.route({
  path: '/auth/syncUser',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-internal-sync-secret',
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

    if (!INTERNAL_SYNC_SECRET) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const requestSecret = request.headers.get('x-internal-sync-secret')
    if (requestSecret !== INTERNAL_SYNC_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    try {
      const body = await request.json()
      const { idTokenClaims, userInfo } = body

      if (!idTokenClaims || !userInfo) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: idTokenClaims, userInfo' }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        )
      }

      // Call the internal mutation to sync user
      const result = await ctx.runMutation(internal.auth_helpers.syncUserFromLogtoToken, {
        idTokenClaims,
        userInfo,
      })

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch (error) {
      console.error('[syncUser] Error:', error)
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
  }),
})

export default http
