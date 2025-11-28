function buildSuccessCard(event, eventLink, endTime) {
  const response = {};
  response.text = "✅ Event Created Successfully!";
  const card = {};
  card.title = `📅 ${event.title}`;
  card.theme = "modern-inline";
  response.card = card;
  const slides = [];
  const slide1 = {};
  slide1.type = "text";
  slide1.title = "📋 Event Details";
  slide1.data = `**Date:** ${formatDate(event.date)}\n` +
                `**Time:** ${event.time} - ${endTime}\n` +
                `**Duration:** ${event.duration} hour${event.duration > 1 ? 's' : ''}\n` +
                `**Type:** ${event.type}\n` +
                `**Priority:** ${event.priority}`;
  slides.push(slide1);
  const slide2 = {};
  slide2.type = "text";
  slide2.title = "🔔 Reminders";
  slide2.data = "Reminders set for 30 and 10 minutes before the event";
  slides.push(slide2);

  response.slides = slides;

  const buttons = [];
  
  const btn = {};
  btn.label = "🗓️ Open Calendar"; 
  btn.type = "+";
  
  const action = {};
  action.type = "open.url";
  
  const dataObj = {};
  dataObj.web = eventLink;
  action.data = dataObj;
  
  btn.action = action;
  buttons.push(btn);

  response.buttons = buttons;

  return response;
}


//  Daily briefing card
 
function buildDailyBriefingCard(schedule, tasks, suggestions) {
  const now = new Date();
  const greeting = now.getHours() < 12 ? '🌅 Good Morning!' : 
                   now.getHours() < 18 ? '☀️ Good Afternoon!' : '🌙 Good Evening!';
  
  const response = {};
  response.text = `${greeting} Here's your day at a glance`;

  const card = {};
  card.title = `📊 Your Schedule`;
  card.theme = "modern-inline";
  response.card = card;

  const slides = [];
  const slide1 = {};
  slide1.type = "text";
  slide1.title = "📅 Today's Events";
  if (schedule.length > 0) {
    slide1.data = schedule.map(event => 
      `• **${event.time}** - ${event.title} (${event.duration}h)`
    ).join('\n');
  } else {
    slide1.data = "✨ No events scheduled - perfect day for deep work!";
  }
  slides.push(slide1);
  const slide2 = {};
  slide2.type = "text";
  slide2.title = "✅ Tasks Due Today";
  if (tasks.length > 0) {
    slide2.data = tasks.map(task => {
      const emoji = task.priority === 'high' ? '🔴' : 
                    task.priority === 'medium' ? '🟡' : '🟢';
      return `• ${emoji} ${task.title}`;
    }).join('\n');
  } else {
    slide2.data = "✨ No urgent tasks today";
  }
  slides.push(slide2);
  const slide3 = {};
  slide3.type = "text";
  slide3.title = "💡 AI Suggestions";
  slide3.data = suggestions.map(s => `• ${s}`).join('\n');
  slides.push(slide3);
  response.slides = slides;
  const buttons = [];
  const btn1 = {};
  btn1.label = "➕ Add Task"; 
  btn1.type = "+";
  btn1.action = {
    type: "invoke.function",
    data: { action: "add_task" }
  };
  buttons.push(btn1);
  const btn2 = {};
  btn2.label = "📊 View Week"; 
  btn2.type = "=";
  btn2.action = {
    type: "invoke.function",
    data: { action: "view_week" }
  };
  buttons.push(btn2);
  response.buttons = buttons;
  return response;
}


// Work-life balance report card
 
function buildWorkLifeBalanceCard(metrics) {
  const score = metrics.workLifeScore;
  const emoji = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';
  const response = {};
  response.text = `${emoji} Work-Life Balance Score: ${score}/100`;
  const card = {};
  card.title = "🧘 Balance Report";
  card.theme = "modern-inline";
  response.card = card;
  const slides = [];
  const slide1 = {};
  slide1.type = "text";
  slide1.title = "📊 This Week";
  slide1.data = `⏱️ **Work Hours:** ${metrics.workHours} hours\n` +
                `📅 **Meetings:** ${metrics.meetingsCount} meetings\n` +
                `🧠 **Focus Time:** ${metrics.focusTimeHours} hours\n` +
                `😴 **Average Sleep:** ${metrics.avgSleepHours} hours`;
  slides.push(slide1);
  if (metrics.issues && metrics.issues.length > 0) {
    const slide2 = {};
    slide2.type = "text";
    slide2.title = "⚠️ Issues Found";
    slide2.data = metrics.issues.map(i => `• ${i}`).join('\n');
    slides.push(slide2);
  }
  if (metrics.recommendations && metrics.recommendations.length > 0) {
    const slide3 = {};
    slide3.type = "text";
    slide3.title = "✅ Recommendations";
    slide3.data = metrics.recommendations.map(r => `• ${r}`).join('\n');
    slides.push(slide3);
  }

  response.slides = slides;
const buttons = [];
const btn = {};
btn.label = "📈 Full Report";
btn.type = "+";
const action = {};
action.type = "invoke.function";
const actionData = {};
actionData.command = "detailed_report";  
action.data = actionData;
btn.action = action;
buttons.push(btn);
response.buttons = buttons;
}


// Task prioritization card
 
function buildTaskPrioritizationCard(schedule) {
  const response = {};
  response.text = "📋 Smart Schedule Suggestion";

  const card = {};
  card.title = "⚡ Task Priority";
  card.theme = "modern-inline";
  response.card = card;
  const slides = [];
  const morningTasks = schedule.filter(t => t.timeSlot === 'morning');
  if (morningTasks.length > 0) {
    const slide1 = {};
    slide1.type = "text";
    slide1.title = "🌅 Morning (9-12)";
    slide1.data = morningTasks.map(t => 
      `• **${t.time}** - ${t.title} (${t.duration}h)\n  _Why: ${t.reason}_`
    ).join('\n\n');
    slides.push(slide1);
  }
  const afternoonTasks = schedule.filter(t => t.timeSlot === 'afternoon');
  if (afternoonTasks.length > 0) {
    const slide2 = {};
    slide2.type = "text";
    slide2.title = "☀️ Afternoon (1-5)";
    slide2.data = afternoonTasks.map(t => 
      `• **${t.time}** - ${t.title} (${t.duration}h)\n  _Why: ${t.reason}_`
    ).join('\n\n');
    slides.push(slide2);
  }

  response.slides = slides;
  const buttons = [];
  
  const btn = {};
  btn.label = "✅ Apply Schedule"; 
  btn.type = "+";
  btn.action = {
    type: "invoke.function",
    data: { action: "apply_schedule" }
  };
  buttons.push(btn);

  response.buttons = buttons;

  return response;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric',
    year: 'numeric'
  });
} 

module.exports = {
  buildSuccessCard,
  buildDailyBriefingCard,
  buildWorkLifeBalanceCard,
  buildTaskPrioritizationCard
};
