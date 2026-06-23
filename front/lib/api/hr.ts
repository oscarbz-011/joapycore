import { apiClient } from './client';

// ── Enums ──────────────────────────────────────────────────────────────────────
export type DocumentType = 'CI' | 'RUC' | 'PASSPORT';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type MaritalStatus = 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED' | 'OTHER';
export type ContractType = 'PERMANENT' | 'TEMPORARY' | 'PART_TIME' | 'CONTRACTOR';
export type PaymentMethod = 'BANK_TRANSFER' | 'CASH';
export type PayrollStatus = 'PENDING' | 'PROCESSED' | 'PAID';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface Employee {
  id: string;
  employeeNumber: number;
  firstName: string;
  lastName: string;
  documentType: DocumentType;
  documentNumber: string;
  ci?: string | null;
  ipsNumber?: string | null;
  ruc?: string | null;
  birthDate: string;
  gender?: Gender | null;
  nationality?: string | null;
  maritalStatus?: MaritalStatus | null;
  phone?: string | null;
  mobilePhone?: string | null;
  address?: string | null;
  city?: string | null;
  emergencyContactName?: string | null;
  hireDate: string;
  contractType: ContractType;
  baseSalary: number;
  paymentMethod: PaymentMethod;
  bankName?: string | null;
  bankAccount?: string | null;
  isActive: boolean;
  terminationDate?: string | null;
  area?: { id: string; name: string } | null;
  position?: { id: string; name: string } | null;
  manager?: { id: string; firstName: string; lastName: string } | null;
  user?: { id: string; email: string; status: string; mustChangePassword: boolean } | null;
}

export interface CreateEmployeePayload {
  firstName: string;
  lastName: string;
  documentType: DocumentType;
  documentNumber: string;
  birthDate: string;
  hireDate: string;
  baseSalary: number;
  gender?: Gender;
  maritalStatus?: MaritalStatus;
  contractType?: ContractType;
  paymentMethod?: PaymentMethod;
  nationality?: string;
  phone?: string;
  mobilePhone?: string;
  address?: string;
  city?: string;
  areaId?: string;
  positionId?: string;
  managerId?: string;
  email?: string;
}

export interface Area {
  id: string;
  name: string;
  parentId?: string | null;
  isActive: boolean;
}

export interface Position {
  id: string;
  name: string;
  isActive: boolean;
}

export interface PayrollConfig {
  id?: string;
  tenantId?: string;
  minimumWage: number;
  ipsEmployeeRate: number;
  ipsEmployerRate: number;
}

export interface PayrollRecord {
  id: string;
  period: string;
  status: PayrollStatus;
  totalGross: number;
  totalNet: number;
  totalIpsEmployee: number;
  totalIpsEmployer: number;
  totalAguinaldo: number;
  createdAt: string;
  items?: PayrollRecordItem[];
}

export interface PayrollRecordItem {
  id: string;
  grossSalary: number;
  aguinaldo: number;
  ipsEmployee: number;
  ipsEmployer: number;
  netSalary: number;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: number;
  };
}

// ── API ────────────────────────────────────────────────────────────────────────
export const hrApi = {
  // Employees
  listEmployees: (): Promise<Employee[]> =>
    apiClient.get('/hr/employees').then((r) => r.data),

  getEmployee: (id: string): Promise<Employee> =>
    apiClient.get(`/hr/employees/${id}`).then((r) => r.data),

  createEmployee: (dto: CreateEmployeePayload): Promise<{ employee: Employee; tempPassword?: string }> =>
    apiClient.post('/hr/employees', dto).then((r) => r.data),

  updateEmployee: (id: string, dto: Partial<CreateEmployeePayload>): Promise<Employee> =>
    apiClient.patch(`/hr/employees/${id}`, dto).then((r) => r.data),

  terminateEmployee: (id: string, terminationDate?: string): Promise<Employee> =>
    apiClient.post(`/hr/employees/${id}/terminate`, { terminationDate }).then((r) => r.data),

  resetEmployeePassword: (id: string): Promise<{ tempPassword: string }> =>
    apiClient.post(`/hr/employees/${id}/reset-password`).then((r) => r.data),

  linkUser: (id: string, email: string): Promise<Employee> =>
    apiClient.post(`/hr/employees/${id}/link-user`, { email }).then((r) => r.data),

  // Areas
  listAreas: (): Promise<Area[]> =>
    apiClient.get('/hr/areas').then((r) => r.data),

  createArea: (dto: { name: string; parentId?: string }): Promise<Area> =>
    apiClient.post('/hr/areas', dto).then((r) => r.data),

  updateArea: (id: string, dto: Partial<{ name: string; isActive: boolean }>): Promise<Area> =>
    apiClient.patch(`/hr/areas/${id}`, dto).then((r) => r.data),

  // Positions
  listPositions: (): Promise<Position[]> =>
    apiClient.get('/hr/positions').then((r) => r.data),

  createPosition: (dto: { name: string }): Promise<Position> =>
    apiClient.post('/hr/positions', dto).then((r) => r.data),

  updatePosition: (id: string, dto: Partial<{ name: string; isActive: boolean }>): Promise<Position> =>
    apiClient.patch(`/hr/positions/${id}`, dto).then((r) => r.data),

  // Payroll config
  getPayrollConfig: (): Promise<PayrollConfig | null> =>
    apiClient.get('/hr/payroll/config').then((r) => r.data),

  updatePayrollConfig: (dto: Partial<PayrollConfig>): Promise<PayrollConfig> =>
    apiClient.put('/hr/payroll/config', dto).then((r) => r.data),

  // Payroll records
  listPayrollRecords: (): Promise<PayrollRecord[]> =>
    apiClient.get('/hr/payroll/records').then((r) => r.data),

  getPayrollRecord: (id: string): Promise<PayrollRecord> =>
    apiClient.get(`/hr/payroll/records/${id}`).then((r) => r.data),

  runPayroll: (period: string): Promise<PayrollRecord> =>
    apiClient.post('/hr/payroll/records/run', { period }).then((r) => r.data),

  markPaid: (id: string): Promise<PayrollRecord> =>
    apiClient.post(`/hr/payroll/records/${id}/pay`).then((r) => r.data),
};
