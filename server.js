const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const perplexityAgent = require('./services/perplexityAgent');
const googleCalendar = require('./services/googleCalendar');
const userManager = require('./db/userManager');
const cliqCards = require('./services/cliqCards');
const commandHandlers = require('./services/commandHandlers');
const smartPlanner = require('./services/smartPlanner');
require('dotenv').config();

// Temporary storage for edit sessions (eventId by userId)
const editSessions = new Map();


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


// Initiate Google Calendar connection
app.get('/connect-calendar', (req, res) => {
  const userId = req.query.user_id || 'unknown';
  
  console.log(`🔗 Connection initiated for user: ${userId}`);
  
  // Generate auth URL with user_id in state parameter
  const authUrl = googleCalendar.getAuthUrl(userId);
  
  res.redirect(authUrl);
});


// OAuth: Google callback
// OAuth callback - Handle Google authorization
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const userId = state || 'unknown';
  
  console.log('📥 OAuth callback triggered');
  console.log('   Code:', code ? 'Received ✅' : 'Missing ❌');
  console.log('   User ID:', userId);

  if (!code) {
    return res.send('❌ Authorization failed. No code received.');
  }

  try {
    console.log('🔄 Exchanging code for tokens...');
    
    // Exchange code for tokens
    const tokens = await googleCalendar.exchangeCodeForTokens(code);
    
    console.log('✅ Tokens received from Google');
    console.log('   Structure:', {
      access_token: tokens.access_token ? `${tokens.access_token.substring(0, 20)}...` : 'MISSING',
      refresh_token: tokens.refresh_token ? `${tokens.refresh_token.substring(0, 20)}...` : 'MISSING',
      expiry_date: tokens.expiry_date || 'MISSING'
    });
    
    // Validate tokens before saving
    if (!tokens.access_token) {
      throw new Error('No access_token received from Google');
    }
    
    // Save tokens with REAL user ID
    console.log('💾 Attempting to save tokens...');
    userManager.saveUserTokens(userId, tokens);
    
    console.log(`✅ Calendar connected for user: ${userId}`);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Calendar Connected</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            text-align: center;
          }
          h1 { color: #667eea; margin-bottom: 10px; }
          p { color: #666; margin: 10px 0; }
          .checkmark { font-size: 60px; color: #4caf50; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="checkmark">✅</div>
          <h1>Calendar Connected!</h1>
          <p>Your Google Calendar is now connected to CalendarAI.</p>
          <p><strong>User ID: ${userId}</strong></p>
          <p style="margin-top: 20px;"><strong>Go back to Zoho Cliq and start scheduling!</strong></p>
          <p style="margin-top: 30px; color: #999; font-size: 14px;">
            You can close this window now.
          </p>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ OAuth error:', error);
    console.error('   Stack:', error.stack);
    res.send('❌ Failed to connect calendar: ' + error.message);
  }
});



