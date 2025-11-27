const googleCalendar = require('./googleCalendar');
const userManager = require('../db/userManager');
const cliqCards = require('./cliqCards');
const perplexityAgent = require('./perplexityAgent');
const workLifeBalanceAI = require('./workLifeBalanceAI');
/**
 * Handle /today command - Show today's schedule
 */
async function handleTodayCommand(userId) {
  const userTokens = userManager.getUserTokens(userId);
  
  if (!userTokens) {
    return {
      text: "🔗 Please connect your Google Calendar first!\n\nUse: `/connect` or message me 'connect calendar'"
    };
  }

  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Get today's events from Google Calendar
    const { google } = require('googleapis');
    const oauth2Client = googleCalendar.getOAuthClient();
    oauth2Client.setCredentials(userTokens);
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: `${todayStr}T00:00:00Z`,
      timeMax: `${todayStr}T23:59:59Z`,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    if (events.length === 0) {
      return {
        text: `📅 **Today's Schedule** - ${today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}\n\n` +
              `✨ No events scheduled today!\n\n` +
              `Perfect day for deep work or catching up on tasks. 💪`
      };
    }

    const scheduleText = events.map(event => {
      const start = new Date(event.start.dateTime || event.start.date);
      const end = new Date(event.end.dateTime || event.end.date);
      const duration = (end - start) / (1000 * 60 * 60); // hours
      
      return `• **${start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}** - ${event.summary} (${duration}h)`;
    }).join('\n');

    return {
      text: `📅 **Today's Schedule** - ${today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}\n\n` +
            scheduleText +
            `\n\n📊 Total: ${events.length} event${events.length > 1 ? 's' : ''}`
    };

  } catch (error) {
    console.error('Error fetching today\'s schedule:', error);
    return {
      text: `❌ Could not fetch today's schedule: ${error.message}`
    };
  }
}

/**
 * Handle /week command - Show this week's schedule
 */
async function handleWeekCommand(userId) {
  const userTokens = userManager.getUserTokens(userId);
  
  if (!userTokens) {
    return {
      text: "🔗 Please connect your Google Calendar first!"
    };
  }

  try {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    
    const { google } = require('googleapis');
    const oauth2Client = googleCalendar.getOAuthClient();
    oauth2Client.setCredentials(userTokens);
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfWeek.toISOString(),
      timeMax: endOfWeek.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    if (events.length === 0) {
      return {
        text: `📊 **This Week's Schedule**\n\n✨ No events scheduled this week!`
      };
    }

    // Group by day
    const eventsByDay = {};
    events.forEach(event => {
      const date = new Date(event.start.dateTime || event.start.date);
      const dayKey = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      
      if (!eventsByDay[dayKey]) {
        eventsByDay[dayKey] = [];
      }
      eventsByDay[dayKey].push(event);
    });

    let scheduleText = `📊 **This Week's Schedule**\n\n`;
    
    Object.keys(eventsByDay).forEach(day => {
      scheduleText += `**${day}**\n`;
      eventsByDay[day].forEach(event => {
        const start = new Date(event.start.dateTime || event.start.date);
        scheduleText += `  • ${start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} - ${event.summary}\n`;
      });
      scheduleText += '\n';
    });

    scheduleText += `📈 Total: ${events.length} event${events.length > 1 ? 's' : ''} this week`;

    return { text: scheduleText };

  } catch (error) {
    console.error('Error fetching week schedule:', error);
    return {
      text: `❌ Could not fetch this week's schedule: ${error.message}`
    };
  }
}


/**
 * Handle /delete command - Delete specific event
 */
