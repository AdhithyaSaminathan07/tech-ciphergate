// config/performance.js
// Performance configuration for question generation system

module.exports = {
    // Concurrency settings
    CONCURRENT_WORKERS: 20,
    CONCURRENT_TOPICS_PER_WORKER: 5,
    CONCURRENT_TOPICS_BATCH: 10,
    
    // API settings
    MAX_QUESTIONS_PER_BATCH: 10,
    MAX_TOKENS: 4096,
    BATCH_DELAY: 100, // ms
    API_RETRY_DELAY: 500, // ms
    MAX_API_RETRIES: 2,
    
    // Rate limiting
    RATE_LIMIT_REQUESTS_PER_MINUTE: 50,
    
    // Caching
    CACHE_TTL: 30 * 60 * 1000, // 30 minutes
    ENABLE_TOPIC_CACHING: true,
    
    // Database optimization
    BULK_INSERT_ORDERED: false,
    
    // Timing optimizations
    RETRY_DELAY_MULTIPLIER: 1,
    BATCH_DELAY_BETWEEN_BATCHES: 100, // ms
};