// Bot message handler (with verification)
// Bot message handler (with AI integration)
// This is the one that could'nt handle hi or something like that
app.post('/bot', verifyCliqRequest, async (req, res) => {
  try {
    console.log('📨 Bot message received');
    
    // Extract user info - USE REAL USER ID FROM CLIQ
    const userMessage = sanitizeInput(req.body.text || '');
    const userId = req.body.user?.id || req.body.userId || 'unknown';  // Real Cliq user ID
    const userName = sanitizeInput(req.body.user?.name || 'User');
    
    console.log(`👤 User: ${userId} (${userName}) | Message: ${userMessage.substring(0, 50)}...`);
    
    // Validate input
    // if (!userMessage || userMessage.length < 3) {
    //   return res.json({
    //     text: '⚠️ Please provide a message. Example: "Schedule meeting tomorrow at 3 PM"'
    //   });
    // }

        // ========================================
    // 🛡️ PRE-FILTER: Detect Intent FIRST
    // ========================================
    
    const lowerMessage = userMessage.toLowerCase();
    
    // 1. Handle greetings
    if (['hi', 'hello', 'hey', 'hola', 'good morning', 'good afternoon', 'good evening'].some(greeting => lowerMessage.includes(greeting))) {
      return res.json({
        text: `👋 Hey ${userName}! I'm your AI calendar assistant.\n\n` +
              `I can help you:\n` +
              `• Schedule meetings and tasks\n` +
              `• Plan your day with /suggestplan\n` +
              `• Check work-life balance with /balance\n\n` +
              `Try: "Schedule meeting tomorrow at 3 PM"`
      });
    }
    
    // 2. Handle thanks/appreciation
    if (['thank', 'thanks', 'appreciate'].some(word => lowerMessage.includes(word))) {
      return res.json({
        text: `😊 You're welcome! Let me know if you need help scheduling anything else.`
      });
    }
    
    // 3. Handle casual conversation (not scheduling)
    const casualPhrases = [
  'weather', 'how are you', 'whats up', "what's up",
  'tell me', 'joke', 'story', 'fact', 'news',
  'today is', 'yesterday', 'nice day', 'beautiful',

  // --- Added casual phrases ---
  'good evening', 'good afternoon', 'how is it going',
  'how are things', 'how you doing', 'how have you been',
  'what are you doing', 'wyd', "what're you doing",
  'what is new', 'anything new', 'how was your day',
  'how’s your day', 'how’s everything',
  'talk to me', 'chat with me', 'say something',

  'i am bored', 'im bored', 'tell me something',
  'entertain me', 'fun', 'interesting',
  'give me a fact', 'give me a joke', 'make me laugh',

  'good vibes', 'nice weather', 'feels good',
  'feeling great', 'feeling sad', 'feeling tired',
  'i’m tired', 'i’m happy', 'i’m sad',

  'long time', 'miss you', 'what a day',
  'ugh', 'wow', 'amazing', 'awesome',
  'cool', 'nice', 'really', 'seriously',

  'random thought', 'random talk', 'chatting',
  'boredom', 'tell me more', 'say a story',
  'tell me news', 'give me updates', 'small talk'
];

    
    if (casualPhrases.some(phrase => lowerMessage.includes(phrase))) {
      return res.json({
        text: `💬 I'm a calendar assistant, so I focus on scheduling and planning.\n\n` +
              `If you want to schedule something, try:\n` +
              `• "Schedule meeting tomorrow at 3 PM"\n` +
              `• "Block 2 hours Friday for project work"\n` +
              `• "/suggestplan" to optimize your day`
      });
    }
    
    // 4. Check for scheduling keywords
    const schedulingKeywords = [
  // Core scheduling actions
  'schedule', 'meeting', 'appointment', 'book', 'reserve',
  'plan', 'block', 'set up', 'arrange', 'organize', 'fix',
  'manage', 'reschedule', 'postpone', 'cancel', 'rebook',
  'slot', 'time slot', 'availability', 'available', 'free', 'busy',

  // Reminders & deadlines
  'remind', 'reminder', 'deadline', 'due', 'due date',
  'follow up', 'follow-up', 'alert', 'notify', 'notification',

  // Days of the week
  'today', 'tomorrow', 'day after tomorrow',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday',

  // General time references
  'this week', 'next week', 'last week',
  'this month', 'next month', 'last month',
  'evening', 'morning', 'afternoon', 'night',
  'midnight', 'noon', 'weekend', 'weekday',

  // Time formats & expressions
  'at', 'pm', 'am', 'oclock', "o'clock", 'hrs', 'hour', 'hours',
  'minute', 'minutes', 'sec', 'second', 'seconds',

  // Natural language time
  'later', 'soon', 'shortly', 'in a bit',
  'in an hour', 'in two hours', 'in three hours',
  'after', 'before',

  // Date references
  'on', 'date', 'calendar', 'day', 'month', 'year',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul',
  'aug', 'sep', 'oct', 'nov', 'dec',

  // Common scheduling verbs/phrases
  'set a reminder', 'create event', 'add to calendar',
  'mark', 'log', 'schedule for', 'put on calendar',
  'fix up', 'line up', 'pencil in', 'confirm',

  // Business/meeting specific
  'call', 'zoom', 'meet', 'meetup', 'sync', 'standup',
  'discussion', 'review', 'check-in', 'catch up',
  'conference', 'session',

  // Duration indicators
  'for 10 minutes', 'for 30 minutes', 'for 1 hour', 'for 2 hours',
  'from', 'to', 'between', 'until', 'till', 'through',

  // Frequency / recurrence
  'every day', 'daily', 'weekly', 'biweekly', 'monthly',
  'every monday', 'every tuesday', 'every week', 'every month',
  'repeat', 'recurring', 'recurrence',

  // Time qualifiers
  'early', 'late', 'first thing', 'end of day',
  'start of day', 'midday',

  // Contextual scheduling intents
  'when can we', 'can we meet', 'let’s meet',
  'set timing', 'pick a time', 'choose a time',
  'push it', 'move it', 'shift it'
];

    
    const hasSchedulingKeyword = schedulingKeywords.some(keyword => 
      lowerMessage.includes(keyword)
    );
    
    if (!hasSchedulingKeyword) {
      return res.json({
        text: `🤔 I don't think that's a scheduling request.\n\n` +
              `I can help you schedule tasks and meetings. Try:\n` +
              `• "Schedule team meeting tomorrow at 2 PM"\n` +
              `• "Block 1 hour Friday for code review"\n` +
              `• Type **/help** to see all commands`
      });
    }

    // CHECK IF USER HAS CONNECTED CALENDAR
    const userTokens = userManager.getUserTokens(userId);
    
    if (!userTokens) {
      console.log('❌ User not connected to calendar');
      return res.json({
        text: `🔗 **Please connect your Google Calendar first!**\n\n` +
              `I need access to your calendar to:\n` +
              `• Check your availability\n` +
              `• Create events\n` +
              `• Send you daily briefings\n\n` +
              `Click the "Connect Now" button below to get started.`
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
              `• "Remind me to submit report by next Monday"\n\n` +
              `Error: ${aiResult.error}`
      });
    }
    
    const event = aiResult.event;

      // If AI didn't give a time, or time is null/empty → find a free slot
    if (!event.time || event.time.trim() === '') {
            console.log('⏰ No time provided, finding free slot...');
            const userContext = {
                timezone: 'Asia/Kolkata',
                workHours: '09:00-18:00'
            };
        const freeSlot = await findFreeSlotForEvent(userTokens, event.date, event.duration || 1, userContext);
        if (!freeSlot.success) {
            return res.json({
            text: `⚠️ I couldn't find a free time on ${formatDate(event.date)}.\n\n` +
                    `You can try:\n` +
                    `• Choosing another day\n` +
                    `• Giving a specific time, like "at 4 PM".`
        });
    }
        // Set the found time into event
        event.time = freeSlot.startTime;   // e.g. "15:00"
        console.log('✅ Free slot found at', event.time);
}
    
    // ========================================
    // 📅 CHECK CALENDAR AVAILABILITY
    // ========================================
    
    console.log('📅 Checking calendar availability...');
    
    // ✅ REMOVED DUPLICATE - userTokens already exists above
    const endTime = calculateEndTime(event.time, event.duration);
    
    const availabilityCheck = await googleCalendar.checkAvailability(
      userTokens,  // Use existing userTokens variable
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
          ).join('\n')
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





// function calculateEndTime(startTime, durationHours) {
//   const [hours, minutes] = startTime.split(':').map(Number);

//   let endHours = hours + Math.floor(durationHours);
//   let endMinutes = minutes + ((durationHours % 1) * 60);

//   if (endMinutes >= 60) {
//     endHours += Math.floor(endMinutes / 60);
//     endMinutes = endMinutes % 60;
//   }

//   // If we go past or reach 24:00, wrap to 00:00
//   if (endHours >= 24) {
//     endHours = 0;
//     endMinutes = 0;
//   }

//   return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
// }



// Helper function to format dates nicely

function calculateEndTime(startTime, durationHours) {
  const [hours, minutes] = startTime.split(':').map(Number);

  let endHours = hours + Math.floor(durationHours);
  let endMinutes = minutes + ((durationHours % 1) * 60);

  if (endMinutes >= 60) {
    endHours += Math.floor(endMinutes / 60);
    endMinutes = endMinutes % 60;
  }

  // If end time would go past 23:59, cap it at 23:59
  if (endHours > 23 || (endHours === 23 && endMinutes > 59)) {
    endHours = 23;
    endMinutes = 59;
  }

  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
}


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
    
    const userId = req.body.userId || 'unknown';
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

// Slash command: /today
app.post('/command/today', verifyCliqRequest, async (req, res) => {
  try {
    const userId = req.body.userId || 'test_user';
    const result = await commandHandlers.handleTodayCommand(userId);
    res.json(result);
  } catch (error) {
    console.error('Error in /today command:', error);
    res.json({ text: '❌ Error processing command' });
  }
});

// Slash command: /week
app.post('/command/week', verifyCliqRequest, async (req, res) => {
  try {
    const userId = req.body.userId || 'test_user';
    const result = await commandHandlers.handleWeekCommand(userId);
    res.json(result);
  } catch (error) {
    console.error('Error in /week command:', error);
    res.json({ text: '❌ Error processing command' });
  }
});


// Slash command: /delete
app.post('/command/delete', verifyCliqRequest, async (req, res) => {
  try {
    const userId = req.body.userId || 'test_user';
    const commandArgs = req.body.arguments || '';
    const result = await commandHandlers.handleDeleteCommand(userId, commandArgs);
    res.json(result);
  } catch (error) {
    console.error('Error in /delete command:', error);
    res.json({ text: '❌ Error processing command' });
  }
});

// Slash command: /update
app.post('/command/update', verifyCliqRequest, async (req, res) => {
  try {
    const userId = req.body.userId || 'test_user';
    const commandArgs = req.body.arguments || '';
    const result = await commandHandlers.handleUpdateCommand(userId, commandArgs);
    res.json(result);
  } catch (error) {
    console.error('Error in /update command:', error);
    res.json({ text: '❌ Error processing command' });
  }
});

// Slash command: /balance
// Slash command: /balance
app.post('/command/balance', verifyCliqRequest, async (req, res) => {
  try {
    console.log('📨 Received /balance request');
    
    const userId = req.body.userId || req.body.user?.id ||'test_user';
    console.log('👤 User ID:', userId);
    
    const result = await commandHandlers.handleBalanceCommand(userId);

    
    
    console.log('✅ Result type:', typeof result);
    console.log('✅ Result:', result);
    
    if (result && result.text) {
      console.log('✅ Sending response to Cliq');
      res.json(result);
    } else {
      console.log('⚠️ No valid result, sending fallback');
      res.json({ text: '❌ No data available' });
    }
    
  } catch (error) {
    console.error('❌ Error in /balance command:', error);
    console.error('Stack:', error.stack);
    res.json({ text: '❌ Error processing command: ' + error.message });
  }
});


// Slash command: /suggestplan - Auto-fetch and optimize today's tasks
app.post('/command/suggestplan', verifyCliqRequest, async (req, res) => {
  try {
    const userId = req.body.userId || req.body.user?.id || 'unknown';
    
    console.log('🎯 Auto-planning for user:', userId);
    
    if (userId === 'unknown') {
      return res.json({ text: '⚠️ Could not identify user.' });
    }

    // Check if user connected calendar
    const userTokens = userManager.getUserTokens(userId);
    
    if (!userTokens) {
      return res.json({
        text: '🔗 Please connect your Google Calendar first!'
      });
    }

    // ========================================
    // 📅 FETCH TODAY'S TASKS FROM CALENDAR
    // ========================================
    
    console.log('📅 Fetching today\'s calendar events...');
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const { google } = require('googleapis');
    const oauth2Client = googleCalendar.getOAuthClient();
    oauth2Client.setCredentials(userTokens);
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: `${todayStr}T00:00:00+05:30`,
      timeMax: `${todayStr}T23:59:59+05:30`,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    if (events.length === 0) {
      return res.json({
        text: '📭 You have no tasks scheduled for today!\n\n' +
              'To add tasks, use:\n' +
              '`Schedule [task name] at [time]`\n\n' +
              'Or manually add events to your Google Calendar.'
      });
    }

    console.log(`✅ Found ${events.length} events today`);

    // Extract task details
    const tasks = events.map(event => {
      const start = new Date(event.start.dateTime || event.start.date);
      const end = new Date(event.end.dateTime || event.end.date);
      const duration = (end - start) / (1000 * 60 * 60); // hours
      
      return {
        title: event.summary,
        currentTime: start.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit', 
          hour12: false 
        }),
        duration: duration,
        description: event.description || ''
      };
    });

    // ========================================
    // 🧠 AI GENERATES OPTIMAL PLAN
    // ========================================
    
    console.log('🧠 Generating AI-optimized plan...');

    // Format tasks for AI
    const taskList = tasks.map(t => 
      `${t.title} (currently at ${t.currentTime}, ${t.duration}h)`
    ).join(', ');

    const userContext = {
      timezone: 'Asia/Kolkata',
      workHours: '09:00-18:00',
      currentTime: today.toTimeString().slice(0, 5)
    };

    const planResult = await smartPlanner.suggestOptimalPlan(taskList, userContext);

    if (!planResult.success) {
      return res.json({
        text: `❌ Could not generate plan: ${planResult.error}\n\n` +
              '**Your current tasks:**\n' +
              tasks.map(t => `• ${t.currentTime} - ${t.title} (${t.duration}h)`).join('\n')
      });
    }

    // ========================================
    // 📊 BUILD COMPARISON CARD
    // ========================================
    
    const responseCard = buildOptimizedPlanCard(tasks, planResult.plan, planResult.summary);
    
    res.json(responseCard);

  } catch (error) {
    console.error('❌ Error in /suggestplan:', error);
    res.json({ 
      text: '❌ Error generating plan: ' + error.message 
    });
  }
});

/**
 * Build card showing current schedule vs optimized plan
 */
function buildOptimizedPlanCard(currentTasks, optimizedPlan, summary) {
  const response = {
    text: `🧠 **AI-Optimized Schedule Analysis**\n\n` +
          `📊 ${currentTasks.length} tasks | ⏱️ ${summary.totalDuration} hours total`,
    card: {
      title: "🎯 Smart Schedule Optimizer",
      theme: "modern-inline"
    },
    slides: []
  };

  // Slide 1: Current Schedule
  const currentSlide = {
    type: "text",
    title: "📅 Your Current Schedule",
    data: currentTasks.map((task, idx) => 
      `${idx + 1}. **${task.title}**\n` +
      `   ⏰ Currently: ${task.currentTime} (${task.duration}h)`
    ).join('\n\n')
  };
  response.slides.push(currentSlide);

  // Slide 2: AI Recommendations
  const recommendationsSlide = {
    type: "text",
    title: "🧠 AI-Optimized Schedule",
    data: optimizedPlan.map((task, idx) => 
      `${idx + 1}. **${task.task}**\n` +
      `   ✅ Suggested: ${task.suggestedTime} (${task.duration}h)\n` +
      `   🏷️ Priority: ${task.priority.toUpperCase()} | Complexity: ${task.complexity}\n` +
      `   💡 ${task.reasoning}`
    ).join('\n\n')
  };
  response.slides.push(recommendationsSlide);

  // Slide 3: Why These Changes?
  const insightsSlide = {
    type: "text",
    title: "💡 Optimization Insights",
    data: generateInsights(currentTasks, optimizedPlan)
  };
  response.slides.push(insightsSlide);

  // Slide 4: Summary
  const summarySlide = {
    type: "text",
    title: "📊 Summary",
    data: `**Total Tasks:** ${summary.totalTasks}\n` +
          `**Total Time:** ${summary.totalDuration} hours\n` +
          `**High Priority:** ${summary.highPriorityTasks} tasks\n` +
          `**Suggested Start:** ${summary.startTime}\n` +
          `**Estimated End:** ${summary.endTime}\n\n` +
          `✅ Schedule optimized for:\n` +
          `• Peak energy times\n` +
          `• Task complexity\n` +
          `• Work-life balance\n` +
          `• Break management`
  };
  response.slides.push(summarySlide);

  return response;
}

/**
 * Generate AI insights about schedule optimization
 */
function generateInsights(currentTasks, optimizedPlan) {
  const insights = [];
  
  // Check if high-priority tasks moved to morning
  const morningOptimized = optimizedPlan.filter(t => {
    const hour = parseInt(t.suggestedTime.split(':')[0]);
    return t.priority === 'high' && hour >= 9 && hour < 12;
  });
  
  if (morningOptimized.length > 0) {
    insights.push('🌅 **Morning Focus**: High-priority tasks scheduled during peak energy hours (9-12 AM)');
  }
  
  // Check for meeting clustering
  const meetings = optimizedPlan.filter(t => t.type === 'meeting');
  if (meetings.length > 0) {
    insights.push('🤝 **Meeting Strategy**: Collaborative tasks grouped in afternoon for better flow');
  }
  
  // Check for deep work blocks
  const focusWork = optimizedPlan.filter(t => 
    t.type === 'focus_work' || t.complexity === 'high'
  );
  if (focusWork.length > 0) {
    insights.push('🎯 **Deep Work**: Complex tasks scheduled when concentration is highest');
  }
  
  // Check for break management
  insights.push('☕ **Break Management**: 15-min buffers between tasks for rest and transition');
  
  // Check work-life balance
  const endTime = optimizedPlan[optimizedPlan.length - 1]?.suggestedTime || '18:00';
  const endHour = parseInt(endTime.split(':')[0]);
  
  if (endHour <= 18) {
    insights.push('🧘 **Work-Life Balance**: Schedule ends by 6 PM, allowing personal time');
  } else {
    insights.push('⚠️ **Overloaded**: Consider moving some tasks to tomorrow for better balance');
  }
  
  return insights.join('\n\n');
}


// Update existing event
app.post('/calendar/update', verifyCliqRequest, async (req, res) => {
  try {
    const { userId, summary, date, startTime, endTime } = req.body;
    
    // Get eventId from session storage
    const eventId = editSessions.get(userId);
    
    if (!eventId) {
      console.log('❌ No edit session found');
      return res.json({ success: false, error: 'No edit session found. Please try again.' });
    }
    
    console.log(`✏️ Update event request: ${eventId} by user ${userId}`);
    console.log(`   Task: ${summary}`);
    console.log(`   Date: ${date}`);
    console.log(`   Time: ${startTime} - ${endTime}`);
    
    const userTokens = userManager.getUserTokens(userId);
    if (!userTokens) {
      return res.json({ success: false, error: 'Not authenticated' });
    }
    
    const { google } = require('googleapis');
    const oauth2Client = googleCalendar.getOAuthClient();
    oauth2Client.setCredentials(userTokens);
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Build ISO datetime strings with IST timezone
    const startDateTime = `${date}T${startTime}:00+05:30`;
    const endDateTime = `${date}T${endTime}:00+05:30`;
    
    const event = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      resource: {
        summary: summary,
        start: { 
          dateTime: startDateTime, 
          timeZone: 'Asia/Kolkata' 
        },
        end: { 
          dateTime: endDateTime, 
          timeZone: 'Asia/Kolkata' 
        }
      }
    });
    
    // Clear session after successful update
    editSessions.delete(userId);
    
    console.log('✅ Event updated successfully');
    res.json({ 
      success: true, 
      message: 'Task updated successfully',
      eventId: event.data.id 
    });
    
  } catch (error) {
    console.error('❌ Update error:', error.message);
    res.json({ success: false, error: error.message });
  }
});