async function handleDeleteCommand(userId, commandArgs) {
  const userTokens = userManager.getUserTokens(userId);
  
  if (!userTokens) {
    return {
      text: "🔗 Please connect your Google Calendar first!"
    };
  }

  if (!commandArgs || commandArgs.trim().length === 0) {
    return {
      text: "❌ Please specify what to delete.\n\n" +
            "**Examples:**\n" +
            "• `/delete meeting tomorrow at 3 PM`\n" +
            "• `/delete team standup on Friday`\n" +
            "• `/delete presentation next Monday`"
    };
  }

  try {
    // Use AI to extract event details
    const aiResult = await perplexityAgent.extractEventDetails(commandArgs, {
      timezone: 'Asia/Kolkata',
      workHours: '09:00-18:00'
    });

    if (!aiResult.success) {
      return {
        text: "❌ I couldn't understand which event to delete.\n\nPlease be more specific about the date and time."
      };
    }

    const event = aiResult.event;
    
    // Search for matching events
    const { google } = require('googleapis');
    const oauth2Client = googleCalendar.getOAuthClient();
    oauth2Client.setCredentials(userTokens);
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const startDateTime = `${event.date}T00:00:00+05:30`;
    const endDateTime = `${event.date}T23:59:59+05:30`;
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDateTime,
      timeMax: endDateTime,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    // Find matching event by title and time
    let matchingEvent = null;
    
    if (events.length === 0) {
      return {
        text: `❌ No events found on ${event.date}`
      };
    }

    // Try to match by title
    matchingEvent = events.find(e => 
      e.summary && e.summary.toLowerCase().includes(event.title.toLowerCase())
    );

    // If time specified, also match by time
    if (event.time && matchingEvent) {
      const eventStartTime = new Date(matchingEvent.start.dateTime).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
      });
      
      if (eventStartTime !== event.time) {
        matchingEvent = events.find(e => {
          const startTime = new Date(e.start.dateTime).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: false 
          });
          return startTime === event.time && 
                 e.summary && 
                 e.summary.toLowerCase().includes(event.title.toLowerCase());
        });
      }
    }

    if (!matchingEvent) {
      // Show available events for that day
      const eventList = events.map((e, i) => {
        const start = new Date(e.start.dateTime || e.start.date);
        return `${i + 1}. **${e.summary}** at ${start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
      }).join('\n');
      
      return {
        text: `❌ Couldn't find matching event.\n\n**Events on ${event.date}:**\n${eventList}\n\n` +
              `Try: \`/delete [exact event name] at [time]\``
      };
    }

    // Delete the event
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: matchingEvent.id,
    });

    const startTime = new Date(matchingEvent.start.dateTime || matchingEvent.start.date);
    
    return {
      text: `✅ **Event Deleted Successfully!**\n\n` +
            `🗑️ Deleted: **${matchingEvent.summary}**\n` +
            `📅 Date: ${startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}\n` +
            `⏰ Time: ${startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`
    };

  } catch (error) {
    console.error('Error deleting event:', error);
    return {
      text: `❌ Failed to delete event: ${error.message}`
    };
  }
}

/**
 * Handle /update command - Update specific event
 */
