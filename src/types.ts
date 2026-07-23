export type UserRole = 'admin' | 'operator';

export interface UserPermissions {
  canRegister: boolean;
  canRenew: boolean;
  canClaim: boolean;
  canExport: boolean;
}

export interface User {
  id: string;
  username: string;
  mobile: string;
  name: string;
  email: string;
  role: UserRole;
  password?: string;
  photoUrl?: string;
  status: 'active' | 'disabled';
  permissions: UserPermissions;
  createdAt: string;
  lastLogin?: string;
}

export interface WorkerDocuments {
  photo?: string;
  aadhaarCard?: string;
  passbook?: string;
  otherDoc?: string;
}

export interface WorkerRegistration {
  id: string;
  mhNumber: string;
  workerName: string;
  fatherName: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  mobileNumber: string;
  aadhaarNumber: string;
  address: string;
  village: string;
  taluka: string;
  district: string;
  pincode: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  verificationDate: string;
  registrationDate: string;
  operatorName: string;
  status: 'Active' | 'Pending Verification' | 'Expired' | 'Rejected' | 'Pending' | 'Accepted';
  fromSource?: string;
  nextRenewalDate?: string;
  appStatus?: 'Pending' | 'Accepted';
  documents: WorkerDocuments;
  feePaid: number;
  category?: string;
  natureOfWork?: string;
}

export interface WorkerRenewal {
  id: string;
  workerName: string;
  mhNumber: string;
  mobileNumber: string;
  verificationDate: string;
  renewalDate: string;
  taluka: string;
  fromSource: string;
  operatorName: string;
  status: 'Pending' | 'Active' | 'Completed' | 'Rejected';
  acceptedDate?: string;
  acceptedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  renewalPeriodYears?: number;
  renewedYears?: number;
  receiptNumber?: string;
  validTill?: string;
  newExpiryDate?: string;
  feeAmount?: number;
  documents?: {
    renewalSlip?: string;
  };
  remarks?: string;
}

export interface Scheme {
  id: string;
  code: string;
  name: string;
  category: 'Educational' | 'Health' | 'Welfare' | 'Financial' | 'Equipment' | 'Safety';
  amount: number;
  description: string;
}

export interface WorkerClaim {
  id: string;
  mhNumber: string;
  workerName: string;
  taluka: string;
  scheme1Id: string;
  scheme1Name: string;
  scheme1Amount: number;
  scheme2Id?: string;
  scheme2Name?: string;
  scheme2Amount?: number;
  totalAmount: number;
  mobileNumber: string;
  operatorName: string;
  status: 'Submitted' | 'Under Scrutiny' | 'Approved' | 'Disbursed' | 'Rejected';
  remarks: string;
  claimDate: string;
}

export type ActivityAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'REGISTRATION_CREATE'
  | 'REGISTRATION_EDIT'
  | 'REGISTRATION_DELETE'
  | 'RENEWAL_CREATE'
  | 'RENEWAL_EDIT'
  | 'CLAIM_SUBMIT'
  | 'CLAIM_UPDATE'
  | 'USER_CREATE'
  | 'USER_EDIT'
  | 'USER_STATUS_CHANGE'
  | 'PASSWORD_RESET'
  | 'SETTINGS_UPDATE'
  | 'DATA_RESTORE';

export interface ActivityLog {
  id: string;
  timestamp: string;
  username: string;
  userRole: UserRole;
  action: ActivityAction;
  details: string;
  ipAddress: string;
}

export interface OfficeSettings {
  officeName: string;
  officeLogo: string;
  officeAddress: string;
  districtName: string;
  contactNumbers: string;
  email: string;
  registrationFee: number;
  renewalFee: number;
  autoApproveClaims: boolean;
  themeMode: 'blue-gradient' | 'glassmorphism' | 'dark-navy';
}

export interface DashboardStats {
  totalRegistrations: number;
  totalRenewals: number;
  totalClaims: number;
  dailyWorkCount: number;
  monthlyRevenue: number;
  pendingWorkCount: number;
  approvedClaimsAmount: number;
}
