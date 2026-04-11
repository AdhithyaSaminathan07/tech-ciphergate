# UPSC Question Generator Enhancement

This document describes the enhancements made to the UPSC question generator to support multiple question formats as requested.

## Overview

The UPSC question generator has been enhanced to support five different question formats commonly used in UPSC/GK Prelims exams:

1. **Format A** - Statement-Type (1,2,3,4)
2. **Format B** - "How many of the above are correct?"
3. **Format C** - Match the Following (Pair Questions)
4. **Format D** - Which of the following are sources / features / uses (I,II,III,IV,V)
5. **Format E** - Standard MCQ (A/B/C/D)

## Implementation Details

### 1. Backend Changes

#### a. OpenAI Utility (`utils/openai.js`)

- Updated the `generateUPSCSingleBatch` function to support multiple formats
- Modified the prompt to include all five formats with detailed examples
- Updated the response structure to include a `format` field indicating the question type
- Enhanced validation to ensure the format field is one of A, B, C, D, or E

#### b. Question Model (`models/Question.js`)

- Added a new field `upscFormat` to store the specific UPSC format (A, B, C, D, or E)
- Defined enum values for the new field

#### c. Question Processor (`utils/questionProcessor.js`)

- Updated to handle the new `format` field from the AI response
- Added mapping to store the format in the database

#### d. Question Controller (`controllers/questionController.js`)

- Modified to include the `upscFormat` field in API responses
- Updated quick test generation to use UPSC format by default

### 2. New Files

#### a. UPSC Question Generator Utility (`utils/upscQuestionGenerator.js`)

- Created a standalone utility class for generating UPSC questions
- Includes methods for generating questions in multiple formats
- Contains sample questions for demonstration purposes

#### b. Test Script (`tests/testUPSCGenerator.js`)

- Created a test script to demonstrate the enhanced functionality
- Shows how to generate questions with different formats
- Displays format distribution statistics

## Usage

### API Endpoints

The existing API endpoints continue to work as before, but now include the additional `upscFormat` field in responses:

1. **Generate Questions**: `POST /api/test/questions/generate`
2. **Get Questions**: `GET /api/test/questions/:workerId`
3. **Quick Test**: `POST /api/test/quick-test`

### Parameters

When generating UPSC questions, you can specify:
- `questionFormat`: Set to 'upsc' to use the enhanced generator
- `difficulty`: Difficulty level (Easy, Medium, Hard)
- `topics`: Array of topics to generate questions for
- `numQuestions`: Number of questions to generate

## Sample Output

The enhanced generator produces questions in the following JSON format:

```json
{
  "question": "Question text here?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": "Option C",
  "format": "A"
}
```

## Testing

To test the enhanced functionality:

1. Run the test script: `node tests/testUPSCGenerator.js`
2. Check the console output for sample questions in different formats
3. Verify that the format distribution is random

## Benefits

1. **Format Diversity**: Questions are generated in multiple formats, making practice tests more realistic
2. **Randomization**: Both question formats and answer positions are randomized
3. **UPSC Standard**: Questions follow the exact patterns used in UPSC/GK Prelims exams
4. **Extensibility**: Easy to add new formats in the future
5. **Backward Compatibility**: Existing functionality remains unchanged

## Future Enhancements

1. Add more sophisticated AI prompting for each specific format
2. Implement format-specific validation rules
3. Add support for custom format mixing ratios
4. Include difficulty-based format selection