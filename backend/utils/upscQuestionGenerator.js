// utils/upscQuestionGenerator.js
// Standalone UPSC Question Generator with Multiple Formats

/**
 * Generate high-quality UPSC/GK Prelims questions in MULTIPLE FORMATS
 * with fully randomized answer positions.
 */
class UPSCQuestionGenerator {
    /**
     * Generate UPSC-style questions with multiple formats
     * @param {Object} params - Generation parameters
     * @param {string} params.difficulty - Difficulty level (Easy, Medium, Hard)
     * @param {string[]} params.topics - Topics to generate questions for
     * @param {number} params.count - Number of questions to generate
     * @returns {Object[]} Array of question objects
     */
    static generateQuestions({ difficulty = 'Medium', topics = [], count = 5 }) {
        // In a real implementation, this would call the AI service
        // For demonstration purposes, we'll return sample questions
        
        return this.generateSampleQuestions({ difficulty, topics, count });
    }

    /**
     * Generate THREE SEPARATE QUESTION SETS for common mode
     * @param {Object} params - Generation parameters
     * @param {string} params.difficulty - Difficulty level (Easy, Medium, Hard)
     * @param {string[]} params.topics - Topics to generate questions for
     * @param {number} params.count - Number of questions to generate per set
     * @returns {Object} Object containing three unique question sets
     */
    static generateThreeQuestionSets({ difficulty = 'Medium', topics = [], count = 5 }) {
        // In a real implementation, this would call the AI service
        // For demonstration purposes, we'll return sample questions
        
        return this.generateThreeSampleQuestionSets({ difficulty, topics, count });
    }

