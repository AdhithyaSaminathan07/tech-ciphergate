import api from './api';

const API_URL = '/tickets';

// Get all tickets
export const getTickets = async (params = {}) => {
    try {
        const response = await api.get(API_URL, { params });
        return response.data;
    } catch (error) {
        throw error.response?.data?.message || 'Error fetching tickets';
    }
};

// Create new ticket
export const createTicket = async (ticketData) => {
    try {
        const response = await api.post(API_URL, ticketData);
        return response.data;
    } catch (error) {
        throw error.response?.data?.message || 'Error creating ticket';
    }
};

// Update ticket
export const updateTicket = async (id, ticketData) => {
    try {
        const response = await api.put(`${API_URL}/${id}`, ticketData);
        return response.data;
    } catch (error) {
        throw error.response?.data?.error || error.response?.data?.message || 'Error updating ticket';
    }
};

// Delete ticket
export const deleteTicket = async (id) => {
    try {
        const response = await api.delete(`${API_URL}/${id}`);
        return response.data;
    } catch (error) {
        throw error.response?.data?.message || 'Error deleting ticket';
    }
};

// Get completions for a ticket
export const getTicketCompletions = async (ticketId) => {
    try {
        const response = await api.get(`${API_URL}/${ticketId}/completions`);
        return response.data;
    } catch (error) {
        throw error.response?.data?.message || 'Error fetching completions';
    }
};

// Upload sub-task proof
export const uploadSubTaskProof = async (formData) => {
    try {
        const response = await api.post(`${API_URL}/completions/upload`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data;
    } catch (error) {
        throw error.response?.data?.message || 'Error uploading proof';
    }
};

// Delete proof file
export const deleteSubTaskProof = async (completionId, fileId) => {
    try {
        const response = await api.delete(`${API_URL}/completions/${completionId}/proof/${fileId}`);
        return response.data;
    } catch (error) {
        throw error.response?.data?.message || 'Error deleting proof file';
    }
};

// Upload reference files
export const uploadReference = async (formData) => {
    try {
        const response = await api.post(`${API_URL}/completions/reference`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data;
    } catch (error) {
        throw error.response?.data?.message || 'Error uploading reference';
    }
};

// Upload ticket-level reference files
export const uploadTicketReference = async (ticketId, formData) => {
    try {
        const response = await api.post(`${API_URL}/${ticketId}/reference`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return response.data;
    } catch (error) {
        throw error.response?.data?.message || 'Error uploading ticket reference';
    }
};

// Delete ticket-level reference file
export const deleteTicketReference = async (ticketId, fileId) => {
    try {
        const response = await api.delete(`${API_URL}/${ticketId}/reference/${fileId}`);
        return response.data;
    } catch (error) {
        throw error.response?.data?.message || 'Error deleting ticket reference';
    }
};
