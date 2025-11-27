const fs = require('fs');
const path = require('path');
const { encrypt, decrypt } = require('../utils/encryption');

const DB_PATH = path.join(__dirname, 'users.json');

/**
 * Load users from JSON file
 */
function loadUsers() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

/**
 * Save users to JSON file
 */
function saveUsers(users) {
  fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
}

/**
 * Save encrypted tokens for a user
 */
function saveUserTokens(userId, tokens) {
  const users = loadUsers();
  
  const encryptedTokens = {
    access_token: encrypt(tokens.access_token),
    refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    expiry_date: tokens.expiry_date
  };
  
  const existingUserIndex = users.findIndex(u => u.userId === userId);
  
  if (existingUserIndex >= 0) {
    users[existingUserIndex].googleTokens = encryptedTokens;
    users[existingUserIndex].lastUpdated = new Date().toISOString();
  } else {
    users.push({
      userId: userId,
      googleTokens: encryptedTokens,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    });
  }
  
  saveUsers(users);
  console.log('✅ Tokens saved for user:', userId);
}

/**
 * Get decrypted tokens for a user
 */
function getUserTokens(userId) {
  const users = loadUsers();
  const user = users.find(u => u.userId === userId);
  
  if (!user || !user.googleTokens) {
    return null;
  }
  
  return {
    access_token: decrypt(user.googleTokens.access_token),
    refresh_token: user.googleTokens.refresh_token ? decrypt(user.googleTokens.refresh_token) : null,
    expiry_date: user.googleTokens.expiry_date
  };
}

/**
 * Check if user has connected Google Calendar
 */
function isUserConnected(userId) {
  const tokens = getUserTokens(userId);
  return tokens !== null;
}

module.exports = {
  saveUserTokens,
  getUserTokens,
  isUserConnected
};
