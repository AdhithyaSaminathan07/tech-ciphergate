const { z } = require('zod');

const generateSalarySchema = z.object({
  body: z.object({
    subdomain: z.string().min(1, "Subdomain is required"),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000).max(2100),
  }).strip(),
});

const updateSalarySchema = z.object({
  body: z.object({
    baseSalary: z.union([z.string(), z.number()]).optional(),
    bonus: z.union([z.string(), z.number()]).optional(),
    deductions: z.union([z.string(), z.number()]).optional(),
  }).strip(),
});

module.exports = {
  generateSalarySchema,
  updateSalarySchema,
};
