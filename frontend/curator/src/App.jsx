import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { getRatingSummary } from './api.js'
import exhibitInfo from '../../exhibit/exhibit-info.json'
import brandIcon from '../../exhibit/icon.png'
import './App.css'

const EXHIBIT_IDS = Object.keys(exhibitInfo)
  .filter((id) => /^(0[1-9]|1[0-9]|2[0-5])$/.test(id))
  .sort()
const VISITOR_URL = (import.meta.env.VITE_VISITOR_URL || 'http://localhost:5173').replace(/\/$/, '')

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function ShareDialog({ visitorUrl, exhibitId, onClose }) {
  const dialogRef = useRef(null)
  const qrCanvasRef = useRef(null)
  const refreshTimerRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const [includeImage, setIncludeImage] = useState(false)
  const [urlVisible, setUrlVisible] = useState(true)
  const url = `${visitorUrl}/?id=${exhibitId}${includeImage ? '&image=true' : ''}`

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => {
      dialog.close()
      window.clearTimeout(refreshTimerRef.current)
    }
  }, [])

  function toggleImage(event) {
    setIncludeImage(event.target.checked)
    setUrlVisible(false)
    window.clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = window.setTimeout(() => setUrlVisible(true), 250)
  }

  function downloadQrCode() {
    const canvas = qrCanvasRef.current
    if (!canvas) return

    const downloadLink = document.createElement('a')
    downloadLink.download = `exhibit-${exhibitId}-qr.png`
    downloadLink.href = canvas.toDataURL('image/png')
    downloadLink.click()
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="share-dialog"
      aria-labelledby="share-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="share-dialog-content">
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close share dialog">×</button>
        <p className="eyebrow">EXHIBIT {exhibitId}</p>
        <h2 id="share-dialog-title">Share exhibit</h2>
        <label className="image-toggle">
          <input type="checkbox" checked={includeImage} onChange={toggleImage} />
          Include exhibit image
        </label>
        <div className="qr-code"><QRCodeCanvas ref={qrCanvasRef} value={url} size={224} level="M" marginSize={4} title={`QR code for exhibit ${exhibitId}`} /></div>
        <div className="share-link-row">
          {urlVisible ? <a className="share-url" href={url} target="_blank" rel="noreferrer">{url}</a> : <span className="share-url share-url-refreshing" aria-hidden="true" />}
          <button className="copy-link-button" type="button" onClick={copyLink} disabled={!urlVisible} aria-label={copied ? 'Link copied' : 'Copy visitor link'} title={copied ? 'Copied' : 'Copy link'}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
          </button>
        </div>
        <button className="download-qr" type="button" onClick={downloadQrCode}>Download PNG</button>
      </div>
    </dialog>
  )
}

function AudioPreview({ filename }) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioUrl = filename ? `${VISITOR_URL}/exhibit/audio/${filename}` : ''

  async function toggleAudio() {
    const audio = audioRef.current
    if (!audio) return
    setUnavailable(false)
    if (audio.paused) {
      try {
        await audio.play()
      } catch {
        setUnavailable(true)
      }
    } else {
      audio.pause()
    }
  }

  function seekAudio(event) {
    const time = Number(event.target.value)
    if (!audioRef.current || !duration) return
    audioRef.current.currentTime = time
    setCurrentTime(time)
  }

  return (
    <div className="card-audio">
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          setIsPlaying(false)
          setUnavailable(true)
        }}
      />
      <button className="audio-button" type="button" onClick={toggleAudio} disabled={!audioUrl} aria-label={isPlaying ? 'Pause audio' : 'Play audio'}>
        <span aria-hidden="true">{isPlaying ? 'Ⅱ' : '▶'}</span>
      </button>
      <span className="audio-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
      <input
        className="audio-seek"
        type="range"
        min="0"
        max={duration || 0}
        step="0.1"
        value={Math.min(currentTime, duration || 0)}
        onChange={seekAudio}
        aria-label="Seek audio"
        disabled={!audioUrl || !duration}
      />
      {unavailable && <span className="audio-error" role="status">Audio unavailable</span>}
    </div>
  )
}

function App() {
  const [summaries, setSummaries] = useState(() =>
    Object.fromEntries(EXHIBIT_IDS.map((id) => [id, { status: 'loading' }])),
  )
  const [shareId, setShareId] = useState(null)

  useEffect(() => {
    let active = true

    EXHIBIT_IDS.forEach(async (id) => {
      try {
        const summary = await getRatingSummary(id)
        if (active) setSummaries((current) => ({ ...current, [id]: { status: 'loaded', summary } }))
      } catch (error) {
        if (active) setSummaries((current) => ({ ...current, [id]: { status: 'error', message: error.message } }))
      }
    })

    return () => { active = false }
  }, [])

  return (
    <main className="curator-page">
      <header className="curator-masthead" aria-label="Visitor audio guide">
        <img className="brand-mark" src={brandIcon} alt="" />
        <span className="brand-name">PAINTINGS<br />REVIEWS</span>
      </header>
      <header className="page-heading">
        <h1>Exhibit Ratings</h1>
        <p className="intro">Showing {EXHIBIT_IDS.length} {EXHIBIT_IDS.length === 1 ? 'exhibit' : 'exhibits'}</p>
      </header>

      <section className="exhibit-grid" aria-label="Exhibit rating summaries">
        {EXHIBIT_IDS.map((id) => {
          const entry = summaries[id]
          const summary = entry.status === 'loaded' ? entry.summary : null
          const exhibit = exhibitInfo[id]
          return (
            <article className="exhibit-card" key={id}>
              <div className="card-topline">
                <p className="card-heading"><span>EXHIBIT</span><strong>{id}</strong></p>
                <button className="share-button" type="button" onClick={() => setShareId(id)} aria-label={`Share exhibit ${id}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.7 10.6 6.6-4.2M8.7 13.4l6.6 4.2" /></svg>
                  Share
                </button>
              </div>
              <h2 className="exhibit-title" title={exhibit.title}>{exhibit.title}</h2>
              <p className="average" aria-live="polite">
                {entry.status === 'loading' ? 'Loading…' : entry.status === 'error' ? 'Unavailable' : summary.average === null ? 'No ratings' : summary.average.toFixed(2)}
              </p>
              <p className="count">
                {entry.status === 'loaded' ? `${summary.count} ${summary.count === 1 ? 'rating' : 'ratings'}` : entry.status === 'error' ? 'Could not load ratings' : 'Loading ratings'}
              </p>
              <div className="card-actions">
                <AudioPreview filename={exhibit.filename} />
              </div>
            </article>
          )
        })}
      </section>

      {shareId && <ShareDialog visitorUrl={VISITOR_URL} exhibitId={shareId} onClose={() => setShareId(null)} />}
    </main>
  )
}

export default App
