const googleCalendar = require('./googleCalendar');
const userManager = require('../db/userManager');
const cliqCards = require('./cliqCards');
const perplexityAgent = require('./perplexityAgent');
const workLifeBalanceAI = require('./workLifeBalanceAI');

async function handleTodayCommand(userId) {
  const userTokens = userManager.getUserTokens(userId);
  
  if (!userTokens) {
    return {
      text: "🔗 Please connect your Google Calendar first!\n\nUse: `/connect` or message me 'connect calendar'"
    };
  }

  try {
    // Get today's date in IST
    const today = new Date();
    const todayIST = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
    
    // Get today's events from Google Calendar
    const { google } = require('googleapis');
    const oauth2Client = googleCalendar.getOAuthClient();
    oauth2Client.setCredentials(userTokens);
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: `${todayIST}T00:00:00+05:30`,
      timeMax: `${todayIST}T23:59:59+05:30`,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    if (events.length === 0) {
      return {
        text: `📅 **Today's Schedule** - ${today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })}\n\n` +
              `✨ No events scheduled today!\n\n` +
              `Perfect day for deep work or catching up on tasks. 💪`
      };
    }

    const scheduleText = events.map(event => {
      const start = new Date(event.start.dateTime || event.start.date);
      const end = new Date(event.end.dateTime || event.end.date);
      const duration = (end - start) / (1000 * 60 * 60); // hours
      
      // Convert to IST for display
      const startTimeIST = start.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false,
        timeZone: 'Asia/Kolkata'
      });
      
      return `• **${startTimeIST}** - ${event.summary} (${duration}h)`;
    }).join('\n');

    return {
      text: `📅 **Today's Schedule** - ${today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })}\n\n` +
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

// Show this week's schedule
async function handleWeekCommand(userId) {
  const userTokens = userManager.getUserTokens(userId);
  
  if (!userTokens) {
    return {
      text: "🔗 Please connect your Google Calendar first!"
    };
  }

  try {
    const today = new Date();
    
    // Get start of week in IST
    const startOfWeek = new Date(today.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);
    
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

    const eventsByDay = {};
    events.forEach(event => {
      const date = new Date(event.start.dateTime || event.start.date);
      const dayKey = date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        timeZone: 'Asia/Kolkata'
      });
      
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
        const timeIST = start.toLocaleTimeString('en-IN', { 
          hour: '2-digit', 
          minute: '2-digit', 
          hour12: false,
          timeZone: 'Asia/Kolkata'
        });
        scheduleText += `  • ${timeIST} - ${event.summary}\n`;
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
    
    let matchingEvent = null;
    
    if (events.length === 0) {
      return {
        text: `❌ No events found on ${event.date}`
      };
    }

    matchingEvent = events.find(e => 
      e.summary && e.summary.toLowerCase().includes(event.title.toLowerCase())
    );

    if (event.time && matchingEvent) {
      const eventStartTime = new Date(matchingEvent.start.dateTime).toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false,
        timeZone: 'Asia/Kolkata'
      });
      
      if (eventStartTime !== event.time) {
        matchingEvent = events.find(e => {
          const startTime = new Date(e.start.dateTime).toLocaleTimeString('en-IN', { 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: false,
            timeZone: 'Asia/Kolkata'
          });
          return startTime === event.time && 
                 e.summary && 
                 e.summary.toLowerCase().includes(event.title.toLowerCase());
        });
      }
    }

    if (!matchingEvent) {
      const eventList = events.map((e, i) => {
        const start = new Date(e.start.dateTime || e.start.date);
        const timeIST = start.toLocaleTimeString('en-IN', { 
          hour: '2-digit', 
          minute: '2-digit', 
          hour12: false,
          timeZone: 'Asia/Kolkata'
        });
        return `${i + 1}. **${e.summary}** at ${timeIST}`;
      }).join('\n');
      
      return {
        text: `❌ Couldn't find matching event.\n\n**Events on ${event.date}:**\n${eventList}\n\n` +
              `Try: \`/delete [exact event name] at [time]\``
      };
    }

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: matchingEvent.id,
    });

    const startTime = new Date(matchingEvent.start.dateTime || matchingEvent.start.date);
    
    return {
      text: `✅ **Event Deleted Successfully!**\n\n` +
            `🗑️ Deleted: **${matchingEvent.summary}**\n` +
            `📅 Date: ${startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' })}\n` +
            `⏰ Time: ${startTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })}`
    };

  } catch (error) {
    console.error('Error deleting event:', error);
    return {
      text: `❌ Failed to delete event: ${error.message}`
    };
  }
}


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
            "• `/update meeting today at 2 PM move to tomorrow 3 PM`\n" +
            "• `/update team standup change time to 11 AM`\n" +
            "• `/update presentation next Monday move to Tuesday`"
    };
  }

  try {
    let originalEventText = commandArgs;
    let updates = {};

    // Parse time changes (to/change time to)
    if (commandArgs.includes(' to ') || commandArgs.includes(' change time to ')) {
      const parts = commandArgs.split(/\s+to\s+|\s+change time to\s+/i);
      originalEventText = parts[0];
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

    // Parse date changes (move to/reschedule to)
    if (commandArgs.includes(' move to ') || commandArgs.includes(' reschedule to ')) {
      const parts = commandArgs.split(/\s+move to\s+|\s+reschedule to\s+/i);
      originalEventText = parts[0];
      updates.newDateText = parts[1];
    }

    // Extract event details with IST context
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
    
    const { google } = require('googleapis');
    const oauth2Client = googleCalendar.getOAuthClient();
    oauth2Client.setCredentials(userTokens);
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Query events for the date in IST
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
    
    // Find matching event by title
    let matchingEvent = events.find(e => 
      e.summary && e.summary.toLowerCase().includes(event.title.toLowerCase())
    );

   if (!matchingEvent) {
  return {
    text: `❌ Couldn't find "${event.title}" on ${new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' })}.\n\n` +
          `**Update syntax:**\n` +
          `• Time: \`/update [event] to [time]\`\n` +
          `• Date: \`/update [event] move to [date]\`\n` +
          `• Both: \`/update [event] move to [date] [time]\`\n\n` +
          `Example: \`/update meeting today move to tomorrow 3 PM\``
  };
}


    // Get full event details
    const existingEvent = await calendar.events.get({
      calendarId: 'primary',
      eventId: matchingEvent.id,
    });

    const eventToUpdate = existingEvent.data;

    // Update time if specified
    if (updates.newTime) {
      // Check if all-day event
      if (eventToUpdate.start.date) {
        return { 
          text: "❌ Cannot set specific time for an all-day event. Please update it in Google Calendar directly." 
        };
      }

      // Get original ISO strings
      const origStartISO = eventToUpdate.start.dateTime;
      const origEndISO = eventToUpdate.end.dateTime;

      // Extract date part
      const datePart = origStartISO.split('T')[0];

      // Compose new start with IST offset
      const newStartISOWithTZ = `${datePart}T${updates.newTime}:00+05:30`;

      // Calculate duration
      const origStart = new Date(origStartISO);
      const origEnd = new Date(origEndISO);
      const durationMs = origEnd.getTime() - origStart.getTime();

      // Create new start and end
      const newStart = new Date(newStartISOWithTZ);
      const newEnd = new Date(newStart.getTime() + durationMs);

      eventToUpdate.start.dateTime = newStart.toISOString();
      eventToUpdate.end.dateTime = newEnd.toISOString();
    }
    
    // Update date if specified
    if (updates.newDateText) {
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

    // Update the event in Google Calendar
    const updatedEvent = await calendar.events.update({
      calendarId: 'primary',
      eventId: matchingEvent.id,
      requestBody: eventToUpdate,
    });

    // Format response with IST times
    const newStart = new Date(updatedEvent.data.start.dateTime);
    const newEnd = new Date(updatedEvent.data.end.dateTime);
    
    return {
      text: `✅ **Event Updated Successfully!**\n\n` +
            `📝 Event: **${updatedEvent.data.summary}**\n` +
            `📅 New Date: ${newStart.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' })}\n` +
            `⏰ New Time: ${newStart.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })} - ` +
            `${newEnd.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })}\n\n` +
            `🔗 [View in Calendar](${updatedEvent.data.htmlLink})`
    };

  } catch (error) {
    console.error('Error updating event:', error);
    return {
      text: `❌ Failed to update event: ${error.message}`
    };
  }
}


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
    
    // Get events from last 7 days in IST
    const now = new Date();
    const startDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    endDate.setHours(23, 59, 59, 999);
    
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
    console.log('🧠 Analyzing work-life balance...');
    
    const analysis = await workLifeBalanceAI.analyzeWorkLifeBalance(events, {
      workStart: '09:00',
      workEnd: '18:00',
      targetSleepHours: 7
    });

    console.log('📊 Analysis complete:', analysis);
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
    const finalResponse = { text: responseText };
    console.log('✅ Final response object:', finalResponse);
    
    return finalResponse; 

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
