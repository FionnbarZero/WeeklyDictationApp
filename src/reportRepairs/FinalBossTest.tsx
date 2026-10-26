import { useRef } from 'react'
import { playCachedWordAudio, playCachedWordAudioOnce } from '../audio/promptAudio.ts'
import type { Dataset } from '../domain/contracts.ts'
import { channelWords, type PracticeChannel } from '../familyBeta/gamePools.ts'
import { savePreviewResult } from '../familyBeta/runtime.ts'
import { DeferredTestReview } from '../testReview/DeferredTestReview.tsx'
export function FinalBossTest({
  datasets,
  channel,
  onExit,
}: {
  datasets: Dataset[]
  channel: PracticeChannel
  onExit: () => void
}) {
  const id = useRef(crypto.randomUUID()).current
  const targets = useRef(datasets.flatMap((dataset) => channelWords(dataset, channel))).current
  return (
    <DeferredTestReview
      mode={channel}
      targets={targets}
      activityLabel={`Final Boss ${channel === 'writing' ? 'Writing' : 'Reading'} Test`}
      retrySaveFailures
      onPlayReference={playCachedWordAudioOnce}
      onPlayWritingPrompt={playCachedWordAudio}
      onDiscard={onExit}
      exitLabel="Exit"
      onComplete={(completion) => {
        const saved = savePreviewResult({
          id,
          activity: `Final Boss ${channel === 'writing' ? 'Writing' : 'Reading'} Test`,
          channel,
          datasetIds: datasets.map((dataset) => dataset.id),
          schoolYear: datasets[0]?.schoolYear,
          correct: completion.correct,
          attempted: completion.total,
        })
        if (!saved) throw new Error('This score could not be confirmed. Retry the final review.')
        onExit()
      }}
    />
  )
}
