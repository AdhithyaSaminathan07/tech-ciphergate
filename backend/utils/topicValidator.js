// utils/topicValidator.js

const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
    'the', 'to', 'was', 'were', 'will', 'with', 'what', 'how', 'why',
    'when', 'where', 'which', 'who', 'this', 'these', 'those', 'then',
    'topic', 'topics', 'daily', 'study', 'studied', 'learning', 'learn'
]);

// Common technical term expansions / concept associations
const TOPIC_CONCEPT_MAP = {
    react: ['component', 'hook', 'state', 'props', 'jsx', 'effect', 'render', 'virtual', 'dom', 'redux', 'context'],
    reactjs: ['component', 'hook', 'state', 'props', 'jsx', 'effect', 'render', 'virtual', 'dom', 'redux', 'context'],
    hooks: ['useeffect', 'usestate', 'usecontext', 'usememo', 'usecallback', 'useref', 'hook', 'custom'],
    nodejs: ['node', 'express', 'middleware', 'npm', 'event', 'loop', 'buffer', 'stream', 'async', 'callback'],
    node: ['express', 'middleware', 'npm', 'event', 'loop', 'buffer', 'stream', 'async', 'callback'],
    javascript: ['js', 'es6', 'closure', 'prototype', 'promise', 'async', 'await', 'scope', 'variable', 'function'],
    python: ['def', 'tuple', 'list', 'dict', 'django', 'flask', 'pandas', 'numpy', 'lambda', 'class'],
    sql: ['select', 'table', 'database', 'join', 'query', 'where', 'insert', 'update', 'delete', 'index'],
    mongodb: ['collection', 'document', 'mongoose', 'nosql', 'aggregate', 'schema', 'bson', 'lookup'],
    docker: ['container', 'image', 'dockerfile', 'compose', 'volume', 'port', 'daemon'],
    kubernetes: ['k8s', 'pod', 'cluster', 'deployment', 'ingress', 'service', 'namespace', 'kube'],
    typescript: ['type', 'interface', 'generic', 'enum', 'tuple', 'ts', 'compiler'],
    css: ['style', 'flexbox', 'grid', 'selector', 'media', 'tailwind', 'margin', 'padding'],
    html: ['tag', 'element', 'attribute', 'dom', 'form', 'input', 'div']
};

/**
 * Extracts normalized keyword tokens from topic strings
 * @param {string} topicString - Raw topic string, potentially comma-separated
 * @returns {string[]} Array of unique lowercase keywords
 */
function extractTopicKeywords(topicString) {
    if (!topicString || typeof topicString !== 'string') return [];
    
    // Split on commas, semicolons, dashes, slashes, whitespace
    const rawTokens = topicString
        .toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .split(/[\s,;/-]+/)
        .map(t => t.trim())
        .filter(Boolean);

    const keywords = new Set();
    for (const token of rawTokens) {
        if (token.length >= 2 && !STOP_WORDS.has(token)) {
            keywords.add(token);
            // If token ends with 'js' (e.g. 'reactjs', 'vuejs'), also add the base technology name
            if (token.endsWith('js') && token.length > 3) {
                const baseToken = token.slice(0, -2);
                keywords.add(baseToken);
                if (TOPIC_CONCEPT_MAP[baseToken]) {
                    for (const concept of TOPIC_CONCEPT_MAP[baseToken]) {
                        keywords.add(concept);
                    }
                }
            }
            // Also include recognized concept associations
            if (TOPIC_CONCEPT_MAP[token]) {
                for (const concept of TOPIC_CONCEPT_MAP[token]) {
                    keywords.add(concept);
                }
            }
        }
    }

    return Array.from(keywords);
}

/**
 * Deterministically checks whether a question is relevant to the given topic.
 * @param {Object} question - The question candidate { questionText, question, options, correctAnswer }
 * @param {string} topicString - The target topic
 * @returns {{ isRelevant: boolean, score: number, matchedKeywords: string[], reason?: string }}
 */