// Delete event
app.post('/calendar/delete', verifyCliqRequest, async (req, res) => {
  try {
    const { userId, eventId } = req.body;
    
    console.log(`🗑️ Delete event request: ${eventId} by user ${userId}`);
    
    const userTokens = userManager.getUserTokens(userId);
    if (!userTokens) {
      return res.json({ success: false, error: 'Not authenticated' });
    }
    
    const { google } = require('googleapis');
    const oauth2Client = googleCalendar.getOAuthClient();
    oauth2Client.setCredentials(userTokens);
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId
    });
    
    console.log('✅ Event deleted successfully');
    res.json({ 
      success: true, 
      message: 'Task deleted successfully' 
    });
    
  } catch (error) {
    console.error('❌ Delete error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

app.post('/widget/today', verifyCliqRequest, async (req, res) => {
  try {
    const userId = req.body.userId || 'unknown';
    const eventType = req.body.eventType || 'load';
    
    console.log(`📊 Widget ${eventType} from user: ${userId}`);
    
    if (userId === 'unknown') {
      return res.json(buildErrorWidget('Could not identify user'));
    }

    const userTokens = userManager.getUserTokens(userId);
    
    if (!userTokens) {
      console.log('❌ No tokens found');
      return res.json(buildErrorWidget('Please connect your Google Calendar first using /connect command'));
    }

    // Fetch today's events
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const { google } = require('googleapis');
    const oauth2Client = googleCalendar.getOAuthClient();
    oauth2Client.setCredentials(userTokens);
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: `${todayStr}T00:00:00+05:30`,
      timeMax: `${todayStr}T23:59:59+05:30`,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    console.log(`✅ Found ${events.length} events for widget`);

    // Build widget response (single overview tab only)
    const widgetData = buildTodayWidget(events, today, userId);
    
    console.log('📤 Widget structure:', JSON.stringify({
      type: widgetData.type,
      tabCount: widgetData.tabs?.length || 0,
      sectionsCount: widgetData.sections?.length || 0
    }, null, 2));
    
    res.json(widgetData);

  } catch (error) {
    console.error('❌ Widget error:', error.message);
    
    if (!res.headersSent) {
      res.json(buildErrorWidget('Error loading calendar data: ' + error.message));
    }
  }
});



function buildTodayWidget(events, currentDate, userId) {
  console.log('🔨 Building widget for', events.length, 'events');
  
  const now = new Date();
  const currentTime = now.getTime();
  
  // Categorize events
  const upcoming = [];
  const inProgress = [];
  const completed = [];
  
  events.forEach(event => {
    const start = new Date(event.start.dateTime || event.start.date);
    const end = new Date(event.end.dateTime || event.end.date);
    
    if (end.getTime() < currentTime) {
      completed.push(event);
    } else if (start.getTime() <= currentTime && end.getTime() >= currentTime) {
      inProgress.push(event);
    } else {
      upcoming.push(event);
    }
  });
  
  // ========================================
  // BUILD WIDGET STRUCTURE - SINGLE TAB
  // ========================================
  const widget = {
    type: "applet",
    tabs: [
      { label: "Today's Tasks", id: "overview" }
    ],
    active_tab: "overview",
    sections: [],
    header: {
  title: `📅 Today - ${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
  navigation: "new"
  // No buttons array → no Add Task button
}

  };
  
  // ========================================
  // SECTION 1: SUMMARY STATS
  // ========================================
  const statsElements = [];
  
  statsElements.push({
    type: "title",
    text: "📊 Today's Summary"
  });
  
  statsElements.push({
    type: "text",
    text: `✅ Completed: **${completed.length}** | ` +
          `🔵 In Progress: **${inProgress.length}** | ` +
          `⏳ Upcoming: **${upcoming.length}**`
  });
  
  statsElements.push({ type: "divider" });
  
  widget.sections.push({
    id: 1,
    elements: statsElements
  });
  
  // ========================================
  // SECTION 2: ALL TASKS LIST
  // ========================================
  if (events.length === 0) {
    // Empty state
    const emptyElements = [];
    emptyElements.push({
      type: "text",
      text: "📭 **No tasks scheduled for today!**\n\nClick **➕ Add Task** to create one."
    });
    
    widget.sections.push({
      id: 2,
      elements: emptyElements
    });
  } else {
    // Title for task list
    const titleElements = [];
    titleElements.push({
      type: "title",
      text: `📋 All Tasks (${events.length})`
    });
    
    widget.sections.push({
      id: 2,
      elements: titleElements
    });
    
    // Add each task as a separate section with Edit/Delete buttons
    events.forEach((event, idx) => {
      const start = new Date(event.start.dateTime || event.start.date);
      const end = new Date(event.end.dateTime || event.end.date);
      const duration = Math.round((end - start) / (1000 * 60 * 60) * 10) / 10;
      
      // Determine status
      let status = '⏳';
      let statusText = 'Upcoming';
      let statusColor = 'gray';
      
      if (end.getTime() < currentTime) {
        status = '✅';
        statusText = 'Completed';
        statusColor = 'green';
      } else if (start.getTime() <= currentTime) {
        status = '🔵';
        statusText = 'In Progress';
        statusColor = 'blue';
      }
      
      const taskElements = [];
      
      // Task title and time
      taskElements.push({
        type: "text",
        text: `${status} **${event.summary}**\n` +
              `⏰ ${start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} - ` +
              `${end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} ` +
              `(${duration}h) • _${statusText}_`
      });
      
      // Action buttons (Edit and Delete)
        const editButton = {
        label: "✏️ Edit",
        type: "invoke.function",
        name: "editTaskFromWidget",
        // encode eventId as edit_<eventId>
        id: `edit_${event.id}`
        };

      
        const deleteButton = {
        label: "🗑️ Delete",
        type: "invoke.function",
        name: "deleteTaskFromWidget",
        id: `del_${event.id}`,
        emotion: "negative"
        };

      
      taskElements.push({
        type: "buttons",
        buttons: [editButton, deleteButton]
      });
      
      taskElements.push({ type: "divider" });
      
      widget.sections.push({
        id: idx + 3, // Start from 3 (after stats and title sections)
        elements: taskElements
      });
    });
  }
  
  console.log(`✅ Widget built with ${widget.sections.length} sections`);
  
  return widget;
}



function buildErrorWidget(errorMessage) {
  return {
    type: "applet",
    data_type: "info",
    info: {
      title: "⚠️ Tasks Widget Error",
      description: errorMessage,
      image_url: "https://i.ibb.co/gSP05Yr/Cliq-automation.png",
      button: {
        label: "Connect Calendar",
        type: "invoke.function",
        name: "connectCalendar", // Your connection function name
        id: "connect_btn"
      }
    },
    tabs: [{
      label: "Error",
      id: "error_tab"
    }],
    active_tab: "error_tab"
  };
}

// Start edit session - store eventId
app.post('/widget/start-edit', verifyCliqRequest, async (req, res) => {
  try {
    const { userId, eventId } = req.body;
    
    console.log(`📝 Starting edit session for user ${userId}, event ${eventId}`);
    
    // Store eventId keyed by userId
    editSessions.set(userId, eventId);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('❌ Start edit error:', error.message);
    res.json({ success: false, error: error.message });
  }
});


async function findFreeSlotForEvent(userTokens, date, durationHours, userContext) {
  try {
    const workStart = userContext.workHours?.split('-')[0] || '09:00';
    const workEnd = userContext.workHours?.split('-')[1] || '18:00';

    const [startHour] = workStart.split(':').map(Number);
    const [endHour] = workEnd.split(':').map(Number);

    const { google } = require('googleapis');
    const oauth2Client = googleCalendar.getOAuthClient();
    oauth2Client.setCredentials(userTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const timeMin = `${date}T${workStart}:00+05:30`;
    const timeMax = `${date}T${workEnd}:00+05:30`;

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: 'primary' }]
      }
    });

    const busySlots = response.data.calendars.primary.busy || [];

    // Build a list of candidate start times in 30 min steps
    const candidates = [];
    for (let hour = startHour; hour <= endHour - durationHours; hour++) {
      candidates.push(`${String(hour).padStart(2,'0')}:00`);
      candidates.push(`${String(hour).padStart(2,'0')}:30`);
    }

    // Check each candidate against busy slots
    for (const candidate of candidates) {
      const candidateStart = new Date(`${date}T${candidate}:00+05:30`);
      const candidateEnd = new Date(candidateStart.getTime() + durationHours * 60 * 60 * 1000);

      const overlaps = busySlots.some(slot => {
        const busyStart = new Date(slot.start);
        const busyEnd = new Date(slot.end);
        return candidateStart < busyEnd && candidateEnd > busyStart;
      });

      if (!overlaps) {
        // Found free time
        return {
          success: true,
          startTime: candidate
        };
      }
    }

    // No free slots
    return {
      success: false,
      error: 'No free slot found'
    };

  } catch (error) {
    console.error('❌ Error in findFreeSlotForEvent:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}




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




// app.post('/bot', verifyCliqRequest, async (req, res) => {
//   try {
//     console.log('📨 Bot message received');
    
//     const userMessage = sanitizeInput(req.body.text || '');
//     const userId = req.body.user?.id || 'unknown';
//     const userName = sanitizeInput(req.body.user?.name || 'User');
    
//     console.log(`👤 User: ${userId} (${userName}) | Message: ${userMessage.substring(0, 50)}...`);
    
//     // Validate input
//     if (!userMessage || userMessage.length < 2) {
//       return res.json({
//         text: '⚠️ Please type a message.'
//       });
//     }

//     // ========================================
//     // 🛡️ PRE-FILTER: Detect Intent FIRST
//     // ========================================
    
//     const lowerMessage = userMessage.toLowerCase();
    
//     // 1. Handle greetings
//     if (['hi', 'hello', 'hey', 'hola', 'good morning', 'good afternoon', 'good evening'].some(greeting => lowerMessage.includes(greeting))) {
//       return res.json({
//         text: `👋 Hey ${userName}! I'm your AI calendar assistant.\n\n` +
//               `I can help you:\n` +
//               `• Schedule meetings and tasks\n` +
//               `• Plan your day with /suggestplan\n` +
//               `• Check work-life balance with /balance\n\n` +
//               `Try: "Schedule meeting tomorrow at 3 PM"`
//       });
//     }
    
//     // 2. Handle thanks/appreciation
//     if (['thank', 'thanks', 'appreciate'].some(word => lowerMessage.includes(word))) {
//       return res.json({
//         text: `😊 You're welcome! Let me know if you need help scheduling anything else.`
//       });
//     }
    
//     // 3. Handle casual conversation (not scheduling)
//     const casualPhrases = [
//   'weather', 'how are you', 'whats up', "what's up",
//   'tell me', 'joke', 'story', 'fact', 'news',
//   'today is', 'yesterday', 'nice day', 'beautiful',

//   // --- Added casual phrases ---
//   'hello', 'hi', 'hey', 'good morning', 'good night',
//   'good evening', 'good afternoon', 'how is it going',
//   'how are things', 'how you doing', 'how have you been',
//   'what are you doing', 'wyd', "what're you doing",
//   'what is new', 'anything new', 'how was your day',
//   'how’s your day', 'how’s everything',
//   'talk to me', 'chat with me', 'say something',

//   'i am bored', 'im bored', 'tell me something',
//   'entertain me', 'fun', 'interesting',
//   'give me a fact', 'give me a joke', 'make me laugh',

//   'good vibes', 'nice weather', 'feels good',
//   'feeling great', 'feeling sad', 'feeling tired',
//   'i’m tired', 'i’m happy', 'i’m sad',

//   'long time', 'miss you', 'what a day',
//   'ugh', 'wow', 'amazing', 'awesome',
//   'cool', 'nice', 'really', 'seriously',

//   'random thought', 'random talk', 'chatting',
//   'boredom', 'tell me more', 'say a story',
//   'tell me news', 'give me updates', 'small talk'
// ];

    
//     if (casualPhrases.some(phrase => lowerMessage.includes(phrase))) {
//       return res.json({
//         text: `💬 I'm a calendar assistant, so I focus on scheduling and planning.\n\n` +
//               `If you want to schedule something, try:\n` +
//               `• "Schedule meeting tomorrow at 3 PM"\n` +
//               `• "Block 2 hours Friday for project work"\n` +
//               `• "/suggestplan" to optimize your day`
//       });
//     }
    
//     // 4. Check for scheduling keywords
//     const schedulingKeywords = [
//   // Core scheduling actions
//   'schedule', 'meeting', 'appointment', 'book', 'reserve',
//   'plan', 'block', 'set up', 'arrange', 'organize', 'fix',
//   'manage', 'reschedule', 'postpone', 'cancel', 'rebook',
//   'slot', 'time slot', 'availability', 'available', 'free', 'busy',

//   // Reminders & deadlines
//   'remind', 'reminder', 'deadline', 'due', 'due date',
//   'follow up', 'follow-up', 'alert', 'notify', 'notification',

//   // Days of the week
//   'today', 'tomorrow', 'day after tomorrow',
//   'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
//   'saturday', 'sunday',

//   // General time references
//   'this week', 'next week', 'last week',
//   'this month', 'next month', 'last month',
//   'evening', 'morning', 'afternoon', 'night',
//   'midnight', 'noon', 'weekend', 'weekday',

//   // Time formats & expressions
//   'at', 'pm', 'am', 'oclock', "o'clock", 'hrs', 'hour', 'hours',
//   'minute', 'minutes', 'sec', 'second', 'seconds',

//   // Natural language time
//   'later', 'soon', 'shortly', 'in a bit',
//   'in an hour', 'in two hours', 'in three hours',
//   'after', 'before',

//   // Date references
//   'on', 'date', 'calendar', 'day', 'month', 'year',
//   'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul',
//   'aug', 'sep', 'oct', 'nov', 'dec',

//   // Common scheduling verbs/phrases
//   'set a reminder', 'create event', 'add to calendar',
//   'mark', 'log', 'schedule for', 'put on calendar',
//   'fix up', 'line up', 'pencil in', 'confirm',

//   // Business/meeting specific
//   'call', 'zoom', 'meet', 'meetup', 'sync', 'standup',
//   'discussion', 'review', 'check-in', 'catch up',
//   'conference', 'session',

//   // Duration indicators
//   'for 10 minutes', 'for 30 minutes', 'for 1 hour', 'for 2 hours',
//   'from', 'to', 'between', 'until', 'till', 'through',

//   // Frequency / recurrence
//   'every day', 'daily', 'weekly', 'biweekly', 'monthly',
//   'every monday', 'every tuesday', 'every week', 'every month',
//   'repeat', 'recurring', 'recurrence',

//   // Time qualifiers
//   'early', 'late', 'first thing', 'end of day',
//   'start of day', 'midday',

//   // Contextual scheduling intents
//   'when can we', 'can we meet', 'let’s meet',
//   'set timing', 'pick a time', 'choose a time',
//   'push it', 'move it', 'shift it'
// ];

    
//     const hasSchedulingKeyword = schedulingKeywords.some(keyword => 
//       lowerMessage.includes(keyword)
//     );
    
//     if (!hasSchedulingKeyword) {
//       return res.json({
//         text: `🤔 I don't think that's a scheduling request.\n\n` +
//               `I can help you schedule tasks and meetings. Try:\n` +
//               `• "Schedule team meeting tomorrow at 2 PM"\n` +
//               `• "Block 1 hour Friday for code review"\n` +
//               `• Type **/help** to see all commands`
//       });
//     }

//     // ========================================
//     // ✅ PASSED FILTER - Now check calendar connection
//     // ========================================
    
//     const userTokens = userManager.getUserTokens(userId);
    
//     if (!userTokens) {
//       console.log('❌ User not connected to calendar');
//       return res.json({
//         text: `🔗 **Please connect your Google Calendar first!**\n\n` +
//               `I need access to your calendar to:\n` +
//               `• Check your availability\n` +
//               `• Create events\n` +
//               `• Send you daily briefings\n\n` +
//               `Click the "Connect Now" button below to get started.`
//       });
//     }

//     // ========================================
//     // 🧠 AI PROCESSING WITH PERPLEXITY
//     // ========================================
    
//     console.log('🤖 Processing with Perplexity AI...');
    
//     const userContext = {
//       timezone: 'Asia/Kolkata',
//       workHours: '09:00-18:00'
//     };
    
//     const aiResult = await perplexityAgent.extractEventDetails(userMessage, userContext);
    
//     if (!aiResult.success) {
//       return res.json({
//         text: `❌ I couldn't extract event details from that.\n\n` +
//               `Please try being more specific:\n` +
//               `• "Schedule meeting with team tomorrow at 3 PM"\n` +
//               `• "Block 2 hours Friday afternoon for project work"\n` +
//               `• "Remind me to submit report by next Monday 5 PM"`
//       });
//     }
    
//     const event = aiResult.event;

//     // If AI didn't give a time, or time is null/empty → find a free slot
//     if (!event.time || event.time.trim() === '') {
//             console.log('⏰ No time provided, finding free slot...');
//             const userContext = {
//                 timezone: 'Asia/Kolkata',
//                 workHours: '09:00-18:00'
//             };
//         const freeSlot = await findFreeSlotForEvent(userTokens, event.date, event.duration || 1, userContext);
//         if (!freeSlot.success) {
//             return res.json({
//             text: `⚠️ I couldn't find a free time on ${formatDate(event.date)}.\n\n` +
//                     `You can try:\n` +
//                     `• Choosing another day\n` +
//                     `• Giving a specific time, like "at 4 PM".`
//         });
//     }
//         // Set the found time into event
//         event.time = freeSlot.startTime;   // e.g. "15:00"
//         console.log('✅ Free slot found at', event.time);
// }
    
//     // ... rest of your existing code for availability check, event creation, etc.
    
//   } catch (error) {
//     console.error('❌ Error in bot handler:', error);
//     res.status(500).json({
//       text: '⚠️ An error occurred. Please try again.'
//     });
//   }
// });




// Helper function to calculate end time

// function calculateEndTime(startTime, durationHours) {
//   const [hours, minutes] = startTime.split(':').map(Number);
//   const endHours = hours + Math.floor(durationHours);
//   const endMinutes = minutes + ((durationHours % 1) * 60);
  
//   return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
// }