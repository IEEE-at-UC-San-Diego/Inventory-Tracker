import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import {
  Package,
  Map,
  LayoutGrid,
  History,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Plus,
  Minus,
  ArrowLeftRight,
  Zap,
  Users,
  Activity,
  Inbox,
  CheckCircle,
} from 'lucide-react'
import { useQuery } from '@/integrations/convex/react-query'
import { api } from '@/convex/_generated/api'
import { ProtectedRoute } from '../components/auth/ProtectedRoute'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, StatCard } from '../components/ui/card'
import { useAuth } from '../hooks/useAuth'
import { useRole } from '../hooks/useRole'
import { useCallback } from 'react'
import { TransactionBadge, QuantityDelta } from '../components/transactions'
import { useToast, ToastProvider } from '../components/ui/toast'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <ProtectedRoute>
      <ToastProvider>
        <DashboardContent />
      </ToastProvider>
    </ProtectedRoute>
  )
}

function DashboardContent() {
  const { user, authContext, isLoading } = useAuth()
  const { isAdmin, isEditor } = useRole()
  const { toast } = useToast()

  // Fetch dashboard data with real-time subscriptions
  const stats = useQuery(api["organization_helpers"].getOrgStats, { authContext }, {
    enabled: !!authContext && !isLoading
  })
  const transactionsResult = useQuery(api["transactions/queries"].list, { authContext, limit: 10 }, {
    enabled: !!authContext && !isLoading
  })
  const inventory = useQuery(api["inventory/queries"].list, { authContext }, {
    enabled: !!authContext && !isLoading
  })
  const blueprintsResult = useQuery(api["blueprints/queries"].list, { authContext }, {
    enabled: !!authContext && !isLoading
  })
  const usersResult = useQuery(api["organizations/queries"].getOrgMembers, 
    authContext ? { authContext, organizationId: authContext.orgId } : 'skip', {
    enabled: !!authContext && !isLoading
  })

  // Calculate derived data
  const recentTransactions = transactionsResult?.items?.slice(0, 10) || []
  const blueprints = blueprintsResult || []
  const orgUsers = usersResult || []

  // Calculate low stock items (less than 10 quantity)
  const lowStockItems = useMemo(() => {
    if (!inventory?.items) return []
    return inventory.items
      .filter((item) => item.quantity < 10)
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 5)
  }, [inventory])

  // Calculate locked blueprints
  const lockedBlueprints = useMemo(() => {
    return blueprints.filter((bp) => bp.lockedBy)
  }, [blueprints])

  // Calculate today's transaction stats
  const todayStats = useMemo(() => {
    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000
    const todayTransactions = recentTransactions.filter(
      (t) => now - t.timestamp < oneDayMs
    )

    return {
      total: todayTransactions.length,
      adds: todayTransactions.filter((t) => t.actionType === 'Add').length,
      removes: todayTransactions.filter((t) => t.actionType === 'Remove').length,
      moves: todayTransactions.filter((t) => t.actionType === 'Move').length,
      adjusts: todayTransactions.filter((t) => t.actionType === 'Adjust').length,
    }
  }, [recentTransactions])

  // Handle quick action with toast
  const handleQuickAction = (action: string) => {
    toast.info('Quick Action', `${action} - Navigate to the appropriate page to complete this action`)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Welcome header with live indicator */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.name?.split(' ')[0] || 'User'}!
          </h1>
          <p className="text-gray-600 mt-1">
            Here's what's happening with your inventory today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LiveIndicator />
          <span className="text-sm text-gray-500">
            Last updated: {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Parts"
          value={stats?.totalParts || 0}
          description="Active parts in system"
          icon={<Package className="w-4 h-4" />}
          trend={stats && stats.totalParts > 0 ? { value: 0, isPositive: true } : undefined}
        />
        <StatCard
          title="Inventory Items"
          value={stats?.totalInventory || 0}
          description="Total units in stock"
          icon={<LayoutGrid className="w-4 h-4" />}
          trend={{ value: 12, isPositive: true }}
        />
        <StatCard
          title="Active Blueprints"
          value={blueprints.length}
          description={`${lockedBlueprints.length} currently locked`}
          icon={<Map className="w-4 h-4" />}
          trend={lockedBlueprints.length > 0 ? { value: lockedBlueprints.length, isPositive: false } : undefined}
        />
        <StatCard
          title="Transactions Today"
          value={todayStats.total}
          description="Activity in last 24 hours"
          icon={<History className="w-4 h-4" />}
          trend={todayStats.total > 0 ? { value: todayStats.total, isPositive: true } : undefined}
        />
      </div>

      {/* Today's activity breakdown */}
      {todayStats.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-600" />
              Today's Activity Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ActivityStat
                label="Check In"
                value={todayStats.adds}
                icon={<Plus className="w-4 h-4" />}
                color="green"
              />
              <ActivityStat
                label="Check Out"
                value={todayStats.removes}
                icon={<Minus className="w-4 h-4" />}
                color="red"
              />
              <ActivityStat
                label="Moves"
                value={todayStats.moves}
                icon={<ArrowLeftRight className="w-4 h-4" />}
                color="blue"
              />
              <ActivityStat
                label="Adjustments"
                value={todayStats.adjusts}
                icon={<Zap className="w-4 h-4" />}
                color="yellow"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick actions - takes 1 column */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks you might want to perform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <QuickActionButton
                to="/parts/new"
                icon={<Package className="w-5 h-5" />}
                title="Add Part"
                description="Create a new part"
                color="cyan"
              />
              <QuickActionButton
                to="/inventory"
                icon={<Inbox className="w-5 h-5" />}
                title="Check In Items"
                description="Add inventory to storage"
                color="green"
              />
              {(isEditor || isAdmin) && (
                <QuickActionButton
                  to="/inventory"
                  icon={<ArrowRight className="w-5 h-5 rotate-90" />}
                  title="Check Out Items"
                  description="Remove inventory from storage"
                  color="red"
                />
              )}
              <QuickActionButton
                to="/blueprints"
                icon={<Map className="w-5 h-5" />}
                title="View Blueprints"
                description="Manage storage layouts"
                color="blue"
              />
              <QuickActionButton
                to="/transactions"
                icon={<History className="w-5 h-5" />}
                title="View History"
                description="Recent activity log"
                color="purple"
              />
            </div>
          </CardContent>
        </Card>

        {/* Recent activity - takes 2 columns */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest inventory transactions</CardDescription>
            </div>
            <Link
              to="/transactions"
              className="text-sm text-cyan-600 hover:text-cyan-700 flex items-center gap-1"
            >
              View all
              <ArrowRight className="w-4 h-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentTransactions.length > 0 ? (
              <div className="space-y-2">
                {recentTransactions.slice(0, 5).map((transaction) => (
                  <div
                    key={transaction._id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <TransactionBadge
                        actionType={transaction.actionType}
                        showLabel={false}
                        size="sm"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {transaction.part?.name || 'Unknown Part'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {transaction.user?.name} •{' '}
                          {formatRelativeTime(transaction.timestamp)}
                        </p>
                      </div>
                    </div>
                    <QuantityDelta delta={transaction.quantityDelta} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<History className="w-12 h-12" />}
                title="No recent activity"
                description="Transactions will appear here when inventory changes occur"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alerts and Status - 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Low Stock Alerts
            </CardTitle>
            <CardDescription>Items requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
            {lowStockItems.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="font-medium">
                    {lowStockItems.length} items running low
                  </span>
                </div>
                <ul className="space-y-2">
                  {lowStockItems.map((item) => (
                    <li
                      key={item._id}
                      className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-yellow-600" />
                        <span className="text-sm font-medium text-gray-900">
                          {item.part?.name || 'Unknown Part'}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-yellow-700">
                        {item.quantity} units
                      </span>
                    </li>
                  ))}
                </ul>
                {inventory && inventory.items.filter((i) => i.quantity < 10).length > 5 && (
                  <Link
                    to="/inventory"
                    className="text-sm text-cyan-600 hover:text-cyan-700 flex items-center gap-1"
                  >
                    View all alerts
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            ) : (
              <EmptyState
                icon={<CheckCircle className="w-12 h-12 text-green-500" />}
                title="All items well stocked!"
                description="No low stock alerts at this time"
              />
            )}
          </CardContent>
        </Card>

        {/* Active Users & System Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-500" />
              Organization
            </CardTitle>
            <CardDescription>Team and system status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Active users count */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-500" />
                <span className="font-medium text-gray-700">Team Members</span>
              </div>
              <span className="text-lg font-bold text-gray-900">{orgUsers.length}</span>
            </div>

            {/* Locked blueprints */}
            {lockedBlueprints.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Locked Blueprints</p>
                {lockedBlueprints.slice(0, 3).map((bp) => (
                  <div
                    key={bp._id}
                    className="flex items-center justify-between p-3 bg-blue-50 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <Map className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-gray-900">{bp.name}</span>
                    </div>
                    <span className="text-xs text-blue-600">
                      by {bp.lockedByUser?.name || 'Unknown'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* System status */}
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-green-500" />
                <span className="font-medium text-gray-700">System Status</span>
              </div>
              <span className="text-sm font-medium text-green-600 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Live
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Activity stat component
interface ActivityStatProps {
  label: string
  value: number
  icon: React.ReactNode
  color: 'green' | 'red' | 'blue' | 'yellow' | 'purple'
}

function ActivityStat({ label, value, icon, color }: ActivityStatProps) {
  const colorClasses = {
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    purple: 'bg-purple-50 text-purple-700',
  }

  return (
    <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}

// Quick action button component
interface QuickActionButtonProps {
  to: string
  icon: React.ReactNode
  title: string
  description: string
  color: 'cyan' | 'green' | 'red' | 'blue' | 'purple'
}

function QuickActionButton({ to, icon, title, description, color }: QuickActionButtonProps) {
  const colorClasses = {
    cyan: 'bg-cyan-50 text-cyan-600 group-hover:bg-cyan-100',
    green: 'bg-green-50 text-green-600 group-hover:bg-green-100',
    red: 'bg-red-50 text-red-600 group-hover:bg-red-100',
    blue: 'bg-blue-50 text-blue-600 group-hover:bg-blue-100',
    purple: 'bg-purple-50 text-purple-600 group-hover:bg-purple-100',
  }

  return (
    <Link
      to={to}
      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors group"
    >
      <div className={`p-2 rounded-lg transition-colors ${colorClasses[color]}`}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="font-medium text-gray-900">{title}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
    </Link>
  )
}

// Live indicator component
function LiveIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
      Live
    </div>
  )
}

// Empty state component
interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
}

function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="text-gray-300 mb-3">{icon}</div>
      <p className="text-gray-900 font-medium">{title}</p>
      <p className="text-sm text-gray-500 mt-1">{description}</p>
    </div>
  )
}

// Format relative time helper
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}
