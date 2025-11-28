require('dotenv').config();
const perplexityAgent = require('./perplexityAgent');

async function analyzeWorkLifeBalance(events, userPreferences = {}) {
  const analysis = {
    workHours: 0,
    meetingsCount: 0,
    focusTimeHours: 0,
    overTimeHours: 0,
    avgSleepHours: 0,
    workLifeScore: 0,
    issues: [],
    recommendations: []
  };

  const workStart = userPreferences.workStart || '09:00';
  const workEnd = userPreferences.workEnd || '18:00';
  const targetSleepHours = userPreferences.targetSleepHours || 7;
  events.forEach(event => {
    const start = new Date(event.start.dateTime || event.start.date);
    const end = new Date(event.end.dateTime || event.end.date);
    const duration = (end - start) / (1000 * 60 * 60); // hours
    const eventHour = start.getHours();
    if (eventHour >= parseInt(workStart.split(':')[0]) && 
        eventHour < parseInt(workEnd.split(':')[0])) {
      analysis.workHours += duration;
      if (event.summary.toLowerCase().includes('meeting') || 
          event.summary.toLowerCase().includes('call') ||
          event.summary.toLowerCase().includes('sync')) {
        analysis.meetingsCount++;
      }
    } else {
      analysis.overTimeHours += duration;
    }
    if (event.summary.toLowerCase().includes('focus') || 
        event.summary.toLowerCase().includes('deep work') ||
        event.summary.toLowerCase().includes('coding')) {
      analysis.focusTimeHours += duration;
    }
  });
  const sleepEvents = events.filter(e => 
    e.summary.toLowerCase().includes('sleep') || 
    e.summary.toLowerCase().includes('bedtime')
  );
  
  if (sleepEvents.length > 0) {
    const totalSleepHours = sleepEvents.reduce((sum, e) => {
      const start = new Date(e.start.dateTime || e.start.date);
      const end = new Date(e.end.dateTime || e.end.date);
      return sum + ((end - start) / (1000 * 60 * 60));
    }, 0);
    analysis.avgSleepHours = totalSleepHours / sleepEvents.length;
  } else {
    analysis.avgSleepHours = 7; 
  }
  if (analysis.workHours > 45) {
    analysis.issues.push(`⚠️ Working ${Math.round(analysis.workHours)} hours (recommended: max 40)`);
  }
  
  if (analysis.meetingsCount > 15) {
    analysis.issues.push(`⚠️ ${analysis.meetingsCount} meetings this week (recommended: max 12)`);
  }
  
  if (analysis.focusTimeHours < 10) {
    analysis.issues.push(`⚠️ Only ${Math.round(analysis.focusTimeHours)} hours of focus time (recommended: 15+)`);
  }
  
  if (analysis.overTimeHours > 5) {
    analysis.issues.push(`⚠️ ${Math.round(analysis.overTimeHours)} hours of overtime work`);
  }
  
  if (analysis.avgSleepHours < targetSleepHours) {
    analysis.issues.push(`⚠️ Average ${analysis.avgSleepHours.toFixed(1)} hours sleep (target: ${targetSleepHours})`);
  }
  if (analysis.meetingsCount > 12) {
    analysis.recommendations.push('📅 Consider declining optional meetings or combining similar ones');
  }
  
  if (analysis.focusTimeHours < 15) {
    analysis.recommendations.push('🧠 Block 2-3 hour focus time sessions daily for deep work');
  }
  
  if (analysis.workHours > 40) {
    analysis.recommendations.push('⏰ Try to limit work to 8 hours per day maximum');
  }
  
  if (analysis.overTimeHours > 3) {
    analysis.recommendations.push('🌙 Avoid scheduling work outside 9 AM - 6 PM');
  }
  
  if (analysis.avgSleepHours < targetSleepHours) {
    analysis.recommendations.push('😴 Schedule consistent sleep times: aim for 7-8 hours nightly');
  }
  if (analysis.meetingsCount > 0 && analysis.focusTimeHours === 0) {
    analysis.recommendations.push('💡 Balance meetings with dedicated focus time blocks');
  }

  let score = 100;
  
  score -= Math.max(0, (analysis.workHours - 40) * 2); // -2 points per hour over 40
  score -= Math.max(0, (analysis.meetingsCount - 12) * 3); // -3 points per meeting over 12
  score -= Math.max(0, (15 - analysis.focusTimeHours) * 2); // -2 points for missing focus time
  score -= analysis.overTimeHours * 5; // -5 points per overtime hour
  score -= Math.max(0, (targetSleepHours - analysis.avgSleepHours) * 10); // -10 points per hour under target
  
  analysis.workLifeScore = Math.max(0, Math.min(100, Math.round(score)));

  if (analysis.issues.length === 0) {
    analysis.recommendations.push('✅ Great balance! Keep maintaining this schedule');
    analysis.recommendations.push('🎯 Continue prioritizing sleep and focus time');
  }

  return analysis;
}
 
 
async function getSmartSchedulingSuggestions(tasks, existingEvents) {
  const currentDate = new Date();
  
  const prompt = `You are a productivity expert. Given these tasks and existing calendar events, suggest the optimal schedule.

Current date: ${currentDate.toISOString().split('T')[0]}
Work hours: 9 AM - 6 PM

Tasks to schedule:
${tasks.map(t => `- ${t.title} (${t.duration} hours, priority: ${t.priority})`).join('\n')}

Existing events today:
${existingEvents.map(e => {
  const start = new Date(e.start.dateTime);
  return `- ${start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}: ${e.summary}`;
}).join('\n')}

Rules:
1. High-priority tasks in morning (peak energy)
2. Meetings in afternoon
3. 15-min break between tasks
4. No more than 2 consecutive meetings
5. Lunch break 1-2 PM

Provide optimal schedule with reasoning for each task placement.
Return as JSON array with format:
[{"task": "name", "time": "HH:MM", "reason": "why this time"}]`;

  try {
    const result = await perplexityAgent.suggestOptimalSchedule(tasks, 'today');
    
    if (result.success) {
      return {
        success: true,
        suggestions: result.suggestions
      };
    }
    
    return {
      success: false,
      error: 'Could not generate suggestions'
    };
    
  } catch (error) {
    console.error('Error getting AI suggestions:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  analyzeWorkLifeBalance,
  getSmartSchedulingSuggestions
};
