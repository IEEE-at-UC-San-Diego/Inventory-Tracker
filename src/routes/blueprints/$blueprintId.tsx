import { createFileRoute, useParams, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, Save, X, Lock, Unlock, Trash2, Crosshair, History } from 'lucide-react'
import { useQuery, useMutation } from '@/integrations/convex/react-query'
import { api } from '../../../convex/_generated/api'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertDialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { useRole } from '@/hooks/useRole'
import { useAuth } from '@/hooks/useAuth'
import {
  BlueprintCanvas,
  BlueprintControls,
  BlueprintSidebar,
  useBlueprintLock,
  VersionHistoryPanel,
} from '@/components/blueprint'
import { CompartmentDetailsPanel } from '@/components/blueprint/CompartmentDetailsPanel'
import type {
  Drawer,
  Compartment,
  SelectedElement,
  DrawerWithCompartments,
  BlueprintWithHierarchy,
  CanvasMode,
  Viewport,
} from '@/types'
import type { Id } from '../../../convex/_generated/dataModel'

export const Route = createFileRoute('/blueprints/$blueprintId')({
  component: BlueprintEditorPage,
})

function BlueprintEditorPage() {
  return (
    <ProtectedRoute>
      <BlueprintEditorContent />
    </ProtectedRoute>
  )
}

