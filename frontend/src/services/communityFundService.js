import api from './api';
import { getAuthToken } from '../utils/authUtils';

// Get wallet balance and stats
export const getCommunityFundWallet = async () => {
    try {
        const token = getAuthToken();
        const response = await api.get('/community-fund/wallet', {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } catch (error) {
        throw error.response ? error.response.data : new Error('Failed to fetch wallet data');
    }
};

// Get all transactions
export const getCommunityFundTransactions = async () => {
    try {
        const token = getAuthToken();
        const response = await api.get('/community-fund/transactions', {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } catch (error) {
        throw error.response ? error.response.data : new Error('Failed to fetch transactions');
    }
};

// Debit from Community Fund for company usage
export const debitFund = async (debitData) => {
    try {
        const token = getAuthToken();
        const response = await api.post('/community-fund/debit', debitData, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } catch (error) {
        throw error.response ? error.response.data : new Error('Failed to debit fund');
    }
};

