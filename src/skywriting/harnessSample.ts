export type SkyWritingHarnessGrade = 'Kindergarten' | 'Grade 2' | 'Grade 5'

export type SkyWritingHarnessTarget = {
  id: string
  text: string
  grade: SkyWritingHarnessGrade
  sourceFixture: string
  sourceUnit: string
}

export const skyWritingCrossGradeSample: SkyWritingHarnessTarget[] = [
  { id: 'kindergarten-week-3-one', text: '一', grade: 'Kindergarten', sourceFixture: 'kindergarten-workbook.json', sourceUnit: 'Week 3 08/31' },
  { id: 'grade-2-week-1-school', text: '学校', grade: 'Grade 2', sourceFixture: 'grade2-presentation.json', sourceUnit: 'Week 8/31-9/4' },
  { id: 'grade-5-week-4-need', text: '需要', grade: 'Grade 5', sourceFixture: 'grade5-presentation.json', sourceUnit: 'Week 4 (8/31-9/4)' },
  { id: 'kindergarten-week-4-heart', text: '心', grade: 'Kindergarten', sourceFixture: 'kindergarten-workbook.json', sourceUnit: 'Week 4 09/08' },
  { id: 'grade-2-week-2-america', text: '美国', grade: 'Grade 2', sourceFixture: 'grade2-presentation.json', sourceUnit: 'Week 9/8-9/11' },
  { id: 'grade-5-week-5-absorb', text: '吸收', grade: 'Grade 5', sourceFixture: 'grade5-presentation.json', sourceUnit: 'Week 5 (9/8-11)' },
  { id: 'kindergarten-week-5-water', text: '水', grade: 'Kindergarten', sourceFixture: 'kindergarten-workbook.json', sourceUnit: 'Week 5 09/14' },
  { id: 'grade-2-week-4-convenient', text: '方便', grade: 'Grade 2', sourceFixture: 'grade2-presentation.json', sourceUnit: 'Week 9/21-9/25' },
  { id: 'grade-5-week-4-many-kinds', text: '各种各样', grade: 'Grade 5', sourceFixture: 'grade5-presentation.json', sourceUnit: 'Week 4 (8/31-9/4)' },
  { id: 'grade-2-week-3-exercise', text: '运动', grade: 'Grade 2', sourceFixture: 'grade2-presentation.json', sourceUnit: 'Week 9/14-9/18' },
]

export const skyWritingHarnessGrades: SkyWritingHarnessGrade[] = ['Kindergarten', 'Grade 2', 'Grade 5']
