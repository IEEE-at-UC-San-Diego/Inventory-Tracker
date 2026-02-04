import { useAuth } from '@/hooks/useAuth'
import type { AuthContext } from '@/types/auth'

export function useConvexAuth() {
	const { authContext, getFreshAuthContext } = useAuth()

	async function withAuthContext<T>(
		fn: (context: AuthContext) => Promise<T>,
	): Promise<T> {
		const fresh = await getFreshAuthContext()
		const context = fresh || authContext
		if (!context) throw new Error('Not authenticated')
		return fn(context)
	}

	return { authContext, getFreshAuthContext, withAuthContext }
}
