import { firebaseConfig } from '../config.ts'
import { getIdToken } from '../firebaseClient.ts'
import { firebaseAppCheckHeaders } from '../firebaseSdkRuntime.ts'
import { createGameCloudRepository } from '../ninjaSkills/gameCloud.ts'
import type { GameHistoryRemote } from '../ninjaSkills/gameHistory.ts'

/** The authenticated family boundary for durable game detail. Keeping this
 * factory beside the family runtime prevents an iframe or child-facing screen
 * from acquiring credentials or choosing its own family scope. */
export function familyGameHistoryRepository(familyId: string, stillOwner: () => boolean): GameHistoryRemote {
  return createGameCloudRepository({
    projectId: firebaseConfig.projectId,
    familyId,
    token: getIdToken,
    appCheckHeaders: firebaseAppCheckHeaders,
    stillOwner,
  })
}