    /**
     * Generate sample UPSC questions for demonstration with proper answer shuffling
     * @param {Object} params - Generation parameters
     * @returns {Object[]} Array of sample question objects
     */
    static generateSampleQuestions({ difficulty, topics, count }) {
        const questions = [];
        
        // Sample questions in different formats
        const sampleQuestions = [
            // Format A - Statement-Type
            {
                question: "Consider the following statements regarding the Indian Constitution:\nI. The idea of residual powers being vested in the Centre was borrowed from the Canadian Constitution.\nII. The procedure for amendment of the Constitution is laid down in Article 368.\nIII. The concept of judicial review has been borrowed from the Irish Constitution.\nWhich of the above statements are correct?",
                options: [
                    "I and II only",
                    "II only",
                    "I, II and III",
                    "III only"
                ],
                correctAnswer: "I and II only",
                format: "A"
            },
            
            // Format B - "How many of the above are correct?"
            {
                question: "Consider the following pairs:\n1. Tropic of Cancer - 23.5° N\n2. Tropic of Capricorn - 23.5° S\n3. Arctic Circle - 66.5° N\n4. Antarctic Circle - 66.5° S\nHow many of the above pairs are correctly matched?",
                options: [
                    "Only one",
                    "Only two",
                    "Only three",
                    "All four"
                ],
                correctAnswer: "All four",
                format: "B"
            },
            
            // Format C - Match the Following
            {
                question: "Consider the following pairs:\nNational Park : State\nI. Keoladeo National Park : Rajasthan\nII. Silent Valley National Park : Kerala\nIII. Namdapha National Park : Arunachal Pradesh\nIV. Dachigam National Park : Jammu and Kashmir\nHow many pairs are correctly matched?",
                options: [
                    "One",
                    "Two",
                    "Three",
                    "All four"
                ],
                correctAnswer: "All four",
                format: "C"
            },
            
            // Format D - Sources/Features/Uses
            {
                question: "Which of the following are among the powers of the President of India?\nI. Summoning and proroguing of Parliament sessions\nII. Dissolution of Lok Sabha\nIII. Appointment of Prime Minister\nIV. Appointment of judges of Supreme Court\nV. Granting pardons\nSelect the correct answer using the code below.",
                options: [
                    "I, II, III and IV only",
                    "II, III and V only",
                    "I, III, IV and V only",
                    "I, II, III, IV and V"
                ],
                correctAnswer: "I, II, III, IV and V",
                format: "D"
            },
            
            // Format E - Standard MCQ
            {
                question: "The term 'Federal' has been used in the Indian Constitution in the",
                options: [
                    "Preamble",
                    "Part III",
                    "Article 368",
                    "Not used anywhere"
                ],
                correctAnswer: "Not used anywhere",
                format: "E"
            },
            
            // Additional questions to ensure variety
            {
                question: "Consider the following statements:\nI. The Speaker of Lok Sabha can be removed by a resolution passed by a majority of all the members of the House.\nII. The Deputy Speaker is subordinate to the Speaker.\nIII. The Speaker need not vacate his office if his party merges with another party.\nWhich of the statements given above is/are correct?",
                options: [
                    "I and III only",
                    "I only",
                    "II and III only",
                    "I, II and III"
                ],
                correctAnswer: "I and III only",
                format: "A"
            },
            
            {
                question: "How many of the following are Kharif crops?\n1. Wheat\n2. Rice\n3. Maize\n4. Cotton\n5. Mustard",
                options: [
                    "Only three",
                    "Only two",
                    "Only one",
                    "All five"
                ],
                correctAnswer: "Only three",
                format: "B"
            },
            
            {
                question: "Consider the following pairs:\nFamous Place : Region\nI. Bodh Gaya : Bihar\nII. Khajuraho : Madhya Pradesh\nIII. Tiruvannamalai : Kerala\nIV. Ellora : Maharashtra\nHow many pairs given above are correctly matched?",
                options: [
                    "Three",
                    "Two",
                    "One",
                    "All four"
                ],
                correctAnswer: "Three",
                format: "C"
            },
            
            {
                question: "Which of the following are the objectives of the Pradhan Mantri Jan Dhan Yojana?\nI. Providing universal access to banking facilities\nII. Financial literacy and inclusion\nIII. Creating a universal database of all citizens\nIV. Providing insurance cover to all account holders\nV. Facilitating access to credit\nSelect the correct answer using the code given below.",
                options: [
                    "I, II, IV and V only",
                    "I, II and IV only",
                    "I, III and V only",
                    "I, II, III, IV and V"
                ],
                correctAnswer: "I, II, IV and V only",
                format: "D"
            },
            
            {
                question: "Which one of the following is the best description of 'INS Astradharini', that was in the news recently?",
                options: [
                    "Amphibious warfare ship",
                    "Torpedo launch and recovery vessel",
                    "Nuclear-powered submarine",
                    "Destroyer"
                ],
                correctAnswer: "Torpedo launch and recovery vessel",
                format: "E"
            },
            
            // More questions for better distribution
            {
                question: "Consider the following statements about the Indian Parliament:\nI. The Council of States (Rajya Sabha) is a continuing chamber.\nII. The maximum strength of Lok Sabha is fixed at 552.\nIII. The Parliament can amend any provision of the Constitution.\nWhich of the statements given above is/are correct?",
                options: [
                    "I and II only",
                    "III only",
                    "I, II and III",
                    "I only"
                ],
                correctAnswer: "I and II only",
                format: "A"
            },
            
            {
                question: "How many of the following are UNESCO World Heritage Sites in India?\n1. Taj Mahal\n2. Qutub Minar\n3. Red Fort\n4. Ajanta Caves\n5. Konark Sun Temple",
                options: [
                    "All five",
                    "Only four",
                    "Only three",
                    "Only two"
                ],
                correctAnswer: "All five",
                format: "B"
            },
            
            {
                question: "Consider the following pairs:\nPort : State\nI. Paradip Port : Odisha\nII. Mormugao Port : Goa\nIII. New Mangalore Port : Karnataka\nIV. Tuticorin Port : Tamil Nadu\nHow many pairs given above are correctly matched?",
                options: [
                    "All four",
                    "Three",
                    "Two",
                    "One"
                ],
                correctAnswer: "All four",
                format: "C"
            },
            
            {
                question: "Which of the following are among the Directive Principles of State Policy?\nI. Equal pay for equal work for both men and women\nII. Prohibition of consumption of intoxicating drinks\nIII. Separation of judiciary from executive\nIV. Promotion of educational and economic interests of SCs and STs\nV. Organization of village panchayats\nSelect the correct answer using the code given below.",
                options: [
                    "I, III, IV and V only",
                    "I, II, III and V only",
                    "II, III, IV and V only",
                    "I, II, III, IV and V"
                ],
                correctAnswer: "I, III, IV and V only",
                format: "D"
            },
            
            {
                question: "With reference to the 'Gram Nyayalaya Act', which of the following statements is/are correct?\n1. Gram Nyayalayas can hear only civil cases and not criminal cases.\n2. The Act allows local social activists to act as mediators/reconciliators.\n3. Gram Nyayalayas have jurisdiction throughout the state.",
                options: [
                    "1 and 2 only",
                    "2 only",
                    "2 and 3 only",
                    "1, 2 and 3"
                ],
                correctAnswer: "2 only",
                format: "E"
            },
            
            // Additional questions for Set A
            {
                question: "Consider the following statements about the Supreme Court of India:\nI. The Supreme Court is a court of record.\nII. The Supreme Court has the power of judicial review.\nIII. The Chief Justice of India is appointed by the President.\nWhich of the statements given above is/are correct?",
                options: [
                    "I and II only",
                    "III only",
                    "I, II and III",
                    "I only"
                ],
                correctAnswer: "I, II and III",
                format: "A"
            },
            
            {
                question: "How many of the following are Rabi crops?\n1. Wheat\n2. Rice\n3. Maize\n4. Peas\n5. Mustard",
                options: [
                    "Only three",
                    "Only two",
                    "Only one",
                    "All five"
                ],
                correctAnswer: "Only three",
                format: "B"
            },
            
            {
                question: "Consider the following pairs:\nMountain Peak : State\nI. Kanchenjunga : Sikkim\nII. Nanda Devi : Uttarakhand\nIII. Anamudi : Kerala\nIV. Dodabetta : Tamil Nadu\nHow many pairs given above are correctly matched?",
                options: [
                    "All four",
                    "Three",
                    "Two",
                    "One"
                ],
                correctAnswer: "All four",
                format: "C"
            },
            
            {
                question: "Which of the following are among the Fundamental Duties of citizens laid down in the Indian Constitution?\nI. To preserve the rich heritage of our composite culture\nII. To protect and improve the natural environment\nIII. To develop scientific temper and spirit of inquiry\nIV. To strive towards excellence in all spheres of individual and collective activity\nV. To practice family planning and control population\nSelect the correct answer using the code given below.",
                options: [
                    "I, II, III and IV only",
                    "I, III, IV and V only",
                    "II, III and V only",
                    "I, II, III, IV and V"
                ],
                correctAnswer: "I, II, III and IV only",
                format: "D"
            },
            
            {
                question: "Which one of the following is the best description of 'INS Arihant', that was in the news recently?",
                options: [
                    "Nuclear-powered ballistic missile submarine",
                    "Torpedo launch and recovery vessel",
                    "Amphibious warfare ship",
                    "Destroyer"
                ],
                correctAnswer: "Nuclear-powered ballistic missile submarine",
                format: "E"
            }
        ];

        // Select questions and ensure proper shuffling with balanced distribution
        const selectedQuestions = [];
        const usedIndices = new Set();
        
        // First, select unique questions
        while (selectedQuestions.length < count && selectedQuestions.length < sampleQuestions.length) {
            const randomIndex = Math.floor(Math.random() * sampleQuestions.length);
            if (!usedIndices.has(randomIndex)) {
                usedIndices.add(randomIndex);
                selectedQuestions.push({...sampleQuestions[randomIndex]});
            }
        }
        
        // If we need more questions than available, duplicate and modify
        while (selectedQuestions.length < count) {
            const randomIndex = Math.floor(Math.random() * sampleQuestions.length);
            selectedQuestions.push({...sampleQuestions[randomIndex]});
        }
        
        // Shuffle options for each question and ensure balanced distribution
        const positionTargets = this.calculateBalancedPositions(count);
        
        selectedQuestions.forEach((question, index) => {
            // Get target position for this question
            const targetPosition = positionTargets[index];
            
            // Shuffle options with target position for correct answer
            const shuffled = this.shuffleOptionsWithTarget(question.options, question.correctAnswer, targetPosition);
            question.options = shuffled.options;
            question.correctAnswer = shuffled.correctAnswer;
        });

        return selectedQuestions;
    }

