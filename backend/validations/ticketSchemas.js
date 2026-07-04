const { z } = require('zod');

// We use .strip() to safely discard undocumented or legacy fields
const createTicketSchema = z.object({
  body: z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional().nullable(),
    assignee: z.string().optional().nullable(),
    assignees: z.array(z.string()).optional(),
    team: z.string().optional().nullable(),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
    status: z.enum(['To Do', 'In Progress', 'Review', 'Done']).optional(),
    issueType: z.enum(['Task', 'Bug', 'Enhancement']).optional(),
    storyPoints: z.union([z.string(), z.number()]).optional().nullable(),
    labels: z.array(z.string()).optional(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    subdomain: z.string().optional(),
    tempId: z.string().optional(),
    checklist: z.array(z.any()).optional()
  }).strip()
});

const updateTicketSchema = z.object({
  body: z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    assignee: z.string().optional().nullable(),
    assignees: z.array(z.string()).optional(),
    team: z.string().optional().nullable(),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
    status: z.enum(['To Do', 'In Progress', 'Review', 'Done']).optional(),
    issueType: z.enum(['Task', 'Bug', 'Enhancement']).optional(),
    storyPoints: z.union([z.string(), z.number()]).optional().nullable(),
    labels: z.array(z.string()).optional(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    subdomain: z.string().optional(),
    feedback: z.string().optional().nullable(),
    workerQuery: z.string().optional().nullable(),
    checklist: z.array(z.any()).optional()
  }).strip()
});

module.exports = {
  createTicketSchema,
  updateTicketSchema
};
