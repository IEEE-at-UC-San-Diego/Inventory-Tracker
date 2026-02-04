import { useRef, useCallback, useState, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react'
import { Stage, Layer, Rect, Line, Text, Group, Image as KonvaImage } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { DrawerShape } from './DrawerShape'
import { CompartmentShape } from './CompartmentShape'
import { useCanvasViewport } from './useCanvasViewport'
import type {
  Drawer,
  Compartment,
  DrawerWithCompartments,
  SelectedElement,
  CanvasMode,
  Viewport,
} from '@/types'
import useImage from 'use-image'

interface BlueprintCanvasProps {
  width: number
  height: number
  backgroundImageUrl?: string | null
  drawers: DrawerWithCompartments[]
  selectedElement: SelectedElement
  mode: CanvasMode
  isLocked: boolean
  isLockedByMe: boolean
  highlightedPartId?: string
  highlightedCompartmentIds?: string[]
  onSelectElement: (element: SelectedElement) => void
  onCompartmentDoubleClick?: (compartment: Compartment, drawer: Drawer) => void
  onUpdateDrawer: (drawerId: string, updates: Partial<Drawer>) => void
  onUpdateCompartment: (compartmentId: string, updates: Partial<Compartment>) => void
  onViewportChange?: (viewport: Viewport) => void
  zoomInRef?: React.MutableRefObject<(() => void) | null>
  zoomOutRef?: React.MutableRefObject<(() => void) | null>
  zoomToFitRef?: React.MutableRefObject<(() => void) | null>
  resetViewRef?: React.MutableRefObject<(() => void) | null>
  zoomToLocationRef?: React.MutableRefObject<
    ((targetX: number, targetY: number, targetWidth?: number, targetHeight?: number) => void) | null
  >
  compartmentsWithInventory?: Map<string, number> // compartmentId -> inventory count
}

interface BlueprintCanvasProps {
  width: number
  height: number
  drawers: DrawerWithCompartments[]
  selectedElement: SelectedElement
  mode: CanvasMode
  isLocked: boolean
  isLockedByMe: boolean
  highlightedPartId?: string
  highlightedCompartmentIds?: string[]
  onSelectElement: (element: SelectedElement) => void
  onCompartmentDoubleClick?: (compartment: Compartment, drawer: Drawer) => void
  onUpdateDrawer: (drawerId: string, updates: Partial<Drawer>) => void
  onUpdateCompartment: (compartmentId: string, updates: Partial<Compartment>) => void
  onViewportChange?: (viewport: Viewport) => void
  zoomInRef?: React.MutableRefObject<(() => void) | null>
  zoomOutRef?: React.MutableRefObject<(() => void) | null>
  zoomToFitRef?: React.MutableRefObject<(() => void) | null>
  resetViewRef?: React.MutableRefObject<(() => void) | null>
  zoomToLocationRef?: React.MutableRefObject<
    ((targetX: number, targetY: number, targetWidth?: number, targetHeight?: number) => void) | null
  >
  compartmentsWithInventory?: Map<string, number> // compartmentId -> inventory count
}

const GRID_SIZE = 50
const GRID_COLOR = '#e2e8f0'

// Background image wrapper component with useImage
const BlueprintBackgroundImage = ({ imageUrl }: { imageUrl?: string | null }) => {
  const [image] = useImage(imageUrl || undefined, 'anonymous')
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    if (image) {
      setImageDimensions({ width: image.width, height: image.height })
    }
  }, [image])

  if (!image || !imageDimensions) return null

  return <KonvaImage image={image} width={imageDimensions.width} height={imageDimensions.height} opacity={0.7} />
}

