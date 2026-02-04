import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import {
  Plus,
  Minus,
  ArrowRightLeft,
  Package,
  MapPin,
  AlertTriangle,
  Settings,
  Search,
  Filter,
  TrendingDown,
  Activity,
  Clock,
  Grid3X3,
  Download,
} from 'lucide-react'
import { useQuery, useMutation } from '@/integrations/convex/react-query'
import { api } from '../../../convex/_generated/api'
import { ProtectedRoute, EditorOnly, AdminOnly } from '@/components/auth/ProtectedRoute'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, StatCard } from '@/components/ui/card'
import { DataTable } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertDialog } from '@/components/ui/dialog'
import { useToast, ToastProvider } from '@/components/ui/toast'
import { useRole } from '@/hooks/useRole'
import { useAuth } from '@/hooks/useAuth'
import {
  CheckInDialog,
  CheckOutDialog,
  MoveDialog,
  AdjustDialog,
} from '@/components/inventory'
import type { Inventory } from '@/types'
import type { Id } from '../../../convex/_generated/dataModel'
import { createCSV, downloadCSV, generateTimestamp } from '@/lib/csv-export'

export const Route = createFileRoute('/inventory/')({
  component: InventoryPage,
})

function InventoryPage() {
  return (
    <ProtectedRoute>
      <ToastProvider>
        <InventoryContent />
      </ToastProvider>
    </ProtectedRoute>
  )
}

