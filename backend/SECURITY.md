# Security Guidelines

## API Key Security

### ⚠️ Critical Security Notice
Never hardcode API keys in source code. This is a major security vulnerability that can lead to:
- Financial loss from unauthorized API usage
- Compromise of sensitive data
- Violation of service terms of use

### ✅ Proper API Key Handling

1. **Environment Variables**: All API keys must be stored in environment variables
2. **.env File**: Create a `.env` file in the project root (never commit this file)
3. **.env.example**: Document required environment variables in `.env.example`
4. **Validation**: Always validate that required environment variables are set

### Implementation

```javascript
// ✅ Correct approach
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY environment variable is required');
}

const openai = new OpenAI({
    apiKey: DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1'
});
```

```javascript
// ❌ Never do this
const openai = new OpenAI({
    apiKey: 'sk-1116ca52ef05484c83f0b8b3603f7ad0', // Hardcoded key - SECURITY RISK
    baseURL: 'https://api.deepseek.com/v1'
});
```

### Environment Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your actual API keys:
   ```env
   DEEPSEEK_API_KEY=your_actual_deepseek_api_key_here
   ```

3. The `.env` file is included in `.gitignore` and will never be committed to version control.

## Additional Security Measures

1. **Rate Limiting**: The application implements rate limiting to prevent API abuse
2. **Input Validation**: All user inputs are validated to prevent injection attacks
3. **Authentication**: JWT tokens are used for secure authentication
4. **Authorization**: Role-based access control prevents unauthorized access
5. **CORS**: Cross-Origin Resource Sharing is properly configured

## Best Practices

1. Regularly rotate API keys
2. Monitor API usage for unusual patterns
3. Use different API keys for development and production
4. Never share API keys in code repositories, logs, or documentation
5. Implement proper error handling that doesn't expose sensitive information