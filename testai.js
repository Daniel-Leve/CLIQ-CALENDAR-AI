require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.PERPLEXITY_API_KEY;

console.log('Testing Perplexity API...');
console.log('API Key:', API_KEY ? API_KEY.substring(0, 10) + '...' : 'MISSING');

axios.post(
  'https://api.perplexity.ai/chat/completions',
  {
    model: 'sonar',
    messages: [
      { role: 'user', content: 'Say hello' }
    ]
  },
  {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  }
)
.then(response => {
  console.log('✅ SUCCESS!');
  console.log('Response:', response.data.choices[0].message.content);
})
.catch(error => {
  console.log('❌ FAILED');
  console.log('Error:', error.response?.data || error.message);
});
