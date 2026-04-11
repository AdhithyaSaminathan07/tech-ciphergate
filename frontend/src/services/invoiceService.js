import api from './api';

// Helper function to clean invoice data before sending to backend
const cleanInvoiceData = (invoiceData) => {
  // Remove id fields from items as they're not needed in the backend
  const cleanedData = {
    ...invoiceData,
    items: invoiceData.items.map(item => {
      const { id, ...rest } = item;
      return rest;
    })
  };
  return cleanedData;
};

// Create a new invoice
export const createInvoice = async (invoiceData) => {
  try {
    // Clean the data before sending
    const cleanedData = cleanInvoiceData(invoiceData);
    const response = await api.post('/invoices', cleanedData);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Error creating invoice' };
  }
};

// Update an existing invoice
export const updateInvoice = async (id, invoiceData) => {
  try {
    // Clean the data before sending
    const cleanedData = cleanInvoiceData(invoiceData);
    const response = await api.put(`/invoices/${id}`, cleanedData);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Error updating invoice' };
  }
};

// Get all invoices for the current admin
export const getInvoices = async () => {
  try {
    const response = await api.get('/invoices');
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Error fetching invoices' };
  }
};

// Get all invoices (super admin only)
export const getAllInvoices = async () => {
  try {
    const response = await api.get('/invoices/all');
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Error fetching all invoices' };
  }
};

// Get a specific invoice by ID
export const getInvoiceById = async (id) => {
  try {
    const response = await api.get(`/invoices/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Error fetching invoice' };
  }
};

// Delete an invoice
export const deleteInvoice = async (id) => {
  try {
    const response = await api.delete(`/invoices/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Error deleting invoice' };
  }
};

// Update admin last viewed timestamp
export const updateAdminLastViewed = async () => {
  try {
    const response = await api.put('/invoices/admin-viewed');
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Error updating admin viewed status' };
  }
};

// Get new invoice count
export const getNewInvoiceCount = async () => {
  try {
    const response = await api.get('/invoices/new-count');
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Error fetching new invoice count' };
  }
};

// Get delete history for admin
export const getAdminDeleteHistory = async () => {
  try {
    const response = await api.get('/invoices/delete-history/admin');
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Error fetching admin delete history' };
  }
};

// Get delete history for worker
export const getWorkerDeleteHistory = async () => {
  try {
    const response = await api.get('/invoices/delete-history/worker');
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Error fetching worker delete history' };
  }
};

// Get a specific deleted invoice by ID
export const getDeletedInvoiceById = async (id) => {
  try {
    const response = await api.get(`/invoices/delete-history/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Error fetching deleted invoice' };
  }
};