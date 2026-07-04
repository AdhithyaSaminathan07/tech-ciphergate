const { z } = require('zod');

const applyLeaveSchema = z.object({
  body: z.object({
    workerId: z.string().optional(),
    leaveType: z.string().min(1, "Leave Type is required"),
    startDate: z.string().min(1, "Start Date is required"),
    endDate: z.string().min(1, "End Date is required"),
    reason: z.string().min(1, "Reason is required"),
    subdomain: z.string().min(1, "Subdomain is required"),
    totalDays: z.any().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    status: z.enum(['Pending', 'Approved', 'Rejected']).optional(),
  }).strip(),
});

const updateLeaveStatusSchema = z.object({
  body: z.object({
    status: z.enum(['Pending', 'Approved', 'Rejected']),
    rejectionReason: z.string().optional(),
  }).strip(),
});

module.exports = {
  applyLeaveSchema,
  updateLeaveStatusSchema,
};
