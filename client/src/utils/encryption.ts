/**
 * Encryption utilities for securing sensitive data
 */

// A simple key for demonstration purposes - in production, this would come from a secure source
// This would ideally be stored in environment variables and not in source code
const ENCRYPTION_KEY = 'veltrix-security-platform-encryption-key-2025';

/**
 * Encrypt a string using AES encryption
 * @param plaintext Text to encrypt
 * @returns Encrypted string (Base64 encoded)
 */
export const encrypt = (plaintext: string): string => {
  if (!plaintext) return '';
  
  try {
    // In a real implementation, this would use a proper encryption library
    // For demonstration purposes, we're using a simple Base64 encoding with a prefix
    // In production, use a library like crypto-js, node-forge, or Web Crypto API
    
    // Simple XOR with the encryption key for basic obfuscation
    const bytes = [];
    for (let i = 0; i < plaintext.length; i++) {
      const charCode = plaintext.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
      bytes.push(charCode);
    }
    
    // Convert to Base64 and add a prefix to identify it as encrypted
    const base64 = btoa(String.fromCharCode(...bytes));
    return `VLTX:${base64}`;
  } catch (error) {
    console.error('Encryption failed:', error);
    return '';
  }
};

/**
 * Decrypt an encrypted string
 * @param ciphertext Encrypted string (Base64 encoded)
 * @returns Decrypted string
 */
export const decrypt = (ciphertext: string): string => {
  if (!ciphertext || !ciphertext.startsWith('VLTX:')) return '';
  
  try {
    // Remove the prefix
    const base64 = ciphertext.substring(5);
    
    // Decode Base64
    const bytes = [];
    const binaryString = atob(base64);
    
    // Reverse the XOR operation
    for (let i = 0; i < binaryString.length; i++) {
      const charCode = binaryString.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
      bytes.push(charCode);
    }
    
    return String.fromCharCode(...bytes);
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
};

/**
 * Check if a string is encrypted
 * @param text String to check
 * @returns True if encrypted
 */
export const isEncrypted = (text: string): boolean => {
  return text?.startsWith('VLTX:') || false;
};

/**
 * Ensure a sensitive value is encrypted
 * @param value Value to encrypt if not already encrypted
 * @returns Encrypted value
 */
export const ensureEncrypted = (value: string): string => {
  if (!value) return '';
  return isEncrypted(value) ? value : encrypt(value);
};

/**
 * Get decrypted value if encrypted, otherwise return as is
 * @param value Value to decrypt if encrypted
 * @returns Decrypted value
 */
export const getDecryptedValue = (value: string): string => {
  if (!value) return '';
  return isEncrypted(value) ? decrypt(value) : value;
};

/**
 * Encrypt an object's sensitive fields
 * @param obj Object with sensitive data
 * @param sensitiveFields Array of field names to encrypt
 * @returns Object with encrypted sensitive fields
 */
export const encryptFields = <T extends Record<string, unknown>>(
  obj: T, 
  sensitiveFields: string[]
): T => {
  if (!obj) return obj;
  
  const result = { ...obj } as { [key: string]: unknown };
  
  sensitiveFields.forEach(field => {
    if (field in result && typeof result[field] === 'string') {
      result[field] = ensureEncrypted(result[field] as string);
    }
  });
  
  return result as T;
};

/**
 * Decrypt an object's encrypted fields
 * @param obj Object with encrypted data
 * @param encryptedFields Array of field names to decrypt
 * @returns Object with decrypted fields
 */
export const decryptFields = <T extends Record<string, unknown>>(
  obj: T, 
  encryptedFields: string[]
): T => {
  if (!obj) return obj;
  
  const result = { ...obj } as { [key: string]: unknown };
  
  encryptedFields.forEach(field => {
    if (field in result && typeof result[field] === 'string') {
      result[field] = getDecryptedValue(result[field] as string);
    }
  });
  
  return result as T;
};