export const BlueprintCanvas = forwardRef(function BlueprintCanvas({
  width,
  height,
  backgroundImageUrl,
  drawers,
  selectedElement,
  mode,
  isLocked,
  isLockedByMe,
  highlightedPartId,
  highlightedCompartmentIds,
  onSelectElement,
  onCompartmentDoubleClick,
  onUpdateDrawer,
  onUpdateCompartment,
  onViewportChange,
  zoomInRef,
  zoomOutRef,
  zoomToFitRef,
  resetViewRef,
  zoomToLocationRef,
  compartmentsWithInventory,
}: BlueprintCanvasProps, ref) {
  const stageRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const lastPointerPosition = useRef<{ x: number; y: number } | null>(null)

  const {
    viewport,
    zoom,
    zoomIn,
    zoomOut,
    zoomToFit,
    resetView,
    zoomToLocation,
    pan,
    screenToBlueprint,
    blueprintToScreen,
  } = useCanvasViewport({
    containerWidth: width,
    containerHeight: height,
    drawers,
  })

  // Expose zoom functions via refs
  useEffect(() => {
    if (zoomInRef) zoomInRef.current = zoomIn
    if (zoomOutRef) zoomOutRef.current = zoomOut
    if (zoomToFitRef) zoomToFitRef.current = zoomToFit
    if (resetViewRef) resetViewRef.current = resetView
    if (zoomToLocationRef) {
      zoomToLocationRef.current = (targetX: number, targetY: number, targetWidth?: number, targetHeight?: number) => {
        zoomToLocation(targetX, targetY, targetWidth, targetHeight, { animate: true, duration: 0.5 })
      }
    }
  }, [zoomIn, zoomOut, zoomToFit, resetView, zoomToLocation, zoomInRef, zoomOutRef, zoomToFitRef, resetViewRef, zoomToLocationRef])

  // Notify parent of viewport changes
  useEffect(() => {
    onViewportChange?.(viewport)
  }, [viewport, onViewportChange])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        setIsSpacePressed(true)
      }
      if (e.code === 'Escape') {
        onSelectElement(null)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false)
        setIsPanning(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [onSelectElement])

  // Wheel zoom
  const handleWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()

      const stage = stageRef.current
      if (!stage) return

      const pointer = stage.getPointerPosition()
      if (!pointer) return

      const delta = e.evt.deltaY
      const factor = delta > 0 ? 0.9 : 1.1

      zoom(factor, { x: pointer.x, y: pointer.y })
    },
    [zoom]
  )

  // Mouse events for panning
  const handleMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      // Pan with space bar or middle mouse button
      if (isSpacePressed || e.evt.button === 1) {
        setIsPanning(true)
        lastPointerPosition.current = {
          x: e.evt.clientX,
          y: e.evt.clientY,
        }
        return
      }

      // Click on empty canvas to deselect
      if (e.target === e.target.getStage()) {
        onSelectElement(null)
      }
    },
    [isSpacePressed, onSelectElement]
  )

  const handleMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (!isPanning || !lastPointerPosition.current) return

      const dx = e.evt.clientX - lastPointerPosition.current.x
      const dy = e.evt.clientY - lastPointerPosition.current.y

      pan(dx, dy)

      lastPointerPosition.current = {
        x: e.evt.clientX,
        y: e.evt.clientY,
      }
    },
    [isPanning, pan]
  )

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
    lastPointerPosition.current = null
  }, [])

  // Double-click to fit to screen
  const handleDblClick = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (e.target === e.target.getStage()) {
        zoomToFit()
      }
    },
    [zoomToFit]
  )

  // Drawer selection
  const handleDrawerSelect = useCallback(
    (drawer: Drawer) => {
      onSelectElement({ type: 'drawer', id: drawer._id, data: drawer })
    },
    [onSelectElement]
  )

  // Compartment selection
  const handleCompartmentSelect = useCallback(
    (compartment: Compartment, drawerId: string) => {
      onSelectElement({
        type: 'compartment',
        id: compartment._id,
        data: compartment,
        drawerId,
      })
    },
    [onSelectElement]
  )

  // Compartment double-click for details panel
  const handleCompartmentDoubleClick = useCallback(
    (compartment: Compartment, drawer: Drawer) => {
      onCompartmentDoubleClick?.(compartment, drawer)
    },
    [onCompartmentDoubleClick]
  )

  // Drawer drag end
  const handleDrawerDragEnd = useCallback(
    (drawerId: string, x: number, y: number) => {
      onUpdateDrawer(drawerId, { x, y })
    },
    [onUpdateDrawer]
  )

  // Drawer transform end
  const handleDrawerTransformEnd = useCallback(
    (
      drawerId: string,
      x: number,
      y: number,
      width: number,
      height: number,
      rotation: number
    ) => {
      onUpdateDrawer(drawerId, { x, y, width, height, rotation })
    },
    [onUpdateDrawer]
  )

  // Compartment drag end
  const handleCompartmentDragEnd = useCallback(
    (compartmentId: string, x: number, y: number) => {
      onUpdateCompartment(compartmentId, { x, y })
    },
    [onUpdateCompartment]
  )

  // Compartment transform end
  const handleCompartmentTransformEnd = useCallback(
    (
      compartmentId: string,
      x: number,
      y: number,
      width: number,
      height: number,
      rotation: number
    ) => {
      onUpdateCompartment(compartmentId, { x, y, width, height, rotation })
    },
    [onUpdateCompartment]
  )

  // Get inventory count for a compartment
  const getCompartmentInventoryCount = useCallback(
    (compartmentId: string): number => {
      return compartmentsWithInventory?.get(compartmentId) ?? 0
    },
    [compartmentsWithInventory]
  )

  // Sort drawers by zIndex
  const sortedDrawers = useMemo(() => {
    return [...drawers].sort((a, b) => a.zIndex - b.zIndex)
  }, [drawers])

  // Generate grid lines
  const gridLines = useMemo(() => {
    const lines = []
    const offsetX = viewport.x % (GRID_SIZE * viewport.zoom)
    const offsetY = viewport.y % (GRID_SIZE * viewport.zoom)

    // Vertical lines
    for (let x = offsetX; x < width; x += GRID_SIZE * viewport.zoom) {
      lines.push(
        <Line
          key={`v-${x}`}
          points={[x, 0, x, height]}
          stroke={GRID_COLOR}
          strokeWidth={1}
          listening={false}
        />
      )
    }

    // Horizontal lines
    for (let y = offsetY; y < height; y += GRID_SIZE * viewport.zoom) {
      lines.push(
        <Line
          key={`h-${y}`}
          points={[0, y, width, y]}
          stroke={GRID_COLOR}
          strokeWidth={1}
          listening={false}
        />
      )
    }

    return lines
  }, [viewport, width, height])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-slate-50 cursor-crosshair"
      style={{
        cursor: isSpacePressed || isPanning ? 'grab' : 'default',
      }}
    >
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDblClick={handleDblClick}
        draggable={false}
      >
        {/* Background Image Layer - renders below everything */}
        {backgroundImageUrl && (
          <Layer
            listening={false}
            x={viewport.x}
            y={viewport.y}
            scaleX={viewport.zoom}
            scaleY={viewport.zoom}
          >
            <BlueprintBackgroundImage imageUrl={backgroundImageUrl} />
          </Layer>
        )}

        {/* Grid Layer */}
        <Layer listening={false}>{gridLines}</Layer>

        {/* Blueprint Content Layer */}
        <Layer
          x={viewport.x}
          y={viewport.y}
          scaleX={viewport.zoom}
          scaleY={viewport.zoom}
        >
          {/* Drawers */}
          {sortedDrawers.map((drawer) => (
            <DrawerShape
              key={drawer._id}
              drawer={drawer}
              isSelected={selectedElement?.type === 'drawer' && selectedElement.id === drawer._id}
              isLocked={isLocked}
              isLockedByMe={isLockedByMe}
              mode={mode}
              highlighted={highlightedCompartmentIds?.some((id) =>
                drawer.compartments.some((c) => c._id === id)
              )}
              onSelect={() => handleDrawerSelect(drawer)}
              onDragEnd={(x, y) => handleDrawerDragEnd(drawer._id, x, y)}
              onTransformEnd={(x, y, w, h, r) =>
                handleDrawerTransformEnd(drawer._id, x, y, w, h, r)
              }
            />
          ))}

          {/* Compartments */}
          {sortedDrawers.map((drawer) =>
            drawer.compartments.map((compartment) => (
              <CompartmentShape
                key={compartment._id}
                compartment={compartment}
                drawer={drawer}
                isSelected={
                  selectedElement?.type === 'compartment' &&
                  selectedElement.id === compartment._id
                }
                isLockedByMe={isLockedByMe}
                mode={mode}
                highlighted={highlightedCompartmentIds?.includes(compartment._id) ?? false}
                inventoryCount={getCompartmentInventoryCount(compartment._id)}
                onSelect={() => handleCompartmentSelect(compartment, drawer._id)}
                onDoubleClick={() => handleCompartmentDoubleClick(compartment, drawer)}
                onDragEnd={(x, y) => handleCompartmentDragEnd(compartment._id, x, y)}
                onTransformEnd={(x, y, w, h, r) =>
                  handleCompartmentTransformEnd(compartment._id, x, y, w, h, r)
                }
              />
            ))
          )}
        </Layer>

        {/* UI Overlay Layer */}
        <Layer listening={false}>
          {/* Origin marker */}
          <Group x={viewport.x} y={viewport.y}>
            <Line points={[-10, 0, 10, 0]} stroke="#ef4444" strokeWidth={2} />
            <Line points={[0, -10, 0, 10]} stroke="#ef4444" strokeWidth={2} />
            <Text x={12} y={-15} text="(0,0)" fontSize={10} fill="#ef4444" />
          </Group>
        </Layer>
      </Stage>

      {/* Mode indicator overlay */}
      {mode === 'edit' && isLockedByMe && (
        <div className="absolute top-4 left-4 px-3 py-1.5 bg-green-100 text-green-800 rounded-full text-sm font-medium shadow-sm border border-green-200">
          Edit Mode
        </div>
      )}
      {mode === 'view' && isLocked && !isLockedByMe && (
        <div className="absolute top-4 left-4 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full text-sm font-medium shadow-sm border border-amber-200">
          View Only - Locked
        </div>
      )}
    </div>
  )
})
