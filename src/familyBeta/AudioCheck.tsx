import { useRef, useState } from 'react'
import { playAudioPlan, promptAudioCompleted, stopActiveAudio } from '../audio/promptAudio.ts'
import { kindergartenAudioForText } from '../audio/kindergartenAudio.ts'
import { ReadingResponsePanel } from '../readingPractice/ReadingResponsePanel.tsx'

export function AudioCheck() {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const play = () =>
    promptAudioCompleted(
      playAudioPlan([
        { text: '牛', language: 'zh-CN', rate: 0.8, storagePath: kindergartenAudioForText('牛')?.storagePath },
      ]),
    )
  function close() {
    stopActiveAudio()
    setOpen(false)
    dialog.current?.close()
  }
  return (
    <>
      <button
        onClick={() => {
          setOpen(true)
          dialog.current?.showModal()
        }}
      >
        Check sound &amp; microphone
      </button>
      <dialog
        ref={dialog}
        className="beta-report-dialog"
        aria-labelledby="audio-check-title"
        data-report-activity="Sound and microphone check"
        onCancel={(e) => {
          e.preventDefault()
          close()
        }}
      >
        <h1 id="audio-check-title">Check sound and microphone</h1>
        <p>
          Turn up your speakers and check that this browser tab is not muted. This check does not change scores or save
          recordings.
        </p>
        <button
          onClick={async () => {
            setError('')
            setStatus('Playing a recorded Mandarin word…')
            try {
              await play()
              setStatus(
                'Playback finished. Did you hear “牛”? If not, check this browser’s sound permission and your audio output device.',
              )
            } catch {
              setStatus('')
              setError(
                'Sound could not play. Allow sound for this site, check your output device, and try again. Your browser may also need a Mandarin speech voice installed.',
              )
            }
          }}
        >
          Play test word
        </button>
        <p role="status">{status}</p>
        {error && <p role="alert">{error}</p>}
        {open && (
          <ReadingResponsePanel
            promptId="preview-audio-check"
            targetText="牛"
            assessed={false}
            onPlayReference={play}
            onAnswer={() => undefined}
            onContinue={() => {
              setStatus('Microphone comparison checked. No recording has been saved.')
              close()
            }}
          />
        )}
        <p>
          If no microphone prompt appears, open the browser’s site permissions and allow Microphone. Check your
          computer’s microphone permissions too. Use the local preview address on this computer or a secure HTTPS
          address.
        </p>
        <button onClick={close}>Close sound check</button>
      </dialog>
    </>
  )
}
