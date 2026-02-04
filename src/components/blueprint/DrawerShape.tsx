import { useRef, useCallback } from 'react'
import { Rect, Text, Group, Transformer } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Drawer } from '@/types'

interface DrawerShapeProps {
  drawer: Drawer
  isSelected: boolean
  isLocked: boolean
  isLockedByMe: boolean
  mode: 'view' | 'edit'
  highlighted?: boolean
  highlightColor?: string
  onSelect: () => void
  onDragEnd: (x: number, y: number) => void
  onTransformEnd: (x: number, y: number, width: number, height: number, rotation: number) => void
}

const DRAWER_COLORS = {
  default: {
    fill: '#e0f2fe', // cyan-100
    stroke: '#0ea5e9', // cyan-500
    strokeWidth: 2,
  },
  selected: {
    fill: '#bae6fd', // cyan-200
    stroke: '#0284c7', // cyan-600
    strokeWidth: 3,
  },
  locked: {
    fill: '#fef3c7', // amber-100
    stroke: '#f59e0b', // amber-500
    strokeWidth: 2,
  },
  highlighted: {
    fill: '#dcfce7', // green-100
    stroke: '#22c55e', // green-500
    strokeWidth: 3,
  },
}

export function DrawerShape({
  drawer,
  isSelected,
  isLocked,
  isLockedByMe,
  mode,
  highlighted = false,
  highlightColor,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: DrawerShapeProps) {
  const shapeRef = useRef<any>(null)
  const trRef = useRef<any>(null)

  // Determine colors based on state
  const getColors = () => {
    if (highlighted) return { ...DRAWER_COLORS.highlighted, stroke: highlightColor || DRAWER_COLORS.highlighted.stroke }
    if (isSelected) return DRAWER_COLORS.selected
    if (isLocked && !isLockedByMe) return DRAWER_COLORS.locked
    return DRAWER_COLORS.default
  }

  const colors = getColors()
  const isEditable = mode === 'edit' && isLockedByMe

  const handleClick = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true
      onSelect()
    },
    [onSelect]
  )

  const handleDragEnd = useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      if (!isEditable) return
      const node = e.target
      onDragEnd(node.x(), node.y())
    },
    [isEditable, onDragEnd]
  )

  const handleTransformEnd = useCallback(() => {
    if (!isEditable || !shapeRef.current) return

    const node = shapeRef.current
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    // Reset scale and apply to width/height
    node.scaleX(1)
    node.scaleY(1)

    onTransformEnd(
      node.x(),
      node.y(),
      Math.max(20, node.width() * scaleX),
      Math.max(20, node.height() * scaleY),
      node.rotation()
    )
  }, [isEditable, onTransformEnd])

  // Enable transformer when selected and in edit mode
  const enableTransformer = isSelected && isEditable

  return (
    <>
      <Group
        x={drawer.x}
        y={drawer.y}
        rotation={drawer.rotation}
        draggable={isEditable}
        onClick={handleClick}
        onTap={handleClick}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        ref={shapeRef}
      >
        {/* Main drawer rectangle - centered at (0,0) for rotation */}
        <Rect
          x={-drawer.width / 2}
          y={-drawer.height / 2}
          width={drawer.width}
          height={drawer.height}
          fill={colors.fill}
          stroke={colors.stroke}
          strokeWidth={colors.strokeWidth}
          cornerRadius={4}
          shadowColor="black"
          shadowBlur={isSelected ? 10 : 5}
          shadowOpacity={0.1}
          shadowOffsetY={2}
        />

        {/* Label background */}
        <Rect
          x={-drawer.width / 2 + 4}
          y={-drawer.height / 2 + 4}
          width={Math.min(drawer.width - 8, 120)}
          height={24}
          fill={colors.fill}
          cornerRadius={2}
          opacity={0.9}
        />

        {/* Label text */}
        <Text
          x={-drawer.width / 2 + 8}
          y={-drawer.height / 2 + 8}
          text={drawer.label || 'Drawer'}
          fontSize={12}
          fontFamily="system-ui, -apple-system, sans-serif"
          fill="#0c4a6e"
          fontStyle={isSelected ? 'bold' : 'normal'}
          width={Math.min(drawer.width - 16, 112)}
          ellipsis
        />

        {/* Lock indicator */}
        {isLocked && !isLockedByMe && (
          <Text
            x={drawer.width / 2 - 24}
            y={-drawer.height / 2 + 8}
            text="🔒"
            fontSize={14}
          />
        )}

        {/* ID badge (small, in corner) */}
        <Text
          x={drawer.width / 2 - 40}
          y={drawer.height / 2 - 16}
          text={`#${drawer._id.slice(-4)}`}
          fontSize={10}
          fill="#64748b"
          fontFamily="monospace"
        />
      </Group>

      {/* Transformer for resize/rotate */}
      {enableTransformer && (
        <Transformer
          ref={trRef}
          node={shapeRef.current}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          boundBoxFunc={(oldBox, newBox) => {
            // Limit minimum size
            if (newBox.width < 20 || newBox.height < 20) {
              return oldBox
            }
            return newBox
          }}
          rotateEnabled={true}
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          rotateAnchorOffset={20}
        />
      )}
    </>
  )
}
