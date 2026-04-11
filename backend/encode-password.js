/**
 * Utility script to URL encode MongoDB passwords
 * Run with: node encode-password.js "your_password_here"
 */

const { argv } = require('process');

if (argv.length < 3) {
  console.log('Usage: node encode-password.js "your_password_here"');
  console.log('Example: node encode-password.js "p@ssw0rd#"');
  process.exit(1);
}

const password = argv[2];
const encodedPassword = encodeURIComponent(password);

console.log('Original password:', password);
console.log('URL encoded password:', encodedPassword);

// Show the full URI format
console.log('\nUse this in your MONGO_URI:');
console.log(`mongodb+srv://username:${encodedPassword}@cluster.mongodb.net/database`);

// Show common encoding mappings
console.log('\nCommon URL encoding mappings:');
const mappings = {
  '!': '%21',
  '@': '%40',
  '#': '%23',
  '$': '%24',
  '%': '%25',
  '^': '%5E',
  '&': '%26',
  '*': '%2A',
  '(': '%28',
  ')': '%29',
  '+': '%2B',
  '=': '%3D',
  '?': '%3F',
  '/': '%2F',
  ':': '%3A',
  ';': '%3B',
  '[': '%5B',
  ']': '%5D',
  '{': '%7B',
  '}': '%7D',
  '|': '%7C',
  '\\': '%5C',
  '"': '%22',
  "'": '%27',
  '<': '%3C',
  '>': '%3E',
  ',': '%2C',
  ' ': '%20'
};

console.log('Character : Encoded');
console.log('------------------');
Object.entries(mappings).forEach(([char, encoded]) => {
  console.log(`${char}         : ${encoded}`);
});