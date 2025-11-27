// /**
//  * Build interactive cards for Zoho Cliq responses
//  */

// /**
//  * Event confirmation card with action buttons
//  */
// function buildEventConfirmationCard(event, eventLink) {
//   return {
//     text: `✅ **Event Ready to Create**`,
//     card: {
//       theme: "modern-inline",
//       title: event.title,
//       sections: [
//         {
//           id: 1,
//           elements: [
//             {
//               type: "text",
//               text: `📅 **Date:** ${formatDate(event.date)}`
//             },
//             {
//               type: "text",
//               text: `⏰ **Time:** ${event.time} (${event.duration} hour${event.duration > 1 ? 's' : ''})`
//             },
//             {
//               type: "text",
//               text: `🏷️ **Type:** ${event.type}`
//             },
//             {
//               type: "text",
//               text: `⚡ **Priority:** ${event.priority}`
//             }
//           ]
//         }
//       ],
//       buttons: [
//         {
//           label: "✅ Confirm & Create",
//           type: "+",
//           action: {
//             type: "invoke.function",
//             data: {
//               action: "confirm_event",
//               event: JSON.stringify(event)
//             }
//           }
//         },
//         {
//           label: "🔄 Suggest Different Time",
//           type: "=",
//           action: {
//             type: "invoke.function",
//             data: {
//               action: "suggest_time",
//               event: JSON.stringify(event)
//             }
//           }
//         },
//         {
//           label: "❌ Cancel",
//           type: "-",
//           action: {
//             type: "invoke.function",
//             data: {
//               action: "cancel"
//             }
//           }
//         }
//       ]
//     }
//   };
// }

// /**
//  * Event created success card
//  */
// /**
//  * Event created success card - Cliq-compatible format
//  */
// function buildSuccessCard(event, eventLink, endTime) {
//   return {
//     text: `✅ Event Created Successfully!`,
//     card: {
//       theme: "modern-inline",
//       title: `📅 ${event.title}`,
//       sections: [
//         {
//           id: 1,
//           elements: [
//             {
//               type: "text",
//               text: `**Date:** ${formatDate(event.date)}`
//             },
//             {
//               type: "text",
//               text: `**Time:** ${event.time} - ${endTime}`
//             },
//             {
//               type: "text",
//               text: `**Duration:** ${event.duration} hour${event.duration > 1 ? 's' : ''}`
//             },
//             {
//               type: "text",
//               text: `**Type:** ${event.type}`
//             },
//             {
//               type: "text",
//               text: `**Priority:** ${event.priority}`
//             }
//           ]
//         },
//         {
//           id: 2,
//           elements: [
//             {
//               type: "text",
//               text: `🔔 Reminders set for 30 and 10 minutes before`
//             }
//           ]
//         }
//       ],
//       buttons: [
//         {
//           label: "View in Calendar",
//           type: "+",
//           action: {
//             type: "open.url",
//             url: eventLink
//           }
//         }
//       ]
//     }
//   };
// }


// /**
//  * Daily briefing card
//  */
// function buildDailyBriefingCard(schedule, tasks, suggestions) {
//   const now = new Date();
//   const greeting = now.getHours() < 12 ? '🌅 Good Morning!' : 
//                    now.getHours() < 18 ? '☀️ Good Afternoon!' : '🌙 Good Evening!';
  
