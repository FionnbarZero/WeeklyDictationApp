import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppErrorBoundary } from '../AppErrorBoundary.tsx'
import { pauseToFamilyHub } from '../activity/activityLifecycle.ts'
import { kindergartenAudioForText } from '../audio/kindergartenAudio.ts'
import { playAudioPlan, promptAudioCompleted, stopActiveAudio } from '../audio/promptAudio.ts'
import { LearningModuleHost } from '../ninjaSkills/LearningModuleHost.tsx'
import type { FamilyActivitySlot } from './activitySlots.ts'
import { familyPreview, previewProfile, savePreviewResult } from './runtime.ts'
import '../styles.css'

function readGame() {
  if (!familyPreview || !previewProfile()) return null
  try {
    const game = JSON.parse(
      window.frameElement?.getAttribute('data-family-game') || 'null',
    ) as FamilyActivitySlot['game']
    return game && /^[\w-]{1,160}$/.test(game.attemptId) && game.pack.cohort.grade === previewProfile()?.grade
      ? game
      : null
  } catch {
    return null
  }
}

function FamilyGame() {
  const [game] = useState(readGame)
  const [error, setError] = useState('')
  useEffect(() => () => stopActiveAudio(), [])
  if (!game) return <p role="alert">Open this game from your family’s Ninja Skills page.</p>
  return (
    <div data-report-activity={game.pack.title} data-report-phase="game">
      {error && <p role="alert">{error}</p>}
      <LearningModuleHost
        pack={game.pack}
        onExit={() => {
          pauseToFamilyHub()
        }}
        playAudio={(text, language = 'zh-CN', rate = 0.65) =>
          promptAudioCompleted(
            playAudioPlan([
              { text, language: language as 'zh-CN', rate, storagePath: kindergartenAudioForText(text)?.storagePath },
            ]),
          )
        }
        onComplete={(summary) => {
          try {
            const saved = savePreviewResult({
              id: game.attemptId,
              activity: game.pack.title,
              channel: 'game',
              datasetIds: game.pack.cohort.provenance.map((p) => p.datasetId),
              schoolYear: game.pack.cohort.schoolYear,
              correct: summary.correct,
              attempted: summary.attempted,
            })
            if (!saved) throw new Error('The completed game could not be saved for this child.')
            parent.postMessage({ type: 'family-beta-game-completed', attemptId: saved.id }, location.origin)
          } catch (e) {
            setError(
              `${e instanceof Error ? e.message : 'Saving could not be confirmed.'} Keep the game open and retry its completion.`,
            )
          }
        }}
      />
    </div>
  )
}

createRoot(document.getElementById('family-game-root')!).render(
  <AppErrorBoundary>
    <FamilyGame />
  </AppErrorBoundary>,
)
