const axios = require('axios');
require('dotenv').config();
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

async function suggestOptimalPlan(tasks, userContext = {}) {
  const currentDate = new Date();
  const currentTime = currentDate.toTimeString().slice(0, 5);
  const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
  
  const systemPrompt = `You are a productivity expert. Create an optimal task schedule.

Context: ${currentDate.toISOString().split('T')[0]} (${dayOfWeek}), ${currentTime}
Work Hours: ${userContext.workHours || '09:00-18:00'}

CRITICAL INSTRUCTION: Return ONLY a valid JSON array. NO explanations, NO text before or after, NO markdown.

Required format:
[
  {
    "task": "Task name",
    "priority": "high|medium|low",
    "complexity": "high|medium|low",
    "suggestedTime": "HH:MM",
    "duration": 1.5,
    "reasoning": "Brief reason",
    "type": "meeting|focus_work|routine"
  }
]`;

  try {
    const response = await axios.post(
      PERPLEXITY_API_URL,
      {
        model: 'sonar',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Tasks: ${tasks}. Return ONLY JSON array, nothing else.` }
        ],
        temperature: 0.2,
        max_tokens: 1500
      },
      {
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const aiResponse = response.data.choices[0].message.content;
    console.log('🧠 AI Response (first 500 chars):', aiResponse.substring(0, 500));
    let plan;
    try {
      let cleaned = aiResponse.trim();
      const jsonArrayMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonArrayMatch) {
        cleaned = jsonArrayMatch[0];
        console.log('✅ Extracted JSON array using regex');
      } else {
        const startIdx = cleaned.indexOf('[');
        const endIdx = cleaned.lastIndexOf(']');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          cleaned = cleaned.substring(startIdx, endIdx + 1);
          console.log('✅ Extracted JSON using bracket search');
        } else {
          throw new Error('No JSON array found in response');
        }
      }
      cleaned = cleaned.replace(/``````/g, '').trim();
      
      console.log('🔍 Cleaned JSON (first 200 chars):', cleaned.substring(0, 200));
      
      plan = JSON.parse(cleaned);
      
    } catch (parseError) {
      console.error('❌ Parse error:', parseError.message);
      console.error('📝 Full AI response:', aiResponse);
      
      return {
        success: false,
        error: 'Could not parse AI response as JSON',
        rawResponse: aiResponse
      };
    }
    if (!Array.isArray(plan) || plan.length === 0) {
      console.error('❌ Invalid structure - not an array or empty');
      return {
        success: false,
        error: 'AI returned invalid plan structure'
      };
    }
    console.log(`✅ Plan generated: ${plan.length} tasks`);

    return {
      success: true,
      plan: plan,
      summary: generatePlanSummary(plan)
    };
  } catch (error) {
    console.error('❌ API error:', error.response?.data || error.message);
    
    return {
      success: false,
      error: error.response?.data?.error || error.message,
      message: 'Failed to generate plan'
    };
  }
}

function generatePlanSummary(plan) {
  const totalDuration = plan.reduce((sum, task) => sum + (task.duration || 1), 0);
  const highPriorityCount = plan.filter(t => t.priority === 'high').length;
  
  return {
    totalTasks: plan.length,
    totalDuration: totalDuration,
    highPriorityTasks: highPriorityCount,
    startTime: plan[0]?.suggestedTime || '09:00',
    endTime: calculateEndTime(plan)
  };
}

function calculateEndTime(plan) {
  if (!plan || plan.length === 0) return '09:00';
  
  const lastTask = plan[plan.length - 1];
  const [hours, minutes] = (lastTask.suggestedTime || '09:00').split(':').map(Number);
  const duration = lastTask.duration || 1;
  
  const endHours = hours + Math.floor(duration);
  const endMinutes = minutes + ((duration % 1) * 60);
  
  return `${String(endHours).padStart(2, '0')}:${String(Math.floor(endMinutes)).padStart(2, '0')}`;
}

module.exports = {
  suggestOptimalPlan
};
