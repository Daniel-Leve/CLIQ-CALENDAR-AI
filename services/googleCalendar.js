require('dotenv').config();
const { google } = require('googleapis');
const { encrypt, decrypt } = require('../utils/encryption');

/**
 * Create OAuth2 client for Google Calendar API
 */
function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Get authorization URL for user to connect their Google Calendar
 */
function getAuthUrl(userId) {
  const oauth2Client = getOAuthClient();
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    state: userId // Pass userId to identify user after redirect
  });
  
  return authUrl;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code) {
  const oauth2Client = getOAuthClient();
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('✅ Tokens received from Google');
    
    return {
      success: true,
      tokens: tokens
    };
  } catch (error) {
    console.error('❌ Token exchange error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check calendar availability using FreeBusy API
 */
async function checkAvailability(userTokens, date, startTime, endTime) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(userTokens);
  
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  try {
    const timeMin = `${date}T${startTime}:00+05:30`; // IST timezone
    const timeMax = `${date}T${endTime}:00+05:30`;
    
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin,
        timeMax: timeMax,
        items: [{ id: 'primary' }]
      }
    });
    
    const busySlots = response.data.calendars.primary.busy || [];
    
    console.log('📅 Availability check:', busySlots.length === 0 ? 'FREE' : 'BUSY');
    
    return {
      success: true,
      available: busySlots.length === 0,
      busySlots: busySlots
    };
    
  } catch (error) {
    console.error('❌ Availability check error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create event in Google Calendar
 */
async function createCalendarEvent(userTokens, eventDetails) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(userTokens);
  
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  try {
    // Build event object
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
    
    // Add attendees if specified
    if (eventDetails.participants && eventDetails.participants.length > 0) {
      event.attendees = eventDetails.participants.map(email => ({ email }));
    }
    
    console.log('📤 Creating calendar event:', event.summary);
    
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all' // Send invites to attendees
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
 * Helper: Calculate end time based on start time and duration
 */
function calculateEndTime(startTime, durationHours) {
  const [hours, minutes] = startTime.split(':').map(Number);
  const endHours = hours + Math.floor(durationHours);
  const endMinutes = minutes + ((durationHours % 1) * 60);
  
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
}

module.exports = {
  getOAuthClient,   
  getAuthUrl,
  exchangeCodeForTokens,
  checkAvailability,
  createCalendarEvent
};
