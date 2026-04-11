import api from './api';

export const getAllLeaves = async (leaveData) => {
  try {
    if (!leaveData.subdomain || leaveData.subdomain == 'main') {
      throw new Error('Subdomain is missing check the URL');
    }

    const response = await api.get(`/leaves/${leaveData.subdomain}/0`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to fetch leaves');
  }
};

export const getMyLeaves = async (leaveData) => {
  try {
    console.log('Fetching leaves for subdomain:', leaveData.subdomain);
    const response = await api.get(`/leaves/${leaveData.subdomain}/1`);
    console.log('Leaves Service Response:', response.data);
    console.log('Number of leaves found:', Array.isArray(response.data) ? response.data.length : 'Not an array');

    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('Leaves Fetch Error:', error);
    throw error.response ? error.response.data : new Error('Failed to fetch leaves');
  }
}

// Create leave
export const createLeave = async (leaveData) => {
  try {
    // Check if leaveData is already a FormData object
    let formData;
    let subdomain, reason, startDate, endDate, leaveType;

    if (leaveData instanceof FormData) {
      // If it's already FormData, extract values for validation
      formData = leaveData;
      subdomain = formData.get('subdomain');
      reason = formData.get('reason');
      startDate = formData.get('startDate');
      endDate = formData.get('endDate');
      leaveType = formData.get('leaveType');
    } else {
      // If it's a regular object, create FormData
      subdomain = leaveData.subdomain;
      reason = leaveData.reason;
      startDate = leaveData.startDate;
      endDate = leaveData.endDate;
      leaveType = leaveData.leaveType;

      formData = new FormData();
      Object.keys(leaveData).forEach(key => {
        if (key === 'document' && leaveData.document) {
          formData.append('document', leaveData.document, leaveData.document.name);
        } else {
          formData.append(key, leaveData[key]);
        }
      });
    }

    // Validation
    if (!subdomain || subdomain === 'main') {
      throw new Error('Subdomain is missing check the URL');
    }
    if (!reason || reason.trim() === '') {
      throw new Error('Reason is required and cannot be empty');
    }
    if (!startDate) {
      throw new Error('Start date is required');
    }
    if (!endDate) {
      throw new Error('End date is required');
    }
    if (!leaveType) {
      throw new Error('Leave type is required');
    }

    const response = await api.post('/leaves', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Leave creation error:', error.response?.data || error);
    throw error.response?.data || new Error('Failed to create leave');
  }
};

// Update leave status (admin)
export const updateLeaveStatus = async (leaveId, status, leaveData) => {
  try {
    const response = await api.put(`/leaves/${leaveId}/status`, { status, leaveData });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to update leave status');
  }
};

// Mark leave as viewed (worker)
export const markLeaveAsViewed = async (leaveId) => {
  try {
    const response = await api.put(`/leaves/${leaveId}/viewed`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to mark leave as viewed');
  }
};

// Get leaves by date range (admin)
export const getLeavesByDateRange = async (startDate, endDate) => {
  try {
    const response = await api.get(`/leaves/range?startDate=${startDate}&endDate=${endDate}`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to fetch leaves');
  }
};

export const getLeavesByStatus = async (status) => {
  try {
    const response = await api.get(`/leaves/status?status=${status}`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to fetch leaves');
  }
};

export const getLeaveApplyStats = async (subdomain) => {
  try {
    const response = await api.get(`/leaves/apply-info/${subdomain}`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to fetch leave apply stats');
  }
};

export const markLeavesAsViewedByAdmin = async () => {
  try {
    await api.put('/leaves/mark-viewed-by-admin');
  } catch (error) {
    console.error('Failed to mark leaves as viewed:', error);
  }
};