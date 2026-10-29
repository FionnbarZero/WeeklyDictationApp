import type { BetaGrade } from '../familyBeta/model.ts'
import { learningModuleCapability } from '../ninjaSkills/content.ts'
import type { LearningModulePack } from '../ninjaSkills/contracts.ts'
import { NINJA_SKILLS_PROFILES } from '../ninjaSkills/profiles.ts'
/** Reserve once per new maintenance entrance. Wrong turns and Report never consume a visit. */
export function reserveMaintenanceGame(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  child: string,
  grade: BetaGrade,
  pack: LearningModulePack,
) {
  const key = `maintenance-entrances-v1:${encodeURIComponent(JSON.stringify([child, grade, pack.moduleId, pack.cohort.provenance.map((source) => source.datasetId).sort()]))}`
  const raw = storage.getItem(key)
  const visit = raw === null ? 0 : JSON.parse(raw)
  if (!Number.isSafeInteger(visit) || visit < 0 || visit >= Number.MAX_SAFE_INTEGER)
    throw new Error('Maintenance rotation could not be read. Your saved scores are unchanged.')
  const next = learningModuleCapability(pack.moduleId, pack.cohort, NINJA_SKILLS_PROFILES[grade], visit)
  if (next.status !== 'ready') throw new Error(next.reason)
  storage.setItem(key, JSON.stringify(visit + 1))
  if (storage.getItem(key) !== JSON.stringify(visit + 1))
    throw new Error('Maintenance rotation could not be saved. Please retry opening the game.')
  return next.pack
}
