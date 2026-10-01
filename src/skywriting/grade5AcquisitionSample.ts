export type Grade5SkyWritingAcquisitionTarget = {
  id: string
  text: string
  prototypeSentence: string
  sourceFixture: 'grade5-presentation.json'
  sourceUnit: string
}

export const grade5SkyWritingAcquisitionSample: Grade5SkyWritingAcquisitionTarget[] = [
  { id: 'grade-5-week-5-need', text: '需要', prototypeSentence: '植物需要阳光和水。', sourceFixture: 'grade5-presentation.json', sourceUnit: 'Week 5 (9/8-11)' },
  { id: 'grade-5-week-6-absorb', text: '吸收', prototypeSentence: '植物的根从土壤里吸收水分。', sourceFixture: 'grade5-presentation.json', sourceUnit: 'Week 6 (9/14-18)' },
  { id: 'grade-5-week-5-many-kinds', text: '各种各样', prototypeSentence: '海洋里生活着各种各样的动物。', sourceFixture: 'grade5-presentation.json', sourceUnit: 'Week 5 (9/8-11)' },
]

export function grade5SkyWritingAcquisitionAudioSequence(target: Grade5SkyWritingAcquisitionTarget) {
  return [target.text, target.prototypeSentence, target.text, target.text]
}