async function handleUpdateCommand(userId, commandArgs) {
  const userTokens = userManager.getUserTokens(userId);
  
  if (!userTokens) {
    return {
      text: "🔗 Please connect your Google Calendar first!"
    };
  }

  if (!commandArgs || commandArgs.trim().length === 0) {
    return {
      text: "❌ Please specify what to update.\n\n" +
            "**Examples:**\n" +
            "• `/update meeting tomorrow at 3 PM to 4 PM`\n" +
            "• `/update team standup change time to 11 AM`\n" +
            "• `/update presentation next Monday move to Tuesday`"
    };
  }

  try {
    // Parse update command - look for keywords
    let originalEventText = commandArgs;
    let updates = {};
    
    // Check for time change keywords
    if (commandArgs.includes(' to ') || commandArgs.includes(' change time to ')) {
      const parts = commandArgs.split(/\s+to\s+|\s+change time to\s+/i);
      originalEventText = parts[0];
      
      // Extract new time from second part
      const newTimePart = parts[1];
      const timeMatch = newTimePart.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
      
      if (timeMatch) {
        let hour = parseInt(timeMatch[1]);
        const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const ampm = timeMatch[3];
        
        if (ampm && ampm.toLowerCase() === 'pm' && hour < 12) {
          hour += 12;
        } else if (ampm && ampm.toLowerCase() === 'am' && hour === 12) {
          hour = 0;
        }
        
        updates.newTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      }
    }
    
    // Check for date change keywords
    if (commandArgs.includes(' move to ') || commandArgs.includes(' reschedule to ')) {
      const parts = commandArgs.split(/\s+move to\s+|\s+reschedule to\s+/i);
      originalEventText = parts[0];
      updates.newDateText = parts[1];
    }

    // Extract original event details
    const aiResult = await perplexityAgent.extractEventDetails(originalEventText, {
      timezone: 'Asia/Kolkata',
      workHours: '09:00-18:00'
    });

    if (!aiResult.success) {
      return {
        text: "❌ I couldn't understand which event to update.\n\nPlease specify the event name, date, and what to change."
      };
    }

    const event = aiResult.event;
    
    // Search for matching event
    const { google } = require('googleapis');
    const oauth2Client = googleCalendar.getOAuthClient();
    oauth2Client.setCredentials(userTokens);
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const startDateTime = `${event.date}T00:00:00+05:30`;
    const endDateTime = `${event.date}T23:59:59+05:30`;
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDateTime,
      timeMax: endDateTime,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    let matchingEvent = events.find(e => 
      e.summary && e.summary.toLowerCase().includes(event.title.toLowerCase())
    );

    if (!matchingEvent) {
      const eventList = events.map((e, i) => {
        const start = new Date(e.start.dateTime || e.start.date);
        return `${i + 1}. **${e.summary}** at ${start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
      }).join('\n');
      
      return {
        text: `❌ Couldn't find matching event.\n\n**Events on ${event.date}:**\n${eventList}`
      };
    }

    // Build update object
    const existingEvent = await calendar.events.get({
      calendarId: 'primary',
      eventId: matchingEvent.id,
    });

    const eventToUpdate = existingEvent.data;
    
    // Apply updates
    if (updates.newTime) {
      const currentStart = new Date(eventToUpdate.start.dateTime);
      const currentEnd = new Date(eventToUpdate.end.dateTime);
      const duration = (currentEnd - currentStart) / (1000 * 60 * 60); // hours
      
      const [newHour, newMinute] = updates.newTime.split(':').map(Number);
      
      const newStart = new Date(currentStart);
      newStart.setHours(newHour, newMinute, 0);
      
      const newEnd = new Date(newStart);
      newEnd.setHours(newHour + Math.floor(duration), newMinute + ((duration % 1) * 60), 0);
      
      eventToUpdate.start.dateTime = newStart.toISOString();
      eventToUpdate.end.dateTime = newEnd.toISOString();
    }
    
    if (updates.newDateText) {
      // Use AI to extract new date
      const newDateAI = await perplexityAgent.extractEventDetails(`event on ${updates.newDateText}`, {
        timezone: 'Asia/Kolkata'
      });
      
      if (newDateAI.success) {
        const oldStart = new Date(eventToUpdate.start.dateTime);
        const oldEnd = new Date(eventToUpdate.end.dateTime);
        
        const [newYear, newMonth, newDay] = newDateAI.event.date.split('-').map(Number);
        
        const newStart = new Date(oldStart);
        newStart.setFullYear(newYear, newMonth - 1, newDay);
        
        const newEnd = new Date(oldEnd);
        newEnd.setFullYear(newYear, newMonth - 1, newDay);
        
        eventToUpdate.start.dateTime = newStart.toISOString();
        eventToUpdate.end.dateTime = newEnd.toISOString();
      }
    }

    // Update the event
    const updatedEvent = await calendar.events.update({
      calendarId: 'primary',
      eventId: matchingEvent.id,
      requestBody: eventToUpdate,
    });

    const newStart = new Date(updatedEvent.data.start.dateTime);
    const newEnd = new Date(updatedEvent.data.end.dateTime);
    
    return {
      text: `✅ **Event Updated Successfully!**\n\n` +
            `📝 Event: **${updatedEvent.data.summary}**\n` +
            `📅 New Date: ${newStart.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}\n` +
            `⏰ New Time: ${newStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} - ` +
            `${newEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}\n\n` +
            `🔗 [View in Calendar](${updatedEvent.data.htmlLink})`
    };

  } catch (error) {
    console.error('Error updating event:', error);
    return {
      text: `❌ Failed to update event: ${error.message}`
    };
  }
}

// ... existing functions ...

/**
 * Handle /balance command - Show work-life balance report
 */
/**
 * Handle /balance command - Show work-life balance report
 */
async function handleBalanceCommand(userId) {
  console.log('📊 Balance command called for user:', userId);
  
  const userTokens = userManager.getUserTokens(userId);
  
  if (!userTokens) {
    console.log('❌ User not connected');
    return {
      text: "🔗 Please connect your Google Calendar first!"
    };
  }

  try {
    console.log('✅ User tokens found, fetching events...');
    
    // Get events from last 7 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    const endDate = new Date();
    
    console.log('📅 Date range:', startDate.toISOString(), 'to', endDate.toISOString());
    
    const { google } = require('googleapis');
    const oauth2Client = googleCalendar.getOAuthClient();
    oauth2Client.setCredentials(userTokens);
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    console.log('🔄 Calling Google Calendar API...');
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    console.log(`✅ Retrieved ${events.length} events`);
    
    // Analyze work-life balance
    console.log('🧠 Analyzing work-life balance...');
    
    const analysis = await workLifeBalanceAI.analyzeWorkLifeBalance(events, {
      workStart: '09:00',
      workEnd: '18:00',
      targetSleepHours: 7
    });

    console.log('📊 Analysis complete:', analysis);

    // Build response text
    const score = analysis.workLifeScore;
    const emoji = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';

    const responseText = `${emoji} **Work-Life Balance Report**\n\n` +
          `📊 Score: ${score}/100\n\n` +
          `**This Week:**\n` +
          `⏱️ Work Hours: ${Math.round(analysis.workHours)} hours\n` +
          `📅 Meetings: ${analysis.meetingsCount}\n` +
          `🧠 Focus Time: ${Math.round(analysis.focusTimeHours)} hours\n` +
          `😴 Avg Sleep: ${analysis.avgSleepHours.toFixed(1)} hours\n\n` +
          `**Issues Found:** ${analysis.issues.length}\n` +
          (analysis.issues.length > 0 ? analysis.issues.map(i => `• ${i}`).join('\n') + '\n\n' : '') +
          `**Recommendations:** ${analysis.recommendations.length}\n` +
          (analysis.recommendations.length > 0 ? analysis.recommendations.map(r => `• ${r}`).join('\n') : '');
    
    console.log('✅ Built response, returning now');
    
    // CRITICAL: Return the response object
    const finalResponse = { text: responseText };
    console.log('✅ Final response object:', finalResponse);
    
    return finalResponse;  // ← MAKE SURE THIS IS HERE!

  } catch (error) {
    console.error('❌ Error analyzing balance:', error);
    console.error('Stack trace:', error.stack);
    return {
      text: `❌ Could not analyze work-life balance: ${error.message}`
    };
  }
}




module.exports = {
  handleTodayCommand,
  handleWeekCommand,
  handleDeleteCommand,
  handleUpdateCommand,
  handleBalanceCommand
};


