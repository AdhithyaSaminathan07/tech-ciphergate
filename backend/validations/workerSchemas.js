const { z } = require('zod');

const createWorkerSchema = z.object({
  body: z.object({
    username: z.string().min(1, "Username is required"),
    email: z.string().email("Invalid email format"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    name: z.string().min(1, "Name is required"),
    rfid: z.string().optional(),
    department: z.string().optional(),
    designation: z.string().optional(),
    salary: z.union([z.string(), z.number()]).optional(),
  }).strip(),
});

const updateWorkerSchema = z.object({
  body: z.object({
    username: z.string().optional(),
    email: z.string().email("Invalid email format").optional(),
    name: z.string().optional(),
    rfid: z.string().optional(),
    department: z.string().optional(),
    designation: z.string().optional(),
    salary: z.union([z.string(), z.number()]).optional(),
    status: z.enum(['Active', 'Inactive', 'Suspended']).optional(),
  }).strip(),
});

module.exports = {
  createWorkerSchema,
  updateWorkerSchema,
};
