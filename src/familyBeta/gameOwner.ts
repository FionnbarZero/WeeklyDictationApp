import type { BetaProfile } from './model.ts'

export type FamilyGameOwner = {
  familyId: string
  writerId: string
  profile: BetaProfile
  week: string
  stillOwner: () => boolean
}
export type FamilyGameWindow = Window & {
  familyGameOwner?: (source: Window) => FamilyGameOwner
  familyGameSession?: { discard: () => Promise<void> }
}