    /**
     * Generate three separate unique question sets
     * @param {Object} params - Generation parameters
     * @returns {Object} Object containing three unique question sets
     */
    static generateThreeSampleQuestionSets({ difficulty, topics, count }) {
        // Sample questions for all three sets
        const allSampleQuestions = [
            // Format A - Statement-Type
            {
                question: "Consider the following statements regarding the Indian Constitution:\nI. The idea of residual powers being vested in the Centre was borrowed from the Canadian Constitution.\nII. The procedure for amendment of the Constitution is laid down in Article 368.\nIII. The concept of judicial review has been borrowed from the Irish Constitution.\nWhich of the above statements are correct?",
                options: [
                    "I and II only",
                    "II only",
                    "I, II and III",
                    "III only"
                ],
                correctAnswer: "I and II only",
                format: "A"
            },
            
            // Format B - "How many of the above are correct?"
            {
                question: "Consider the following pairs:\n1. Tropic of Cancer - 23.5° N\n2. Tropic of Capricorn - 23.5° S\n3. Arctic Circle - 66.5° N\n4. Antarctic Circle - 66.5° S\nHow many of the above pairs are correctly matched?",
                options: [
                    "Only one",
                    "Only two",
                    "Only three",
                    "All four"
                ],
                correctAnswer: "All four",
                format: "B"
            },
            
            // Format C - Match the Following
            {
                question: "Consider the following pairs:\nNational Park : State\nI. Keoladeo National Park : Rajasthan\nII. Silent Valley National Park : Kerala\nIII. Namdapha National Park : Arunachal Pradesh\nIV. Dachigam National Park : Jammu and Kashmir\nHow many pairs are correctly matched?",
                options: [
                    "One",
                    "Two",
                    "Three",
                    "All four"
                ],
                correctAnswer: "All four",
                format: "C"
            },
            
            // Format D - Sources/Features/Uses
            {
                question: "Which of the following are among the powers of the President of India?\nI. Summoning and proroguing of Parliament sessions\nII. Dissolution of Lok Sabha\nIII. Appointment of Prime Minister\nIV. Appointment of judges of Supreme Court\nV. Granting pardons\nSelect the correct answer using the code below.",
                options: [
                    "I, II, III and IV only",
                    "II, III and V only",
                    "I, III, IV and V only",
                    "I, II, III, IV and V"
                ],
                correctAnswer: "I, II, III, IV and V",
                format: "D"
            },
            
            // Format E - Standard MCQ
            {
                question: "The term 'Federal' has been used in the Indian Constitution in the",
                options: [
                    "Preamble",
                    "Part III",
                    "Article 368",
                    "Not used anywhere"
                ],
                correctAnswer: "Not used anywhere",
                format: "E"
            },
            
            // Additional questions to ensure variety
            {
                question: "Consider the following statements:\nI. The Speaker of Lok Sabha can be removed by a resolution passed by a majority of all the members of the House.\nII. The Deputy Speaker is subordinate to the Speaker.\nIII. The Speaker need not vacate his office if his party merges with another party.\nWhich of the statements given above is/are correct?",
                options: [
                    "I and III only",
                    "I only",
                    "II and III only",
                    "I, II and III"
                ],
                correctAnswer: "I and III only",
                format: "A"
            },
            
            {
                question: "How many of the following are Kharif crops?\n1. Wheat\n2. Rice\n3. Maize\n4. Cotton\n5. Mustard",
                options: [
                    "Only three",
                    "Only two",
                    "Only one",
                    "All five"
                ],
                correctAnswer: "Only three",
                format: "B"
            },
            
            {
                question: "Consider the following pairs:\nFamous Place : Region\nI. Bodh Gaya : Bihar\nII. Khajuraho : Madhya Pradesh\nIII. Tiruvannamalai : Kerala\nIV. Ellora : Maharashtra\nHow many pairs given above are correctly matched?",
                options: [
                    "Three",
                    "Two",
                    "One",
                    "All four"
                ],
                correctAnswer: "Three",
                format: "C"
            },
            
            {
                question: "Which of the following are the objectives of the Pradhan Mantri Jan Dhan Yojana?\nI. Providing universal access to banking facilities\nII. Financial literacy and inclusion\nIII. Creating a universal database of all citizens\nIV. Providing insurance cover to all account holders\nV. Facilitating access to credit\nSelect the correct answer using the code given below.",
                options: [
                    "I, II, IV and V only",
                    "I, II and IV only",
                    "I, III and V only",
                    "I, II, III, IV and V"
                ],
                correctAnswer: "I, II, IV and V only",
                format: "D"
            },
            
            {
                question: "Which one of the following is the best description of 'INS Astradharini', that was in the news recently?",
                options: [
                    "Amphibious warfare ship",
                    "Torpedo launch and recovery vessel",
                    "Nuclear-powered submarine",
                    "Destroyer"
                ],
                correctAnswer: "Torpedo launch and recovery vessel",
                format: "E"
            },
            
            // More questions for better distribution
            {
                question: "Consider the following statements about the Indian Parliament:\nI. The Council of States (Rajya Sabha) is a continuing chamber.\nII. The maximum strength of Lok Sabha is fixed at 552.\nIII. The Parliament can amend any provision of the Constitution.\nWhich of the statements given above is/are correct?",
                options: [
                    "I and II only",
                    "III only",
                    "I, II and III",
                    "I only"
                ],
                correctAnswer: "I and II only",
                format: "A"
            },
            
            {
                question: "How many of the following are UNESCO World Heritage Sites in India?\n1. Taj Mahal\n2. Qutub Minar\n3. Red Fort\n4. Ajanta Caves\n5. Konark Sun Temple",
                options: [
                    "All five",
                    "Only four",
                    "Only three",
                    "Only two"
                ],
                correctAnswer: "All five",
                format: "B"
            },
            
            {
                question: "Consider the following pairs:\nPort : State\nI. Paradip Port : Odisha\nII. Mormugao Port : Goa\nIII. New Mangalore Port : Karnataka\nIV. Tuticorin Port : Tamil Nadu\nHow many pairs given above are correctly matched?",
                options: [
                    "All four",
                    "Three",
                    "Two",
                    "One"
                ],
                correctAnswer: "All four",
                format: "C"
            },
            
            {
                question: "Which of the following are among the Directive Principles of State Policy?\nI. Equal pay for equal work for both men and women\nII. Prohibition of consumption of intoxicating drinks\nIII. Separation of judiciary from executive\nIV. Promotion of educational and economic interests of SCs and STs\nV. Organization of village panchayats\nSelect the correct answer using the code given below.",
                options: [
                    "I, III, IV and V only",
                    "I, II, III and V only",
                    "II, III, IV and V only",
                    "I, II, III, IV and V"
                ],
                correctAnswer: "I, III, IV and V only",
                format: "D"
            },
            
            {
                question: "With reference to the 'Gram Nyayalaya Act', which of the following statements is/are correct?\n1. Gram Nyayalayas can hear only civil cases and not criminal cases.\n2. The Act allows local social activists to act as mediators/reconciliators.\n3. Gram Nyayalayas have jurisdiction throughout the state.",
                options: [
                    "1 and 2 only",
                    "2 only",
                    "2 and 3 only",
                    "1, 2 and 3"
                ],
                correctAnswer: "2 only",
                format: "E"
            },
            
            // Additional questions for Set A
            {
                question: "Consider the following statements about the Supreme Court of India:\nI. The Supreme Court is a court of record.\nII. The Supreme Court has the power of judicial review.\nIII. The Chief Justice of India is appointed by the President.\nWhich of the statements given above is/are correct?",
                options: [
                    "I and II only",
                    "III only",
                    "I, II and III",
                    "I only"
                ],
                correctAnswer: "I, II and III",
                format: "A"
            },
            
            {
                question: "How many of the following are Rabi crops?\n1. Wheat\n2. Rice\n3. Maize\n4. Peas\n5. Mustard",
                options: [
                    "Only three",
                    "Only two",
                    "Only one",
                    "All five"
                ],
                correctAnswer: "Only three",
                format: "B"
            },
            
            {
                question: "Consider the following pairs:\nMountain Peak : State\nI. Kanchenjunga : Sikkim\nII. Nanda Devi : Uttarakhand\nIII. Anamudi : Kerala\nIV. Dodabetta : Tamil Nadu\nHow many pairs given above are correctly matched?",
                options: [
                    "All four",
                    "Three",
                    "Two",
                    "One"
                ],
                correctAnswer: "All four",
                format: "C"
            },
            
            {
                question: "Which of the following are among the Fundamental Duties of citizens laid down in the Indian Constitution?\nI. To preserve the rich heritage of our composite culture\nII. To protect and improve the natural environment\nIII. To develop scientific temper and spirit of inquiry\nIV. To strive towards excellence in all spheres of individual and collective activity\nV. To practice family planning and control population\nSelect the correct answer using the code given below.",
                options: [
                    "I, II, III and IV only",
                    "I, III, IV and V only",
                    "II, III and V only",
                    "I, II, III, IV and V"
                ],
                correctAnswer: "I, II, III and IV only",
                format: "D"
            },
            
            {
                question: "Which one of the following is the best description of 'INS Arihant', that was in the news recently?",
                options: [
                    "Nuclear-powered ballistic missile submarine",
                    "Torpedo launch and recovery vessel",
                    "Amphibious warfare ship",
                    "Destroyer"
                ],
                correctAnswer: "Nuclear-powered ballistic missile submarine",
                format: "E"
            },
            
            // Additional questions for Set B
            {
                question: "Consider the following statements about the Governor of a State:\nI. The Governor is appointed by the President.\nII. The Governor holds office during the pleasure of the President.\nIII. The Governor can summon, prorogue and dissolve the State Legislature.\nWhich of the statements given above is/are correct?",
                options: [
                    "I and II only",
                    "III only",
                    "I, II and III",
                    "I only"
                ],
                correctAnswer: "I, II and III",
                format: "A"
            },
            
            {
                question: "How many of the following are Kharif crops?\n1. Rice\n2. Maize\n3. Cotton\n4. Groundnut\n5. Soybean",
                options: [
                    "All five",
                    "Only four",
                    "Only three",
                    "Only two"
                ],
                correctAnswer: "All five",
                format: "B"
            },
            
            {
                question: "Consider the following pairs:\nDam : River\nI. Hirakud Dam : Mahanadi\nII. Bhakra Nangal Dam : Sutlej\nIII. Nagarjuna Sagar Dam : Godavari\nIV. Tungabhadra Dam : Tungabhadra\nHow many pairs given above are correctly matched?",
                options: [
                    "All four",
                    "Three",
                    "Two",
                    "One"
                ],
                correctAnswer: "Three",
                format: "C"
            },
            
            {
                question: "Which of the following are among the functions of the Election Commission of India?\nI. Superintendence, direction and conduct of free and fair elections\nII. Preparation of electoral rolls\nIII. Recognition of political parties\nIV. Allocation of symbols to political parties\nV. Appointment of Election Commissioners\nSelect the correct answer using the code given below.",
                options: [
                    "I, II, III and IV only",
                    "I, III, IV and V only",
                    "II, III and V only",
                    "I, II, III, IV and V"
                ],
                correctAnswer: "I, II, III and IV only",
                format: "D"
            },
            
            {
                question: "Which one of the following is the best description of 'INS Chakra', that was in the news recently?",
                options: [
                    "Nuclear-powered attack submarine",
                    "Torpedo launch and recovery vessel",
                    "Amphibious warfare ship",
                    "Destroyer"
                ],
                correctAnswer: "Nuclear-powered attack submarine",
                format: "E"
            },
            
            // Additional questions for Set C
            {
                question: "Consider the following statements about the Comptroller and Auditor General (CAG) of India:\nI. The CAG is appointed by the President.\nII. The CAG holds office for a term of 6 years or until he attains the age of 65 years.\nIII. The CAG can be removed by the President on the basis of a resolution passed by both Houses of Parliament.\nWhich of the statements given above is/are correct?",
                options: [
                    "I and II only",
                    "III only",
                    "I, II and III",
                    "I only"
                ],
                correctAnswer: "I, II and III",
                format: "A"
            },
            
            {
                question: "How many of the following are Rabi crops?\n1. Wheat\n2. Barley\n3. Peas\n4. Mustard\n5. Gram",
                options: [
                    "All five",
                    "Only four",
                    "Only three",
                    "Only two"
                ],
                correctAnswer: "All five",
                format: "B"
            },
            
            {
                question: "Consider the following pairs:\nPass : State\nI. Nathu La Pass : Sikkim\nII. Rohtang Pass : Himachal Pradesh\nIII. Palghat Pass : Kerala\nIV. Bhor Ghat Pass : Maharashtra\nHow many pairs given above are correctly matched?",
                options: [
                    "All four",
                    "Three",
                    "Two",
                    "One"
                ],
                correctAnswer: "All four",
                format: "C"
            },
            
            {
                question: "Which of the following are among the provisions of the Right to Education (RTE) Act, 2009?\nI. Free and compulsory education to all children in the age group of 6-14 years\nII. No child shall be held back, expelled or required to pass a board examination till completion of elementary education\nIII. All private schools shall admit 25% of the children in their class strength from weaker section and disadvantaged group\nIV. Reservation of 50% seats for girls in all schools\nV. Appointment of qualified teachers with prescribed norms\nSelect the correct answer using the code given below.",
                options: [
                    "I, II, III and V only",
                    "I, III, IV and V only",
                    "II, III and V only",
                    "I, II, III, IV and V"
                ],
                correctAnswer: "I, II, III and V only",
                format: "D"
            },
            
            {
                question: "Which one of the following is the best description of 'INS Kalvari', that was in the news recently?",
                options: [
                    "Scorpene-class submarine",
                    "Torpedo launch and recovery vessel",
                    "Amphibious warfare ship",
                    "Destroyer"
                ],
                correctAnswer: "Scorpene-class submarine",
                format: "E"
            }
        ];

        // Create three separate sets
        const setA = [];
        const setB = [];
        const setC = [];
        
        // Ensure we have enough questions for three sets
        const totalQuestionsNeeded = count * 3;
        const availableQuestions = allSampleQuestions.length;
        
        // Select questions for Set A
        const usedIndicesA = new Set();
        while (setA.length < count && setA.length < availableQuestions) {
            const randomIndex = Math.floor(Math.random() * availableQuestions);
            if (!usedIndicesA.has(randomIndex)) {
                usedIndicesA.add(randomIndex);
                setA.push({...allSampleQuestions[randomIndex]});
            }
        }
        
        // Select questions for Set B (different from Set A)
        const usedIndicesB = new Set(usedIndicesA);
        while (setB.length < count && (setB.length + usedIndicesA.size) < availableQuestions) {
            const randomIndex = Math.floor(Math.random() * availableQuestions);
            if (!usedIndicesB.has(randomIndex)) {
                usedIndicesB.add(randomIndex);
                setB.push({...allSampleQuestions[randomIndex]});
            }
        }
        
        // Select questions for Set C (different from Set A and Set B)
        const usedIndicesC = new Set(usedIndicesB);
        while (setC.length < count && (setC.length + usedIndicesB.size) < availableQuestions) {
            const randomIndex = Math.floor(Math.random() * availableQuestions);
            if (!usedIndicesC.has(randomIndex)) {
                usedIndicesC.add(randomIndex);
                setC.push({...allSampleQuestions[randomIndex]});
            }
        }
        
        // If we still need more questions, duplicate from the pool ensuring no overlap within each set
        while (setA.length < count) {
            const randomIndex = Math.floor(Math.random() * availableQuestions);
            if (!usedIndicesA.has(randomIndex)) {
                usedIndicesA.add(randomIndex);
                setA.push({...allSampleQuestions[randomIndex]});
            }
        }
        
        while (setB.length < count) {
            const randomIndex = Math.floor(Math.random() * availableQuestions);
            if (!usedIndicesB.has(randomIndex)) {
                usedIndicesB.add(randomIndex);
                setB.push({...allSampleQuestions[randomIndex]});
            }
        }
        
        while (setC.length < count) {
            const randomIndex = Math.floor(Math.random() * availableQuestions);
            if (!usedIndicesC.has(randomIndex)) {
                usedIndicesC.add(randomIndex);
                setC.push({...allSampleQuestions[randomIndex]});
            }
        }
        
        // Shuffle options for each question in all sets and ensure balanced distribution
        const positionTargets = this.calculateBalancedPositions(count);
        
        // Process Set A
        setA.forEach((question, index) => {
            const targetPosition = positionTargets[index];
            const shuffled = this.shuffleOptionsWithTarget(question.options, question.correctAnswer, targetPosition);
            question.options = shuffled.options;
            question.correctAnswer = shuffled.correctAnswer;
        });
        
        // Process Set B
        setB.forEach((question, index) => {
            const targetPosition = positionTargets[index];
            const shuffled = this.shuffleOptionsWithTarget(question.options, question.correctAnswer, targetPosition);
            question.options = shuffled.options;
            question.correctAnswer = shuffled.correctAnswer;
        });
        
        // Process Set C
        setC.forEach((question, index) => {
            const targetPosition = positionTargets[index];
            const shuffled = this.shuffleOptionsWithTarget(question.options, question.correctAnswer, targetPosition);
            question.options = shuffled.options;
            question.correctAnswer = shuffled.correctAnswer;
        });

        return {
            setA,
            setB,
            setC
        };
    }

