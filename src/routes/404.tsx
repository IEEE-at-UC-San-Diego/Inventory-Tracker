import { createFileRoute, Link } from '@tanstack/react-router'
import { PackageX, ArrowLeft, Home, Search } from 'lucide-react'
import { Card, CardContent } from '../components/ui/card'

export const Route = createFileRoute('/404')({
  component: NotFoundPage,
})

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <Card className="max-w-lg w-full">
        <CardContent className="p-8 text-center">
          {/* Icon */}
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <PackageX className="w-10 h-10 text-gray-400" />
          </div>

          {/* Title */}
          <h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>
          <h2 className="text-xl font-semibold text-gray-700 mb-4">Page Not Found</h2>

          {/* Description */}
          <p className="text-gray-600 mb-8">
            The page you're looking for doesn't exist or has been moved.
            Check the URL or try navigating back to a known page.
          </p>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
            >
              <Home className="w-4 h-4" />
              Go to Dashboard
            </Link>
            <button
              onClick={() => window.history.back()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </button>
          </div>

          {/* Helpful links */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 mb-4">Popular destinations:</p>
            <div className="flex flex-wrap justify-center gap-2">
              <QuickLink to="/parts" icon={<Search className="w-3 h-3" />} label="Parts" />
              <QuickLink to="/inventory" icon={<Search className="w-3 h-3" />} label="Inventory" />
              <QuickLink to="/blueprints" icon={<Search className="w-3 h-3" />} label="Blueprints" />
              <QuickLink to="/transactions" icon={<Search className="w-3 h-3" />} label="Transactions" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function QuickLink({
  to,
  icon,
  label,
}: {
  to: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-cyan-600 bg-cyan-50 rounded-full hover:bg-cyan-100 transition-colors"
    >
      {icon}
      {label}
    </Link>
  )
}
