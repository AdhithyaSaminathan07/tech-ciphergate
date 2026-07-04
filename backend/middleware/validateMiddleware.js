const asyncHandler = require('express-async-handler');

/**
 * Validates request payload against a Zod schema.
 * Respects the ENABLE_ZOD_VALIDATION feature flag.
 * 
 * @param {import('zod').ZodSchema} schema - The Zod schema to validate against
 */
const validateRequest = (schema) => {
  return asyncHandler(async (req, res, next) => {
    // Feature Flag: If validation is disabled, proceed without validating
    if (process.env.ENABLE_ZOD_VALIDATION === 'false') {
      return next();
    }

    try {
      // Validate and automatically strip unknown fields
      const validatedData = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Override the request objects with the sanitized data
      req.body = validatedData.body || req.body;
      req.query = validatedData.query || req.query;
      req.params = validatedData.params || req.params;

      next();
    } catch (error) {
      if (error.name === 'ZodError') {
        const errors = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));
        
        return res.status(400).json({
          message: 'Invalid request data',
          errors,
        });
      }
      next(error);
    }
  });
};

module.exports = { validateRequest };
