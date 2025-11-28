const crypto = require('crypto');
const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  console.warn('⚠️ ENCRYPTION_KEY not set or invalid length. Using default (not secure for production).');
  process.env.ENCRYPTION_KEY = 'default-32-character-key-12345';
}
function encrypt(text) {
  if (!text || text === 'undefined' || text === 'null') {
    console.warn('⚠️ Attempted to encrypt undefined/null value, returning empty string');
    return '';
  }
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


