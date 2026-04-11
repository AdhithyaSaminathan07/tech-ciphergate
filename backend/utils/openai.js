// utils/openai.js
const OpenAI = require('openai');

// Configure for DeepSeek API
// Security: API key must be provided via environment variable
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY environment variable is required. Please set it in your .env file.');
}

const openai = new OpenAI({
    apiKey: DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1'
});

// Enterprise-scale constants
const MAX_QUESTIONS_PER_BATCH = 30;
const MAX_TOKENS = 4096;
const BATCH_DELAY = 500;
const API_RETRY_DELAY = 2000;
const MAX_API_RETRIES = 3;

class RateLimiter {
    constructor(requestsPerMinute = 20) {
        this.requests = [];
        this.maxRequests = requestsPerMinute;
    }

    async waitIfNeeded() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < 60000);
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = Math.min(...this.requests);
            const waitTime = 60000 - (now - oldestRequest) + 100;
            if (waitTime > 0) {
                console.log(`[DeepSeek] Waiting ${waitTime}ms to respect rate limits...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        this.requests.push(now);
    }
}

const rateLimiter = new RateLimiter(20);

const generateSingleBatch = async (topics, numQuestionsPerTopic, difficulty = 'Medium', attempt = 1) => {
    await rateLimiter.waitIfNeeded();

    const selectedDifficulty = ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : 'Medium';

    const prompt = `Generate exactly ${numQuestionsPerTopic} unique, high-quality multiple-choice questions for the topic: "${topics[0]}".

    CRITICAL REQUIREMENTS:
    1.  **Your entire response must be a single, valid JSON object, starting with { and ending with }. Do not include any introductory text, explanations, or markdown formatting like \`\`\`json.**
    2.  Each topic must have exactly ${numQuestionsPerTopic} questions.
    3.  Each question needs: "questionText", "options" (an array of exactly 4 string choices), and "correctAnswer" (the exact text of the correct option).
    4.  The position of the correct answer within the "options" array MUST be randomized.
    5.  All questions should be of "${selectedDifficulty}" difficulty.
    
    Response format:
    {
        "${topics[0]}": [
            {
                "questionText": "Question text here?",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correctAnswer": "Option C" 
            }
        ]
    }`;

    let rawResponse = '';
    try {
        console.log(`[DeepSeek] API Call ${attempt} - Generating ${numQuestionsPerTopic} questions for:`, topics);
        
        const response = await openai.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "You are a professional question generator. You will only respond with a valid, complete JSON object based on the user's request."
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: MAX_TOKENS,
        });

        rawResponse = response.choices[0].message.content.trim();
        
        // --- FIXED & IMPROVED JSON PARSING ---
        let jsonString = rawResponse;
        const startIndex = jsonString.indexOf('{');
        const endIndex = jsonString.lastIndexOf('}');

        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            jsonString = jsonString.substring(startIndex, endIndex + 1);
        } else {
             throw new Error("No valid JSON object found in the AI response.");
        }

        const parsedQuestions = JSON.parse(jsonString);
        
        for (const topic of topics) {
            if (!parsedQuestions[topic] || !Array.isArray(parsedQuestions[topic])) {
                throw new Error(`Invalid response structure for topic: ${topic}`);
            }
            for (const question of parsedQuestions[topic]) {
                if (!question.questionText || !Array.isArray(question.options) || question.options.length !== 4 || !question.correctAnswer) {
                    throw new Error(`Invalid question structure in topic: ${topic}`);
                }
                if (!question.options.includes(question.correctAnswer)) {
                    throw new Error(`Correct answer not found in options for topic: ${topic}`);
                }
            }
        }
        
        console.log(`[DeepSeek] ✅ Successfully generated questions for:`, topics);
        return parsedQuestions;

    } catch (error) {
        console.error(`[DeepSeek] ❌ Batch generation failed (attempt ${attempt}):`, error.message);
        console.error("[DeepSeek] Raw problematic response:", rawResponse);
        throw error;
    }
};

