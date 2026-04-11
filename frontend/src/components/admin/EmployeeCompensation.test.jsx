import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EmployeeCompensation from './EmployeeCompensation';

// Mock the context and services
const mockAppContext = {
  subdomain: 'test-subdomain'
};

const mockGetWorkers = jest.fn();
const mockGetCompensationReport = jest.fn();

jest.mock('../../context/AppContext', () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock('../../services/workerService', () => ({
  getWorkers: () => mockGetWorkers(),
  addWorkerWithCompensation: jest.fn(),
  updateWorkerCompensation: jest.fn(),
}));

jest.mock('../../services/salaryService', () => ({
  getCompensationReport: () => mockGetCompensationReport(),
}));

// Mock toast
jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  }
}));

describe('EmployeeCompensation Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWorkers.mockResolvedValue([]);
    mockGetCompensationReport.mockResolvedValue({
      report: [],
      totalWorkers: 0,
      totalCompensation: 0
    });
  });

  test('renders type and class filter dropdowns', async () => {
    render(
      <MemoryRouter>
        <EmployeeCompensation />
      </MemoryRouter>
    );

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Employee Compensation')).toBeInTheDocument();
    });

    // Check if type filter exists
    const typeFilter = screen.getByRole('combobox', { name: /type filter/i });
    expect(typeFilter).toBeInTheDocument();

    // Initially, class filter should not be visible since no type with classes is selected
    const classFilter = screen.queryByRole('combobox', { name: /class filter/i });
    expect(classFilter).not.toBeInTheDocument();
  });

  test('shows class filter when employee type with classes is selected', async () => {
    render(
      <MemoryRouter>
        <EmployeeCompensation />
      </MemoryRouter>
    );

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Employee Compensation')).toBeInTheDocument();
    });

    // Select employee type that has classes
    const typeFilter = screen.getByRole('combobox');
    fireEvent.change(typeFilter, { target: { value: 'employee' } });

    // Now class filter should be visible
    await waitFor(() => {
      const classFilter = screen.getByRole('combobox', { name: /class filter/i });
      expect(classFilter).toBeInTheDocument();
    });
  });

  test('filters by both type and class', async () => {
    const mockWorkers = [
      { _id: '1', name: 'John Doe', employeeType: 'employee', class: 'A', salary: 12000 },
      { _id: '2', name: 'Jane Smith', employeeType: 'employee', class: 'B', salary: 9000 },
      { _id: '3', name: 'Bob Johnson', employeeType: 'intern', class: null, salary: 0 },
    ];

    mockGetWorkers.mockResolvedValue(mockWorkers);

    render(
      <MemoryRouter>
        <EmployeeCompensation />
      </MemoryRouter>
    );

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Employee Compensation')).toBeInTheDocument();
    });

    // Select employee type
    const typeFilter = screen.getByRole('combobox');
    fireEvent.change(typeFilter, { target: { value: 'employee' } });

    // Select class A
    await waitFor(() => {
      const classFilter = screen.getByRole('combobox', { name: /class filter/i });
      fireEvent.change(classFilter, { target: { value: 'A' } });
    });

    // Only John Doe should be visible (employee type with class A)
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
      expect(screen.queryByText('Bob Johnson')).not.toBeInTheDocument();
    });
  });
});