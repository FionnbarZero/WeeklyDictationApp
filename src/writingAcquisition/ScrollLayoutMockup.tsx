import { Headphones } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { playAudioPlan, promptAudioCompleted, stopActiveAudio } from '../audio/promptAudio.ts'
import { ProblemReporter } from '../familyBeta/ProblemReporter.tsx'
import { emptyWritingPadState } from '../skywriting/model.ts'
import { WritingPad } from '../skywriting/WritingPad.tsx'
import { enablePreviewSpeechFromTap } from './previewSpeech.ts'
import './scrollLayoutMockup.css'

function ScrollLayoutMockup() {
  const [mounted, setMounted] = useState(false)
  const [pad, setPad] = useState(emptyWritingPadState)
  const [skipped, setSkipped] = useState(false)
  const [audio, setAudio] = useState('')
  const exit = useRef<HTMLDialogElement>(null)
  const request = useRef(0)
  useEffect(() => {
    setMounted(true)
    const stop = () => {
      request.current++
      stopActiveAudio()
    }
    window.addEventListener('pagehide', stop)
    return () => {
      stop()
      window.removeEventListener('pagehide', stop)
    }
  }, [])
  function hear() {
    const id = ++request.current
    stopActiveAudio()
    enablePreviewSpeechFromTap()
    setAudio('Playing…')
    const attempt = playAudioPlan([{ text: '英雄', language: 'zh-CN', rate: 0.7 }])
    void promptAudioCompleted(attempt)
      .then(() => {
        if (id === request.current) setAudio('')
      })
      .catch(() => {
        if (id === request.current) setAudio('Tap Hear to retry audio')
      })
  }
  return (
    <div
      className="scroll-layout-mockup"
      data-report-grade="Grade 2"
      data-report-activity="Scroll layout mockup"
      data-report-revision="scroll-layout-v9"
      data-report-phase={skipped ? 'timer-skipped-demo' : 'writing-layout-demo'}
    >
      <header className="mockup-header">
        <strong>
          Grade 2 · Layout 9 <small>No scores saved</small>
        </strong>
        <span className="mockup-demo-state" role="status">
          {skipped ? 'Timer skipped · demo' : '25s · demo timer'}
        </span>
        <div id="problem-reporter-controls" />
        <button
          onClick={() => {
            stopActiveAudio()
            exit.current?.showModal()
          }}
        >
          Exit
        </button>
      </header>
      <main className="mockup-paper-area skywriting-workspace" aria-label="Try writing the word on the large scrolls">
        <WritingPad
          characterCount={2}
          traceText={skipped ? undefined : '英雄'}
          traceFont="songti"
          presentation="grand-scroll"
          padState={pad}
          onPadStateChange={setPad}
        />
      </main>
      <footer className="mockup-controls" aria-label="Writing controls">
        <button className="mockup-hear" onClick={hear} aria-label="Hear">
          <Headphones size={28} />
          <span>Hear</span>
        </button>
        <button
          className="mockup-skip"
          onClick={() => {
            setSkipped(!skipped)
            if (skipped) setPad(emptyWritingPadState)
          }}
        >
          {skipped ? 'Try again' : 'Skip Timer'}
        </button>
        <span className="mockup-audio-state" role="status">
          {audio}
        </span>
      </footer>
      <dialog ref={exit} className="mockup-exit">
        <h2>Layout test only</h2>
        <p>This page does not save scores or teach a lesson. Your drawing stays temporary.</p>
        <button onClick={() => exit.current?.close()}>Return to mockup</button>
      </dialog>
      {mounted && <ProblemReporter grade="Grade 2" />}
    </div>
  )
}

const root = document.getElementById('scroll-layout-root')
if (!root) throw new Error('Missing scroll layout root')
createRoot(root).render(<ScrollLayoutMockup />)
