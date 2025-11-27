// const fs = require('fs');
// const path = require('path');
// const { encrypt, decrypt } = require('../utils/encryption');

// const DB_PATH = path.join(__dirname, 'users.json');

// /**
//  * Load users from JSON file
//  */
// function loadUsers() {
//   try {
//     const data = fs.readFileSync(DB_PATH, 'utf8');
//     return JSON.parse(data);
//   } catch (error) {
//     return [];
//   }
// }

// /**
//  * Save users to JSON file
//  */
// function saveUsers(users) {
//   fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
// }

// /**
//  * Save encrypted tokens for a user
//  */
// function saveUserTokens(userId, tokens) {
//   const users = loadUsers();
  
//   const encryptedTokens = {
//     access_token: encrypt(tokens.access_token),
//     refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
//     expiry_date: tokens.expiry_date
//   };
  
//   const existingUserIndex = users.findIndex(u => u.userId === userId);
  
//   if (existingUserIndex >= 0) {
//     users[existingUserIndex].googleTokens = encryptedTokens;
//     users[existingUserIndex].lastUpdated = new Date().toISOString();
//   } else {
//     users.push({
//       userId: userId,
//       googleTokens: encryptedTokens,
//       createdAt: new Date().toISOString(),
//       lastUpdated: new Date().toISOString()
//     });
//   }
  
//   saveUsers(users);
//   console.log('✅ Tokens saved for user:', userId);
// }

// /**
//  * Get decrypted tokens for a user
//  */
// function getUserTokens(userId) {
//   const users = loadUsers();
//   const user = users.find(u => u.userId === userId);
  
//   if (!user || !user.googleTokens) {
//     return null;
//   }
  
//   return {
//     access_token: decrypt(user.googleTokens.access_token),
//     refresh_token: user.googleTokens.refresh_token ? decrypt(user.googleTokens.refresh_token) : null,
//     expiry_date: user.googleTokens.expiry_date
//   };
// }

// /**
//  * Check if user has connected Google Calendar
//  */
// function isUserConnected(userId) {
//   const tokens = getUserTokens(userId);
//   return tokens !== null;
// }

// module.exports = {
//   saveUserTokens,
//   getUserTokens,
//   isUserConnected
// };

const fs = require('fs');
const path = require('path');
const { encrypt, decrypt } = require('../utils/encryption');

const USERS_FILE = path.join(__dirname, 'users.json');

// Ensure users file exists
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, '[]', 'utf8');
}

/**
 * Load all users from database
 */
function loadUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading users:', error);
    return [];
  }
}

/**
 * Save users to database
 */
function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

/**
 * Save user tokens (encrypted)
 */
function saveUserTokens(userId, tokens) {
  console.log('💾 Saving tokens for user:', userId);
  console.log('   Tokens structure:', {
    hasAccessToken: !!tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
    expiryDate: tokens.expiry_date
  });
  
  const users = loadUsers();
  
  // Find existing user or create new
  let user = users.find(u => u.userId === userId);
  
  if (!user) {
    user = { userId };
    users.push(user);
    console.log('   Creating new user entry');
  } else {
    console.log('   Updating existing user');
  }
  
  // Save tokens (encrypt sensitive data)
  // Check if tokens exist before encrypting
  user.accessToken = tokens.access_token ? encrypt(tokens.access_token) : '';
  user.refreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : '';
  user.expiryDate = tokens.expiry_date || Date.now() + 3600000; // 1 hour default
  
  console.log('   Tokens encrypted and saved');
  
  saveUsers(users);
  
  console.log('✅ Tokens saved successfully for user:', userId);
}

/**
 * Get user tokens (decrypted)
 */
function getUserTokens(userId) {
  const users = loadUsers();
  const user = users.find(u => u.userId === userId);
  
  if (!user || !user.accessToken) {
    console.log('❌ No tokens found for user:', userId);
    return null;
  }
  
  console.log('✅ Tokens found for user:', userId);
  
  return {
    access_token: decrypt(user.accessToken),
    refresh_token: decrypt(user.refreshToken),
    expiry_date: user.expiryDate
  };
}

/**
 * Update access token (after refresh)
 */
function updateAccessToken(userId, newAccessToken, newExpiryDate) {
  const users = loadUsers();
  const user = users.find(u => u.userId === userId);
  
  if (!user) {
    console.error('User not found:', userId);
    return false;
  }
  
  user.accessToken = encrypt(newAccessToken);
  user.expiryDate = newExpiryDate;
  
  saveUsers(users);
  return true;
}

module.exports = {
  saveUserTokens,
  getUserTokens,
  updateAccessToken,
  loadUsers
};
