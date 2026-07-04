const { z } = require('zod');

// We use .strip() on the body to ignore extra fields for backward compatibility
// while still strictly enforcing the types and presence of required fields.

const passwordComplexity = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, "Password must contain uppercase, lowercase, number and special character");

const registerAdminSchema = z.object({
  body: z.object({
    username: z.string().min(3, "Username must be at least 3 characters").max(50),
    email: z.string().email("Invalid email format"),
    password: passwordComplexity,
    subdomain: z.string().min(5, "Subdomain must be at least 5 characters").regex(/^[a-zA-Z0-9-]+$/, "Subdomain can only contain letters, numbers, and hyphens"),
  }).strip(),
});

const loginAdminSchema = z.object({
  body: z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
  }).strip(),
});

const loginWorkerSchema = z.object({
  body: z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
    subdomain: z.string().min(1, "Subdomain is required"),
  }).strip(),
});

const passwordResetOtpSchema = z.object({
  body: z.object({
    subdomain: z.string().min(1, "Subdomain is required"),
  }).strip(),
});

const resetPasswordWithOtpSchema = z.object({
  body: z.object({
    subdomain: z.string().min(1, "Subdomain is required"),
    otp: z.string().length(6, "OTP must be exactly 6 digits"),
    password: passwordComplexity,
  }).strip(),
});

module.exports = {
  registerAdminSchema,
  loginAdminSchema,
  loginWorkerSchema,
  passwordResetOtpSchema,
  resetPasswordWithOtpSchema,
};
