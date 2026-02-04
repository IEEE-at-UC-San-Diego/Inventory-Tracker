import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation } from '@/integrations/convex/react-query'
import { api } from '@/convex/_generated/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { useToast } from '../ui/toast'
import { Loader2, ArrowRightLeft, Package, MapPin, ArrowRight } from 'lucide-react'
import type { Id } from '@/convex/_generated/dataModel'
import { useAuth } from '@/hooks/useAuth'

interface MoveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preselectedPartId?: string | null
  onSuccess?: () => void
}

interface LocationWithInventory {
  inventoryId: string
  compartmentId: string
  compartmentLabel: string
  quantity: number
}

export function MoveDialog({
  open,
  onOpenChange,
  preselectedPartId,
  onSuccess,
}: MoveDialogProps) {
  const { authContext, getFreshAuthContext } = useAuth()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [selectedPartId, setSelectedPartId] = useState<string>(preselectedPartId ?? '')
  const [sourceCompartmentId, setSourceCompartmentId] = useState('')
  const [destCompartmentId, setDestCompartmentId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')

  // Fetch available inventory for source
  const availableInventory = useQuery(
    api.inventory.queries.getAvailable,
    selectedPartId ? { authContext, partId: selectedPartId as Id<'parts'> } : 'skip'
  )

  // Get source locations
  const sourceLocations: LocationWithInventory[] = useMemo(() => {
    if (!availableInventory) return []
    return availableInventory
      .filter((item) => item.quantity > 0)
      .map((item) => ({
        inventoryId: item._id,
        compartmentId: item.compartmentId,
        compartmentLabel: item.compartment?.label || `Compartment ${item.compartmentId.slice(-4)}`,
        quantity: item.quantity,
      }))
  }, [availableInventory])

  // Get selected source
  const selectedSource = sourceLocations.find((l) => l.compartmentId === sourceCompartmentId)
  const maxQuantity = selectedSource?.quantity ?? 0

  // Fetch part details
  const partResult = useQuery(
    api.parts.queries.get,
    selectedPartId ? { authContext, partId: selectedPartId as Id<'parts'> } : 'skip'
  )

  // Fetch blueprints for destination selection
  const blueprintsResult = useQuery(api.blueprints.queries.list, { authContext })
  const blueprints = blueprintsResult?.items ?? []

  // Move mutation
  const move = useMutation(api.inventory.mutations.move)

  // Handle submit
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedPartId) {
      toast.error('Please select a part')
      return
    }

    if (!sourceCompartmentId) {
      toast.error('Please select a source location')
      return
    }

    if (!destCompartmentId) {
      toast.error('Please select a destination location')
      return
    }

    if (sourceCompartmentId === destCompartmentId) {
      toast.error('Source and destination must be different')
      return
    }

    if (quantity <= 0) {
      toast.error('Quantity must be greater than 0')
      return
    }

    if (quantity > maxQuantity) {
      toast.error(`Cannot move more than ${maxQuantity} units`)
      return
    }

    setIsSubmitting(true)

    try {
      const context = await getFreshAuthContext() || authContext
      await move({
        authContext: context,
        partId: selectedPartId as Id<'parts'>,
        sourceCompartmentId: sourceCompartmentId as Id<'compartments'>,
        destCompartmentId: destCompartmentId as Id<'compartments'>,
        quantity,
        notes: notes || undefined,
      })

      toast.success(
        'Inventory moved',
        `Moved ${quantity} ${partResult?.name ?? 'units'} to new location`
      )

      // Reset form
      setSourceCompartmentId('')
      setDestCompartmentId('')
      setQuantity(1)
      setNotes('')

      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      toast.error(
        'Failed to move inventory',
        error instanceof Error ? error.message : 'An unexpected error occurred'
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [
    selectedPartId,
    sourceCompartmentId,
    destCompartmentId,
    quantity,
    maxQuantity,
    notes,
    partResult,
    move,
    onOpenChange,
    onSuccess,
    toast,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-blue-600" />
              Move Inventory
            </DialogTitle>
            <DialogDescription>
              Move parts from one location to another
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Part info (if preselected) */}
            {preselectedPartId && partResult && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Moving:</p>
                <p className="font-medium">{partResult.name}</p>
                <p className="text-sm text-gray-500">{partResult.sku}</p>
              </div>
            )}

            {/* Source Location Selection */}
            <div className="space-y-2">
              <Label>From Location</Label>
              {sourceLocations.length === 0 ? (
                <p className="text-sm text-gray-500 p-3 bg-gray-50 rounded-lg">
                  No inventory available for this part
                </p>
              ) : (
                <div className="space-y-2">
                  {sourceLocations.map((location) => (
                    <button
                      key={location.compartmentId}
                      type="button"
                      onClick={() => {
                        setSourceCompartmentId(location.compartmentId)
                        setQuantity(Math.min(quantity, location.quantity))
                      }}
                      className={`w-full p-3 rounded-lg border text-left transition-colors ${
                        sourceCompartmentId === location.compartmentId
                          ? 'border-red-500 bg-red-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">{location.compartmentLabel}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Package className="w-4 h-4" />
                          {location.quantity} units
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Destination Selection */}
            {sourceCompartmentId && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4" />
                  To Location
                </Label>
                <DestinationSelector
                  authContext={authContext}
                  value={destCompartmentId}
                  onChange={setDestCompartmentId}
                  excludeCompartmentId={sourceCompartmentId}
                />
              </div>
            )}

            {/* Quantity */}
            {selectedSource && destCompartmentId && (
              <div className="space-y-2">
                <Label htmlFor="quantity">
                  Quantity (max: {maxQuantity})
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  max={maxQuantity}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-32"
                />
                {quantity > maxQuantity && (
                  <p className="text-sm text-red-500">
                    Cannot exceed available quantity of {maxQuantity}
                  </p>
                )}
              </div>
            )}

            {/* Notes */}
            {destCompartmentId && (
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any additional information..."
                  rows={2}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                !sourceCompartmentId ||
                !destCompartmentId ||
                quantity <= 0 ||
                quantity > maxQuantity ||
                sourceCompartmentId === destCompartmentId
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Moving...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                  Move Inventory
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Destination selector component
interface DestinationSelectorProps {
  authContext: any
  value: string
  onChange: (value: string) => void
  excludeCompartmentId?: string
}

function DestinationSelector({ authContext, value, onChange, excludeCompartmentId }: DestinationSelectorProps) {
  const [selectedBlueprintId, setSelectedBlueprintId] = useState('')
  const [selectedDrawerId, setSelectedDrawerId] = useState('')

  // Fetch blueprints
  const blueprintsResult = useQuery(api.blueprints.queries.list, { authContext })
  const blueprints = blueprintsResult?.items ?? []

  // Fetch drawers for selected blueprint
  const drawersResult = useQuery(
    api["drawers/queries"].listByBlueprint,
    selectedBlueprintId ? { authContext, blueprintId: selectedBlueprintId as Id<'blueprints'> } : 'skip'
  )
  const drawers = drawersResult?.items ?? []

  // Fetch compartments for selected drawer
  const compartmentsResult = useQuery(
    api.compartments.queries.getByDrawer,
    selectedDrawerId ? { authContext, drawerId: selectedDrawerId as Id<'drawers'> } : 'skip'
  )
  const compartments = compartmentsResult?.items ?? []

  // Filter out excluded compartment
  const availableCompartments = compartments.filter(
    (comp) => comp._id !== excludeCompartmentId
  )

  return (
    <div className="space-y-2">
      {/* Blueprint */}
      <select
        value={selectedBlueprintId}
        onChange={(e) => {
          setSelectedBlueprintId(e.target.value)
          setSelectedDrawerId('')
          onChange('')
        }}
        className="w-full px-3 py-2 border rounded-lg"
      >
        <option value="">Select Blueprint...</option>
        {blueprints.map((bp) => (
          <option key={bp._id} value={bp._id}>
            {bp.name}
          </option>
        ))}
      </select>

      {/* Drawer */}
      {selectedBlueprintId && (
        <select
          value={selectedDrawerId}
          onChange={(e) => {
            setSelectedDrawerId(e.target.value)
            onChange('')
          }}
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="">Select Drawer...</option>
          {drawers.map((drawer) => (
            <option key={drawer._id} value={drawer._id}>
              {drawer.label || `Drawer ${drawer._id.slice(-4)}`}
            </option>
          ))}
        </select>
      )}

      {/* Compartment */}
      {selectedDrawerId && (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="">Select Compartment...</option>
          {availableCompartments.map((comp) => (
            <option key={comp._id} value={comp._id}>
              {comp.label || `Compartment ${comp._id.slice(-4)}`}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
