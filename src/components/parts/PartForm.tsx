import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation } from '@/integrations/convex/react-query'
import { api } from '@/convex/_generated/api'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { PartImageUpload } from './PartImage'
import { useToast } from '../ui/toast'
import { Loader2, Save, X } from 'lucide-react'
import type { Part } from '@/types'
import type { Id } from '@/convex/_generated/dataModel'

interface PartFormProps {
  part?: Part | null
  onSubmit: (partId: string) => void
  onCancel: () => void
}

export function PartForm({ part, onSubmit, onCancel }: PartFormProps) {
  const { toast } = useToast()
  const { authContext, getFreshAuthContext } = useAuth()
  const isEditing = !!part

  // Form state
  const [formData, setFormData] = useState({
    name: part?.name ?? '',
    sku: part?.sku ?? '',
    category: part?.category ?? '',
    description: part?.description ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Fetch existing categories for autocomplete
  const partsResult = useQuery(api.parts.queries.list, { authContext, includeArchived: false })
  const existingCategories = Array.from(
    new Set((partsResult?.items ?? []).map((p) => p.category))
  ).sort()

  // Mutations
  const createPart = useMutation(api.parts.mutations.create)
  const updatePart = useMutation(api.parts.mutations.update)
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl)

  // Validation
  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }

    if (!formData.sku.trim()) {
      newErrors.sku = 'SKU is required'
    } else if (!/^[a-zA-Z0-9-_]+$/.test(formData.sku)) {
      newErrors.sku = 'SKU can only contain letters, numbers, hyphens, and underscores'
    }

    if (!formData.category.trim()) {
      newErrors.category = 'Category is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData])

  // Handle image file selection
  const handleImageSelect = useCallback((file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Invalid file type', 'Please select an image file')
      return
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large', 'Maximum file size is 5MB')
      return
    }

    setImageFile(file)

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }, [toast])

  const clearImagePreview = useCallback(() => {
    setImageFile(null)
    setImagePreview(null)
  }, [])

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      toast.error('Please fix the errors in the form')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    try {
      let imageId: string | undefined

      // Upload image if selected
      if (imageFile) {
        setUploadProgress(10)
        const uploadUrl = await generateUploadUrl()
        setUploadProgress(30)

        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': imageFile.type },
          body: imageFile,
        })

        if (!response.ok) {
          throw new Error('Failed to upload image')
        }

        const result = await response.json()
        imageId = result.storageId
        setUploadProgress(60)
      }

      const context = await getFreshAuthContext() || authContext

      if (isEditing && part) {
        // Update existing part
        await updatePart({
          authContext: context,
          partId: part._id as Id<'parts'>,
          name: formData.name,
          sku: formData.sku,
          category: formData.category,
          description: formData.description || undefined,
          imageId,
        })
        setUploadProgress(100)
        toast.success('Part updated successfully')
        onSubmit(part._id)
      } else {
        // Create new part
        const partId = await createPart({
          authContext: context,
          name: formData.name,
          sku: formData.sku,
          category: formData.category,
          description: formData.description || undefined,
          imageId,
        })
        setUploadProgress(100)
        toast.success('Part created successfully')
        onSubmit(partId)
      }
    } catch (error) {
      toast.error(
        isEditing ? 'Failed to update part' : 'Failed to create part',
        error instanceof Error ? error.message : 'An unexpected error occurred'
      )
    } finally {
      setIsUploading(false)
    }
  }, [
    validateForm,
    imageFile,
    isEditing,
    part,
    formData,
    createPart,
    updatePart,
    generateUploadUrl,
    authContext,
    getFreshAuthContext,
    onSubmit,
    toast,
  ])

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            {isEditing ? 'Update the part details' : 'Enter the basic details of the part'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Part Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Resistor 10kΩ"
                disabled={isUploading}
                className={errors.name ? 'border-red-500' : ''}
              />
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">
                SKU <span className="text-red-500">*</span>
              </Label>
              <Input
                id="sku"
                value={formData.sku}
                onChange={(e) =>
                  setFormData({ ...formData, sku: e.target.value })
                }
                placeholder="e.g., RES-10K-001"
                disabled={isUploading}
                className={errors.sku ? 'border-red-500' : ''}
              />
              {errors.sku && (
                <p className="text-sm text-red-500">{errors.sku}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">
              Category <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                id="category"
                list="categories"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                placeholder="e.g., Electronics, Mechanical, Fasteners"
                disabled={isUploading}
                className={errors.category ? 'border-red-500' : ''}
              />
              <datalist id="categories">
                {existingCategories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
            {errors.category && (
              <p className="text-sm text-red-500">{errors.category}</p>
            )}
            <p className="text-xs text-gray-500">
              Categories help organize your parts. Use existing categories or create new ones.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Optional description of the part..."
              rows={3}
              disabled={isUploading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Image Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Part Image</CardTitle>
          <CardDescription>
            {isEditing && part?.imageId
              ? 'Replace the current image'
              : 'Upload an image to help identify this part'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <PartImageUpload
              onFileSelect={handleImageSelect}
              previewUrl={imagePreview}
              onClearPreview={clearImagePreview}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
            />
            <div className="flex-1">
              <p className="text-sm text-gray-600">
                Recommended: Square image, at least 200x200 pixels.
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Max file size: 5MB. Supported formats: JPG, PNG, GIF.
              </p>
              {isEditing && part?.imageId && !imagePreview && (
                <p className="text-sm text-cyan-600 mt-2">
                  Current image will be kept if no new image is selected.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isUploading}
        >
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
        <Button type="submit" disabled={isUploading}>
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {uploadProgress > 0 ? `Uploading ${uploadProgress}%...` : 'Saving...'}
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              {isEditing ? 'Update Part' : 'Create Part'}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
