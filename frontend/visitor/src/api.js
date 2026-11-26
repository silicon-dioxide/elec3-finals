const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')

export async function postRating(exhibitId, rating) {
  const response = await fetch(`${API_BASE}/ratings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exhibitId, rating }),
  })
  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(result.error || `Rating could not be submitted (${response.status}).`)
  }

  return result
}