function BlueprintEditorContent() {
  const { blueprintId } = useParams({ from: '/blueprints/$blueprintId' })
  const navigate = useNavigate()

  // Redirect "new" to the proper new blueprint route
  useEffect(() => {
    if (blueprintId === 'new') {
      navigate({ to: '/blueprints/new' })
    }
  }, [blueprintId, navigate])

  const { user, authContext, getFreshAuthContext, isLoading } = useAuth()
  const { canEdit } = useRole()
  const { toast } = useToast()
  
  // Helper to get fresh auth context for mutations
  const getAuthContextForMutation = useCallback(async (context: typeof authContext) => {
    const fresh = await getFreshAuthContext()
    return fresh || context
  }, [getFreshAuthContext])
  
  // URL search params for part highlighting
  const search = useSearch({ from: '/blueprints/$blueprintId' })
  const highlightPartId = search.partId as string | undefined

  const [mode, setMode] = useState<CanvasMode>('view')
  const [selectedElement, setSelectedElement] = useState<SelectedElement>(null)
  const [highlightedCompartmentIds, setHighlightedCompartmentIds] = useState<string[]>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
  const [zoomLevel, setZoomLevel] = useState(100)
  const [showCompartmentDetails, setShowCompartmentDetails] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [selectedCompartmentForDetails, setSelectedCompartmentForDetails] = useState<{
    compartment: Compartment | null
    drawer: Drawer | null
  }>({ compartment: null, drawer: null })

  // Refs for canvas controls
  const zoomInRef = useRef<(() => void) | null>(null)
  const zoomOutRef = useRef<(() => void) | null>(null)
  const zoomToFitRef = useRef<(() => void) | null>(null)
  const resetViewRef = useRef<(() => void) | null>(null)
  const zoomToLocationRef = useRef<((x: number, y: number, w?: number, h?: number) => void) | null>(null)

  // Fetch blueprint with full hierarchy
  const blueprintData = useQuery(api["blueprints/queries"].getWithHierarchy, {
    authContext,
    blueprintId: blueprintId as Id<'blueprints'>,
  }, {
    enabled: !!authContext && !isLoading
  })

  // Fetch inventory for this blueprint to get compartment inventory counts
  const inventoryData = useQuery(api["inventory/queries"].list, {
    authContext,
    includeDetails: false,
  }, {
    enabled: !!authContext && !isLoading
  })

  // Fetch compartments containing highlighted part
  const partCompartmentsQuery = useQuery(
    api.compartments.queries.findByPart,
    authContext && highlightPartId ? { authContext, partId: highlightPartId as Id<'parts'> } : undefined,
    {
      enabled: !!authContext && !isLoading && !!highlightPartId
    }
  )

  // Fetch background image URL if blueprint has one
  const backgroundImageUrl = useQuery(
    api.storage.getImageUrl,
    authContext && blueprintData?.backgroundImageId ? { authContext, storageId: blueprintData.backgroundImageId } : undefined,
    {
      enabled: !!blueprintData?.backgroundImageId && !!authContext
    }
  )

  // Type assertion for blueprint data
  const blueprint = blueprintData as BlueprintWithHierarchy | null | undefined

  // Lock management - MUST be called before any early returns
  const {
    lockStatus,
    isLocked,
    isLockedByMe,
    canAcquireLock,
    acquireLock,
    releaseLock,
    isLoading: lockLoading,
  } = useBlueprintLock({
    blueprintId: blueprintId as Id<'blueprints'>,
    canEdit,
    onLockAcquired: () => {
      setMode('edit')
      setHasChanges(false)
      toast.success('Lock acquired - you can now edit this blueprint')
    },
    onLockReleased: async () => {
      setMode('view')
      // Create a revision if changes were made
      if (hasChanges && blueprint) {
        try {
          const context = await getAuthContextForMutation(authContext)
          const revisionState = {
            drawers: blueprint.drawers.map((drawer) => ({
              _id: drawer._id,
              x: drawer.x,
              y: drawer.y,
              width: drawer.width,
              height: drawer.height,
              rotation: drawer.rotation,
              zIndex: drawer.zIndex,
              label: drawer.label,
            })),
            compartments: blueprint.drawers.flatMap((drawer) =>
              drawer.compartments.map((comp) => ({
                _id: comp._id,
                drawerId: comp.drawerId,
                x: comp.x,
                y: comp.y,
                width: comp.width,
                height: comp.height,
                rotation: comp.rotation,
                zIndex: comp.zIndex,
                label: comp.label,
              }))
            ),
          }
          await createRevision({
            authContext: context,
            blueprintId: blueprintId as Id<'blueprints'>,
            state: revisionState,
            description: 'Auto-created on edit completion',
          })
          toast.success('Lock released - revision saved')
        } catch (error) {
          console.error('Failed to create revision:', error)
          toast.success('Lock released')
        }
      } else {
        toast.success('Lock released')
      }
      setHasChanges(false)
    },
    onLockLost: () => {
      setMode('view')
      setSelectedElement(null)
      setHasChanges(false)
      toast.error('Lock lost - another user may have taken it')
    },
  })

  // Mutations
  const updateBlueprint = useMutation(api.blueprints.mutations.update)
  const deleteBlueprint = useMutation(api.blueprints.mutations.deleteBlueprint)
  const createDrawer = useMutation(api.drawers.mutations.create)
  const updateDrawer = useMutation(api.drawers.mutations.update)
  const deleteDrawer = useMutation(api.drawers.mutations.deleteDrawer)
  const createCompartment = useMutation(api.compartments.mutations.create)
  const updateCompartment = useMutation(api.compartments.mutations.update)
  const deleteCompartment = useMutation(api.compartments.mutations.deleteCompartment)
  const createRevision = useMutation(api.blueprintRevisions.mutations.createRevision)
  const restoreRevision = useMutation(api.blueprintRevisions.mutations.restoreRevision)

  // Track if changes were made during edit session
  const [hasChanges, setHasChanges] = useState(false)

  // Early returns for loading and error states - AFTER all hooks
  if (blueprint === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600" />
      </div>
    )
  }

  if (blueprint === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Blueprint not found</h1>
          <p className="text-gray-600 mt-2">
            The blueprint you're looking for doesn't exist or has been deleted.
          </p>
          <button
            onClick={() => navigate({ to: '/blueprints' })}
            className="mt-4 inline-flex items-center gap-2 text-cyan-600 hover:text-cyan-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to blueprints
          </button>
        </div>
      </div>
    )
  }

  // Set initial name value when blueprint loads
  useEffect(() => {
    if (blueprintData) {
      setNameValue(blueprintData.name)
    }
  }, [blueprintData])

  // Handle canvas resize
  useEffect(() => {
    const updateSize = () => {
      const container = document.getElementById('canvas-container')
      if (container) {
        const rect = container.getBoundingClientRect()
        setCanvasSize({
          width: rect.width,
          height: rect.height,
        })
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Build compartments with inventory count map
  const compartmentsWithInventory = useMemo(() => {
    const map = new Map<string, number>()
    inventoryData?.forEach((item) => {
      const existing = map.get(item.compartmentId) ?? 0
      map.set(item.compartmentId, existing + item.quantity)
    })
    return map
  }, [inventoryData])

  const drawers = useMemo<DrawerWithCompartments[]>(() => {
    return blueprint?.drawers || []
  }, [blueprint])

  // Handle part highlighting from URL
  useEffect(() => {
    if (highlightPartId && partCompartmentsQuery) {
      const compartments = partCompartmentsQuery
      if (compartments.length > 0) {
        setHighlightedCompartmentIds(compartments.map((c) => c._id))
        
        // Zoom to first compartment location after a short delay to ensure canvas is ready
        const firstCompartment = compartments[0]
        const drawer = blueprint?.drawers.find((d) => d._id === firstCompartment.drawerId)
        if (drawer && zoomToLocationRef.current) {
          const compartmentX = drawer.x + firstCompartment.x
          const compartmentY = drawer.y + firstCompartment.y
          setTimeout(() => {
            zoomToLocationRef.current?.(compartmentX, compartmentY, firstCompartment.width, firstCompartment.height)
          }, 100)
        }
      }
    }
  }, [highlightPartId, partCompartmentsQuery, blueprint])

  // Handlers
  const handleSaveName = async () => {
    try {
      const context = await getAuthContextForMutation(authContext)
      await updateBlueprint({
        authContext: context,
        blueprintId: blueprintId as Id<'blueprints'>,
        name: nameValue,
      })
      toast.success('Blueprint name updated')
      setIsEditingName(false)
    } catch (error) {
      toast.error(
        'Failed to update name',
        error instanceof Error ? error.message : 'An error occurred'
      )
    }
  }

  const handleDelete = async () => {
    try {
      const context = await getAuthContextForMutation(authContext)
      await deleteBlueprint({
        authContext: context,
        blueprintId: blueprintId as Id<'blueprints'>,
      })
      toast.success('Blueprint deleted successfully')
      navigate({ to: '/blueprints' })
    } catch (error) {
      toast.error(
        'Failed to delete blueprint',
        error instanceof Error ? error.message : 'An error occurred'
      )
    }
  }

  const handleCreateDrawer = async (drawerData: Partial<Drawer>) => {
    try {
      const context = await getAuthContextForMutation(authContext)
      await createDrawer({
        authContext: context,
        blueprintId: blueprintId as Id<'blueprints'>,
        x: drawerData.x ?? 100,
        y: drawerData.y ?? 100,
        width: drawerData.width ?? 150,
        height: drawerData.height ?? 100,
        rotation: drawerData.rotation ?? 0,
        label: drawerData.label,
      })
      toast.success('Drawer created')
    } catch (error) {
      toast.error(
        'Failed to create drawer',
        error instanceof Error ? error.message : 'An error occurred'
      )
    }
  }

  const handleUpdateDrawer = async (drawerId: string, updates: Partial<Drawer>) => {
    try {
      const context = await getAuthContextForMutation(authContext)
      await updateDrawer({
        authContext: context,
        drawerId: drawerId as Id<'drawers'>,
        ...updates,
      })
      setHasChanges(true)
    } catch (error) {
      toast.error(
        'Failed to update drawer',
        error instanceof Error ? error.message : 'An error occurred'
      )
    }
  }

  const handleDeleteDrawer = async (drawerId: string) => {
    try {
      const context = await getAuthContextForMutation(authContext)
      await deleteDrawer({
        authContext: context,
        drawerId: drawerId as Id<'drawers'>,
      })
      setSelectedElement(null)
      toast.success('Drawer deleted')
    } catch (error) {
      toast.error(
        'Failed to delete drawer',
        error instanceof Error ? error.message : 'An error occurred'
      )
    }
  }

  const handleCreateCompartment = async (
    compartmentData: Partial<Compartment>,
    drawerId: string
  ) => {
    try {
      const context = await getAuthContextForMutation(authContext)
      await createCompartment({
        authContext: context,
        drawerId: drawerId as Id<'drawers'>,
        x: compartmentData.x ?? 0,
        y: compartmentData.y ?? 0,
        width: compartmentData.width ?? 40,
        height: compartmentData.height ?? 30,
        rotation: compartmentData.rotation ?? 0,
        label: compartmentData.label,
      })
      toast.success('Compartment created')
    } catch (error) {
      toast.error(
        'Failed to create compartment',
        error instanceof Error ? error.message : 'An error occurred'
      )
    }
  }

  const handleUpdateCompartment = async (
    compartmentId: string,
    updates: Partial<Compartment>
  ) => {
    try {
      const context = await getAuthContextForMutation(authContext)
      await updateCompartment({
        authContext: context,
        compartmentId: compartmentId as Id<'compartments'>,
        ...updates,
      })
      setHasChanges(true)
    } catch (error) {
      toast.error(
        'Failed to update compartment',
        error instanceof Error ? error.message : 'An error occurred'
      )
    }
  }

  const handleDeleteCompartment = async (compartmentId: string) => {
    try {
      const context = await getAuthContextForMutation(authContext)
      await deleteCompartment({
        authContext: context,
        compartmentId: compartmentId as Id<'compartments'>,
      })
      setSelectedElement(null)
      toast.success('Compartment deleted')
    } catch (error) {
      toast.error(
        'Failed to delete compartment',
        error instanceof Error ? error.message : 'An error occurred'
      )
    }
  }

  const handleViewportChange = useCallback((viewport: Viewport) => {
    setZoomLevel(Math.round(viewport.zoom * 100))
  }, [])

  // Zoom control handlers
  const handleZoomIn = useCallback(() => {
    zoomInRef.current?.()
  }, [])

  const handleZoomOut = useCallback(() => {
    zoomOutRef.current?.()
  }, [])

  const handleZoomToFit = useCallback(() => {
    zoomToFitRef.current?.()
  }, [])

  const handleResetView = useCallback(() => {
    resetViewRef.current?.()
  }, [])

  const handleClearHighlight = useCallback(() => {
    setHighlightedCompartmentIds([])
    navigate({
      to: '/blueprints/$blueprintId',
      params: { blueprintId },
      search: {},
    })
  }, [blueprintId, navigate])

  const handleZoomToCompartment = useCallback((compartmentId: string) => {
    for (const drawer of drawers) {
      const compartment = drawer.compartments.find((c) => c._id === compartmentId)
      if (compartment) {
        const x = drawer.x + compartment.x
        const y = drawer.y + compartment.y
        zoomToLocationRef.current?.(x, y, compartment.width, compartment.height)
        setSelectedElement({
          type: 'compartment',
          id: compartment._id,
          data: compartment,
          drawerId: drawer._id,
        })
        break
      }
    }
  }, [drawers])

  // Handle compartment click for details panel
  const handleCompartmentClick = useCallback(
    (compartment: Compartment, drawer: Drawer) => {
      setSelectedCompartmentForDetails({ compartment, drawer })
      setShowCompartmentDetails(true)
    },
    []
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Delete selected element
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElement && isLockedByMe) {
        e.preventDefault()
        if (selectedElement.type === 'drawer') {
          await handleDeleteDrawer(selectedElement.id)
        } else if (selectedElement.type === 'compartment') {
          await handleDeleteCompartment(selectedElement.id)
        }
      }

      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && isLockedByMe) {
        e.preventDefault()
        toast.info('All changes are saved automatically')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedElement, isLockedByMe])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b bg-white shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate({ to: '/blueprints' })}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    className="text-xl font-bold h-9 w-64"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleSaveName}>
                    <Save className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsEditingName(false)
                      setNameValue(blueprint.name)
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <h1
                    className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-cyan-600"
                    onClick={() => canEdit() && setIsEditingName(true)}
                  >
                    {blueprint.name}
                  </h1>
                  {canEdit() && (
                    <button
                      onClick={() => setIsEditingName(true)}
                      className="p-1 hover:bg-gray-100 rounded text-gray-400"
                    >
                      <Lock className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}
              {isLocked && (
                <div
                  className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${
                    isLockedByMe
                      ? 'bg-green-100 text-green-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {isLockedByMe ? (
                    <Unlock className="w-3 h-3" />
                  ) : (
                    <Lock className="w-3 h-3" />
                  )}
                  {isLockedByMe ? 'Editing' : 'Locked'}
                </div>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              Last updated {new Date(blueprint.updatedAt).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowVersionHistory(true)}
          >
            <History className="w-4 h-4 mr-2" />
            History
          </Button>
          {canEdit() && !isLockedByMe && !isLocked && (
            <Button onClick={acquireLock} disabled={lockLoading}>
              <Lock className="w-4 h-4 mr-2" />
              Edit Blueprint
            </Button>
          )}
          {isLockedByMe && (
            <Button variant="outline" onClick={releaseLock} disabled={lockLoading}>
              <Unlock className="w-4 h-4 mr-2" />
              Done Editing
            </Button>
          )}
          {canEdit() && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowDeleteDialog(true)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas area */}
        <div id="canvas-container" className="flex-1 relative">
          <BlueprintCanvas
            width={canvasSize.width}
            height={canvasSize.height}
            backgroundImageUrl={backgroundImageUrl}
            drawers={drawers}
            selectedElement={selectedElement}
            mode={mode}
            isLocked={isLocked}
            isLockedByMe={isLockedByMe}
            onSelectElement={setSelectedElement}
            onCompartmentDoubleClick={handleCompartmentClick}
            onUpdateDrawer={handleUpdateDrawer}
            onUpdateCompartment={handleUpdateCompartment}
            onViewportChange={handleViewportChange}
            zoomInRef={zoomInRef}
            zoomOutRef={zoomOutRef}
            zoomToFitRef={zoomToFitRef}
            resetViewRef={resetViewRef}
            zoomToLocationRef={zoomToLocationRef}
            compartmentsWithInventory={compartmentsWithInventory}
            highlightedCompartmentIds={highlightedCompartmentIds}
          />

          <BlueprintControls
            mode={mode}
            isLocked={isLocked}
            isLockedByMe={isLockedByMe}
            canAcquireLock={canAcquireLock}
            lockStatus={lockStatus}
            onModeChange={setMode}
            onAcquireLock={acquireLock}
            onReleaseLock={releaseLock}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomToFit={handleZoomToFit}
            onResetView={handleResetView}
            zoomLevel={zoomLevel}
          />

          {/* Highlight indicator */}
          {highlightedCompartmentIds.length > 0 && (
            <div className="absolute top-4 right-4 z-10">
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 shadow-sm">
                <div className="flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-green-600" />
                  <div className="text-sm">
                    <span className="font-medium text-green-800">{highlightedCompartmentIds.length}</span>
                    <span className="text-green-700"> compartment{highlightedCompartmentIds.length > 1 ? 's' : ''} highlighted</span>
                  </div>
                  <button
                    onClick={handleClearHighlight}
                    className="ml-2 p-1 hover:bg-green-100 rounded text-green-600"
                    title="Clear highlight"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 border-l bg-white overflow-y-auto p-4">
          <BlueprintSidebar
            blueprint={blueprint}
            drawers={drawers}
            selectedElement={selectedElement}
            mode={mode}
            isLockedByMe={isLockedByMe}
            onSelectElement={setSelectedElement}
            onCreateDrawer={handleCreateDrawer}
            onCreateCompartment={handleCreateCompartment}
            onUpdateDrawer={handleUpdateDrawer}
            onUpdateCompartment={handleUpdateCompartment}
            onDeleteDrawer={handleDeleteDrawer}
            onDeleteCompartment={handleDeleteCompartment}
          />
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Blueprint"
        description={`Are you sure you want to delete "${blueprint.name}"? This will remove all associated drawers and compartments.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        variant="destructive"
      />

      {/* Compartment Details Panel */}
      <CompartmentDetailsPanel
        open={showCompartmentDetails}
        onOpenChange={setShowCompartmentDetails}
        compartment={selectedCompartmentForDetails.compartment}
        drawer={selectedCompartmentForDetails.drawer}
      />

      {/* Version History Panel */}
      <VersionHistoryPanel
        blueprintId={blueprintId as Id<'blueprints'>}
        onClose={() => setShowVersionHistory(false)}
      />
    </div>
  )
}
