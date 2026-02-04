import * as React from 'react'
import { Check, ChevronRight, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

// Simple dropdown menu implementation
// Uses React state for open/close management

interface DropdownMenuProps {
  children: React.ReactNode
}

function DropdownMenu({ children }: DropdownMenuProps) {
  return <div className="relative inline-block text-left">{children}</div>
}

interface DropdownMenuTriggerProps {
  children: React.ReactNode
  asChild?: boolean
}

function DropdownMenuTrigger({ children }: DropdownMenuTriggerProps) {
  return <>{children}</>
}

interface DropdownMenuContentProps {
  children: React.ReactNode
  align?: 'start' | 'end' | 'center'
  className?: string
}

function DropdownMenuContent({
  children,
  align = 'center',
  className,
}: DropdownMenuContentProps) {
  const alignClasses = {
    start: 'left-0',
    end: 'right-0',
    center: 'left-1/2 -translate-x-1/2',
  }

  return (
    <div
      className={cn(
        'absolute z-50 mt-2 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95',
        alignClasses[align],
        className
      )}
    >
      {children}
    </div>
  )
}

interface DropdownMenuItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  inset?: boolean
}

function DropdownMenuItem({
  className,
  inset,
  children,
  ...props
}: DropdownMenuItemProps) {
  return (
    <button
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground',
        inset && 'pl-8',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

interface DropdownMenuCheckboxItemProps {
  children: React.ReactNode
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  className?: string
}

function DropdownMenuCheckboxItem({
  children,
  checked,
  onCheckedChange,
  className,
}: DropdownMenuCheckboxItemProps) {
  return (
    <button
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground',
        className
      )}
      onClick={() => onCheckedChange?.(!checked)}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {checked && <Check className="h-4 w-4" />}
      </span>
      {children}
    </button>
  )
}

interface DropdownMenuRadioItemProps {
  children: React.ReactNode
  value: string
  selected?: boolean
  onSelect?: (value: string) => void
  className?: string
}

function DropdownMenuRadioItem({
  children,
  value,
  selected,
  onSelect,
  className,
}: DropdownMenuRadioItemProps) {
  return (
    <button
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground',
        className
      )}
      onClick={() => onSelect?.(value)}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {selected && <Circle className="h-2 w-2 fill-current" />}
      </span>
      {children}
    </button>
  )
}

interface DropdownMenuLabelProps
  extends React.HTMLAttributes<HTMLDivElement> {
  inset?: boolean
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: DropdownMenuLabelProps) {
  return (
    <div
      className={cn(
        'px-2 py-1.5 text-sm font-semibold',
        inset && 'pl-8',
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('-mx-1 my-1 h-px bg-muted', className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('ml-auto text-xs tracking-widest opacity-60', className)}
      {...props}
    />
  )
}

interface DropdownMenuGroupProps {
  children: React.ReactNode
}

function DropdownMenuGroup({ children }: DropdownMenuGroupProps) {
  return <div role="group">{children}</div>
}

interface DropdownMenuSubProps {
  children: React.ReactNode
}

function DropdownMenuSub({ children }: DropdownMenuSubProps) {
  return <div className="relative">{children}</div>
}

interface DropdownMenuSubTriggerProps {
  children: React.ReactNode
  inset?: boolean
  className?: string
}

function DropdownMenuSubTrigger({
  children,
  inset,
  className,
}: DropdownMenuSubTriggerProps) {
  return (
    <button
      className={cn(
        'flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground',
        inset && 'pl-8',
        className
      )}
    >
      {children}
      <ChevronRight className="ml-auto h-4 w-4" />
    </button>
  )
}

interface DropdownMenuSubContentProps {
  children: React.ReactNode
  className?: string
}

function DropdownMenuSubContent({
  children,
  className,
}: DropdownMenuSubContentProps) {
  return (
    <div
      className={cn(
        'absolute left-full top-0 z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95',
        className
      )}
    >
      {children}
    </div>
  )
}

// Controlled Dropdown Menu hook
export function useDropdownMenu() {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  const toggle = React.useCallback(() => setOpen((prev) => !prev), [])
  const close = React.useCallback(() => setOpen(false), [])

  // Close on click outside
  React.useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        close()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, close])

  // Close on escape key
  React.useEffect(() => {
    if (!open) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, close])

  return {
    open,
    setOpen,
    toggle,
    close,
    triggerRef,
  }
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
