/** This interaction policy is opt-in until the owner accepts the working prototype.
 * It never migrates, deletes, or weakens access to existing family records. */
export const regressionPreview = import.meta.env?.VITE_REGRESSION_REPAIR_PREVIEW === 'true'
