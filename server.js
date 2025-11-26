const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet()); // Adds security headers
app.use(bodyParser.json());

// Rate limiting - max 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/bot', limiter);
app.use('/command', limiter);

const PORT = process.env.PORT || 3000;

// ========================
// SECURITY: Request Verification
// ========================
function verifyCliqRequest(req, res, next) {
  // Zoho Cliq sends a signature in headers for verification
  const cliqSignature = req.headers['x-catalyst-signature'];
  const cliqAppKey = process.env.CLIQ_APP_KEY;
  
  if (!cliqAppKey) {
    console.error('CLIQ_APP_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  // For development: You can temporarily skip verification
  // Remove this block in production!
  if (process.env.NODE_ENV === 'development' && !cliqSignature) {
    console.warn('Development mode: Skipping signature verification');
    return next();
  }
  
  // Verify signature
  if (!cliqSignature) {
    console.error('No signature in request');
    return res.status(401).json({ error: 'Unauthorized: Missing signature' });
  }
  
  // Create expected signature
  const requestBody = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', cliqAppKey)
    .update(requestBody)
    .digest('hex');
  
  if (cliqSignature !== expectedSignature) {
    console.error('Invalid signature');
    return res.status(401).json({ error: 'Unauthorized: Invalid signature' });
  }
  
  console.log('Request verified from Zoho Cliq');
  next();
}

// ========================
// SECURITY: Input Sanitization
// ========================
function sanitizeInput(text) {
  if (!text || typeof text !== 'string') return '';
  
  // Remove potentially harmful characters
  return text
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .trim()
    .substring(0, 1000); // Limit length to prevent overflow attacks
}

// ========================
// ENDPOINTS
// ========================

// Health check (no verification needed)
app.get('/', (req, res) => {
  res.json({ 
    status: 'running',
    version: '1.0.0',
    security: 'enabled'
  });
});

// Bot message handler (with verification)
app.post('/bot', verifyCliqRequest, async (req, res) => {
  try {
    console.log('Bot message received');
    
    // Extract and sanitize user input
    const userMessage = sanitizeInput(req.body.text || '');
    const userId = req.body.user?.id || 'unknown';
    const userName = sanitizeInput(req.body.user?.name || 'User');
    
    // Log for security audit
    console.log(`User: ${userId} | Message: ${userMessage.substring(0, 50)}...`);
    
    // Validate input
    if (!userMessage) {
      return res.json({
        text: 'Please provide a message.'
      });
    }
    
    if (userMessage.length < 3) {
      return res.json({
        text: 'Message too short. Please describe what you want to schedule.'
      });
    }
    
    // Simple test response (AI logic will be added later)
    res.json({
      text: `Secure message received from ${userName}!\n\nYou said: "${userMessage}"\n\nAll security checks passed.`
    });
    
  } catch (error) {
    console.error('Error in bot handler:', error);
    res.status(500).json({
      text: 'An error occurred. Please try again.'
    });
  }
});

// Command handler (with verification)
app.post('/command', verifyCliqRequest, async (req, res) => {
  try {
    console.log('Command received');
    
    const userId = req.body.user?.id || 'unknown';
    console.log(`User: ${userId} | Command executed`);
    
    res.json({
      text: 'Command handler working securely!'
    });
    
  } catch (error) {
    console.error('Error in command handler:', error);
    res.status(500).json({
      text: 'An error occurred. Please try again.'
    });
  }
});

// 404 handler
app.use((req, res) => {
  console.warn(`404: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n Secure Server Running`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Security: ENABLED `);
  console.log(`   Rate Limiting: ENABLED `);
  console.log(`\n Make sure to set CLIQ_APP_KEY in .env file\n`);
});
