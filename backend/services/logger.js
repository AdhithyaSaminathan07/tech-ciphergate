const winston = require('winston');
const path = require('path');

// Configure Winston logger for structured audit logging
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json() // Structured JSON logs
  ),
  defaultMeta: { service: 'ciphergate-audit' },
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, '../logs/error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(__dirname, '../logs/audit.log') })
  ],
});

// Add console logging for non-production environments
if (process.env.NODE_ENV !== 'production') {
  auditLogger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

/**
 * Log an audit event
 * @param {Object} params - Audit log parameters
 * @param {string} params.action - Action performed (e.g., 'LOGIN', 'UPDATE_SALARY')
 * @param {Object} params.actor - User performing the action (should include _id and role)
 * @param {string} params.outcome - Outcome of the action ('SUCCESS', 'FAILURE')
 * @param {string} [params.ip] - IP address of the request
 * @param {string} [params.correlationId] - ID connecting related requests
 * @param {Object} [params.details] - Additional non-sensitive context
 */
const logAudit = ({ action, actor, outcome, ip, correlationId, details = {} }) => {
  // Ensure we NEVER log passwords, tokens, full salaries, or RFIDs in the details
  const sanitizedDetails = { ...details };
  delete sanitizedDetails.password;
  delete sanitizedDetails.token;
  delete sanitizedDetails.rfid;
  
  if (sanitizedDetails.salary) sanitizedDetails.salary = '***';
  if (sanitizedDetails.finalSalary) sanitizedDetails.finalSalary = '***';

  auditLogger.info({
    event: 'AUDIT',
    action,
    actorId: actor?._id || 'unknown',
    actorRole: actor?.role || 'unknown',
    outcome,
    ip: ip || 'unknown',
    correlationId: correlationId || 'none',
    details: sanitizedDetails
  });
};

module.exports = { auditLogger, logAudit };
