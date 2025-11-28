const axios = require('axios');
require('dotenv').config();
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

async function extractEventDetails(userMessage, userContext = {}) {
  const currentDate = new Date();
  const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
  
  const systemPrompt = `You are an intelligent calendar assistant that extracts structured event information from natural language.

Current Context:
- Today's Date: ${currentDate.toISOString().split('T')[0]} (${dayOfWeek})
- Current Time: ${currentDate.toTimeString().slice(0, 5)}
- User Timezone: ${userContext.timezone || 'Asia/Kolkata'}
- Work Hours: ${userContext.workHours || '09:00-18:00'}

Your task: Extract event details and return a JSON object with these fields:
{
  "title": "string - event name/title",
  "date": "YYYY-MM-DD - calculated date",
  "time": "HH:MM - 24-hour format, suggest if not specified",
  "duration": "number - hours (default: 1 for meetings, 2 for tasks)",
  "type": "meeting|task|focus_block|reminder",
  "priority": "low|medium|high|urgent",
  "participants": ["email1", "email2"] - if mentioned,
  "description": "string - any additional context",
  "flexible": boolean - can this be rescheduled if needed?
}

Date interpretation rules:
- "tomorrow" = ${new Date(Date.now() + 86400000).toISOString().split('T')[0]}
- "next Monday" = next occurring Monday from today
- "this Friday" = upcoming Friday this week
- "in 3 days" = calculate from today

Time interpretation:
- "morning" = 09:00-12:00 (suggest 10:00)
- "afternoon" = 13:00-17:00 (suggest 14:00)
- "evening" = 17:00-20:00 (suggest 18:00)
- No time specified for meetings = suggest 10:00
- No time specified for tasks = suggest 14:00

Return ONLY valid JSON, no markdown or explanation.`;

  try {
    const response = await axios.post(
      PERPLEXITY_API_URL,
      {
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        temperature: 0.2,
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const aiResponse = response.data.choices[0].message.content;
    console.log('📊 Perplexity AI Response:', aiResponse);
let eventData;
try {
  let cleanedResponse = aiResponse.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.substring(7); 
      }
      if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.substring(3); 
      }
      if (cleanedResponse.endsWith('```')) {
        cleanedResponse = cleanedResponse.substring(0, cleanedResponse.length - 3); 
      }
      
      cleanedResponse = cleanedResponse.trim();
      
      eventData = JSON.parse(cleanedResponse);
  
  eventData = JSON.parse(cleanedResponse);
} catch (parseError) {
  console.error('❌ JSON parse error:', parseError);
  return {
    success: false,
    error: 'Could not parse AI response',
    rawResponse: aiResponse
  };
}
    if (!eventData.title || !eventData.date) {
      return {
        success: false,
        error: 'Missing required fields (title or date)',
        data: eventData
      };
    }

    console.log('✅ Extracted event:', eventData);

    return {
      success: true,
      event: eventData,
      confidence: 'high'
    };

  } catch (error) {
    console.error('❌ Perplexity API error:', error.response?.data || error.message);
    
    return {
      success: false,
      error: error.response?.data?.error || error.message,
      message: 'Failed to process with AI'
    };
  }
}

async function suggestOptimalSchedule(tasks, timeframe = 'today') {
  const systemPrompt = `You are a productivity expert. Analyze the given tasks and suggest an optimal schedule.

Consider:
- Task priority and deadlines
- Estimated duration
- Energy levels (high focus work in morning, meetings afternoon)
- Break time between tasks (minimum 15 min)
- No more than 2 consecutive meetings
- Lunch break 13:00-14:00

Return JSON with suggested schedule for each task.`;

  try {
    const response = await axios.post(
      PERPLEXITY_API_URL,
      {
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Tasks: ${JSON.stringify(tasks)}\nTimeframe: ${timeframe}`
          }
        ],
        temperature: 0.3,
        max_tokens: 800
      },
      {
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      suggestions: response.data.choices[0].message.content
    };

  } catch (error) {
    console.error('❌ Schedule suggestion error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  extractEventDetails,
  suggestOptimalSchedule
};
