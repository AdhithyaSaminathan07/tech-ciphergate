const { z } = require('zod');

const bankDetailsSchema = z.object({
  accountHolderName: z.string().or(z.literal("")).nullable().optional(),
  bankName: z.string().or(z.literal("")).nullable().optional(),
  accountNumber: z.string().or(z.literal("")).nullable().optional(),
  ifscCode: z.string().or(z.literal("")).nullable().optional(),
  branchName: z.string().or(z.literal("")).nullable().optional(),
  upiId: z.string().or(z.literal("")).nullable().optional(),
}).nullable().optional();

const createWorkerSchema = z.object({
  body: z.object({
    username: z.string().min(1, "Username is required"),
    email: z.string().email("Invalid email format").or(z.literal("")).nullable().optional(),
    password: z.string().min(6, "Password must be at least 6 characters"),
    name: z.string().min(1, "Name is required"),
    rfid: z.string().optional(),
    subdomain: z.string().min(1, "Subdomain is required"),
    department: z.string().optional(),
    designation: z.string().or(z.literal("")).nullable().optional(),
    salary: z.union([z.string(), z.number()]).optional(),
    batch: z.string().or(z.literal("")).nullable().optional(),
    photo: z.string().or(z.literal("")).nullable().optional(),
    faceEmbeddings: z.array(z.array(z.number())).nullable().optional(),
    employeeType: z.enum(['intern', 'intern_with_stphen', 'employee', 'developer']).or(z.literal("")).nullable().optional(),
    class: z.enum(['A', 'B', 'C']).or(z.literal("")).nullable().optional(),
    phoneNumber: z.string().or(z.literal("")).nullable().optional(),
    joiningDate: z.union([z.string(), z.date()]).nullable().optional(),
    original_certificate_status: z.enum(['not_submitted', 'submitted', 'returned']).or(z.literal("")).nullable().optional(),
    certificate_notes: z.string().or(z.literal("")).nullable().optional(),
    bankDetails: bankDetailsSchema,
  }).strip(),
});

const updateWorkerSchema = z.object({
  body: z.object({
    username: z.string().optional(),
    email: z.string().email("Invalid email format").or(z.literal("")).nullable().optional(),
    password: z.string().min(6, "Password must be at least 6 characters").or(z.literal("")).nullable().optional(),
    name: z.string().optional(),
    rfid: z.string().optional(),
    subdomain: z.string().optional(),
    department: z.string().optional(),
    designation: z.string().or(z.literal("")).nullable().optional(),
    salary: z.union([z.string(), z.number()]).optional(),
    status: z.enum(['Active', 'Relieved', 'Deleted']).optional(),
    batch: z.string().or(z.literal("")).nullable().optional(),
    photo: z.string().or(z.literal("")).nullable().optional(),
    faceEmbeddings: z.array(z.array(z.number())).nullable().optional(),
    employeeType: z.enum(['intern', 'intern_with_stphen', 'employee', 'developer']).or(z.literal("")).nullable().optional(),
    class: z.enum(['A', 'B', 'C']).or(z.literal("")).nullable().optional(),
    phoneNumber: z.string().or(z.literal("")).nullable().optional(),
    joiningDate: z.union([z.string(), z.date()]).nullable().optional(),
    original_certificate_status: z.enum(['not_submitted', 'submitted', 'returned']).or(z.literal("")).nullable().optional(),
    certificate_notes: z.string().or(z.literal("")).nullable().optional(),
    bankDetails: bankDetailsSchema,
  }).strip(),
});

module.exports = {
  createWorkerSchema,
  updateWorkerSchema,
};