//   return {
//     text: `${greeting} Here's your day at a glance`,
//     card: {
//       theme: "modern-inline",
//       title: `📊 Your Schedule - ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`,
//       sections: [
//         {
//           id: 1,
//           title: "📅 Today's Events",
//           elements: schedule.length > 0 ? 
//             schedule.map(event => ({
//               type: "text",
//               text: `• **${event.time}** - ${event.title} (${event.duration}h)`
//             })) : 
//             [{
//               type: "text",
//               text: "✨ No events scheduled - perfect day for deep work!"
//             }]
//         },
//         {
//           id: 2,
//           title: "✅ Tasks Due Today",
//           elements: tasks.length > 0 ?
//             tasks.map(task => ({
//               type: "text",
//               text: `• ${task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'} ${task.title}`
//             })) :
//             [{
//               type: "text",
//               text: "✨ No urgent tasks today"
//             }]
//         },
//         {
//           id: 3,
//           title: "💡 AI Suggestions",
//           elements: suggestions.map(suggestion => ({
//             type: "text",
//             text: `• ${suggestion}`
//           }))
//         }
//       ],
//       buttons: [
//         {
//           label: "➕ Add Task",
//           type: "+",
//           action: {
//             type: "invoke.function",
//             data: { action: "add_task" }
//           }
//         },
//         {
//           label: "📊 View Full Week",
//           type: "=",
//           action: {
//             type: "invoke.function",
//             data: { action: "view_week" }
//           }
//         }
//       ]
//     }
//   };
// }

// /**
//  * Work-life balance report card
//  */
// function buildWorkLifeBalanceCard(metrics) {
//   const score = metrics.workLifeScore;
//   const emoji = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';
  
//   return {
//     text: `${emoji} Work-Life Balance Score: ${score}/100`,
//     card: {
//       theme: score >= 80 ? "modern-success" : score >= 60 ? "modern-warning" : "modern-error",
//       title: "🧘 Work-Life Balance Report",
//       sections: [
//         {
//           id: 1,
//           title: "📊 This Week",
//           elements: [
//             {
//               type: "text",
//               text: `⏱️ **Work Hours:** ${metrics.workHours} hours`
//             },
//             {
//               type: "text",
//               text: `📅 **Meetings:** ${metrics.meetingsCount} meetings`
//             },
//             {
//               type: "text",
//               text: `🧠 **Focus Time:** ${metrics.focusTimeHours} hours`
//             },
//             {
//               type: "text",
//               text: `😴 **Average Sleep:** ${metrics.avgSleepHours} hours`
//             }
//           ]
//         },
//         {
//           id: 2,
//           title: "⚠️ Issues Found",
//           elements: metrics.issues.map(issue => ({
//             type: "text",
//             text: `• ${issue}`
//           }))
//         },
//         {
//           id: 3,
//           title: "✅ Recommendations",
//           elements: metrics.recommendations.map(rec => ({
//             type: "text",
//             text: `• ${rec}`
//           }))
//         }
//       ],
//       buttons: [
//         {
//           label: "📊 Detailed Report",
//           type: "+",
//           action: {
//             type: "invoke.function",
//             data: { action: "detailed_report" }
//           }
//         }
//       ]
//     }
//   };
// }

// // Helper function
// function formatDate(dateString) {
//   const date = new Date(dateString);
//   return date.toLocaleDateString('en-US', { 
//     weekday: 'long', 
//     month: 'long', 
//     day: 'numeric',
//     year: 'numeric'
//   });
// }

// module.exports = {
//   buildEventConfirmationCard,
//   buildSuccessCard,
//   buildDailyBriefingCard,
//   buildWorkLifeBalanceCard
// };



/**
 * Build interactive cards for Zoho Cliq responses using correct card format
 */

/**
 * Event created success card - Working Cliq format
 *//**
 * Build interactive cards for Zoho Cliq responses using correct card format
 */

/**
 * Event created success card - Working Cliq format
 */
