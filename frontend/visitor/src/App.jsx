import { useEffect, useRef, useState } from 'react'
import { postRating } from './api.js'
import exhibitInfo from '../../exhibit/exhibit-info.json'
import brandIcon from '../../exhibit/icon.png'
import './App.css'

const requestedId = new URLSearchParams(window.location.search).get('id')
const normalizedId = requestedId && /^\d{1,2}$/.test(requestedId)
  ? requestedId.padStart(2, '0')
  : requestedId
const exhibitId = /^(0[1-9]|1[0-9]|2[0-5])$/.test(normalizedId ?? '') ? normalizedId : null
const guide = exhibitId ? exhibitInfo[exhibitId] : null
const title = guide?.title ?? (exhibitId ? `Exhibit ${exhibitId}` : 'Exhibit not found')
const artist = guide?.artist ?? ''
const description = guide?.description ?? ''
const audio = guide?.filename
  ? `${import.meta.env.BASE_URL}exhibit/audio/${guide.filename}`
  : ''
const wantsImage = new URLSearchParams(window.location.search).get('image') === 'true'
const image = wantsImage && guide?.image
  ? `${import.meta.env.BASE_URL}exhibit/image/${guide.image}`
  : ''
const WAVEFORM = [12, 20, 14, 26, 17, 33, 21, 28, 13, 24, 35, 18, 26, 12, 30, 20, 14, 25, 17, 32, 13, 22, 16, 28, 11, 20, 32, 15, 23, 12, 28, 18, 34, 14]

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function App() {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioError, setAudioError] = useState(false)
  const [rating, setRating] = useState('')
  const [ratingLocked, setRatingLocked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [ratingStatus, setRatingStatus] = useState(null)
  const [imageUnavailable, setImageUnavailable] = useState(false)

  useEffect(() => () => audioRef.current?.pause(), [])
  useEffect(() => {
    document.title = title
  }, [])

  async function toggleAudio() {
    const player = audioRef.current
    if (!player) return

    if (player.paused) {
      setAudioError(false)
      if (player.ended) {
        player.currentTime = 0
        setCurrentTime(0)
      }
      try {
        await player.play()
      } catch {
        setAudioError(true)
      }
    } else {
      player.pause()
    }
  }

  function seekAudio(event) {
    const time = Number(event.target.value)
    if (!audioRef.current || !duration) return
    audioRef.current.currentTime = time
    setCurrentTime(time)
  }

  async function selectRating(value) {
    if (submitting || ratingLocked || !exhibitId) return

    setRating(String(value))
    setRatingLocked(true)
    setSubmitting(true)
    setRatingStatus({ type: '', message: 'Submitting rating…' })
    try {
      await postRating(exhibitId, value)
      setRatingStatus({ type: 'success', message: 'Rating has been saved!' })
    } catch (error) {
      setRatingStatus({ type: 'error', message: error.message })
      setRating('')
      setRatingLocked(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (!exhibitId) return <main className="not-found">Exhibit not found</main>

  return (
    <main className="visitor-page">
      <header className="masthead" aria-label="Visitor audio guide">
        <img className="brand-mark" src={brandIcon} alt="" />
        <span className="brand-name">PAINTINGS<br />AUDIO GUIDE</span>
      </header>

      <section className="title-section" aria-labelledby="page-title">
        {image && !imageUnavailable && <img className="exhibit-image" src={image} alt={title} onError={() => setImageUnavailable(true)} />}
        <h1 id="page-title">{title}</h1>
        {artist && <h2 className="artist-name">{artist}</h2>}
      </section>

      <section className="player-section" aria-label="Audio player">
        <div className="player-controls">
          <audio
            ref={audioRef}
            src={audio || undefined}
            preload="metadata"
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onDurationChange={(event) => setDuration(event.currentTarget.duration)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onError={() => {
              setIsPlaying(false)
              setAudioError(true)
            }}
          />
          <button
            type="button"
            className="play-button"
            onClick={toggleAudio}
            aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            disabled={!audio}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3.5" height="12" rx="1" /><rect x="13.5" y="6" width="3.5" height="12" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.8c0-.8.9-1.3 1.6-.9l9 5.2a1 1 0 0 1 0 1.8l-9 5.2c-.7.4-1.6-.1-1.6-.9V5.8Z" /></svg>
            )}
          </button>
          <div className="track-area">
            <div className="waveform-wrap">
              <div className="waveform" aria-hidden="true">
                {WAVEFORM.map((height, index) => (
                  <span
                    key={index}
                    className={duration && index / WAVEFORM.length < currentTime / duration ? 'waveform-played' : ''}
                    style={{ '--bar-height': `${height}px` }}
                  />
                ))}
              </div>
              <input
                className="waveform-seek"
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={Math.min(currentTime, duration || 0)}
                onChange={seekAudio}
                aria-label="Seek audio"
                disabled={!duration}
              />
            </div>
            <div className="track-labels">
              <span>{!guide ? 'AUDIO NOT CONFIGURED' : audioError ? 'AUDIO FILE UNAVAILABLE' : isPlaying ? 'NOW PLAYING' : 'PRESS TO BEGIN'}</span>
              <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="description-section" aria-label="Description">
        {description && <p>{description}</p>}
      </section>

      <section className="rating-section" aria-labelledby="rating-title">
        <h2 id="rating-title" className="rating-title">Rate the exhibit</h2>
        <fieldset className="rating-fieldset" disabled={submitting || ratingLocked}>
          <legend className="visually-hidden">Choose a rating from one to five stars</legend>
          <div className="star-options">
            {[1, 2, 3, 4, 5].map((value) => (
              <label className={`star-option${Number(rating) >= value ? ' selected' : ''}`} key={value}>
                <input
                  type="radio"
                  name="rating"
                  value={value}
                  checked={rating === String(value)}
                  onChange={() => selectRating(value)}
                />
                <span aria-hidden="true">★</span>
                <span className="visually-hidden">{value} {value === 1 ? 'star' : 'stars'}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className={`rating-status${ratingStatus ? ` ${ratingStatus.type}` : ''}`} aria-live="polite">
          {ratingStatus?.message ?? (ratingLocked ? 'Your selection is locked for this visit.' : 'Choose one star to five stars.')}
        </p>
      </section>
      
    </main>
  )
}

export default App
