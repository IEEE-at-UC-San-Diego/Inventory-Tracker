import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Package,
  User,
  MapPin,
  ArrowRight,
  ExternalLink,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { TransactionBadge, TransactionDot, QuantityDelta } from './TransactionBadge'
import type { Transaction, ActionType } from '@/types'

interface TransactionTableProps {
  transactions: Transaction[]
  isLoading?: boolean
  onRowClick?: (transaction: Transaction) => void
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
  onSort?: (column: string) => void
  emptyMessage?: string
}

type SortColumn = 'timestamp' | 'actionType' | 'part' | 'quantity' | 'location' | 'user'

export function TransactionTable({
  transactions,
  isLoading,
  onRowClick,
  sortColumn: externalSortColumn,
  sortDirection: externalSortDirection,
  onSort: externalOnSort,
  emptyMessage = 'No transactions found',
}: TransactionTableProps) {
  const [internalSortColumn, setInternalSortColumn] = useState<SortColumn>('timestamp')
  const [internalSortDirection, setInternalSortDirection] = useState<'asc' | 'desc'>('desc')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Use external sort state if provided, otherwise use internal
  const sortColumn = externalSortColumn || internalSortColumn
  const sortDirection = externalSortDirection || internalSortDirection

  const handleSort = (column: SortColumn) => {
    if (externalOnSort) {
      externalOnSort(column)
    } else {
      if (internalSortColumn === column) {
        setInternalSortDirection(internalSortDirection === 'asc' ? 'desc' : 'asc')
      } else {
        setInternalSortColumn(column)
        setInternalSortDirection('asc')
      }
    }
  }

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  // Sort transactions
  const sortedTransactions = [...transactions].sort((a, b) => {
    let comparison = 0
    switch (sortColumn) {
      case 'timestamp':
        comparison = a.timestamp - b.timestamp
        break
      case 'actionType':
        comparison = a.actionType.localeCompare(b.actionType)
        break
      case 'part':
        comparison = (a.part?.name || '').localeCompare(b.part?.name || '')
        break
      case 'quantity':
        comparison = a.quantityDelta - b.quantityDelta
        break
      case 'location':
        const aLoc = a.destCompartment?.label || ''
        const bLoc = b.destCompartment?.label || ''
        comparison = aLoc.localeCompare(bLoc)
        break
      case 'user':
        comparison = (a.user?.name || '').localeCompare(b.user?.name || '')
        break
    }
    return sortDirection === 'asc' ? comparison : -comparison
  })

  if (isLoading) {
    return <TransactionTableSkeleton />
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <Package className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-gray-500 font-medium">{emptyMessage}</p>
        <p className="text-sm text-gray-400 mt-1">
          Transactions will appear here when inventory changes occur
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="w-8 px-2 py-3"></th>
            <SortableHeader
              label="Date/Time"
              column="timestamp"
              currentColumn={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
            />
            <SortableHeader
              label="Action"
              column="actionType"
              currentColumn={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
              className="w-32"
            />
            <SortableHeader
              label="Part"
              column="part"
              currentColumn={sortColumn}
              direction={sortDirection}
            />
            <SortableHeader
              label="Quantity"
              column="quantity"
              currentColumn={sortColumn}
              direction={sortDirection}
              className="w-24"
            />
            <SortableHeader
              label="Location"
              column="location"
              currentColumn={sortColumn}
              direction={sortDirection}
            />
            <SortableHeader
              label="User"
              column="user"
              currentColumn={sortColumn}
              direction={sortDirection}
            />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sortedTransactions.map((transaction) => (
            <TransactionRow
              key={transaction._id}
              transaction={transaction}
              isExpanded={expandedRows.has(transaction._id)}
              onToggle={() => toggleRow(transaction._id)}
              onClick={() => onRowClick?.(transaction)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface SortableHeaderProps {
  label: string
  column: SortColumn
  currentColumn: string
  direction: 'asc' | 'desc'
  onSort?: (column: SortColumn) => void
  className?: string
}

function SortableHeader({
  label,
  column,
  currentColumn,
  direction,
  onSort,
  className,
}: SortableHeaderProps) {
  const isActive = currentColumn === column

  return (
    <th
      className={cn(
        'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider',
        onSort && 'cursor-pointer hover:text-gray-700',
        className
      )}
      onClick={() => onSort?.(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive && (
          <span className="text-gray-400">
            {direction === 'asc' ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </span>
        )}
      </div>
    </th>
  )
}

interface TransactionRowProps {
  transaction: Transaction
  isExpanded: boolean
  onToggle: () => void
  onClick?: () => void
}

function TransactionRow({ transaction, isExpanded, onToggle, onClick }: TransactionRowProps) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return {
      date: date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      time: date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }
  }

  const { date, time } = formatDate(transaction.timestamp)

  // Get location display
  const getLocationDisplay = () => {
    if (transaction.actionType === 'Move') {
      return (
        <div className="flex items-center gap-1 text-sm">
          <span className="text-gray-500">
            {transaction.sourceCompartment?.label || 'Unknown'}
          </span>
          <ArrowRight className="w-3 h-3 text-gray-400" />
          <span>{transaction.destCompartment?.label || 'Unknown'}</span>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-1 text-sm">
        <MapPin className="w-3 h-3 text-gray-400" />
        <span>{transaction.destCompartment?.label || 'Unknown'}</span>
      </div>
    )
  }

  return (
    <>
      <tr
        className={cn(
          'hover:bg-gray-50 transition-colors',
          onClick && 'cursor-pointer'
        )}
        onClick={onClick}
      >
        <td className="px-2 py-3">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            <ChevronRight
              className={cn(
                'w-4 h-4 text-gray-400 transition-transform',
                isExpanded && 'rotate-90'
              )}
            />
          </button>
        </td>
        <td className="px-4 py-3">
          <div className="text-sm">
            <div className="font-medium text-gray-900">{date}</div>
            <div className="text-gray-500">{time}</div>
          </div>
        </td>
        <td className="px-4 py-3">
          <TransactionBadge actionType={transaction.actionType} size="sm" />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-400" />
            <Link
              to="/parts/$partId"
              params={{ partId: transaction.partId }}
              className="font-medium text-gray-900 hover:text-cyan-600 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {transaction.part?.name || 'Unknown Part'}
            </Link>
            {transaction.part?.sku && (
              <span className="text-xs text-gray-400">({transaction.part.sku})</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <QuantityDelta delta={transaction.quantityDelta} />
        </td>
        <td className="px-4 py-3">{getLocationDisplay()}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-700">{transaction.user?.name || 'Unknown'}</span>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="px-4 py-4 bg-gray-50">
            <TransactionDetails transaction={transaction} />
          </td>
        </tr>
      )}
    </>
  )
}

function TransactionDetails({ transaction }: { transaction: Transaction }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-900">Transaction Details</h4>
        <dl className="space-y-2">
          <div className="flex gap-2">
            <dt className="text-gray-500 w-24">ID:</dt>
            <dd className="font-mono text-xs text-gray-700">{transaction._id}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 w-24">Action:</dt>
            <dd>
              <TransactionBadge actionType={transaction.actionType} size="sm" />
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 w-24">Quantity:</dt>
            <dd>
              <QuantityDelta delta={transaction.quantityDelta} />
            </dd>
          </div>
          {transaction.notes && (
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24">Notes:</dt>
              <dd className="text-gray-700 italic">{transaction.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="space-y-3">
        <h4 className="font-semibold text-gray-900">Related Information</h4>
        <dl className="space-y-2">
          <div className="flex gap-2">
            <dt className="text-gray-500 w-24">Part:</dt>
            <dd>
              <Link
                to="/parts/$partId"
                params={{ partId: transaction.partId }}
                className="text-cyan-600 hover:text-cyan-700 flex items-center gap-1"
              >
                {transaction.part?.name || 'View Part'}
                <ExternalLink className="w-3 h-3" />
              </Link>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 w-24">User:</dt>
            <dd className="text-gray-700">{transaction.user?.name || 'Unknown'}</dd>
          </div>
          {transaction.sourceCompartment && (
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24">From:</dt>
              <dd className="text-gray-700">{transaction.sourceCompartment.label || 'Unknown'}</dd>
            </div>
          )}
          {transaction.destCompartment && (
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24">To:</dt>
              <dd className="text-gray-700">{transaction.destCompartment.label || 'Unknown'}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}

// Skeleton loader for table
function TransactionTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="w-8 px-2 py-3"></th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Date/Time</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Action</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Part</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Quantity</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Location</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">User</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td className="px-2 py-3">
                <div className="w-6 h-6 bg-gray-200 rounded animate-pulse" />
              </td>
              <td className="px-4 py-3">
                <div className="space-y-1">
                  <div className="w-24 h-4 bg-gray-200 rounded animate-pulse" />
                  <div className="w-16 h-3 bg-gray-200 rounded animate-pulse" />
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="w-20 h-6 bg-gray-200 rounded-full animate-pulse" />
              </td>
              <td className="px-4 py-3">
                <div className="w-32 h-4 bg-gray-200 rounded animate-pulse" />
              </td>
              <td className="px-4 py-3">
                <div className="w-12 h-4 bg-gray-200 rounded animate-pulse" />
              </td>
              <td className="px-4 py-3">
                <div className="w-24 h-4 bg-gray-200 rounded animate-pulse" />
              </td>
              <td className="px-4 py-3">
                <div className="w-20 h-4 bg-gray-200 rounded animate-pulse" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Pagination component
interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  totalItems: number
  itemsPerPage: number
}

export function TransactionPagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
}: PaginationProps) {
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
      <div className="text-sm text-gray-500">
        Showing <span className="font-medium">{startItem}</span> to{' '}
        <span className="font-medium">{endItem}</span> of{' '}
        <span className="font-medium">{totalItems}</span> transactions
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span className="text-sm text-gray-500">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-1 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  )
}
