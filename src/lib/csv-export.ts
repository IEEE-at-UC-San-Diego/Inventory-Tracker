/**
 * CSV Export Utility
 * Provides consistent CSV formatting and download functionality
 */

/**
 * Escape a CSV cell value properly
 * Handles commas, quotes, and newlines
 */
export function escapeCSV(cell: any): string {
  const cellStr = String(cell ?? '')
  if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
    return `"${cellStr.replace(/"/g, '""')}"`
  }
  return cellStr
}

/**
 * Create CSV content from headers and data rows
 */
export function createCSV<T>(headers: string[], data: T[][], includeBOM = true): string {
  const headerRow = headers.map(escapeCSV).join(',')
  const dataRows = data
    .map((row) => row.map(escapeCSV).join(','))
    .join('\n')

  const content = `${headerRow}\n${dataRows}`
  
  // Add BOM for UTF-8 encoding support in Excel
  return includeBOM ? '\ufeff' + content : content
}

/**
 * Download CSV file
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  // Clean up URL
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

/**
 * Generate timestamp for filename
 */
export function generateTimestamp(): string {
  return new Date().toISOString().split('T')[0]
}
