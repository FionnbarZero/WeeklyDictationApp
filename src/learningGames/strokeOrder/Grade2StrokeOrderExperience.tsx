import { gradeAudioProfileFor } from '../../audio/gradeAudioProfile.ts'
import { playAudioPlan, playCachedWordAudio, stopActiveAudio } from '../../audio/lazyPromptAudio.ts'
import type { PracticeTarget, Word } from '../../domain.ts'
import { StrokeOrderActivity } from './StrokeOrderActivity.tsx'
import { grade2StrokeOrderConfig } from './grade2Adapter.ts'

type Grade2StrokeOrderExperienceProps = {
  readonly target: PracticeTarget
  readonly onClose: () => void
}

function playWord(word: Word) {
  const profile = gradeAudioProfileFor('Grade 2')
  return playCachedWordAudio(word, false, {
    playbackRate: profile.dictationRate,
    sentenceRate: profile.dictationRate,
    pauseMs: profile.segmentGapMs,
  }).completed
}

export default function Grade2StrokeOrderExperience({
  target,
  onClose,
}: Grade2StrokeOrderExperienceProps) {
  const config = grade2StrokeOrderConfig(target)
  const close = () => {
    stopActiveAudio()
    onClose()
  }
  return (
    <StrokeOrderActivity
      key={config.sourceId}
      {...config}
      playAudio={(text) => {
        const word = target.dataset.words.find((candidate) => candidate.text === text)
        if (word) return playWord(word)
        const profile = gradeAudioProfileFor('Grade 2')
        return playAudioPlan([{ text, language: 'zh-CN', rate: profile.dictationRate }], {
          pauseMs: profile.segmentGapMs,
        }).completed
      }}
      onExit={close}
      onComplete={close}
    />
  )
}
