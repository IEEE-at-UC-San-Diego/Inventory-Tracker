import {
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCcw,
  Lock,
  Unlock,
  Eye,
  Pencil,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CanvasMode, LockStatus } from '@/types'
import { formatLockTimeRemaining } from './useBlueprintLock'

interface BlueprintControlsProps {
  mode: CanvasMode
  isLocked: boolean
  isLockedByMe: boolean
  canAcquireLock: boolean
  lockStatus?: LockStatus
  onModeChange: (mode: CanvasMode) => void
  onAcquireLock: () => void
  onReleaseLock: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomToFit: () => void
  onResetView: () => void
  zoomLevel?: number
}

export function BlueprintControls({
  mode,
  isLocked,
  isLockedByMe,
  canAcquireLock,
  lockStatus,
  onModeChange,
  onAcquireLock,
  onReleaseLock,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  onResetView,
  zoomLevel = 100,
}: BlueprintControlsProps) {
  const canEdit = canAcquireLock || isLockedByMe

  return (
    <>
      <div className="absolute bottom-6 left-6 flex flex-col gap-3 z-10">
        {/* Main controls toolbar */}
        <div className="flex items-center gap-2 p-2 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200">
          {/* View controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onZoomIn}
              className="h-9 w-9"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={onZoomOut}
              className="h-9 w-9"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={onZoomToFit}
              className="h-9 w-9"
              title="Fit to Screen"
            >
              <Maximize className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={onResetView}
              className="h-9 w-9"
              title="Reset View"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>

          <div className="w-px h-6 bg-gray-200 mx-1" />

          {/* Mode toggle */}
          <div className="flex items-center gap-1">
            <Button
              variant={mode === 'view' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onModeChange('view')}
              className="h-9 gap-1.5"
            >
              <Eye className="w-4 h-4" />
              <span className="hidden sm:inline">View</span>
            </Button>

            <Button
              variant={mode === 'edit' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                if (mode !== 'edit') {
                  onAcquireLock()
                } else {
                  onReleaseLock()
                }
              }}
              disabled={!canEdit}
              className="h-9 gap-1.5"
              title={isLocked && !isLockedByMe ? 'Locked by another user' : 'Edit Mode'}
            >
              <Pencil className="w-4 h-4" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
          </div>
        </div>

        {/* Zoom level indicator */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/95 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 self-start">
          <span className="text-xs text-gray-500 font-medium">
            {Math.round(zoomLevel)}%
          </span>
        </div>
      </div>

      {/* Lock status indicator (top right) */}
      <div className="absolute top-4 right-4 z-10">
        {isLocked ? (
          <div
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg border ${
              isLockedByMe
                ? 'bg-green-50 border-green-200'
                : 'bg-amber-50 border-amber-200'
            }`}
          >
            <div
              className={`p-1.5 rounded-lg ${
                isLockedByMe ? 'bg-green-100' : 'bg-amber-100'
              }`}
            >
              {isLockedByMe ? (
                <Lock className="w-4 h-4 text-green-600" />
              ) : (
                <Unlock className="w-4 h-4 text-amber-600" />
              )}
            </div>
            <div className="flex flex-col">
              <span
                className={`text-sm font-medium ${
                  isLockedByMe ? 'text-green-800' : 'text-amber-800'
                }`}
              >
                {isLockedByMe
                  ? 'You are editing'
                  : `Locked by ${lockStatus?.lockedByName || 'another user'}`}
              </span>
              {isLockedByMe && lockStatus?.timeRemainingMs && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatLockTimeRemaining(lockStatus.timeRemainingMs)}
                </span>
              )}
            </div>
            {isLockedByMe && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onReleaseLock}
                className="h-7 text-green-700 hover:text-green-800 hover:bg-green-100 ml-2"
              >
                Done
              </Button>
            )}
          </div>
        ) : canAcquireLock ? (
          <Button
            onClick={onAcquireLock}
            className="shadow-lg gap-2"
          >
            <Pencil className="w-4 h-4" />
            Edit Blueprint
          </Button>
        ) : null}
      </div>

      {/* Instructions (bottom center) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <div className="px-4 py-2 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 text-xs text-gray-500">
          {mode === 'edit' && isLockedByMe ? (
            <span>
              Drag to move • Resize with handles • <kbd className="px-1 py-0.5 bg-gray-100 rounded">Delete</kbd> to remove • <kbd className="px-1 py-0.5 bg-gray-100 rounded">Space</kbd> to pan
            </span>
          ) : (
            <span>
              <kbd className="px-1 py-0.5 bg-gray-100 rounded">Space</kbd> + drag to pan • Scroll to zoom • Double-click to fit
            </span>
          )}
        </div>
      </div>
    </>
  )
}