function InventoryContent() {
  const { canEdit, canManage } = useRole()
  const { toast } = useToast()
  const { authContext, isLoading } = useAuth()

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)

  // Dialog state
  const [showCheckIn, setShowCheckIn] = useState(false)
  const [showCheckOut, setShowCheckOut] = useState(false)
  const [showMove, setShowMove] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustItem, setAdjustItem] = useState<Inventory | null>(null)

  // Fetch inventory data
  const inventoryResult = useQuery(api["inventory/queries"].list, { authContext, includeDetails: true }, {
    enabled: !!authContext && !isLoading
  })
  const inventory = inventoryResult ?? []

  // Fetch parts for categories
  const partsResult = useQuery(api["parts/queries"].list, { authContext, includeArchived: false }, {
    enabled: !!authContext && !isLoading
  })
  const parts = partsResult?.items ?? []

  // Fetch low stock items
  const lowStockResult = useQuery(api["inventory/queries"].getLowStock, { authContext, threshold: 10 }, {
    enabled: !!authContext && !isLoading
  })
  const lowStockItems = lowStockResult ?? []

  // Fetch recent transactions
  const transactionsResult = useQuery(api["transactions/queries"].list, {
    authContext,
    limit: 10,
  }, {
    enabled: !!authContext && !isLoading
  })
  const recentTransactions = transactionsResult?.items ?? []

  // Get unique categories
  const categories = useMemo(() => {
    return Array.from(new Set(parts.map((p) => p.category))).sort()
  }, [parts])

  // Filter inventory
  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const part = item.part
      if (!part) return false

      const matchesSearch =
        searchQuery === '' ||
        part.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        part.sku.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesCategory =
        selectedCategory === '' || part.category === selectedCategory

      const matchesLowStock = !showLowStockOnly || item.quantity < 10

      return matchesSearch && matchesCategory && matchesLowStock
    })
  }, [inventory, searchQuery, selectedCategory, showLowStockOnly])

  // Export inventory to CSV
  const handleExportInventory = useCallback(() => {
    const headers = [
      'Part Name',
      'Part SKU',
      'Category',
      'Quantity',
      'Location',
      'Low Stock',
    ]

    const rows = filteredInventory.map((item) => [
      item.part?.name || '',
      item.part?.sku || '',
      item.part?.category || '',
      String(item.quantity),
      item.compartment?.label || 'Unknown',
      item.quantity < 10 ? 'Yes' : 'No',
    ])

    const csvContent = createCSV(headers, rows)
    const timestamp = generateTimestamp()
    downloadCSV(csvContent, `inventory_${timestamp}.csv`)

    toast.success('Export Complete', `Downloaded ${filteredInventory.length} inventory items to CSV`)
  }, [filteredInventory, toast])

  // Calculate stats
  const totalItems = inventory.length
  const totalQuantity = inventory.reduce((sum, item) => sum + item.quantity, 0)
  const lowStockCount = lowStockItems.length

  // Handle adjust dialog
  const handleAdjust = useCallback((item: Inventory) => {
    setAdjustItem(item)
    setShowAdjust(true)
  }, [])

  // Table columns
  const columns = [
    {
      key: 'part',
      header: 'Part',
      cell: (item: Inventory) => (
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-100 rounded-lg">
            <Package className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <Link to={`/parts/${item.partId}`} className="font-medium hover:text-cyan-600">
              {item.part?.name}
            </Link>
            <p className="text-sm text-gray-500">{item.part?.sku}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      cell: (item: Inventory) =>
        item.part?.category ? (
          <Badge variant="outline">{item.part.category}</Badge>
        ) : null,
    },
    {
      key: 'location',
      header: 'Location',
      cell: (item: Inventory) => (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="w-4 h-4 text-gray-400" />
          <span>{item.compartment?.label || 'Unknown Location'}</span>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Quantity',
      cell: (item: Inventory) => (
        <div className="flex items-center gap-2">
          <span
            className={`font-medium ${
              item.quantity < 10 ? 'text-red-600' : 'text-gray-900'
            }`}
          >
            {item.quantity}
          </span>
          {item.quantity < 10 && (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (item: Inventory) => (
        <div className="flex items-center gap-1">
          <EditorOnly>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleAdjust(item)}
              title="Check in"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleAdjust(item)}
              title="Check out"
              disabled={item.quantity <= 0}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleAdjust(item)}
              title="Move"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </Button>
          </EditorOnly>
          <AdminOnly>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleAdjust(item)}
              title="Adjust"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </AdminOnly>
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-600 mt-1">Track parts across storage locations</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportInventory}
            disabled={filteredInventory.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <EditorOnly>
            <div className="flex items-center gap-2">
              <Button onClick={() => setShowCheckIn(true)}>
                <Plus className="w-5 h-5 mr-2" />
                Check In
              </Button>
              <Button variant="outline" onClick={() => setShowCheckOut(true)}>
                <Minus className="w-5 h-5 mr-2" />
                Check Out
              </Button>
              <Button variant="outline" onClick={() => setShowMove(true)}>
                <ArrowRightLeft className="w-5 h-5 mr-2" />
                Move
              </Button>
            </div>
          </EditorOnly>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Items"
          value={totalItems}
          description="Unique part locations"
          icon={<Package className="w-4 h-4" />}
        />
        <StatCard
          title="Total Quantity"
          value={totalQuantity}
          description="Units in stock"
          icon={<Activity className="w-4 h-4" />}
        />
        <StatCard
          title="Low Stock Alerts"
          value={lowStockCount}
          description="Items below threshold"
          icon={<AlertTriangle className="w-4 h-4" />}
          className={lowStockCount > 0 ? 'border-yellow-200' : ''}
        />
        <StatCard
          title="Categories"
          value={categories.length}
          description="Unique part types"
          icon={<Filter className="w-4 h-4" />}
        />
      </div>

      {/* Low Stock Alert Card */}
      {lowStockCount > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-yellow-800 text-base">
              <AlertTriangle className="w-5 h-5" />
              Low Stock Alert
            </CardTitle>
            <CardDescription className="text-yellow-700">
              {lowStockCount} item(s) are running low (less than 10 units)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {lowStockItems.slice(0, 6).map((item) => (
                <Link
                  key={item._id}
                  to={`/parts/${item.partId}`}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border border-yellow-200 hover:border-yellow-300 transition-colors"
                >
                  <span className="font-medium text-sm">{item.part?.name}</span>
                  <span className="text-red-600 font-medium">{item.quantity} units</span>
                </Link>
              ))}
              {lowStockItems.length > 6 && (
                <div className="flex items-center justify-center p-3 text-sm text-yellow-700">
                  And {lowStockItems.length - 6} more...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by part name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={showLowStockOnly}
                  onChange={(e) => setShowLowStockOnly(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Low stock only</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={filteredInventory}
            keyExtractor={(item) => item._id}
            isLoading={isLoading}
            emptyMessage="No inventory items found. Try adjusting your filters or add inventory."
          />
        </CardContent>
      </Card>

      {/* Recent Activity */}
      {recentTransactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentTransactions.slice(0, 5).map((transaction) => (
                <div
                  key={transaction._id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className={`p-2 rounded-full ${
                    transaction.actionType === 'Add' ? 'bg-green-100 text-green-600' :
                    transaction.actionType === 'Remove' ? 'bg-red-100 text-red-600' :
                    transaction.actionType === 'Move' ? 'bg-blue-100 text-blue-600' :
                    'bg-purple-100 text-purple-600'
                  }`}>
                    {transaction.actionType === 'Add' ? <Plus className="w-4 h-4" /> :
                     transaction.actionType === 'Remove' ? <Minus className="w-4 h-4" /> :
                     transaction.actionType === 'Move' ? <ArrowRightLeft className="w-4 h-4" /> :
                     <Settings className="w-4 h-4" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{transaction.actionType}</span>
                      {' '}{Math.abs(transaction.quantityDelta)} units of{' '}
                      <Link to={`/parts/${transaction.partId}`} className="text-cyan-600 hover:underline">
                        {transaction.part?.name || 'Unknown Part'}
                      </Link>
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(transaction.timestamp).toLocaleString()}
                      {transaction.user?.name && ` by ${transaction.user.name}`}
                    </p>
                  </div>
                  <span className={`font-medium ${
                    transaction.quantityDelta > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {transaction.quantityDelta > 0 ? '+' : ''}
                    {transaction.quantityDelta}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 text-center">
              <Link to="/transactions">
                <Button variant="ghost" size="sm">
                  View All Transactions
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory Operation Dialogs */}
      <CheckInDialog
        open={showCheckIn}
        onOpenChange={setShowCheckIn}
        onSuccess={() => {
          // Refetch will happen automatically
        }}
      />

      <CheckOutDialog
        open={showCheckOut}
        onOpenChange={setShowCheckOut}
        onSuccess={() => {
          // Refetch will happen automatically
        }}
      />

      <MoveDialog
        open={showMove}
        onOpenChange={setShowMove}
        onSuccess={() => {
          // Refetch will happen automatically
        }}
      />

      <AdjustDialog
        open={showAdjust}
        onOpenChange={(open) => {
          setShowAdjust(open)
          if (!open) setAdjustItem(null)
        }}
        inventoryId={adjustItem?._id ?? null}
        preselectedPartId={adjustItem?.partId ?? null}
        preselectedCompartmentId={adjustItem?.compartmentId ?? null}
        onSuccess={() => {
          setAdjustItem(null)
          // Refetch will happen automatically
        }}
      />
    </div>
  )
}
