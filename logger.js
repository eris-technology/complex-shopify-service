const winston = require('winston');

/**
 * Creates a Winston logger with Console and optional Sentry transports
 * 
 * Features:
 * - Console: Outputs ALL logs (debug, info, warn, error) to Docker logs
 * - Sentry: Only sends warn/error to Sentry via Sentry.captureException (when enabled)
 * - Structured: All logs include timestamp, level, service, and metadata
 * - Performance: Separate format for [PERFORMANCE] logs
 * 
 * @param {Object} options - Configuration options
 * @param {Object} options.Sentry - Initialized Sentry client (optional)
 */

const createLogger = (options = {}) => {
  const transports = [];
  const Sentry = options.Sentry || null;
  
  // Console transport - always enabled, captures everything
  transports.push(
    new winston.transports.Console({
      level: 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }), // Ensure stack traces are captured
        winston.format.printf(({ timestamp, level, message, stack, ...metadata }) => {
          // Format performance logs consistently
          if (metadata.type === 'performance') {
            return `[PERFORMANCE] ${timestamp} ${metadata.method} ${metadata.path} ${metadata.duration}ms ${metadata.status} ${metadata.statusText}`;
          }
          
          // Format other logs with metadata
          const levelUpper = level.toUpperCase();
          let output = `[${levelUpper}] ${timestamp}`;
          
          if (message) {
            output += ` ${message}`;
          }
          
          // Add metadata if present (excluding internal winston fields)
          const cleanMeta = { ...metadata };
          delete cleanMeta.level;
          delete cleanMeta.timestamp;
          delete cleanMeta.type;
          
          if (Object.keys(cleanMeta).length > 0) {
            output += ` ${JSON.stringify(cleanMeta, null, 2)}`;
          }
          
          // Add stack trace for errors
          if (stack) {
            output += `\n${stack}`;
          }
          
          return output;
        })
      )
    })
  );

  const logger = winston.createLogger({
    level: 'debug', // Capture everything, transports filter themselves
    transports,
  });

  // Custom handling for warn/error to send to Sentry
  if (Sentry) {
    const originalWarn = logger.warn.bind(logger);
    const originalError = logger.error.bind(logger);

    logger.warn = function(message, meta = {}) {
      originalWarn(message, meta);
      
      // Send warning to Sentry (wrapped in try-catch for safety)
      try {
        Sentry.withScope((scope) => {
          scope.setLevel('warning');
          scope.setContext('metadata', meta);
          Sentry.captureMessage(message || 'Warning', 'warning');
        });
      } catch (err) {
        // Silently fail - Sentry is not critical to application functionality
      }
    };

    logger.error = function(message, meta = {}) {
      originalError(message, meta);
      
      if (!Sentry) {
        return;
      }
      
      // Send error to Sentry (wrapped in try-catch for safety)
      try {
        Sentry.withScope((scope) => {
          scope.setLevel('error');
          
          // Handle complex error objects (Sequelize, Postgres, etc.)
          let errorToCapture = null;
          
          // Check if message itself is an Error object
          if (message instanceof Error) {
            errorToCapture = message;
            // Add metadata as extra context
            Object.keys(meta).forEach(key => {
              scope.setExtra(key, meta[key]);
            });
          }
          // Check if meta contains error/stack/original properties
          else if (meta.error || meta.stack || meta.original || meta.parent) {
            // Reconstruct or use existing error
            if (meta.error instanceof Error) {
              errorToCapture = meta.error;
            } else {
              errorToCapture = new Error(message || meta.message || 'Error');
              if (meta.stack) errorToCapture.stack = meta.stack;
            }
            
            // Add all metadata as extras for Sequelize errors
            Object.keys(meta).forEach(key => {
              if (key !== 'error' && key !== 'stack') {
                scope.setExtra(key, meta[key]);
              }
            });
            
            // Special handling for database errors
            if (meta.sql) {
              scope.setContext('sql', {
                query: meta.sql,
                parameters: meta.parameters,
                code: meta.code,
                detail: meta.detail,
                hint: meta.hint
              });
            }
          } else {
            // Simple message or metadata
            scope.setContext('metadata', meta);
          }
          
          // Capture to Sentry
          if (errorToCapture) {
            Sentry.captureException(errorToCapture);
          } else {
            Sentry.captureMessage(message || 'Error', 'error');
          }
        });
      } catch (err) {
        // Silently fail - Sentry is not critical to application functionality
        // Error is already logged to Winston above
      }
    };
  }

  // Add convenience method for performance logging
  logger.performance = (method, path, duration, status, statusText) => {
    logger.info('', {
      type: 'performance',
      method,
      path,
      duration,
      status,
      statusText,
    });
  };

  return logger;
};

// Export the factory function as default
module.exports = createLogger;

// Also export a default logger instance with Sentry auto-initialization for use in controllers
// This tries to load Sentry on its own if available
let defaultSentry = null;
try {
  defaultSentry = require("@sentry/node");
  // Check if Sentry is already initialized (it exports isInitialized but not always available)
  // We'll just try to use it - if not initialized, it will no-op
} catch (err) {
  // Sentry not available
}

module.exports.defaultLogger = createLogger({ Sentry: defaultSentry });
