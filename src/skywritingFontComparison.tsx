import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { WritingPad, type WritingPadTraceFont } from './skywriting/index.ts'
import { grade5SkyWritingAcquisitionSample } from './skywriting/grade5AcquisitionSample.ts'
import './skywritingFontComparison.css'

const prototypeBaselineEnabled = import.meta.env.VITE_PROTOTYPE_BASELINE === 'true'

type FontAvailability = {
  songti: boolean
  kaiti: boolean
}

const comparisonFonts = [
  {
    id: 'songti' satisfies WritingPadTraceFont,
    name: 'Songti SC Light',
    description: 'Printed, structured strokes with Song-style details.',
  },
  {
    id: 'kaiti' satisfies WritingPadTraceFont,
    name: 'Kaiti SC Regular',
    description: 'Handwriting-inspired strokes with a brush-written feel.',
  },
] as const

function SkyWritingFontComparison() {
  const [availability, setAvailability] = useState<FontAvailability>({ songti: false, kaiti: false })
  const [targetIndex, setTargetIndex] = useState(0)
  const target = grade5SkyWritingAcquisitionSample[targetIndex]

  useEffect(() => {
    setAvailability({
      songti: document.fonts.check('16px "Songti SC"'),
      kaiti: document.fonts.check('16px "Kaiti SC"'),
    })
  }, [])

  if (!import.meta.env.DEV && !prototypeBaselineEnabled) return <main className="font-compare-unavailable">This development comparison is unavailable in production.</main>

  return <main className="font-compare-shell">
    <header className="font-compare-header">
      <div>
        <p>Interactive child-use comparison</p>
        <h1>Songti SC Light <span>vs.</span> Kaiti SC Regular</h1>
      </div>
      <strong>Trace the same word once in each box</strong>
    </header>

    <nav className="font-target-picker" aria-label="Choose a comparison word">
      <span>Target word</span>
      {grade5SkyWritingAcquisitionSample.map((item, index) => <button
        key={item.id}
        type="button"
        aria-pressed={targetIndex === index}
        onClick={() => setTargetIndex(index)}
      >{item.text}</button>)}
      <small>Changing the word clears both practice boxes.</small>
    </nav>

    <section className="font-compare-grid">
      {comparisonFonts.map((font) => <article key={font.id} className="font-compare-card">
        <header>
          <div>
            <p>{font.id === 'songti' ? '300 weight' : '400 weight'}</p>
            <h2>{font.name}</h2>
          </div>
          <span className={availability[font.id] ? 'available' : 'fallback'}>
            {availability[font.id] ? 'Installed' : 'Using fallback'}
          </span>
        </header>
        <p className="font-description">{font.description}</p>
        <div className="font-practice-box">
          <WritingPad
            key={`${font.id}-${target.id}`}
            characterCount={[...target.text].length}
            traceText={target.text}
            traceFont={font.id}
          />
        </div>
      </article>)}
    </section>
  </main>
}

const root = document.getElementById('skywriting-font-comparison-root')
if (!root) throw new Error('Missing Sky Writing font comparison root.')
createRoot(root).render(<SkyWritingFontComparison />)