function isQuestionRelevantToTopic(question, topicString) {
    if (!question) {
        return { isRelevant: false, score: 0, matchedKeywords: [], reason: 'Question is undefined' };
    }

    const topicKeywords = extractTopicKeywords(topicString);
    if (topicKeywords.length === 0) {
        const cleanTopic = String(topicString).trim().toLowerCase();
        if (!cleanTopic) {
            return { isRelevant: false, score: 0, matchedKeywords: [], reason: 'Empty topic string' };
        }
        topicKeywords.push(cleanTopic);
    }

    const qText = String(question.questionText || question.question || '').toLowerCase();
    const optText = Array.isArray(question.options) ? question.options.join(' ').toLowerCase() : '';
    const fullSearchableText = `${qText} ${optText}`;

    const matchedKeywords = [];
    for (const kw of topicKeywords) {
        const regex = new RegExp(`\\b${kw}`, 'i');
        if (regex.test(fullSearchableText)) {
            matchedKeywords.push(kw);
        }
    }

    const isRelevant = matchedKeywords.length > 0;
    return {
        isRelevant,
        score: matchedKeywords.length,
        matchedKeywords,
        reason: isRelevant ? 'Topic keywords matched' : `No keywords from topic "${topicString}" found in question text or options`
    };
}

/**
 * Validates a single question's structural integrity
 * @param {Object} q - Question candidate
 * @returns {{ isValid: boolean, error?: string }}
 */
function validateQuestionStructure(q) {
    if (!q || typeof q !== 'object') {
        return { isValid: false, error: 'Question is not an object' };
    }

    const text = (q.questionText || q.question || '').trim();
    if (!text || text.length < 5) {
        return { isValid: false, error: 'Question text is empty or too short' };
    }

    if (!Array.isArray(q.options) || q.options.length < 2) {
        return { isValid: false, error: 'Options must be an array with at least 2 choices' };
    }

    const cleanOptions = q.options.map(opt => String(opt).trim());
    if (cleanOptions.some(opt => !opt)) {
        return { isValid: false, error: 'Question options cannot contain empty strings' };
    }

    // Check for distinct options (reject questions where options duplicate)
    const uniqueOptions = new Set(cleanOptions.map(o => o.toLowerCase()));
    if (uniqueOptions.size < cleanOptions.length) {
        return { isValid: false, error: 'Question contains duplicate options' };
    }

    // Check correct answer presence
    if (q.correctAnswer === undefined || q.correctAnswer === null || q.correctAnswer === '') {
        return { isValid: false, error: 'Question is missing correctAnswer' };
    }

    if (typeof q.correctAnswer === 'number') {
        if (q.correctAnswer < 0 || q.correctAnswer >= cleanOptions.length) {
            return { isValid: false, error: 'correctAnswer index out of bounds' };
        }
    } else {
        const cleanAns = String(q.correctAnswer).replace(/^\([a-d]\)\s*/i, '').trim().toLowerCase();
        const matchesOption = cleanOptions.some(opt => opt.replace(/^\([a-d]\)\s*/i, '').trim().toLowerCase() === cleanAns);
        if (!matchesOption) {
            return { isValid: false, error: 'correctAnswer does not match any available option' };
        }
    }

    return { isValid: true };
}

/**
 * Validates, deduplicates, and filters questions for topic relevance and structural correctness.
 * @param {Object[]} questions - Array of questions generated by AI
 * @param {string} topicString - Topic string the questions were generated for
 * @returns {{ validQuestions: Object[], rejectedQuestions: Object[] }}
 */
function validateAndFilterQuestions(questions, topicString) {
    if (!Array.isArray(questions)) {
        return { validQuestions: [], rejectedQuestions: [] };
    }

    const validQuestions = [];
    const rejectedQuestions = [];
    const seenTexts = new Set();

    for (const q of questions) {
        // 1. Structural check
        const structCheck = validateQuestionStructure(q);
        if (!structCheck.isValid) {
            rejectedQuestions.push({ question: q, reason: structCheck.error });
            continue;
        }

        // 2. Duplicate check within batch
        const qText = (q.questionText || q.question || '').trim().toLowerCase().replace(/[^\w]/g, '');
        if (seenTexts.has(qText)) {
            rejectedQuestions.push({ question: q, reason: 'Duplicate question text within batch' });
            continue;
        }
        seenTexts.add(qText);

        // 3. Topic relevance check
        if (topicString) {
            const relCheck = isQuestionRelevantToTopic(q, topicString);
            if (!relCheck.isRelevant) {
                rejectedQuestions.push({ question: q, reason: relCheck.reason });
                continue;
            }
        }

        validQuestions.push(q);
    }

    return { validQuestions, rejectedQuestions };
}

module.exports = {
    extractTopicKeywords,
    isQuestionRelevantToTopic,
    validateQuestionStructure,
    validateAndFilterQuestions,
    TOPIC_CONCEPT_MAP
};
