import { useEffect, useRef, useState } from 'react'
import IconButton from '@mui/material/IconButton'
import Rating from '@mui/material/Rating'
import audioGuides from './data/audio-guides.json'
import './App.css'

const requestedId = new URLSearchParams(window.location.search).get('id') ?? '1'
const guideId = Number(requestedId)
const guide = Number.isInteger(guideId) && guideId >= 1 && guideId <= 25
  ? audioGuides[String(guideId)]
  : null
const title = guide?.title ?? 'Exhibit ID not found'
const artist = guide?.artist ?? ''
const description = guide?.description ?? 'No text available'
const audio = guide ? `${import.meta.env.BASE_URL}audio-guide/${guideId}/${guide.filename}` : ''

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--'
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function App() {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioError, setAudioError] = useState(false)
  const [rating, setRating] = useState(null)

  useEffect(() => () => audioRef.current?.pause(), [])
  useEffect(() => {
    document.title = title
  }, [title])

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

  return (
    <main className="visitor-page">
      <header className="masthead" aria-label="Visitor audio guide">
        <span className="brand-mark" aria-hidden="true">V</span>
        <span className="brand-name">PAINTINGS<br />AUDIO GUIDE</span>
      </header>

      <section className="title-section" aria-labelledby="page-title">
        <h1 id="page-title">{title}</h1>
      </section>

      <section className="player-section" aria-label="Audio player">
        <div className="player-heading">
          <span className="duration">{formatTime(duration)} <span>MIN</span></span>
        </div>
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
          <IconButton
            className="play-button"
            onClick={toggleAudio}
            aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            disableRipple
            disabled={!audio}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3.5" height="12" rx="1" /><rect x="13.5" y="6" width="3.5" height="12" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.8c0-.8.9-1.3 1.6-.9l9 5.2a1 1 0 0 1 0 1.8l-9 5.2c-.7.4-1.6-.1-1.6-.9V5.8Z" /></svg>
            )}
          </IconButton>
          <div className="track-area">
            <div className="waveform-wrap">
              <div className="waveform" aria-hidden="true">
                {[12, 20, 14, 26, 17, 33, 21, 28, 13, 24, 35, 18, 26, 12, 30, 20, 14, 25, 17, 32, 13, 22, 16, 28, 11, 20, 32, 15, 23, 12, 28, 18, 34, 14].map((height, index, bars) => (
                  <span
                    key={index}
                    className={duration && index / bars.length < currentTime / duration ? 'waveform-played' : ''}
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
              <span>{!guide ? 'GUIDE NOT FOUND' : audioError ? 'AUDIO FILE UNAVAILABLE' : isPlaying ? 'NOW PLAYING' : 'PRESS TO BEGIN'}</span>
              <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rating-section" aria-labelledby="rating-title">
        <h2 id="rating-title" className="rating-title">Rate the exhibit</h2>
        <Rating
          className="visitor-rating"
          name="visitor-guide-rating"
          value={rating}
          max={5}
          size="large"
          readOnly={rating !== null}
          onChange={(_, value) => {
            if (rating === null && value !== null) setRating(value)
          }}
          getLabelText={(value) => `${value} star${value === 1 ? '' : 's'}`}
          aria-label="Rate this visitor guide"
        />
        <p className="rating-status" aria-live="polite">
          {rating === null ? '' : `Rating has been saved!`}
        </p>
      </section>

      <section className="description-section" text-a aria-labelledby="about-title">
        <h2 id="about-title">{artist}</h2>
        <p>{description}</p>
      </section>
    </main>
  )
}

export default App
