import api from './api';
import uploadUtils from '../utils/uploadUtils';
import { getAuthToken } from '../utils/authUtils';

export const getUniqueId = async () => {
  try {
    const response = await api.get('/workers/generate-id');
    console.log(response.data);
    return response.data || [];
  } catch (error) {
    console.error('Workers fetch error:', error);
    return [];
  }
};

export const createWorker = async (workerData) => {
  try {
    console.log('Worker data:', workerData);

    // Enhanced client-side validation
    if (!workerData.name || workerData.name.trim() === '') {
      throw new Error('Name is required and cannot be empty');
    }
    if (!workerData.username || workerData.username.trim() === '') {
      throw new Error('Username is required and cannot be empty');
    }
    if (!workerData.subdomain || workerData.subdomain.trim() === '') {
      throw new Error('Subdomain is missing, please check the url');
    }
    if (!workerData.password || workerData.password.trim() === '') {
      throw new Error('Password is required and cannot be empty');
    }
    // FIX: Convert salary to string before calling trim()
    if (!workerData.salary || String(workerData.salary).trim() === '') {
      throw new Error('Salary is required and cannot be empty');
    }
    if (!workerData.department) {
      throw new Error('Department is required');
    }
    if (!workerData.batch) { // ADDED THIS
      throw new Error('Batch is required');
    }

    // Handle photo upload if it's a file
    if (workerData.photo && workerData.photo instanceof File) {
      const urlResponse = await uploadUtils(workerData.photo);
      // Only update the photo field if upload was successful
      if (urlResponse) {
        workerData.photo = urlResponse;
      } else {
        // If upload failed, remove the photo field or keep the existing one
        delete workerData.photo;
      }
    }

    const response = await api.post('/workers', workerData);
    return response.data;
  } catch (error) {
    console.error('Worker creation error:', error.response?.data || error);
    throw error.response?.data || new Error('Failed to create worker');
  }
};

export const getWorkers = async (subdomainParam, params = {}) => {
  try {
    const subdomain = typeof subdomainParam === 'object' ? subdomainParam.subdomain : subdomainParam;
    const status = typeof subdomainParam === 'object' && subdomainParam.status ? subdomainParam.status : 'Active';
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    const response = await api.post(`/workers/all?_t=${timestamp}`, { subdomain, status, ...params });
    const data = response.data;
    const rawList = Array.isArray(data) ? data : (Array.isArray(data?.workers) ? data.workers : []);

    const transformedWorkers = rawList.map(w => {
      let deptName = 'N/A';
      let deptId = null;

      const rawDept = w.department;
      if (rawDept) {
        if (typeof rawDept === 'object' && rawDept !== null) {
          deptName = rawDept.name ? String(rawDept.name).trim() : (rawDept._id ? String(rawDept._id) : 'N/A');
          deptId = rawDept._id ? String(rawDept._id) : null;
        } else if (typeof rawDept === 'string') {
          deptName = rawDept.trim() || 'N/A';
          deptId = /^[0-9a-fA-F]{24}$/.test(rawDept.trim()) ? rawDept.trim() : null;
        }
      } else if (w.departmentName) {
        deptName = String(w.departmentName).trim();
        deptId = w.departmentId || null;
      }

      return {
        ...w,
        department: deptName,
        departmentName: deptName,
        departmentId: deptId || w.departmentId || null,
        departmentInfo: { _id: deptId || w.departmentId || null, name: deptName }
      };
    });

    if (Array.isArray(data)) {
      return transformedWorkers;
    }

    return {
      ...data,
      workers: transformedWorkers
    };
  } catch (error) {
    console.error('Workers fetch error:', error);
    throw error.response ? error.response.data : new Error('Failed to fetch workers');
  }
};

export const getWorkerById = async (id) => {
  try {
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    const response = await api.get(`/workers/${id}?_t=${timestamp}`);
    return response.data;
  } catch (error) {
    console.error('Worker fetch error:', error);
    throw error.response?.data || new Error('Failed to fetch worker');
  }
};

export const getWorkersInDepartment = async (departmentId, subdomain) => {
  try {
    const response = await api.get(`/workers/department/${departmentId}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: subdomain // Pass subdomain in the request body
    });
    return response.data || [];
  } catch (error) {
    console.error('Workers in department fetch error:', error);
    return [];
  }
};

export const getPublicWorkers = async (subdomainObj) => {
  try {
    const response = await api.post('/workers/public', subdomainObj);
    return response.data || [];
  } catch (error) {
    console.error('Public workers fetch error:', error);
    return [];
  }
};

export const updateWorker = async (id, workerData) => {
  try {
    // Handle photo upload if it's a file
    if (workerData.photo && workerData.photo instanceof File) {
      const urlResponse = await uploadUtils(workerData.photo);
      // Only update the photo field if upload was successful
      if (urlResponse) {
        workerData.photo = urlResponse;
      } else {
        // If upload failed, remove the photo field to keep the existing one
        delete workerData.photo;
      }
    }

    const response = await api.put(`/workers/${id}`, workerData);
    return response.data;
  } catch (error) {
    console.error('Update Worker Error:', {
      response: error.response,
      data: error.response?.data,
      status: error.response?.status
    });
    throw error.response ? error.response.data : new Error('Failed to update worker');
  }
};

export const deleteWorker = async (id) => {
  try {
    const response = await api.delete(`/workers/${id}`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error('Failed to delete worker');
  }
};

export const addWorkerWithCompensation = async (workerData) => {
  try {
    // Handle photo upload if it's a file
    if (workerData.photo && workerData.photo instanceof File) {
      const urlResponse = await uploadUtils(workerData.photo);
      // Only update the photo field if upload was successful
      if (urlResponse) {
        workerData.photo = urlResponse;
      } else {
        // If upload failed, remove the photo field to keep the existing one
        delete workerData.photo;
      }
    }

    const response = await api.post('/workers', workerData);
    return response.data;
  } catch (error) {
    console.error('Worker creation error:', error.response?.data || error);
    throw error.response?.data || new Error('Failed to create worker');
  }
};

export const updateWorkerCompensation = async (id, workerData) => {
  try {
    // Handle photo upload if it's a file
    if (workerData.photo && workerData.photo instanceof File) {
      const urlResponse = await uploadUtils(workerData.photo);
      // Only update the photo field if upload was successful
      if (urlResponse) {
        workerData.photo = urlResponse;
      } else {
        // If upload failed, remove the photo field to keep the existing one
        delete workerData.photo;
      }
    }

    const response = await api.put(`/workers/${id}`, workerData);
    return response.data;
  } catch (error) {
    console.error('Update Worker Error:', {
      response: error.response,
      data: error.response?.data,
      status: error.response?.status
    });
    throw error.response ? error.response.data : new Error('Failed to update worker');
  }
};

// Get worker by RFID
export const getWorkerByRfid = async (rfid) => {
  try {
    const response = await api.post('/workers/get-worker-by-rfid', { rfid });
    return response.data;
  } catch (error) {
    console.error('Worker fetch by RFID error:', error);
    throw error.response?.data || new Error('Failed to fetch worker by RFID');
  }
};