// New function for generating UPSC/GK style questions with multiple formats
const generateUPSCSingleBatch = async (topics, numQuestionsPerTopic, difficulty = 'Medium', attempt = 1) => {
    await rateLimiter.waitIfNeeded();

    const selectedDifficulty = ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : 'Medium';

    const prompt = `Generate exactly ${numQuestionsPerTopic} unique, high-quality UPSC/GK Prelims questions in MULTIPLE FORMATS for the topic: "${topics[0]}".

Follow all instructions below STRICTLY.

############################################
### GENERAL RULES
############################################
1. Difficulty Level: ${selectedDifficulty}
2. Topic: ${topics[0]}
3. Total Questions Needed: ${numQuestionsPerTopic}
4. Question formats must be RANDOMLY mixed from the allowed formats below.
5. Options MUST be shuffled every time.
6. Correct answer position MUST be random.
7. All questions should be factually correct and UPSC-standard.

############################################
### ALLOWED QUESTION FORMATS
############################################

### FORMAT A — Statement-Type (1,2,3,4)
Example:
"Consider the following statements:
I. ...
II. ...
III. ...
Which of the above statements are correct?"

With options like:
(a) I only
(b) II only
(c) I and II only
(d) All of the above

### FORMAT B — "How many of the above are correct?"
Example:
"How many of the above statements are correct?"
Options:
(a) Only one
(b) Only two
(c) Only three
(d) All four

### FORMAT C — Match the Following (Pair Questions)
Example:
"Consider the following pairs:
Region : River
I. ...
II. ...
III. ...
IV. ...
How many pairs are correctly matched?"

Options same as UPSC pattern.

### FORMAT D — Which of the following are sources / features / uses (I,II,III,IV,V)
Example:
"I. ...
II. ...
III. ...
IV. ...
V. ...
Select the correct answer using the code below."

### FORMAT E — Standard MCQ (A/B/C/D)
Normal 4-option MCQ based on UPSC/GS facts.

############################################
### OUTPUT STRUCTURE (MANDATORY)
############################################

For each question return a JSON object:

{
  "question": "",
  "options": ["", "", "", ""],   // SHUFFLED
  "correctAnswer": "",           // EXACT TEXT from options[]
  "format": "A | B | C | D | E"
}

############################################
### QUALITY RULES
############################################
- Use real UPSC logic, avoid easy questions.
- Include subjects: Polity, History, Geography, Science, Economy, Current Affairs (based on topic: ${topics[0]})
- Reuse NO question from your training data.
- All questions must be ORIGINAL.

############################################
### FINAL OUTPUT
############################################
Return ONLY a JSON array with all questions.

CRITICAL REQUIREMENTS:
1.  **Your entire response must be a single, valid JSON object, starting with { and ending with }. Do not include any introductory text, explanations, or markdown formatting like \`\`\`json.**
2.  Each topic must have exactly ${numQuestionsPerTopic} questions.
3.  Each question needs: "question", "options" (an array of exactly 4 string choices), "correctAnswer" (the exact text of the correct option), and "format" (one of A, B, C, D, E).
4.  The position of the correct answer within the "options" array MUST be randomized.
5.  All questions should be of "${selectedDifficulty}" difficulty.
    
Response format:
{
    "${topics[0]}": [
        {
            "question": "Question text here?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correctAnswer": "Option C",
            "format": "E"
        }
    ]
}`;

    let rawResponse = '';
    try {
        console.log(`[DeepSeek] API Call ${attempt} - Generating ${numQuestionsPerTopic} UPSC-style questions for:`, topics);
        
        const response = await openai.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "You are an expert UPSC Question Setter. You will only respond with a valid, complete JSON object based on the user's request. Generate high-quality UPSC/GK Prelims questions in MULTIPLE FORMATS with fully randomized answer positions."
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: MAX_TOKENS,
        });

        rawResponse = response.choices[0].message.content.trim();
        
        // --- FIXED & IMPROVED JSON PARSING ---
        let jsonString = rawResponse;
        const startIndex = jsonString.indexOf('{');
        const endIndex = jsonString.lastIndexOf('}');
        
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            jsonString = jsonString.substring(startIndex, endIndex + 1);
        } else {
             throw new Error("No valid JSON object found in the AI response.");
        }
        
        const parsedQuestions = JSON.parse(jsonString);
        
        for (const topic of topics) {
            if (!parsedQuestions[topic] || !Array.isArray(parsedQuestions[topic])) {
                throw new Error(`Invalid response structure for topic: ${topic}`);
            }
            for (const question of parsedQuestions[topic]) {
                if (!question.question || !Array.isArray(question.options) || question.options.length !== 4 || !question.correctAnswer || !question.format) {
                    throw new Error(`Invalid question structure in topic: ${topic}`);
                }
                if (!question.options.includes(question.correctAnswer)) {
                    throw new Error(`Correct answer not found in options for topic: ${topic}`);
                }
                if (!['A', 'B', 'C', 'D', 'E'].includes(question.format)) {
                    throw new Error(`Invalid format for topic: ${topic}`);
                }
            }
        }
        
        console.log(`[DeepSeek] ✅ Successfully generated UPSC-style questions for:`, topics);
        return parsedQuestions;

    } catch (error) {
        console.error(`[DeepSeek] ❌ UPSC batch generation failed (attempt ${attempt}):`, error.message);
        console.error("[DeepSeek] Raw problematic response:", rawResponse);
        throw error;
    }
};

