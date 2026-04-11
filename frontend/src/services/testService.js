// Test API Services
import api from './api';

// Question Services
export const generateQuestions = async (data) => {
    const response = await api.post('/test/questions/generate', data);
    return response.data;
};

export const getQuestions = async (params = {}) => {
    const response = await api.get('/test/questions', { params });
    return response.data;
};

export const getQuestionsForTest = async (workerId) => {
    const response = await api.get(`/test/questions/${workerId}`);
    return response.data;
};

// Quick Test Services
export const createQuickTest = async (data) => {
    const response = await api.post('/test/questions/quick-test', data);
    return response.data;
};

export const submitQuickTest = async (quickTestId, answers) => {
    const response = await api.post(`/test/quick-test/submit/${quickTestId}`, { answers });
    return response.data;
};

// Test Services
export const submitTest = async (testAttemptId, answers) => {
    const response = await api.post(`/test/submit/${testAttemptId}`, { answers });
    return response.data;
};

export const getScores = async (params = {}) => {
    const response = await api.get('/test/scores', { params });
    return response.data;
};

export const getGlobalScores = async () => {
    const response = await api.get('/test/global-scores');
    return response.data;
};

export const getIndividualScores = async (workerId) => {
    const response = await api.get(`/test/scores/${workerId}`);
    return response.data;
};

export const getTestDetails = async (testId) => {
    const response = await api.get(`/test/${testId}/details`);
    return response.data;
};

// Learning Topic Services
export const submitTopic = async (data) => {
    const response = await api.post('/test/topics', data);
    return response.data;
};

export const getWeeklyTopics = async (workerId, params = {}) => {
    const response = await api.get(`/test/topics/weekly/${workerId}`, { params });
    return response.data;
};

export const checkTopicForToday = async (workerId) => {
    const response = await api.post('/test/topics/check', { workerId });
    return response.data;
};

export const getAllTopics = async (params = {}) => {
    const response = await api.get('/test/topics', { params });
    return response.data;
};

export const assignTopicsToWorkers = async (data) => {
    const response = await api.post('/test/topics/assign', data);
    return response.data;
};