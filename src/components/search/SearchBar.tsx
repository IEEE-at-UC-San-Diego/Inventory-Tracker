import { useState, useCallback, useEffect, useRef } from 'react'
import { Search, X, Clock, ArrowRight, Package, Loader2, MapPin, ChevronDown } from 'lucide-react'
import { useQuery, useConvexClient } from '@/integrations/convex/react-query'
import { api } from '@/convex/_generated/api'
import { Link } from '@tanstack/react-router'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

interface SearchBarProps {
  onClose?: () => void
}

interface SearchResult {
  _id: string
  name: string
  sku: string
  category: string
  description?: string
  imageId?: string
}

interface PartLocation {
  blueprintId: string
  blueprintName: string
  compartmentCount: number
  compartmentIds: string[]
}

export function SearchBar({ onClose }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [partLocations, setPartLocations] = useState<Map<string, PartLocation[]>>(new Map())
  const [loadingLocations, setLoadingLocations] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const client = useConvexClient()

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('recentSearches')
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved))
      } catch {
        // Ignore parse errors
      }
    }
  }, [])

  // Save recent searches
  const saveRecentSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return
    const updated = [searchQuery, ...recentSearches.filter(s => s !== searchQuery)].slice(0, 5)
    setRecentSearches(updated)
    localStorage.setItem('recentSearches', JSON.stringify(updated))
  }, [recentSearches])

  // Search query
  const searchResult = useQuery(
    api.parts.queries.search,
    query.length >= 2 ? { query, limit: 10 } : 'skip'
  )

  const results = searchResult?.items ?? []

  // Fetch blueprint locations for each part result using Convex client
  useEffect(() => {
    if (!client || results.length === 0) {
      setPartLocations(new Map())
      return
    }

    const fetchLocations = async () => {
      const locationsMap = new Map<string, PartLocation[]>()
      const loading = new Set<string>(results.map(r => r._id))
      setLoadingLocations(loading)

      for (const part of results) {
        try {
          const compartments = await client.query(api.compartments.queries.findByPart, {
            partId: part._id as any,
          })

          if (compartments && compartments.length > 0) {
            // Group by blueprint
            const blueprintMap = new Map<string, { count: number; name: string; compartmentIds: string[] }>()
            compartments.forEach((compartment) => {
              if (compartment.blueprint) {
                const existing = blueprintMap.get(compartment.blueprint._id) || {
                  count: 0,
                  name: compartment.blueprint.name,
                  compartmentIds: [],
                }
                blueprintMap.set(compartment.blueprint._id, {
                  count: existing.count + 1,
                  name: compartment.blueprint.name,
                  compartmentIds: [...existing.compartmentIds, compartment._id],
                })
              }
            })

            const locations: PartLocation[] = Array.from(blueprintMap.entries()).map(
              ([blueprintId, data]) => ({
                blueprintId,
                blueprintName: data.name,
                compartmentCount: data.count,
                compartmentIds: data.compartmentIds,
              })
            )

            locationsMap.set(part._id, locations)
          } else {
            locationsMap.set(part._id, [])
          }
        } catch (error) {
          // Silently fail location fetch - search still works
          console.error('Failed to fetch part locations:', error)
          locationsMap.set(part._id, [])
        }
      }

      setPartLocations(locationsMap)
      setLoadingLocations(new Set())
    }

    fetchLocations()
  }, [client, results])

  // Keyboard shortcut: Cmd/Ctrl + K to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)
        setTimeout(() => inputRef.current?.focus(), 100)
      }
      if (e.key === 'Escape') {
        setIsOpen(false)
        onClose?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Handle result click
  const handleResultClick = useCallback((result: SearchResult) => {
    saveRecentSearch(query)
    setIsOpen(false)
    setQuery('')
    onClose?.()
  }, [query, saveRecentSearch, onClose])

  // Handle zoom to location
  const handleZoomToLocation = useCallback(
    (e: React.MouseEvent, partId: string, blueprintId: string) => {
      e.preventDefault()
      e.stopPropagation()
      saveRecentSearch(query)
      setIsOpen(false)
      setQuery('')
      onClose?.()
      // Navigation happens via the Link component
    },
    [query, saveRecentSearch, onClose]
  )

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setIsOpen(true)
          setTimeout(() => inputRef.current?.focus(), 100)
        }}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
      >
        <Search className="w-4 h-4" />
        <span>Search...</span>
        <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-xs bg-white rounded border">
          ⌘K
        </kbd>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => {
          setIsOpen(false)
          onClose?.()
        }}
      />

      {/* Search Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-xl shadow-2xl overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search parts by name, SKU, or category..."
            className="flex-1 text-lg outline-none placeholder:text-gray-400"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-2 py-1 text-xs bg-gray-100 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {query.length < 2 ? (
            // Recent searches
            recentSearches.length > 0 ? (
              <div className="py-2">
                <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                  Recent Searches
                </div>
                {recentSearches.map((search, index) => (
                  <button
                    key={index}
                    onClick={() => setQuery(search)}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-left"
                  >
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span>{search}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-gray-500">
                <p>Start typing to search...</p>
                <p className="text-sm mt-1">Try searching for part names, SKUs, or categories</p>
              </div>
            )
          ) : searchResult === undefined ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              <p>No results found for "{query}"</p>
              <p className="text-sm mt-1">Try a different search term</p>
            </div>
          ) : (
            <div className="py-2">
              <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                Parts ({results.length})
              </div>
              {results.map((result) => {
                const locations = partLocations.get(result._id) || []
                const hasLocations = locations.length > 0
                const isLoadingLocation = loadingLocations.has(result._id)

                return (
                  <div key={result._id} className="group">
                    <Link
                      to={`/parts/${result._id}`}
                      onClick={() => handleResultClick(result)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="p-2 bg-cyan-100 rounded-lg">
                        <Package className="w-4 h-4 text-cyan-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{result.name}</p>
                        <p className="text-sm text-gray-500">
                          {result.sku} • {result.category}
                        </p>
                      </div>
                      {/* Zoom to Location Action */}
                      {isLoadingLocation ? (
                        <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
                      ) : hasLocations ? (
                        <div className="flex items-center gap-1">
                          {locations.length === 1 ? (
                            <Link
                              to={`/blueprints/${locations[0].blueprintId}`}
                              search={{ partId: result._id }}
                              onClick={(e) => handleZoomToLocation(e, result._id, locations[0].blueprintId)}
                              className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-cyan-600 bg-cyan-50 rounded-md hover:bg-cyan-100 transition-colors"
                            >
                              <MapPin className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Zoom to</span>
                              <span className="hidden sm:inline text-cyan-800 ml-1 font-normal">
                                {locations[0].compartmentCount > 1
                                  ? `(${locations[0].compartmentCount})`
                                  : ''}
                              </span>
                            </Link>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-cyan-600 bg-cyan-50 hover:bg-cyan-100"
                                >
                                  <MapPin className="w-3.5 h-3.5 mr-1" />
                                  <span className="hidden sm:inline">Zoom to</span>
                                  <ChevronDown className="w-3 h-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <div className="px-2 py-1.5 text-xs font-medium text-gray-500">
                                  Found in {locations.length} blueprint{locations.length > 1 ? 's' : ''}:
                                </div>
                                {locations.map((location) => (
                                  <Link
                                    key={location.blueprintId}
                                    to={`/blueprints/${location.blueprintId}`}
                                    search={{ partId: result._id }}
                                    onClick={(e) => handleZoomToLocation(e, result._id, location.blueprintId)}
                                  >
                                    <DropdownMenuItem className="cursor-pointer">
                                      <div className="flex-1">
                                        <p className="font-medium">{location.blueprintName}</p>
                                        <p className="text-xs text-gray-500">
                                          {location.compartmentCount} compartment
                                          {location.compartmentCount > 1 ? 's' : ''}
                                        </p>
                                      </div>
                                      <MapPin className="w-4 h-4 text-cyan-600 ml-2" />
                                    </DropdownMenuItem>
                                  </Link>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      ) : (
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                      )}
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white rounded border">↑↓</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white rounded border">↵</kbd>
              to select
            </span>
          </div>
          <span>
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

// Compact search bar for header
export function CompactSearchBar() {
  const [isOpen, setIsOpen] = useState(false)

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
      >
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden md:inline-block px-1.5 py-0.5 text-xs bg-white rounded border">
          ⌘K
        </kbd>
      </button>

      {isOpen && <SearchBar onClose={() => setIsOpen(false)} />}
    </>
  )
}
