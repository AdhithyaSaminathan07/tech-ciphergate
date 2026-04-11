# Three-Set Question Generation Implementation

This document describes the implementation of the three-set question generation feature for UPSC/GK questions in common mode.

## Overview

The three-set question generation feature allows administrators to generate three separate, unique question sets (Set A, Set B, and Set C) when selecting "UPSC/GK" in common mode for multiple employees. Each employee receives questions from one of the three sets, ensuring variety while maintaining fairness.

## Implementation Details

### 1. Backend Changes

#### a. OpenAI Utility (`utils/openai.js`)

- Added a new function `generateThreeUPSCSets` that generates three completely unique question sets
- Updated the prompt to specifically request three separate sets with all required constraints
- Added validation to ensure each set has the correct number of questions and follows all formatting rules
- Updated module exports to include the new function

#### b. Question Model (`models/Question.js`)

- Added a new field `questionSet` to track which set (A, B, or C) a question belongs to
- Defined enum values for the new field: 'setA', 'setB', 'setC'

#### c. Question Processor (`utils/questionProcessor.js`)

- Added a new function `processThreeSetQuestionGeneration` to handle the three-set generation workflow
- Implemented logic to distribute the three sets among employees (Employee 1 gets Set A, Employee 2 gets Set B, Employee 3 gets Set C, then repeat)
- Updated module exports to include the new function

#### d. Question Controller (`controllers/questionController.js`)

- Modified `validateQuestionGeneration` middleware to include validation for the new `generationMode` parameter
- Updated `generateAndStoreQuestions` to use the appropriate processor based on generation mode
- Modified `getQuestionsForTest` to retrieve questions based on the question set when in three-set mode

### 2. New Files

#### a. UPSC Question Generator Utility (`utils/upscQuestionGenerator.js`)

- Added `generateThreeQuestionSets` method for generating three unique question sets
- Implemented logic to ensure complete uniqueness between sets
- Added proper shuffling of options with balanced distribution of correct answers

#### b. Test Scripts

- Created `tests/testThreeSets.js` for basic testing of the three-set generation
- Created `tests/demoThreeSets.js` for comprehensive demonstration

## Usage

### API Endpoints

The existing API endpoint continues to work as before, but now supports an additional parameter:

**Generate Questions**: `POST /api/test/questions/generate`

### New Parameters

When generating questions, you can now specify:
- `generationMode`: Set to 'three-sets' to use the new three-set generation
- `questionFormat`: Should be 'upsc' for three-set generation
- `difficulty`: Difficulty level (Easy, Medium, Hard)
- `commonTopics`: Array of topics to generate questions for
- `numQuestions`: Number of questions per set

### Example Request

```json
{
  "workerIds": ["worker1_id", "worker2_id", "worker3_id"],
  "numQuestions": 5,
  "difficulty": "Medium",
  "topicMode": "common",
  "commonTopics": ["Indian Polity", "Geography"],
  "questionFormat": "upsc",
  "generationMode": "three-sets"
}
```

## How It Works

1. When an administrator selects "UPSC/GK" in common mode for multiple employees:
   - The system uses the `three-sets` generation mode
   - Three unique question sets (A, B, C) are generated
   - Each employee is assigned to a set in rotation (1st employee gets Set A, 2nd gets Set B, 3rd gets Set C, 4th gets Set A again, etc.)

2. When employees take their tests:
   - Each employee only sees questions from their assigned set
   - Questions within each set are shuffled for that employee
   - Options for each question are shuffled for that employee

## Benefits

1. **Variety**: Three completely unique question sets provide variety for different employees
2. **Fairness**: Each employee gets the same number of questions of the same difficulty
3. **Security**: Employees cannot share answers since they have different questions
4. **Scalability**: Works with any number of employees
5. **Backward Compatibility**: Existing functionality remains unchanged

## Verification

The implementation has been tested to ensure:
- All three sets are completely unique with no overlapping questions
- Options are properly shuffled for every question
- Correct answers are distributed naturally across all positions (A, B, C, D)
- All UPSC question formats are properly supported
- Questions follow UPSC prelims logic and are factually accurate