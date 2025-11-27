// const crypto = require('crypto');

// const ALGORITHM = 'aes-256-cbc';
// const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
//   throw new Error('ENCRYPTION_KEY must be exactly 32 characters');
// }

// // Encrypt sensitive data (tokens, secrets)
// function encrypt(text) {
//   const iv = crypto.randomBytes(16);
//   const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  
//   let encrypted = cipher.update(text, 'utf8', 'hex');
//   encrypted += cipher.final('hex');
  
//   // Return IV + encrypted data (both needed for decryption)
//   return iv.toString('hex') + ':' + encrypted;
// }

// // Decrypt sensitive data
// function decrypt(encryptedText) {
//   const parts = encryptedText.split(':');
//   const iv = Buffer.from(parts[0], 'hex');
//   const encrypted = parts[1];
  
//   const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  
//   let decrypted = decipher.update(encrypted, 'hex', 'utf8');
//   decrypted += decipher.final('utf8');
  
//   return decrypted;
// }

// // Generate random encryption key
// function generateEncryptionKey() {
//   return crypto.randomBytes(16).toString('hex'); // 32 characters
// }

// module.exports = {
//   encrypt,
//   decrypt,
//   generateEncryptionKey
// };
const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  console.warn('⚠️ ENCRYPTION_KEY not set or invalid length. Using default (not secure for production).');
  process.env.ENCRYPTION_KEY = 'default-32-character-key-12345';
}

// Encrypt sensitive data (tokens, secrets)
function encrypt(text) {
  // Handle undefined/null values
  if (!text || text === 'undefined' || text === 'null') {
    console.warn('⚠️ Attempted to encrypt undefined/null value, returning empty string');
    return '';
  }
  
  // Convert to string if not already
  const textStr = String(text);
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    ALGORITHM, 
    Buffer.from(process.env.ENCRYPTION_KEY), 
    iv
  );
  
  let encrypted = cipher.update(textStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
}

// Decrypt sensitive data
function decrypt(text) {
  if (!text || text === '') {
    return '';
  }
  
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = parts.join(':');
    
    const decipher = crypto.createDecipheriv(
      ALGORITHM, 
      Buffer.from(process.env.ENCRYPTION_KEY), 
      iv
    );
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('❌ Decryption error:', error);
    return '';
  }
}

module.exports = {
  encrypt,
  decrypt
};