// New function for generating THREE SEPARATE QUESTION SETS for common mode
const generateThreeUPSCSets = async (topics, numQuestionsPerSet, difficulty = 'Medium', attempt = 1) => {
    await rateLimiter.waitIfNeeded();

    const selectedDifficulty = ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : 'Medium';

    const prompt = `You are an expert UPSC/GS Question Generator.

Generate THREE SEPARATE QUESTION SETS for common mode:

- SET A
- SET B
- SET C

Each set must contain EXACTLY ${numQuestionsPerSet} questions.

Topics: ${topics.join(', ')}
Difficulty: ${selectedDifficulty}

###############################################
### RULES FOR ALL SETS
###############################################
1. All three sets must be completely UNIQUE.
2. No question in Set A may repeat in Set B or Set C.
3. Options MUST be fully shuffled for every question.
4. Correct answer MUST be in a RANDOM position in the options array.
5. Maintain natural random distribution of correct answers (some A, some B, some C, some D).
6. Use UPSC-style formats:
   - Statement Type (I, II, III, IV)
   - "How many of the above are correct?"
   - Match the following (Pairs)
   - Code-based statements (I-V)
   - Standard MCQ (A/B/C/D)
7. Ensure high-quality UPSC prelims logic—no trivial questions.

###############################################
### OUTPUT FORMAT (MANDATORY)
###############################################

Return output ONLY in this JSON format:

{
  "setA": [
    {
      "question": "",
      "options": ["", "", "", ""],   // SHUFFLED
      "correctAnswer": "",           // EXACT TEXT FROM OPTIONS[]
      "format": "A | B | C | D | E"
    }
  ],
  "setB": [
    {
      "question": "",
      "options": ["", "", "", ""],
      "correctAnswer": "",
      "format": "A | B | C | D | E"
    }
  ],
  "setC": [
    {
      "question": "",
      "options": ["", "", "", ""],
      "correctAnswer": "",
      "format": "A | B | C | D | E"
    }
  ]
}

###############################################
### IMPORTANT
###############################################
- DO NOT add explanations.
- DO NOT add numbering.
- DO NOT add text outside the JSON.
- All facts must be accurate and original.

CRITICAL REQUIREMENTS:
1.  **Your entire response must be a single, valid JSON object, starting with { and ending with }. Do not include any introductory text, explanations, or markdown formatting like \`\`\`json.**
2.  Each set must have exactly ${numQuestionsPerSet} questions.
3.  Each question needs: "question", "options" (an array of exactly 4 string choices), "correctAnswer" (the exact text of the correct option), and "format" (one of A, B, C, D, E).
4.  The position of the correct answer within the "options" array MUST be randomized.
5.  All questions should be of "${selectedDifficulty}" difficulty.
6.  All three sets must be completely unique with no overlapping questions.`;

    let rawResponse = '';
    try {
        console.log(`[DeepSeek] API Call ${attempt} - Generating three UPSC-style question sets for:`, topics);
        
        const response = await openai.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { 
                    role: "system", 
                    content: "You are an expert UPSC Question Setter. Generate high-quality UPSC/GK Prelims questions in MULTIPLE FORMATS with fully randomized answer positions. Create three completely unique sets of questions."
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: MAX_TOKENS,
        });

        rawResponse = response.choices[0].message.content.trim();
        
        // --- FIXED & IMPROVED JSON PARSING ---
        let jsonString = rawResponse;
        const startIndex = jsonString.indexOf('{');
        const endIndex = jsonString.lastIndexOf('}');
        
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            jsonString = jsonString.substring(startIndex, endIndex + 1);
        } else {
             throw new Error("No valid JSON object found in the AI response.");
        }
        
        const parsedResponse = JSON.parse(jsonString);
        
        // Validate the response structure
        if (!parsedResponse.setA || !parsedResponse.setB || !parsedResponse.setC) {
            throw new Error("Invalid response structure - missing sets");
        }
        
        // Validate each set
        for (const [setName, questions] of Object.entries(parsedResponse)) {
            if (!Array.isArray(questions)) {
                throw new Error(`Invalid structure for ${setName} - not an array`);
            }
            
            if (questions.length !== numQuestionsPerSet) {
                throw new Error(`Invalid question count for ${setName} - expected ${numQuestionsPerSet}, got ${questions.length}`);
            }
            
            for (const question of questions) {
                if (!question.question || !Array.isArray(question.options) || question.options.length !== 4 || !question.correctAnswer || !question.format) {
                    throw new Error(`Invalid question structure in ${setName}`);
                }
                if (!question.options.includes(question.correctAnswer)) {
                    throw new Error(`Correct answer not found in options for ${setName}`);
                }
                if (!['A', 'B', 'C', 'D', 'E'].includes(question.format)) {
                    throw new Error(`Invalid format in ${setName}`);
                }
            }
        }
        
        console.log(`[DeepSeek] ✅ Successfully generated three UPSC-style question sets for:`, topics);
        return parsedResponse;

    } catch (error) {
        console.error(`[DeepSeek] ❌ Three-set generation failed (attempt ${attempt}):`, error.message);
        console.error("[DeepSeek] Raw problematic response:", rawResponse);
        throw error;
    }
};

