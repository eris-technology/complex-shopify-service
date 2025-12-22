const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
require('dotenv').config();

// Sentry initialization - MUST be first, before any other requires
let Sentry;
if (process.env.ENABLE_SENTRY === 'TRUE' || process.env.ENABLE_SENTRY === 'true') {
  try {
    Sentry = require("@sentry/node");
    
    Sentry.init({ 
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      release: 'shopify-service@1.0.0',
      
      // Performance Monitoring
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
      profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE) || 0.1,
      
      // Enhanced integrations for better error tracking and breadcrumbs
      integrations: [
        Sentry.httpIntegration({ tracing: true, breadcrumbs: true }),
        Sentry.expressIntegration(),
      ],
      
      // Dynamic sampling - always capture slow transactions
      tracesSampler: (samplingContext) => {
        const parentSampled = samplingContext.parentSampled;
        if (parentSampled !== undefined) {
          return parentSampled;
        }
        return parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1;
      },
      
      // Enrich error events with service metadata - this sets the Issue title
      beforeSend(event, hint) {
        // Set server_name which appears in Sentry Issues
        event.server_name = 'shopify-service';
        event.tags = { ...event.tags, service: 'shopify-service' };
        return event;
      },
      
      beforeSendTransaction(event) {
        const duration = (event.timestamp - event.start_timestamp) * 1000; // Convert to ms
        if (duration > 1000) {
          event.tags = { ...event.tags, slow_transaction: 'true' };
        }
        return event;
      },
    });
    
    console.log('✓ Sentry monitoring enabled for shopify-service');
  } catch (err) {
    console.error('⚠ Sentry initialization failed - continuing without error monitoring:', err.message);
    Sentry = null;
  }
}

// Initialize logger AFTER Sentry, passing the Sentry instance
const createLogger = require('./logger');
const logger = createLogger({ Sentry });

if (Sentry) {
  logger.info('✓ Sentry monitoring enabled for shopify-service');
}

// Import models first to ensure they're registered with Sequelize
require('./models');

const { initializeDatabase, performanceLogger } = require('complex-common-utils');
const { initializeRedis } = require('./utils/cache');

const app = express();

// Load Swagger document
const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Swagger UI (before morgan to avoid logging these requests)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Morgan logger - placed after Swagger to skip its requests, skip health checks
app.use(morgan('dev', {
    skip: (req, res) => req.path === '/health'
}));

// Performance logging middleware (integrates with Sentry when enabled)
app.use(performanceLogger({
  excludePaths: ['/health', '/api-docs'],
  slowThreshold: 1000,
  sentryEnabled: !!Sentry,
  winstonLogger: logger
}));

// Response logging middleware - systematically logs all 4xx/5xx responses
app.use((req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;
  
  let responseBody = null;
  
  res.send = function(data) {
    responseBody = data;
    return originalSend.call(this, data);
  };
  
  res.json = function(data) {
    responseBody = data;
    return originalJson.call(this, data);
  };
  
  res.on('finish', () => {
    const statusCode = res.statusCode;
    
    // Log warnings for 4xx client errors
    if (statusCode >= 400 && statusCode < 500) {
      logger.warn(`Client error response: ${req.method} ${req.originalUrl || req.url}`, {
        statusCode,
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: req.get('user-agent'),
        ip: req.ip,
        responseBody: typeof responseBody === 'string' ? responseBody.substring(0, 500) : responseBody,
        query: req.query,
        params: req.params
      });
    }
    
    // Log errors for 5xx server errors
    if (statusCode >= 500) {
      logger.error(`Server error response: ${req.method} ${req.originalUrl || req.url}`, {
        statusCode,
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: req.get('user-agent'),
        ip: req.ip,
        responseBody: typeof responseBody === 'string' ? responseBody.substring(0, 500) : responseBody,
        query: req.query,
        params: req.params,
        body: req.body
      });
    }
  });
  
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'complex-shopify-service'
    });
});

// API Routes
app.use('/api', require('./routes'));

// Default route
app.get('/', (req, res) => {
    res.json({
        message: 'Complex Shopify Service API',
        version: '1.0.0',
        documentation: '/api-docs'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || err.status || 500;
    
    // Log the full error object to capture all properties (Sequelize errors, etc.)
    logger.error(err.message || 'Error occurred', {
        error: err,
        message: err.message,
        stack: err.stack,
        statusCode,
        method: req.method,
        url: req.originalUrl || req.url,
        query: req.query,
        params: req.params,
        body: req.body,
        // Sequelize/Database error properties
        sql: err.sql,
        parameters: err.parameters,
        parent: err.parent,
        original: err.original,
    });
    
    res.status(statusCode).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        await initializeDatabase();
        await initializeRedis();
        
        app.listen(PORT, () => {
            console.log(`Complex Shopify Service running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV}`);
            console.log(`API Documentation: http://localhost:${PORT}/api-docs`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Only start the server if this file is run directly
if (require.main === module) {
    startServer();
}

// Export for testing
module.exports = { app, startServer };
