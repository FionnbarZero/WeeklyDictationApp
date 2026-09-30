/**
 * Temporary, source-shaped curriculum data for the development-only Tier 2
 * reading lab. Production curriculum must continue to come from the registered
 * grade adapters; this manifest exists only until the lab can exercise those
 * importers directly.
 */
export type Tier2PrototypeGrade = 'Kindergarten' | 'Grade 2' | 'Grade 5'

export type Tier2PrototypeCycle = {
  readonly id: string
  readonly startDate: string
  readonly endDate: string
  readonly tier1Terms: readonly string[]
  readonly tier2Terms: readonly string[]
  readonly sourceReference: string
}

export const TIER2_PROTOTYPE_CURRICULUM: Record<
  Tier2PrototypeGrade,
  readonly Tier2PrototypeCycle[]
> = {
  Kindergarten: [
    {
      id: 'kindergarten-smoke-w1',
      startDate: '2026-08-31',
      endDate: '2026-09-06',
      tier1Terms: ['一', '二', '三', '人'],
      tier2Terms: ['爸爸', '妈妈', '小'],
      sourceReference: 'Kindergarten workbook · Week 3 08/31',
    },
    {
      id: 'kindergarten-smoke-w2',
      startDate: '2026-09-07',
      endDate: '2026-09-13',
      tier1Terms: ['四', '五', '六', '心'],
      tier2Terms: ['我', '开心'],
      sourceReference: 'Kindergarten workbook · Week 4 09/08',
    },
    {
      id: 'kindergarten-smoke-w3',
      startDate: '2026-09-14',
      endDate: '2026-09-20',
      tier1Terms: ['七', '八', '水'],
      tier2Terms: ['有', '没有'],
      sourceReference: 'Kindergarten workbook · Week 5 09/14',
    },
    {
      id: 'kindergarten-smoke-w4',
      startDate: '2026-09-21',
      endDate: '2026-09-27',
      tier1Terms: ['九', '十', '白'],
      tier2Terms: ['红色', '蓝色'],
      sourceReference: 'Kindergarten workbook · Week 6 09/21',
    },
  ],
  'Grade 2': [
    {
      id: 'grade2-smoke-w1',
      startDate: '2026-08-31',
      endDate: '2026-09-04',
      tier1Terms: ['很短', '也', '笑', '学校', '说'],
      tier2Terms: ['爱心', '难过'],
      sourceReference: 'Grade 2 deck · Week 8/31–9/4',
    },
    {
      id: 'grade2-smoke-w2',
      startDate: '2026-09-07',
      endDate: '2026-09-11',
      tier1Terms: ['美国', '带', '路', '到', '都'],
      tier2Terms: ['帮助', '找'],
      sourceReference: 'Grade 2 deck · Week 9/8–9/11',
    },
    {
      id: 'grade2-smoke-w3',
      startDate: '2026-09-14',
      endDate: '2026-09-18',
      tier1Terms: ['出生', '但是', '运动', '地方', '不同'],
      tier2Terms: ['身体', '手'],
      sourceReference: 'Grade 2 deck · Week 9/14–9/18',
    },
    {
      id: 'grade2-smoke-w4',
      startDate: '2026-09-21',
      endDate: '2026-09-25',
      tier1Terms: ['比如', '部分', '更', '方便', '美好'],
      tier2Terms: ['城市', '上班', '公园', '图书馆', '散步', '漂亮', '各种各样的'],
      sourceReference: 'Grade 2 deck · Week 9/21–9/25 · prototype correction',
    },
  ],
  'Grade 5': [
    {
      id: 'grade5-smoke-w1',
      startDate: '2026-08-31',
      endDate: '2026-09-04',
      tier1Terms: ['需要', '部分', '重要', '开始', '各种各样'],
      tier2Terms: ['海洋', '阳光', '鲨鱼', '天敌', '生存'],
      sourceReference: 'Grade 5 deck · Week 4 coming-next-week vocabulary',
    },
    {
      id: 'grade5-smoke-w2',
      startDate: '2026-09-07',
      endDate: '2026-09-11',
      tier1Terms: ['怎样', '吸收', '通过', '像', '如果'],
      tier2Terms: ['空气', '根', '帮助', '植物', '食物', '得到', '关', '打开'],
      sourceReference: 'Grade 5 deck · Week 5 coming-next-week vocabulary',
    },
    {
      id: 'grade5-smoke-w3',
      startDate: '2026-09-14',
      endDate: '2026-09-18',
      tier1Terms: ['或者', '了解', '完', '兴奋的', '告诉'],
      tier2Terms: ['提醒', '沟通', '快速地', '有意思', '年长的', '并且', '表达', '碰'],
      sourceReference: 'Grade 5 deck · Week 6 coming-next-week vocabulary',
    },
    {
      id: 'grade5-smoke-w4',
      startDate: '2026-09-21',
      endDate: '2026-09-25',
      tier1Terms: ['盐', '咸', '层', '用处', '神奇的'],
      tier2Terms: ['河流', '躺', '留', '不断地', '美味的', '刷牙', '洒', '沉', '浮'],
      sourceReference: 'Grade 5 deck · Week 7 coming-next-week vocabulary',
    },
  ],
}