const generateMCQQuestions = async (topics, numQuestionsPerTopic, difficulty = 'Medium') => {
    try {
        console.log(`\n[DeepSeek] 🚀 ENTERPRISE GENERATION STARTED`);
        console.log(`[DeepSeek] Topics: ${topics.length}, Questions per topic: ${numQuestionsPerTopic}`);
        
        const startTime = Date.now();
        const results = {};
        topics.forEach(topic => results[topic] = []);

        for (let topicIndex = 0; topicIndex < topics.length; topicIndex++) {
            const topic = topics[topicIndex];
            console.log(`\n[DeepSeek] 📋 Processing topic ${topicIndex + 1}/${topics.length}: "${topic}"`);
            
            let remaining = numQuestionsPerTopic;
            let batchNumber = 1;
            
            while (remaining > 0) {
                const batchSize = Math.min(remaining, MAX_QUESTIONS_PER_BATCH);
                console.log(`[DeepSeek] 🔄 Batch ${batchNumber} for "${topic}": ${batchSize} questions (${remaining} remaining)`);
                
                let batchSuccess = false;
                let batchAttempt = 1;
                
                while (!batchSuccess && batchAttempt <= MAX_API_RETRIES) {
                    try {
                        const batchResult = await generateSingleBatch([topic], batchSize, difficulty, batchAttempt);
                        
                        if (batchResult[topic] && Array.isArray(batchResult[topic]) && batchResult[topic].length > 0) {
                            const generatedCount = Math.min(batchResult[topic].length, batchSize);
                            results[topic].push(...batchResult[topic].slice(0, generatedCount));
                            
                            console.log(`[DeepSeek] ✅ Batch ${batchNumber} success: ${generatedCount} questions generated`);
                            remaining -= generatedCount;
                            batchSuccess = true;
                        } else {
                            throw new Error("Empty or invalid batch result");
                        }
                    } catch (batchError) {
                        console.error(`[DeepSeek] ⚠️ Batch ${batchNumber} attempt ${batchAttempt} failed:`, batchError.message);
                        
                        if (batchAttempt < MAX_API_RETRIES) {
                            const retryDelay = API_RETRY_DELAY * batchAttempt;
                            console.log(`[DeepSeek] ⏳ Retrying in ${retryDelay}ms...`);
                            await new Promise(resolve => setTimeout(resolve, retryDelay));
                        } else {
                            console.error(`[DeepSeek] ❌ Batch ${batchNumber} failed after ${MAX_API_RETRIES} attempts, skipping...`);
                            remaining = 0;
                        }
                        batchAttempt++;
                    }
                }
                batchNumber++;
                
                if (remaining > 0 && batchSuccess) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                }
            }
            
            console.log(`[DeepSeek] 📊 Topic "${topic}" completed: ${results[topic].length}/${numQuestionsPerTopic} questions`);
            
            if (topicIndex < topics.length - 1) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }
        
        const duration = Math.round((Date.now() - startTime) / 1000);
        
        console.log(`\n[DeepSeek] 🎉 ENTERPRISE GENERATION COMPLETED`);
        console.log(`[DeepSeek] ⏱️ Duration: ${duration} seconds`);
        
        return results;

    } catch (error) {
        console.error("[DeepSeek] 💥 ENTERPRISE GENERATION FAILED:", error.message);
        throw new Error(`Enterprise generation failed: ${error.message}`);
    }
};

