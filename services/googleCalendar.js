require('dotenv').config();
const { google } = require('googleapis');
const { encrypt, decrypt } = require('../utils/encryption');

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl(userId = 'unknown') {
  const oauth2Client = getOAuthClient();
  
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: userId,  
    prompt: 'consent'
  });

  return authUrl;
}

async function exchangeCodeForTokens(code) {
  console.log('🔄 Exchanging authorization code for tokens...');
  console.log('   Code length:', code ? code.length : 0);
  
  const oauth2Client = getOAuthClient();
  
  try {
    const tokenResponse = await oauth2Client.getToken(code);
    
    console.log('✅ Token response received');
    console.log('   Response structure:', Object.keys(tokenResponse));
    
    const tokens = tokenResponse.tokens;
    
    if (!tokens) {
      console.error('❌ No tokens in response');
      throw new Error('No tokens returned from Google');
    }
    
    console.log('✅ Tokens extracted:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
      tokenType: tokens.token_type
    });
    
    if (!tokens.access_token) {
      throw new Error('access_token missing from Google response');
    }

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date || Date.now() + 3600000,
      scope: tokens.scope,
      token_type: tokens.token_type || 'Bearer'
    };
    
  } catch (error) {
    console.error('❌ Error exchanging code for tokens:', error.message);
    console.error('   Error details:', error);
    throw new Error(`OAuth token exchange failed: ${error.message}`);
  }
}

/**
 * Check if a time slot is available in Google Calendar
 * @param {Object} userTokens - User's Google OAuth tokens
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} startTime - Start time in HH:MM format (24-hour)
 * @param {string} endTime - End time in HH:MM format (24-hour)
 * @returns {Object} Availability result with busy slots in IST
 */
async function checkAvailability(userTokens, date, startTime, endTime) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(userTokens);
  
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  try {
    const timeMin = `${date}T${startTime}:00+05:30`;
    const timeMax = `${date}T${endTime}:00+05:30`;

    console.log('🕒 FreeBusy range:', timeMin, '→', timeMax);

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: 'primary' }]
      }
    });
    
    const busySlots = response.data.calendars.primary.busy || [];
    
    // Convert busy slots to IST for display
    const busySlotsIST = busySlots.map(slot => ({
      start: new Date(slot.start),
      end: new Date(slot.end),
      startFormatted: new Date(slot.start).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata'
      }),
      endFormatted: new Date(slot.end).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata'
      })
    }));
    
    console.log('📅 Availability check:', busySlotsIST.length === 0 ? 'FREE' : 'BUSY');
    
    return {
      success: true,
      available: busySlotsIST.length === 0,
      busySlots: busySlotsIST
    };
    
  } catch (error) {
    console.error('❌ Availability check error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create a new calendar event in Google Calendar
 * @param {Object} userTokens - User's Google OAuth tokens
 * @param {Object} eventDetails - Event details (title, date, time, duration, etc.)
 * @returns {Object} Creation result with event link
 */
async function createCalendarEvent(userTokens, eventDetails) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(userTokens);
  
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  try {
    const startDateTime = `${eventDetails.date}T${eventDetails.time}:00+05:30`;
    const endTime = calculateEndTime(eventDetails.time, eventDetails.duration);
    const endDateTime = `${eventDetails.date}T${endTime}:00+05:30`;
    
    const event = {
      summary: eventDetails.title,
      description: eventDetails.description || '',
      start: {
        dateTime: startDateTime,
        timeZone: 'Asia/Kolkata'
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'Asia/Kolkata'
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'popup', minutes: 10 }
        ]
      }
    };

    // Only add attendees if they look like valid email addresses
    if (eventDetails.participants && eventDetails.participants.length > 0) {
      const validEmails = eventDetails.participants.filter(email => {
        return email && email.includes('@') && email.includes('.');
      });

      if (validEmails.length > 0) {
        event.attendees = validEmails.map(email => ({ email }));
        console.log('✅ Valid attendees added:', validEmails);
      } else {
        console.log('⚠️ No valid attendee emails found, skipping attendees');
      }
    }
    
    console.log('📤 Creating calendar event:', event.summary);
    
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all'
    });

    console.log('✅ Event created successfully!');

    return {
      success: true,
      event: response.data,
      eventLink: response.data.htmlLink
    };
    
  } catch (error) {
    console.error('❌ Event creation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}


/**
 * Calculate end time from start time and duration
 * @param {string} startTime - Start time in HH:MM format
 * @param {number} durationHours - Duration in hours (can be decimal, e.g., 1.5)
 * @returns {string} End time in HH:MM format
 */
function calculateEndTime(startTime, durationHours) {
  const [hours, minutes] = startTime.split(':').map(Number);

  let endHours = hours + Math.floor(durationHours);
  let endMinutes = minutes + ((durationHours % 1) * 60);

  if (endMinutes >= 60) {
    endHours += Math.floor(endMinutes / 60);
    endMinutes = endMinutes % 60;
  }

  if (endHours > 23 || (endHours === 23 && endMinutes > 59)) {
    endHours = 23;
    endMinutes = 59;
  }

  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
}

module.exports = {
  getOAuthClient,   
  getAuthUrl,
  exchangeCodeForTokens,
  checkAvailability,
  createCalendarEvent,
};
