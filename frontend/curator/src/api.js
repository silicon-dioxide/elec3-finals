const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')

export async function getRatingSummary(exhibitId) {
  const response = await fetch(`${API_BASE}/exhibits/${exhibitId}/ratings`)
  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(result.error || `Ratings could not be loaded (${response.status}).`)
  }

  return { count: result.count, average: result.average }
}