// New function for generating UPSC/GK style questions
const generateUPSCQuestions = async (topics, numQuestionsPerTopic, difficulty = 'Medium') => {
    try {
        console.log(`\n[DeepSeek] 🚀 ENTERPRISE UPSC-STYLE GENERATION STARTED`);
        console.log(`[DeepSeek] Topics: ${topics.length}, Questions per topic: ${numQuestionsPerTopic}`);
        
        const startTime = Date.now();
        const results = {};
        topics.forEach(topic => results[topic] = []);

        for (let topicIndex = 0; topicIndex < topics.length; topicIndex++) {
            const topic = topics[topicIndex];
            console.log(`\n[DeepSeek] 📋 Processing topic ${topicIndex + 1}/${topics.length}: "${topic}"`);
            
            let remaining = numQuestionsPerTopic;
            let batchNumber = 1;
            
            while (remaining > 0) {
                const batchSize = Math.min(remaining, MAX_QUESTIONS_PER_BATCH);
                console.log(`[DeepSeek] 🔄 UPSC Batch ${batchNumber} for "${topic}": ${batchSize} questions (${remaining} remaining)`);
                
                let batchSuccess = false;
                let batchAttempt = 1;
                
                while (!batchSuccess && batchAttempt <= MAX_API_RETRIES) {
                    try {
                        const batchResult = await generateUPSCSingleBatch([topic], batchSize, difficulty, batchAttempt);
                        
                        if (batchResult[topic] && Array.isArray(batchResult[topic]) && batchResult[topic].length > 0) {
                            const generatedCount = Math.min(batchResult[topic].length, batchSize);
                            results[topic].push(...batchResult[topic].slice(0, generatedCount));
                            
                            console.log(`[DeepSeek] ✅ UPSC Batch ${batchNumber} success: ${generatedCount} questions generated`);
                            remaining -= generatedCount;
                            batchSuccess = true;
                        } else {
                            throw new Error("Empty or invalid UPSC batch result");
                        }
                    } catch (batchError) {
                        console.error(`[DeepSeek] ⚠️ UPSC Batch ${batchNumber} attempt ${batchAttempt} failed:`, batchError.message);
                        
                        if (batchAttempt < MAX_API_RETRIES) {
                            const retryDelay = API_RETRY_DELAY * batchAttempt;
                            console.log(`[DeepSeek] ⏳ Retrying in ${retryDelay}ms...`);
                            await new Promise(resolve => setTimeout(resolve, retryDelay));
                        } else {
                            console.error(`[DeepSeek] ❌ UPSC Batch ${batchNumber} failed after ${MAX_API_RETRIES} attempts, skipping...`);
                            remaining = 0;
                        }
                        batchAttempt++;
                    }
                }
                batchNumber++;
                
                if (remaining > 0 && batchSuccess) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                }
            }
            
            console.log(`[DeepSeek] 📊 Topic "${topic}" completed: ${results[topic].length}/${numQuestionsPerTopic} UPSC-style questions`);
            
            if (topicIndex < topics.length - 1) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }
        
        const duration = Math.round((Date.now() - startTime) / 1000);
        
        console.log(`\n[DeepSeek] 🎉 ENTERPRISE UPSC-STYLE GENERATION COMPLETED`);
        console.log(`[DeepSeek] ⏱️ Duration: ${duration} seconds`);
        
        return results;

    } catch (error) {
        console.error("[DeepSeek] 💥 ENTERPRISE UPSC-STYLE GENERATION FAILED:", error.message);
        throw new Error(`Enterprise UPSC-style generation failed: ${error.message}`);
    }
};

module.exports = { generateMCQQuestions, generateUPSCQuestions, generateThreeUPSCSets };