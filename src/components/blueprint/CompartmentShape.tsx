import { useRef, useCallback } from 'react'
import { Rect, Text, Group, Circle } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Compartment, Drawer } from '@/types'

interface CompartmentShapeProps {
  compartment: Compartment
  drawer: Drawer
  isSelected: boolean
  isLockedByMe: boolean
  mode: 'view' | 'edit'
  highlighted?: boolean
  highlightColor?: string
  inventoryCount?: number
  onSelect: () => void
  onDoubleClick?: () => void
  onDragEnd: (x: number, y: number) => void
  onTransformEnd: (x: number, y: number, width: number, height: number, rotation: number) => void
}

const COMPARTMENT_COLORS = {
  default: {
    fill: '#f8fafc', // slate-50
    stroke: '#94a3b8', // slate-400
    strokeWidth: 1,
  },
  selected: {
    fill: '#e0f2fe', // cyan-100
    stroke: '#0ea5e9', // cyan-500
    strokeWidth: 2,
  },
  highlighted: {
    fill: '#dcfce7', // green-100
    stroke: '#22c55e', // green-500
    strokeWidth: 2,
  },
  hasInventory: {
    fill: '#eff6ff', // blue-50
    stroke: '#3b82f6', // blue-500
    strokeWidth: 1,
  },
}

export function CompartmentShape({
  compartment,
  drawer,
  isSelected,
  isLockedByMe,
  mode,
  highlighted = false,
  highlightColor,
  inventoryCount = 0,
  onSelect,
  onDoubleClick,
  onDragEnd,
  onTransformEnd,
}: CompartmentShapeProps) {
  const shapeRef = useRef<any>(null)

  // Determine colors based on state
  const getColors = () => {
    if (highlighted) return { ...COMPARTMENT_COLORS.highlighted, stroke: highlightColor || COMPARTMENT_COLORS.highlighted.stroke }
    if (isSelected) return COMPARTMENT_COLORS.selected
    if (inventoryCount > 0) return COMPARTMENT_COLORS.hasInventory
    return COMPARTMENT_COLORS.default
  }

  const colors = getColors()
  const isEditable = mode === 'edit' && isLockedByMe

  // Calculate absolute position within the drawer
  // Compartment coordinates are relative to drawer's center
  const absoluteX = drawer.x + compartment.x
  const absoluteY = drawer.y + compartment.y

  const handleClick = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true
      onSelect()
    },
    [onSelect]
  )

  const handleDblClick = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true
      onDoubleClick?.()
    },
    [onDoubleClick]
  )

  const handleDragEnd = useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      if (!isEditable) return
      const node = e.target

      // Convert absolute position back to drawer-relative
      const relativeX = node.x() - drawer.x
      const relativeY = node.y() - drawer.y

      // Clamp to drawer bounds
      const halfDrawerW = drawer.width / 2
      const halfDrawerH = drawer.height / 2
      const halfCompW = compartment.width / 2
      const halfCompH = compartment.height / 2

      const clampedX = Math.max(
        -halfDrawerW + halfCompW,
        Math.min(halfDrawerW - halfCompW, relativeX)
      )
      const clampedY = Math.max(
        -halfDrawerH + halfCompH,
        Math.min(halfDrawerH - halfCompH, relativeY)
      )

      onDragEnd(clampedX, clampedY)
    },
    [isEditable, drawer, compartment, onDragEnd]
  )

  const handleTransformEnd = useCallback(() => {
    if (!isEditable || !shapeRef.current) return

    const node = shapeRef.current
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    // Reset scale and apply to width/height
    node.scaleX(1)
    node.scaleY(1)

    const newWidth = Math.max(15, compartment.width * scaleX)
    const newHeight = Math.max(15, compartment.height * scaleY)

    // Clamp size to drawer bounds
    const halfDrawerW = drawer.width / 2
    const halfDrawerH = drawer.height / 2
    const clampedWidth = Math.min(newWidth, drawer.width - 10)
    const clampedHeight = Math.min(newHeight, drawer.height - 10)

    onTransformEnd(
      compartment.x,
      compartment.y,
      clampedWidth,
      clampedHeight,
      node.rotation()
    )
  }, [isEditable, compartment, drawer, onTransformEnd])

  return (
    <Group
      x={absoluteX}
      y={absoluteY}
      rotation={drawer.rotation + compartment.rotation}
      draggable={isEditable}
      onClick={handleClick}
      onTap={handleClick}
      onDblClick={handleDblClick}
      onDragEnd={handleDragEnd}
      onTransformEnd={handleTransformEnd}
      ref={shapeRef}
    >
      {/* Main compartment rectangle - centered at (0,0) */}
      <Rect
        x={-compartment.width / 2}
        y={-compartment.height / 2}
        width={compartment.width}
        height={compartment.height}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={colors.strokeWidth}
        cornerRadius={2}
        shadowColor="black"
        shadowBlur={isSelected ? 6 : 2}
        shadowOpacity={0.05}
        shadowOffsetY={1}
      />

      {/* Label text - only if compartment is large enough */}
      {compartment.width > 40 && compartment.height > 30 && (
        <Text
          x={-compartment.width / 2 + 4}
          y={-compartment.height / 2 + 4}
          text={compartment.label || `#${compartment._id.slice(-4)}`}
          fontSize={10}
          fontFamily="system-ui, -apple-system, sans-serif"
          fill="#475569"
          fontStyle={isSelected ? 'bold' : 'normal'}
          width={compartment.width - 8}
          height={compartment.height - 8}
          align="center"
          verticalAlign="middle"
          ellipsis
        />
      )}

      {/* Inventory count badge */}
      {inventoryCount > 0 && (
        <Group x={compartment.width / 2 - 14} y={-compartment.height / 2 + 4}>
          <Circle
            radius={10}
            fill="#3b82f6"
            shadowColor="black"
            shadowBlur={2}
            shadowOpacity={0.2}
          />
          <Text
            text={inventoryCount > 99 ? '99+' : String(inventoryCount)}
            fontSize={inventoryCount > 9 ? 8 : 9}
            fontFamily="system-ui, -apple-system, sans-serif"
            fill="white"
            fontStyle="bold"
            width={20}
            height={20}
            x={-10}
            y={-7}
            align="center"
            verticalAlign="middle"
          />
        </Group>
      )}

      {/* Selection indicator (subtle border glow) */}
      {isSelected && (
        <Rect
          x={-compartment.width / 2 - 2}
          y={-compartment.height / 2 - 2}
          width={compartment.width + 4}
          height={compartment.height + 4}
          stroke="#0ea5e9"
          strokeWidth={1}
          dash={[4, 2]}
          cornerRadius={3}
          listening={false}
        />
      )}
    </Group>
  )
}