function buildSuccessCard(event, eventLink, endTime) {
  const response = {};
  response.text = "✅ Event Created Successfully!";

  // Card meta - only title/theme allowed
  const card = {};
  card.title = `📅 ${event.title}`;
  card.theme = "modern-inline";
  response.card = card;

  // Slides: show details
  const slides = [];

  // Slide 1: Event details
  const slide1 = {};
  slide1.type = "text";
  slide1.title = "📋 Event Details";
  slide1.data = `**Date:** ${formatDate(event.date)}\n` +
                `**Time:** ${event.time} - ${endTime}\n` +
                `**Duration:** ${event.duration} hour${event.duration > 1 ? 's' : ''}\n` +
                `**Type:** ${event.type}\n` +
                `**Priority:** ${event.priority}`;
  slides.push(slide1);

  // Slide 2: Reminders info
  const slide2 = {};
  slide2.type = "text";
  slide2.title = "🔔 Reminders";
  slide2.data = "Reminders set for 30 and 10 minutes before the event";
  slides.push(slide2);

  response.slides = slides;

  // Buttons at top level
  const buttons = [];
  
  const btn = {};
  btn.label = "🗓️ Open Calendar"; // 16 chars ✅
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

/**
 * Daily briefing card
 */
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

  // Slide 1: Today's events
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

  // Slide 2: Tasks
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

  // Slide 3: AI suggestions
  const slide3 = {};
  slide3.type = "text";
  slide3.title = "💡 AI Suggestions";
  slide3.data = suggestions.map(s => `• ${s}`).join('\n');
  slides.push(slide3);

  response.slides = slides;

  // Buttons
  const buttons = [];
  
  const btn1 = {};
  btn1.label = "➕ Add Task"; // 10 chars ✅
  btn1.type = "+";
  btn1.action = {
    type: "invoke.function",
    data: { action: "add_task" }
  };
  buttons.push(btn1);

  const btn2 = {};
  btn2.label = "📊 View Week"; // 11 chars ✅
  btn2.type = "=";
  btn2.action = {
    type: "invoke.function",
    data: { action: "view_week" }
  };
  buttons.push(btn2);

  response.buttons = buttons;

  return response;
}

/**
 * Work-life balance report card
 */
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

  // Slide 1: Metrics
  const slide1 = {};
  slide1.type = "text";
  slide1.title = "📊 This Week";
  slide1.data = `⏱️ **Work Hours:** ${metrics.workHours} hours\n` +
                `📅 **Meetings:** ${metrics.meetingsCount} meetings\n` +
                `🧠 **Focus Time:** ${metrics.focusTimeHours} hours\n` +
                `😴 **Average Sleep:** ${metrics.avgSleepHours} hours`;
  slides.push(slide1);

  // Slide 2: Issues
  if (metrics.issues && metrics.issues.length > 0) {
    const slide2 = {};
    slide2.type = "text";
    slide2.title = "⚠️ Issues Found";
    slide2.data = metrics.issues.map(i => `• ${i}`).join('\n');
    slides.push(slide2);
  }

  // Slide 3: Recommendations
  if (metrics.recommendations && metrics.recommendations.length > 0) {
    const slide3 = {};
    slide3.type = "text";
    slide3.title = "✅ Recommendations";
    slide3.data = metrics.recommendations.map(r => `• ${r}`).join('\n');
    slides.push(slide3);
  }

  response.slides = slides;

  // Button
  const buttons = [];
  
  const btn = {};
  btn.label = "📈 Full Report"; // 13 chars ✅
  btn.type = "+";
  btn.action = {
    type: "invoke.function",
    data: { action: "detailed_report" }
  };
  buttons.push(btn);

  response.buttons = buttons;

  return response;
}

/**
 * Task prioritization card
 */
function buildTaskPrioritizationCard(schedule) {
  const response = {};
  response.text = "📋 Smart Schedule Suggestion";

  const card = {};
  card.title = "⚡ Task Priority";
  card.theme = "modern-inline";
  response.card = card;

  const slides = [];

  // Morning tasks
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

  // Afternoon tasks
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

  // Button
  const buttons = [];
  
  const btn = {};
  btn.label = "✅ Apply Schedule"; // 16 chars ✅
  btn.type = "+";
  btn.action = {
    type: "invoke.function",
    data: { action: "apply_schedule" }
  };
  buttons.push(btn);

  response.buttons = buttons;

  return response;
}

// Helper function
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
