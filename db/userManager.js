const fs = require('fs');
const path = require('path');
const { encrypt, decrypt } = require('../utils/encryption');
const USERS_FILE = path.join(__dirname, 'users.json');

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, '[]', 'utf8');
}

// Load all users from database
 
function loadUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading users:', error);
    return [];
  }
}

// Save users to database
 
function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving users:', error);
  }
}


//Save user tokens (encrypted)
 
function saveUserTokens(userId, tokens) {
  console.log('💾 Saving tokens for user:', userId);
  console.log('   Tokens structure:', {
    hasAccessToken: !!tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
    expiryDate: tokens.expiry_date
  });
  
  const users = loadUsers();
  let user = users.find(u => u.userId === userId);
  
  if (!user) {
    user = { userId };
    users.push(user);
    console.log('   Creating new user entry');
  } else {
    console.log('   Updating existing user');
  }
  user.accessToken = tokens.access_token ? encrypt(tokens.access_token) : '';
  user.refreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : '';
  user.expiryDate = tokens.expiry_date || Date.now() + 3600000; // 1 hour default
  
  console.log('   Tokens encrypted and saved');
  
  saveUsers(users);
  
  console.log('✅ Tokens saved successfully for user:', userId);
}


// Used for getting user tokens 
 
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

// Update access token 
 
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
