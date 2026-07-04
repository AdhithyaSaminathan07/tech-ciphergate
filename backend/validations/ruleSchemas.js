const { z } = require('zod');

const createRuleSchema = z.object({
  body: z.object({
    title: z.string().min(1, "Title is required"),
    category: z.string().min(1, "Category is required"),
    content: z.string().min(1, "Content is required"),
    severity: z.string().optional(),
    changeLog: z.string().optional(),
    isMajor: z.union([z.string(), z.boolean()]).optional(),
  }).strip()
});

const updateRuleSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    category: z.string().optional(),
    content: z.string().optional(),
    severity: z.string().optional(),
    changeLog: z.string().optional(),
    isMajor: z.union([z.string(), z.boolean()]).optional(),
  }).strip()
});

const updateRulesConfigSchema = z.object({
  body: z.object({
    forceAcceptance: z.boolean().optional(),
    scrollValidation: z.boolean().optional(),
    allowPdfDownload: z.boolean().optional(),
    requireCheckbox: z.boolean().optional(),
    autoNotify: z.boolean().optional(),
    gracePeriodDays: z.number().min(0).optional(),
    mobileAcceptance: z.boolean().optional(),
  }).strip()
});

module.exports = {
  createRuleSchema,
  updateRuleSchema,
  updateRulesConfigSchema
};
