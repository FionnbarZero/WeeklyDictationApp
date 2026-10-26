import type { ContextGameRound } from '../learningGames/contracts.ts'

type PlayLearningAudio = (text: string, language?: string, rate?: number) => void | Promise<void>
export const CONTEXT_GAP_MS = 1200
export async function playGappedContext(
  round: Pick<ContextGameRound, 'sentenceBefore' | 'sentenceAfter'>,
  play: PlayLearningAudio,
  pause: (ms: number) => Promise<void>,
  current: () => boolean,
  rate = 0.5,
) {
  if (!current()) return
  const before = round.sentenceBefore.trim(),
    after = round.sentenceAfter.trim()
  if (/\p{Script=Han}/u.test(before)) await play(before, 'zh-CN', rate)
  if (!current()) return
  await pause(CONTEXT_GAP_MS)
  if (!current()) return
  if (/\p{Script=Han}/u.test(after)) await play(after, 'zh-CN', rate)
}
