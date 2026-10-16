import { Headphones } from 'lucide-react'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SkyWritingAcquisition } from './skywriting/skywritingacquisition.tsx'
import { emptyWritingPadState, type WritingPadState } from './skywriting/model.ts'
import './styles.css'

function PersonPinyinPreview() {
  const [padState, setPadState] = useState<WritingPadState>(emptyWritingPadState)

  function hearWord() {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance('人')
    utterance.lang = 'zh-CN'
    utterance.rate = 0.7
    window.speechSynthesis.speak(utterance)
  }

  if (!import.meta.env.DEV) return <main>Development preview unavailable.</main>

  return <div className="app-shell">
    <header className="topbar"><span className="brand">weekly<span className="brand-accent">dictation</span></span><span>Grade 2 · Pinyin tryout</span></header>
    <main className="main-content">
      <div className="practice-page has-skywriting-response">
        <div className="practice-top"><strong>One-word tryout</strong><span>Nothing is scored or saved</span></div>
        <div className="practice-progress"><span style={{ width: '100%' }} /></div>
        <section className="prompt-card tier1-writing-card is-dictation">
          <div className="prompt-meta"><span className="set-chip chip-current">Local preview · 人</span><span className="timer">No timer</span></div>
          <div className="tier1-writing-instructions">
            <div><h1>Listen, then write<br /><span>what you hear.</span></h1><p className="practice-helper">Type <b>ren</b>, then choose the character <b>人</b>.</p></div>
            <div className="tier1-writing-audio-actions"><button type="button" className="writing-hear-button" aria-label="Hear" onClick={hearWord}><Headphones size={36} strokeWidth={2.6} aria-hidden="true" /><span aria-hidden="true">Hear</span></button></div>
          </div>
          <div className="tier1-writing-response"><SkyWritingAcquisition word="人" phase="writing" traceTarget={false} presentation="grand-scroll" pinyinPrototype padState={padState} onPadStateChange={setPadState} /></div>
          <p className="dictation-status">This is an isolated typing tryout. It does not change practice progress.</p>
        </section>
      </div>
    </main>
  </div>
}

const root = document.getElementById('pinyin-person-preview-root')
if (!root) throw new Error('Missing Pinyin person preview root.')
createRoot(root).render(<PersonPinyinPreview />)
