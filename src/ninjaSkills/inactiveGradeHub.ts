import type { SupportedGrade } from '../config.ts'
import { SHARED_LEARNING_PATH_TITLES } from '../learningHub/activityNames.ts'
import type { LearningHubSection, LearningHubViewModel } from '../learningHub/contracts.ts'
import { learningModuleActivities } from './content.ts'
import type { LearningModuleLaunch } from './contracts.ts'
import { NINJA_SKILLS_PROFILES } from './profiles.ts'

function unavailableSection(
  id: string,
  number: string,
  title: string,
  subtitle: string,
  theme: LearningHubSection<LearningModuleLaunch>['theme'],
): LearningHubSection<LearningModuleLaunch> {
  return {
    id,
    number,
    kicker: 'Source onboarding required',
    title,
    subtitle,
    actionLabel: title,
    theme,
    available: false,
    unavailableReason:
      'This path will open after this grade’s authoritative Google source and lifecycle profile are reviewed.',
    cohorts: [],
    activities: [],
  }
}

export function inactiveGradeLearningHubView(
  grade: SupportedGrade,
  childName: string,
): LearningHubViewModel<LearningModuleLaunch> {
  const sourceReason = `The authoritative ${grade} Google source has not been connected and approved yet.`
  return {
    brandMark: grade === 'Kindergarten' ? '小' : grade.replace('Grade ', ''),
    brandLabel: 'Weekly Dictation',
    profileLabel: grade,
    eyebrow: `${grade} setup`,
    title: 'Your Ninja Skills are',
    titleAccent: `being prepared, ${childName}.`,
    introduction:
      'The learning modules are installed. They stay locked until their grade-owned curriculum source is validated.',
    heroTitle: 'Source first.',
    heroAccent: 'Practice safely.',
    heroDescription:
      'Weekly Dictation never invents meanings, Pinyin, sentences, or distractors when authoritative curriculum data is missing.',
    heroMark: '忍',
    sectionEyebrow: 'Grade learning paths',
    sectionTitle: 'What is ready?',
    sectionHint: 'Source onboarding in progress',
    sections: [
      unavailableSection('dojo', '1', SHARED_LEARNING_PATH_TITLES.dojo, sourceReason, 'gold'),
      {
        id: 'ninja-skills',
        number: '2',
        kicker: 'Learning modules installed',
        title: SHARED_LEARNING_PATH_TITLES.ninjaSkills,
        subtitle: 'Review the six modules and the authoritative data each one still needs.',
        detailTitle: 'Practice your Ninja Skills',
        detailSubtitle: sourceReason,
        actionLabel: 'View learning modules',
        theme: 'blue',
        available: true,
        unavailableReason: sourceReason,
        cohorts: [],
        activities: learningModuleActivities(null, NINJA_SKILLS_PROFILES[grade], (pack) => ({
          kind: 'learning-module',
          pack,
        })),
      },
      unavailableSection('final-boss', '3', SHARED_LEARNING_PATH_TITLES.finalBoss, sourceReason, 'violet'),
      unavailableSection('spirit-realm', '4', SHARED_LEARNING_PATH_TITLES.spiritRealm, sourceReason, 'green'),
    ],
  }
}
