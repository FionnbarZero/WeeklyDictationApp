export function isFamilyActivityContext(context: {
  enabled: boolean
  pageRole?: string
  embedded: boolean
  requested: boolean
  parentRole?: string
}) {
  return (
    context.enabled &&
    (context.pageRole === 'family' ||
      (context.pageRole === 'activity' && context.embedded && context.requested && context.parentRole === 'family'))
  )
}
