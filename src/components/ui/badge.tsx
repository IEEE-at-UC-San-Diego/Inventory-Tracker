import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

// Role badge component for user roles
interface RoleBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  role: 'Administrator' | 'Executive Officers' | 'General Officers' | 'Member'
}

function RoleBadge({ role, className, ...props }: RoleBadgeProps) {
  const roleStyles = {
    Administrator: 'bg-red-100 text-red-800 border-red-200',
    'Executive Officers': 'bg-blue-100 text-blue-800 border-blue-200',
    'General Officers': 'bg-green-100 text-green-800 border-green-200',
    Member: 'bg-gray-100 text-gray-800 border-gray-200',
  }

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        roleStyles[role],
        className
      )}
      {...props}
    >
      {role}
    </div>
  )
}

// Status badge component for various states
interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: 'active' | 'inactive' | 'pending' | 'archived' | 'locked' | 'available'
}

function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const statusStyles = {
    active: 'bg-green-100 text-green-800 border-green-200',
    inactive: 'bg-gray-100 text-gray-800 border-gray-200',
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    archived: 'bg-slate-100 text-slate-800 border-slate-200',
    locked: 'bg-orange-100 text-orange-800 border-orange-200',
    available: 'bg-green-100 text-green-800 border-green-200',
  }

  const statusLabels = {
    active: 'Active',
    inactive: 'Inactive',
    pending: 'Pending',
    archived: 'Archived',
    locked: 'Locked',
    available: 'Available',
  }

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        statusStyles[status],
        className
      )}
      {...props}
    >
      {statusLabels[status]}
    </div>
  )
}

// Category badge for parts
interface CategoryBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  category: string
}

function CategoryBadge({ category, className, ...props }: CategoryBadgeProps) {
  // Generate a consistent color based on category name
  const colors = [
    'bg-purple-100 text-purple-800 border-purple-200',
    'bg-pink-100 text-pink-800 border-pink-200',
    'bg-indigo-100 text-indigo-800 border-indigo-200',
    'bg-cyan-100 text-cyan-800 border-cyan-200',
    'bg-teal-100 text-teal-800 border-teal-200',
    'bg-emerald-100 text-emerald-800 border-emerald-200',
    'bg-amber-100 text-amber-800 border-amber-200',
    'bg-lime-100 text-lime-800 border-lime-200',
  ]

  const colorIndex = category
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        colors[colorIndex],
        className
      )}
      {...props}
    >
      {category}
    </div>
  )
}

export { Badge, badgeVariants, RoleBadge, StatusBadge, CategoryBadge }
