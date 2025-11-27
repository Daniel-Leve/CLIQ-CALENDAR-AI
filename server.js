const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const perplexityAgent = require('./services/perplexityAgent');
const googleCalendar = require('./services/googleCalendar');
const userManager = require('./db/userManager');
const cliqCards = require('./services/cliqCards');
require('dotenv').config();

const app = express();

app.set('trust proxy', 1); 
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


// OAuth: Start Google Calendar connection
app.get('/connect-calendar', (req, res) => {
  const userId = req.query.user_id || 'demo_user';
  const authUrl = googleCalendar.getAuthUrl(userId);
  
  res.redirect(authUrl);
});

// OAuth: Google callback
app.get('/oauth/callback', async (req, res) => {
  const { code, state } = req.query;
  const userId = state || 'demo_user';
  
  if (!code) {
    return res.send('❌ Authorization failed. No code received.');
  }
  
  const result = await googleCalendar.exchangeCodeForTokens(code);
  
  if (result.success) {
    userManager.saveUserTokens(userId, result.tokens);
    
    res.send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>✅ Calendar Connected Successfully!</h1>
          <p>You can now close this window and return to Zoho Cliq.</p>
          <p>Try: "Schedule meeting tomorrow at 3 PM"</p>
        </body>
      </html>
    `);
  } else {
    res.send(`❌ Failed to connect: ${result.error}`);
  }
});


// Bot message handler (with verification)
// Bot message handler (with AI integration)
// Bot message handler (with AI + Google Calendar integration)
app.post('/bot', verifyCliqRequest, async (req, res) => {
  try {
    console.log('📨 Bot message received');
    
    // Extract and sanitize user input
    const userMessage = sanitizeInput(req.body.text || '');
    const userId = req.body.user?.id || req.body.user?.email || 'test_user'; // Use test_user as fallback
    const userName = sanitizeInput(req.body.user?.name || 'User');
    
    console.log(`👤 User: ${userId} | Message: ${userMessage.substring(0, 50)}...`);
    
    // Validate input
    if (!userMessage || userMessage.length < 3) {
      return res.json({
        text: '⚠️ Please provide a message. Example: "Schedule meeting tomorrow at 3 PM"'
      });
    }

    // ========================================
    // CHECK IF USER HAS CONNECTED CALENDAR
    // ========================================
    
    const isConnected = userManager.isUserConnected(userId);
    
    if (!isConnected) {
      const connectUrl = `${process.env.NGROK_URL}/connect-calendar?user_id=${userId}`;
      
      return res.json({
        text: `🔗 Please connect your Google Calendar first!\n\n` +
              `Click here to connect: ${connectUrl}\n\n` +
              `After connecting, try your request again.`
      });
    }

    // ========================================
    // 🧠 AI PROCESSING WITH PERPLEXITY
    // ========================================
    
    console.log('🤖 Processing with Perplexity AI...');
    
    const userContext = {
      timezone: 'Asia/Kolkata',
      workHours: '09:00-18:00'
    };
    
    const aiResult = await perplexityAgent.extractEventDetails(userMessage, userContext);
    
    if (!aiResult.success) {
      return res.json({
        text: `❌ I couldn't understand that. Please try:\n\n` +
              `• "Schedule meeting with team tomorrow at 3 PM"\n` +
              `• "Block 2 hours Friday afternoon for project work"\n` +
              `• "Remind me to submit report by next Monday"`
      });
    }
    
    const event = aiResult.event;
    
    // ========================================
    // 📅 CHECK CALENDAR AVAILABILITY
    // ========================================
    
    console.log('📅 Checking calendar availability...');
    
    const userTokens = userManager.getUserTokens(userId);
    const endTime = calculateEndTime(event.time, event.duration);
    
    const availabilityCheck = await googleCalendar.checkAvailability(
      userTokens,
      event.date,
      event.time,
      endTime
    );
    
    if (!availabilityCheck.success) {
      return res.json({
        text: `⚠️ Could not check calendar: ${availabilityCheck.error}`
      });
    }
    
    // ========================================
    // ⚠️ HANDLE CONFLICTS
    // ========================================
    
    if (!availabilityCheck.available) {
      return res.json({
        text: `⚠️ **Time Slot Conflict!**\n\n` +
              `You already have something scheduled at ${event.time} on ${formatDate(event.date)}.\n\n` +
              `Busy slots:\n` +
              availabilityCheck.busySlots.map(slot => 
                `• ${new Date(slot.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ` +
                `${new Date(slot.end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
              ).join('\n') +
              `\n\nWould you like to:\n` +
              `1. Choose a different time\n` +
              `2. Override and schedule anyway`
      });
    }
    
    // ========================================
    // ✅ CREATE CALENDAR EVENT
    // ========================================
    
    console.log('📤 Creating calendar event...');
    
    const createResult = await googleCalendar.createCalendarEvent(userTokens, event);
    
    if (!createResult.success) {
      return res.json({
        text: `❌ Failed to create event: ${createResult.error}`
      });
    }
    
    // ========================================
    // 🎉 SUCCESS RESPONSE
    // ========================================
    
    const successCard = cliqCards.buildSuccessCard(event, createResult.eventLink, endTime);
    res.json(successCard);
    
  } catch (error) {
    console.error('❌ Error in bot handler:', error);
    res.status(500).json({
      text: '⚠️ An error occurred. Please try again.'
    });
  }
});

// Helper function to calculate end time
function calculateEndTime(startTime, durationHours) {
  const [hours, minutes] = startTime.split(':').map(Number);
  const endHours = hours + Math.floor(durationHours);
  const endMinutes = minutes + ((durationHours % 1) * 60);
  
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
}


// Helper function to format dates nicely
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}




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

