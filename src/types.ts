export type UserRole = 'admin' | 'operator';

export interface UserPermissions {
  canRegister: boolean;
  canRenew: boolean;
  canClaim: boolean;
  canExport: boolean;
  canSeeSearch?: boolean;
  canSeeClaimEntry?: boolean;
  canSeeRegistrationEntry?: boolean;
  canSeeRenewalEntry?: boolean;
  canSeeMasterExcelSync?: boolean;
  canSeePendingVerification?: boolean;
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
  fatherName?: string;
  dob?: string;
  gender?: 'Male' | 'Female' | 'Other' | string;
  mobileNumber: string;
  aadhaarNumber: string;
  address?: string;
  village?: string;
  taluka: string;
  district?: string;
  pincode?: string;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
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
  matchSource?: string;
  matchDate?: string;
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
  status: 'Submitted' | 'Under Scrutiny' | 'Approved' | 'Disbursed' | 'Rejected' | 'Payment Released';
  remarks: string;
  claimDate: string;
  listNumber?: string;
  paymentDate?: string;
  approvedAmount?: number;
}

export interface ApprovalRecord {
  id: string;
  listNumber: string;
  listDate: string;
  workerName: string;
  mhNumber: string;
  mobileNumber?: string;
  schemeName: string;
  approvedAmount: number;
  paymentStatus: 'Payment Released' | 'Pending' | 'Disbursed';
  paymentDate: string;
  claimId?: string;
  // Commission collection details
  commissionStatus: 'Pending' | 'Collected';
  commissionDate?: string;
  commissionAmount: number;
  commissionReceiptNo?: string;
  commissionNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkerFollowup {
  id: string;
  module: 'Registration' | 'Renewal' | 'Claim' | 'General';
  recordId?: string;
  mhNumber?: string;
  workerName?: string;
  mobileNumber?: string;
  followupDate: string; // YYYY-MM-DD
  followupTime?: string; // HH:MM
  followupNote: string;
  status: 'Pending' | 'Completed' | 'Cancelled';
  assignedUser?: string;
  createdBy?: string;
  completedDate?: string;
  completedBy?: string;
  nextFollowupId?: string;
  createdAt?: string;
}

export interface CustomerTimelineItem {
  id: string;
  type: 'Registration' | 'Renewal' | 'Claim' | 'Followup';
  date: string;
  title: string;
  status: string;
  createdBy?: string;
  completedBy?: string;
  details: Record<string, any>;
}

export interface CustomerProfile {
  mhNumber: string;
  workerName: string;
  aadhaarNumber: string;
  mobileNumber: string;
  taluka: string;
  village?: string;
  district?: string;
  address?: string;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  status?: string;
  registrationDate?: string;
  verificationDate?: string;
  nextRenewalDate?: string;
  totalRegistrations: number;
  totalRenewals: number;
  totalClaims: number;
  totalFollowups: number;
  timeline: CustomerTimelineItem[];
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
  | 'DATA_RESTORE'
  | 'MAHABOCW_RECORD_CHECK'
  | 'MASTER_EXCEL_SYNC'
  | 'APPROVAL_LIST_UPLOAD'
  | 'APPROVAL_LIST_UPDATE'
  | 'COMMISSION_UPDATE'
  | 'APPROVAL_LIST_DELETE';

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
  whatsappTemplate?: string;
}

export interface VerificationReminder {
  id?: string;
  module: 'Registration' | 'Renewal' | 'Claim';
  recordId: string;
  reminderStatus: 'Reminder Not Sent' | 'Opened/Prepared' | 'Reminder Sent';
  lastReminderDate?: string;
  reminderSentBy?: string;
  reminderCount: number;
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