    /**
     * Calculate balanced target positions for correct answers
     * @param {number} count - Number of questions
     * @returns {Array} Array of target positions
     */
    static calculateBalancedPositions(count) {
        const positions = [];
        const baseCount = Math.floor(count / 4);
        const remainder = count % 4;
        
        // Create base distribution
        for (let i = 0; i < 4; i++) {
            const addOne = i < remainder ? 1 : 0;
            for (let j = 0; j < baseCount + addOne; j++) {
                positions.push(i);
            }
        }
        
        // Shuffle the positions array
        for (let i = positions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [positions[i], positions[j]] = [positions[j], positions[i]];
        }
        
        return positions;
    }

    /**
     * Shuffle options array with a target position for the correct answer
     * @param {Array} options - Array of option strings
     * @param {string} correctAnswer - The correct answer string
     * @param {number} targetPosition - Target position (0-3) for correct answer
     * @returns {Object} Object containing shuffled options and updated correct answer
     */
    static shuffleOptionsWithTarget(options, correctAnswer, targetPosition) {
        // Create a copy of the options array
        const shuffled = [...options];
        
        // Find current position of correct answer
        const correctIndex = shuffled.indexOf(correctAnswer);
        
        // Move correct answer to target position
        if (correctIndex !== -1 && targetPosition < shuffled.length) {
            // Swap correct answer with target position
            [shuffled[correctIndex], shuffled[targetPosition]] = [shuffled[targetPosition], shuffled[correctIndex]];
        }
        
        // Shuffle remaining options (excluding the correct answer at target position)
        for (let i = shuffled.length - 1; i > targetPosition; i--) {
            if (i !== targetPosition) {
                const j = targetPosition + Math.floor(Math.random() * (i - targetPosition + 1));
                if (j !== targetPosition) { // Don't swap with the correct answer
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
            }
        }
        
        // For positions before target, shuffle excluding the correct answer position
        for (let i = targetPosition - 1; i >= 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            // Make sure we don't swap the correct answer
            if (j !== targetPosition && i !== targetPosition) {
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
        }
        
        return {
            options: shuffled,
            correctAnswer: shuffled[targetPosition]
        };
    }
}

module.exports = UPSCQuestionGenerator;