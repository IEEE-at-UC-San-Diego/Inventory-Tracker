import { useState, useCallback } from 'react'
import { useQuery } from '@/integrations/convex/react-query'
import { api } from '../../../convex/_generated/api'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EditorOnly, MemberOnly } from '@/components/auth/ProtectedRoute'
import { CheckInDialog } from '@/components/inventory/CheckInDialog'
import { CheckOutDialog } from '@/components/inventory/CheckOutDialog'
import { MoveDialog } from '@/components/inventory/MoveDialog'
import { AdjustDialog } from '@/components/inventory/AdjustDialog'
import {
  Package,
  Calendar,
  Plus,
  Minus,
  ArrowRightLeft,
  Settings,
  MoreHorizontal,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Compartment, Drawer } from '@/types'

interface CompartmentDetailsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  compartment: Compartment | null
  drawer: Drawer | null
}

export function CompartmentDetailsPanel({
  open,
  onOpenChange,
  compartment,
  drawer,
}: CompartmentDetailsPanelProps) {
  // Dialog states
  const [showCheckIn, setShowCheckIn] = useState(false)
  const [showCheckOut, setShowCheckOut] = useState(false)
  const [showMove, setShowMove] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null)
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null)

  // Fetch inventory for this compartment
  const inventoryResult = useQuery(
    api.inventory.queries.getByCompartment,
    compartment ? { compartmentId: compartment._id as any } : 'skip'
  )
  const compartmentInventory = inventoryResult ?? []
  const totalInCompartment = compartmentInventory.reduce(
    (sum, item) => sum + item.quantity,
    0
  )

  // Handle check in
  const handleCheckIn = useCallback(() => {
    setShowCheckIn(true)
  }, [])

  // Handle check out
  const handleCheckOut = useCallback(() => {
    setShowCheckOut(true)
  }, [])

  // Handle move for a specific part
  const handleMove = useCallback((partId: string, inventoryId: string) => {
    setSelectedPartId(partId)
    setSelectedInventoryId(inventoryId)
    setShowMove(true)
  }, [])

  // Handle adjust for a specific part
  const handleAdjust = useCallback((inventoryId: string) => {
    setSelectedInventoryId(inventoryId)
    setShowAdjust(true)
  }, [])

  // Format timestamp
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  if (!compartment || !drawer) {
    return null
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-[400px] sm:w-[500px] flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              Compartment Details
            </SheetTitle>
            <SheetDescription>
              Showing parts and inventory in this compartment
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto space-y-4 mt-6">
            {/* Compartment Info Card */}
            <Card className="p-4">
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Compartment</p>
                  <p className="font-semibold">
                    {compartment.label ||
                      `Compartment ${compartment._id.slice(-4)}`}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Parent Drawer</p>
                  <p className="font-medium">
                    {drawer.label || `Drawer ${drawer._id.slice(-4)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <p className="text-sm text-gray-500">
                    Updated: {formatDate(compartment.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <Badge variant={totalInCompartment > 0 ? 'default' : 'secondary'}>
                    {totalInCompartment} {totalInCompartment === 1 ? 'unit' : 'units'}
                  </Badge>
                  <MemberOnly>
                    <Button size="sm" onClick={handleCheckIn}>
                      <Plus className="w-4 h-4 mr-1" />
                      Check In
                    </Button>
                  </MemberOnly>
                </div>
              </div>
            </Card>

            {/* Parts List */}
            {compartmentInventory.length === 0 ? (
              <Card className="p-8 text-center">
                <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500 mb-4">No inventory in this compartment</p>
                <MemberOnly>
                  <Button variant="outline" size="sm" onClick={handleCheckIn}>
                    <Plus className="w-4 h-4 mr-2" />
                    Check In First Part
                  </Button>
                </MemberOnly>
              </Card>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Parts</p>
                {compartmentInventory.map((item) => (
                  <PartCard
                    key={item._id}
                    item={item}
                    onMove={() => handleMove(item.partId, item._id)}
                    onAdjust={() => handleAdjust(item._id)}
                  />
                ))}
              </div>
            )}

            {/* Quick Actions Section */}
            {totalInCompartment > 0 && (
              <Card className="p-4">
                <p className="text-sm font-medium mb-3">Quick Actions</p>
                <div className="space-y-2">
                  <MemberOnly>
                    <Button
                      className="w-full justify-start"
                      size="sm"
                      variant="outline"
                      onClick={handleCheckIn}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Check In
                    </Button>
                    <Button
                      className="w-full justify-start"
                      size="sm"
                      variant="outline"
                      onClick={handleCheckOut}
                      disabled={totalInCompartment <= 0}
                    >
                      <Minus className="w-4 h-4 mr-2" />
                      Check Out
                    </Button>
                  </MemberOnly>
                </div>
              </Card>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialogs */}
      <CheckInDialog
        open={showCheckIn}
        onOpenChange={setShowCheckIn}
        preselectedCompartmentId={compartment._id}
      />

      <CheckOutDialog
        open={showCheckOut}
        onOpenChange={setShowCheckOut}
        preselectedCompartmentId={compartment._id}
      />

      <MoveDialog
        open={showMove}
        onOpenChange={setShowMove}
        preselectedPartId={selectedPartId}
      />

      <AdjustDialog
        open={showAdjust}
        onOpenChange={setShowAdjust}
        inventoryId={selectedInventoryId}
      />
    </>
  )
}

// Part Card Component
interface PartCardProps {
  item: {
    _id: string
    partId: string
    quantity: number
    updatedAt: number
    part?: {
      _id: string
      name: string
      sku: string
      description?: string
    }
  }
  onMove: () => void
  onAdjust: () => void
}

function PartCard({ item, onMove, onAdjust }: PartCardProps) {
  const formatDate = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    return 'Just now'
  }

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <p className="font-medium truncate text-sm">
              {item.part?.name || 'Unknown Part'}
            </p>
          </div>
          <p className="text-xs text-gray-500">{item.part?.sku}</p>
          <div className="flex items-center gap-3 mt-2">
            <Badge
              variant={item.quantity < 10 ? 'destructive' : 'secondary'}
              className="text-xs"
            >
              {item.quantity} units
            </Badge>
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(item.updatedAt)}
            </span>
          </div>
        </div>

        <EditorOnly>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 flex-shrink-0"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onMove}>
                <ArrowRightLeft className="w-4 h-4 mr-2" />
                Move
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAdjust}>
                <Settings className="w-4 h-4 mr-2" />
                Adjust Quantity
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </EditorOnly>
      </div>
    </Card>
  )
}
