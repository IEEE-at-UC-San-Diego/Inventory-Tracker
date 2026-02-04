import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import {
  Settings as SettingsIcon,
  Building2,
  User,
  Shield,
  Info,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { useQuery } from '@/integrations/convex/react-query'
import { api } from '../../../convex/_generated/api'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast, ToastProvider } from '@/components/ui/toast'
import { useConvex } from 'convex/react'
import { cn } from '@/lib/utils'
import packageJson from '../../../package.json'
import { useAuth } from '@/hooks/useAuth'

export const Route = createFileRoute('/settings/')({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <ProtectedRoute>
      <ToastProvider>
        <SettingsContent />
      </ToastProvider>
    </ProtectedRoute>
  )
}

interface OrganizationSettings {
  name: string
  slug: string
}

interface SettingsForm {
  orgName: string
}

function SettingsContent() {
  const { authContext, getFreshAuthContext, isLoading } = useAuth()
  const convex = useConvex()
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [form, setForm] = useState<SettingsForm>({
    orgName: '',
  })

  // Fetch organization data
  const orgResult = useQuery(api["organizations/queries"].get, 
    authContext ? { authContext, id: authContext.orgId } : 'skip', {
    enabled: !!authContext && !isLoading
  })

  // Fetch current user profile
  const profileResult = useQuery(api.auth_helpers.getMyProfile, { authContext }, {
    enabled: !!authContext && !isLoading
  })

  // Fetch organization stats
  const statsResult = useQuery(api.organization_helpers.getOrgStats, { authContext }, {
    enabled: !!authContext && !isLoading
  })

  // Update form when data loads
  useEffect(() => {
    if (orgResult) {
      setForm({ orgName: orgResult.name })
      setHasChanges(false)
    }
  }, [orgResult])

  const handleInputChange = (field: keyof SettingsForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setHasChanges(true)
    setSaveSuccess(false)
  }

  const handleSave = useCallback(async () => {
    if (!orgResult) return

    setIsSaving(true)
    try {
      // Get fresh auth context for mutation
      const context = await getFreshAuthContext() || authContext
      
      // Update organization name
      await convex.mutation(api.organizations.mutations.update, {
        authContext: context,
        orgId: orgResult._id as any,
        name: form.orgName,
      })

      setHasChanges(false)
      setSaveSuccess(true)
      toast.success('Settings saved', 'Organization settings have been updated')

      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      toast.error(
        'Failed to save settings',
        error instanceof Error ? error.message : 'An error occurred'
      )
    } finally {
      setIsSaving(false)
    }
  }, [form, orgResult, convex, toast, authContext, getFreshAuthContext])

  const getEnvironmentInfo = () => {
    return {
      'App Version': packageJson.version,
      'Environment': import.meta.env.MODE,
      'API URL': import.meta.env.VITE_CONVEX_URL || 'Not configured',
      'Build Date': packageJson.description || 'Unknown',
    }
  }

  const getPermissionDescription = (role: string) => {
    switch (role) {
      case 'Administrator':
        return 'Full access to all features including user management and organization settings'
      case 'Executive Officers':
        return 'Can create, edit, and delete parts, inventory, and blueprints'
      case 'General Officers':
        return 'Can check items in/out and view inventory and locations'
      case 'Member':
        return 'Read-only access to view inventory, parts, and transactions'
      default:
        return ''
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Administrator':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'Executive Officers':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'General Officers':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'Member':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">Manage your organization and account settings</p>
        </div>
        {hasChanges && (
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              'inline-flex items-center gap-2',
              saveSuccess && 'bg-green-600 hover:bg-green-700'
            )}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : saveSuccess ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Saved
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Organization Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-cyan-600" />
                Organization
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="orgName">Organization Name</Label>
                <Input
                  id="orgName"
                  value={form.orgName}
                  onChange={(e) => handleInputChange('orgName', e.target.value)}
                  placeholder="Enter organization name"
                  className="mt-1.5"
                />
                <p className="text-sm text-gray-500 mt-1">
                  This name is visible to all members of your organization.
                </p>
              </div>

              <div>
                <Label htmlFor="orgSlug">Organization Slug</Label>
                <Input
                  id="orgSlug"
                  value={orgResult?.slug || ''}
                  disabled
                  className="mt-1.5 bg-gray-50"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Unique identifier for your organization. Cannot be changed.
                </p>
              </div>

              {orgResult && (
                <div className="p-3 bg-cyan-50 rounded-lg border border-cyan-200">
                  <div className="flex items-center gap-2 text-sm text-cyan-800">
                    <Info className="w-4 h-4" />
                    <span>
                      Organization ID: <code className="font-mono bg-cyan-100 px-1 rounded">{orgResult._id}</code>
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Your Account */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-cyan-600" />
                Your Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {profileResult ? (
                <>
                  <div>
                    <Label htmlFor="userName">Name</Label>
                    <Input
                      id="userName"
                      value={profileResult.user.name}
                      disabled
                      className="mt-1.5 bg-gray-50"
                    />
                  </div>

                  <div>
                    <Label htmlFor="userEmail">Email</Label>
                    <Input
                      id="userEmail"
                      value={profileResult.user.email}
                      disabled
                      className="mt-1.5 bg-gray-50"
                    />
                  </div>

                  <div>
                    <Label htmlFor="userRole">Role</Label>
                    <div className="mt-1.5">
                      <Badge className={cn('border', getRoleBadgeColor(profileResult.user.role))}>
                        {profileResult.user.role}
                      </Badge>
                      <p className="text-sm text-gray-500 mt-1">
                        {getPermissionDescription(profileResult.user.role)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="userId">User ID</Label>
                    <Input
                      id="userId"
                      value={profileResult.user._id}
                      disabled
                      className="mt-1.5 bg-gray-50 font-mono text-sm"
                    />
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Organization Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Organization Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {statsResult ? (
                <>
                  <StatItem
                    label="Total Parts"
                    value={statsResult.totalParts}
                    icon="parts"
                  />
                  <StatItem
                    label="Blueprints"
                    value={statsResult.totalBlueprints}
                    icon="blueprints"
                  />
                  <StatItem
                    label="Inventory Items"
                    value={statsResult.totalInventory}
                    icon="inventory"
                  />
                  <StatItem
                    label="Transactions"
                    value={statsResult.totalTransactions}
                    icon="transactions"
                  />
                </>
              ) : (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Permissions Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="w-4 h-4 text-cyan-600" />
                Role Permissions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PermissionRole
                role="Administrator"
                color="red"
                permissions={[
                  'Manage users and roles',
                  'Edit organization settings',
                  'All Executive Officers permissions',
                ]}
              />
              <PermissionRole
                role="Executive Officers"
                color="blue"
                permissions={[
                  'Create and edit parts',
                  'Manage inventory',
                  'Create blueprints',
                  'All General Officers permissions',
                ]}
              />
              <PermissionRole
                role="General Officers"
                color="green"
                permissions={[
                  'Check items in/out',
                  'View inventory and locations',
                  'Locate items in blueprints',
                ]}
              />
              <PermissionRole
                role="Member"
                color="gray"
                permissions={[
                  'View inventory data',
                  'View parts and transactions',
                  'Read-only access',
                ]}
              />
            </CardContent>
          </Card>

          {/* Environment Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Info className="w-4 h-4 text-gray-600" />
                Environment Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.entries(getEnvironmentInfo()).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-600">{key}:</span>
                  <span className="font-medium text-gray-900 font-mono text-xs">
                    {typeof value === 'string' && value.length > 30
                      ? `${value.slice(0, 30)}...`
                      : String(value)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// Helper components
interface StatItemProps {
  label: string
  value: number
  icon: string
}

function StatItem({ label, value, icon }: StatItemProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="font-semibold text-gray-900">{value.toLocaleString()}</span>
    </div>
  )
}

interface PermissionRoleProps {
  role: string
  color: 'red' | 'blue' | 'green' | 'gray'
  permissions: string[]
}

function PermissionRole({ role, color, permissions }: PermissionRoleProps) {
  const colorClasses = {
    red: {
      badge: 'bg-red-100 text-red-800 border-red-200',
      dot: 'bg-red-500',
    },
    blue: {
      badge: 'bg-blue-100 text-blue-800 border-blue-200',
      dot: 'bg-blue-500',
    },
    green: {
      badge: 'bg-green-100 text-green-800 border-green-200',
      dot: 'bg-green-500',
    },
    gray: {
      badge: 'bg-gray-100 text-gray-800 border-gray-200',
      dot: 'bg-gray-500',
    },
  }

  const colors = colorClasses[color]

  return (
    <div className="p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <Badge className={cn('text-xs', colors.badge)}>{role}</Badge>
        <div className={cn('w-2 h-2 rounded-full', colors.dot)} />
      </div>
      <ul className="space-y-1">
        {permissions.map((permission, idx) => (
          <li key={idx} className="text-xs text-gray-600 flex items-start gap-1.5">
            <span className="mt-0.5">•</span>
            <span>{permission}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
