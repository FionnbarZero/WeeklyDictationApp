/** Working preview of the owner's cross-grade menu cleanup. Old checkpoint
 * readers and the guided teacher inside Writing remain available for recovery. */
export const standaloneGamesRetired = import.meta.env?.VITE_RETIRE_STANDALONE_GAMES === 'true'

export function retiredStandaloneExperience(experience?: string) {
  return experience === 'stroke-order-slay' || experience === 'whispering-scrolls'
}

export function retiredStandaloneCard(id: string) {
  return id === 'dojo-stroke-order' || id === 'dojo-stroke-order-slay' || id === 'dojo-whispering-scrolls'
}
