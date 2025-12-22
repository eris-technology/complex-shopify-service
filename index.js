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
  Sentry = require("@sentry/node");
  
  Sentry.init({ 
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    
    // Performance Monitoring
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE) || 0.1,
    
    // Enhanced integrations for better error tracking and breadcrumbs
    integrations: [
      new Sentry.Integrations.Http({ tracing: true, breadcrumbs: true }),
      new Sentry.Integrations.Console(),
      new Sentry.Integrations.OnUncaughtException(),
      new Sentry.Integrations.OnUnhandledRejection(),
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
    
    enableLogs: true,
  });
  
  console.log('✓ Sentry monitoring enabled for shopify-service');
}

// Import models first to ensure they're registered with Sequelize
require('./models');

const { initializeDatabase, performanceLogger } = require('complex-common-utils');
const { initializeRedis } = require('./utils/cache');

const app = express();

// Sentry request handler - MUST be first middleware
if (Sentry) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

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
  sentryEnabled: !!Sentry
}));

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

// Sentry error handler - MUST be after routes but before custom error handlers
if (Sentry) {
  app.use(Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Capture all errors with status code >= 400
      return true;
    },
  }));
}

// Error handling middleware (must be after Sentry error handler)
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    
    const statusCode = err.statusCode || 500;
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
