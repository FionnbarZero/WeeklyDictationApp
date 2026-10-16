import type { AcquisitionPromptKind } from '../acquisition/contracts.ts'

export const TARGET_WRITING_RESPONSE_SECONDS = 25
export const FAMILIAR_WRITING_RESPONSE_SECONDS = 10

export function writingResponseSecondsFor(
  promptKind: AcquisitionPromptKind | undefined,
  primaryPhase: string | null | undefined,
) {
  if (primaryPhase === 'test-review') return TARGET_WRITING_RESPONSE_SECONDS
  return promptKind === 'familiar-dt' || promptKind === undefined
    ? FAMILIAR_WRITING_RESPONSE_SECONDS
    : TARGET_WRITING_RESPONSE_SECONDS
}
