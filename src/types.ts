export type UserRole = 'admin' | 'operator' | 'sub_agent';

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
  canSeeMaterialDistribution?: boolean;
  canSeeWhatsappGroup?: boolean;
  canSeeIwbmsChecker?: boolean;
  canSeeSubAgentEntries?: boolean;
  canSeeSubAgentManagement?: boolean;
  canSeeClaimPayments?: boolean;
  canManageClaimPayments?: boolean;
  canManageCommissionSettings?: boolean;
  canManageExpenses?: boolean;
  canManageOfficerCommission?: boolean;
  canExportClaimPayments?: boolean;
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
  iwbmsStatus?: IwbmsResultStatus;
  iwbmsLastChecked?: string;
  iwbmsCheckStartedAt?: string;
  iwbmsCheckCompletedAt?: string;
  iwbmsError?: string;
  createdByUserId?: string;
  createdBy?: string;
  paymentAmount?: number;
  paymentMode?: 'Cash' | 'Online' | 'N/A';
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
  iwbmsStatus?: IwbmsResultStatus;
  iwbmsLastChecked?: string;
  iwbmsCheckStartedAt?: string;
  iwbmsCheckCompletedAt?: string;
  iwbmsError?: string;
  createdByUserId?: string;
  createdBy?: string;
  paymentAmount?: number;
  paymentMode?: 'Cash' | 'Online' | 'N/A';
  renewalYear?: string;
  aadhaarNumber?: string;
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
  iwbmsStatus?: IwbmsResultStatus;
  iwbmsLastChecked?: string;
  iwbmsCheckStartedAt?: string;
  iwbmsCheckCompletedAt?: string;
  iwbmsError?: string;
  createdByUserId?: string;
  createdBy?: string;
}

export interface SubAgentStats {
  totalRegistrations: number;
  totalRenewals: number;
  totalClaims: number;
  totalEntries: number;
  pendingEntries?: number;
  approvedEntries?: number;
  rejectedEntries?: number;
  todayRegistrations?: number;
  todayRenewals?: number;
  todayClaims?: number;
  todayEntries?: number;
  monthRegistrations?: number;
  monthRenewals?: number;
  monthClaims?: number;
  monthEntries?: number;
  totalCollection?: number;
  todayCollection?: number;
}

export interface SubAgentUserSummary extends User {
  stats?: SubAgentStats;
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

export type MaterialStatus = 'Pending' | 'Given' | 'Not Eligible';

export interface MaterialDistributionRecord {
  id: string;
  mhNumber: string;
  workerName: string;
  mobileNumber: string;
  taluka: string;
  sourceType: 'Registration' | 'Renewal';
  
  bhandiStatus: MaterialStatus;
  bhandiGivenDate?: string;
  bhandiGivenBy?: string;
  bhandiNotEligibleReason?: string;
  bhandiUpdatedBy?: string;
  bhandiUpdatedDate?: string;

  petiStatus: MaterialStatus;
  petiGivenDate?: string;
  petiGivenBy?: string;
  petiNotEligibleReason?: string;
  petiUpdatedBy?: string;
  petiUpdatedDate?: string;

  bagStatus: MaterialStatus;
  bagGivenDate?: string;
  bagGivenBy?: string;
  bagNotEligibleReason?: string;
  bagUpdatedBy?: string;
  bagUpdatedDate?: string;

  createdAt?: string;
  updatedAt?: string;
}

export type WhatsappGroupStatus = 'Pending' | 'Added' | 'No WhatsApp';

export interface WhatsappGroupTrackingRecord {
  mhNumber: string;
  workerName: string;
  mobileNumber: string;
  taluka: string;
  sourceType: 'Registration' | 'Renewal';
  activeDate: string;
  status: WhatsappGroupStatus;
  addedDate?: string;
  addedBy?: string;
  remark?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type IwbmsWorkerType = 'registration' | 'renewal' | 'claim' | 'direct';
export type IwbmsJobStatus = 'Pending' | 'Processing' | 'Completed' | 'Failed';
export type IwbmsResultStatus = 'Active' | 'Inactive' | 'Not Found' | 'Check';

export interface IwbmsCheckJob {
  id: number;
  workerType: IwbmsWorkerType;
  workerRecordId: string;
  mhNumber: string;
  status: IwbmsJobStatus;
  resultStatus?: IwbmsResultStatus;
  createdBy?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  retryCount: number;
  errorMessage?: string;
  lastCheckedAt?: string;
}

export type IwbmsWorkerStatus = 'Online' | 'Idle' | 'Processing' | 'Offline';

export interface IwbmsWorkerHeartbeat {
  workerName: string;
  workerVersion: string;
  status: IwbmsWorkerStatus;
  currentJobId?: number;
  currentMhNumber?: string;
  lastSeen: string;
  ipAddress?: string;
}

export interface IwbmsJobCounts {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  activeResults: number;
  inactiveResults: number;
  notFoundResults: number;
  checkResults: number;
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
  | 'APPROVAL_LIST_DELETE'
  | 'MATERIAL_DISTRIBUTION_UPDATE'
  | 'MATERIAL_ELIGIBILITY_UPDATE'
  | 'WHATSAPP_GROUP_STATUS_UPDATE'
  | 'IWBMS_JOB_CREATE'
  | 'IWBMS_JOB_COMPLETE'
  | 'IWBMS_JOB_FAIL'
  | 'IWBMS_JOB_RETRY'
  | 'IWBMS_BATCH_ENQUEUE'
  | 'CLAIM_PAYMENT_IMPORT'
  | 'CLAIM_PAYMENT_UPDATE'
  | 'CLAIM_COLLECTION_ADD'
  | 'CLAIM_EXPENSE_ADD'
  | 'CLAIM_EXPENSE_DELETE'
  | 'OFFICER_COMMISSION_UPDATE'
  | 'COMMISSION_SETTINGS_UPDATE';

export interface IwbmsCheckHistory {
  id: number;
  jobId: number;
  workerType: IwbmsWorkerType;
  workerRecordId: string;
  mhNumber: string;
  previousStatus?: string | null;
  newStatus: string;
  checkedAt: string;
  workerName?: string | null;
  details?: string | null;
}

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

// -------------------------------------------------------------
// CLAIM PAYMENTS MODULE INTERFACES
// -------------------------------------------------------------

export type ClaimPaymentListStatus = 'Payment Pending' | 'Payment Received' | 'Collection In Progress' | 'Collection Completed';

export interface ClaimPaymentList {
  id: string;
  listNumber: string;
  listDate: string;
  status: ClaimPaymentListStatus;
  notes?: string;
  createdByUserId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
  // Computed summary metrics
  totalWorkers?: number;
  totalClaimAmount?: number;
  totalCommissionExpected?: number;
  commissionReceived?: number;
  totalCommissionCollected?: number;
  commissionPending?: number;
  totalCommissionPending?: number;
  totalExpense?: number;
  totalExpenses?: number;
  officerCommission?: number;
  totalOfficerCommission?: number;
  netBalance?: number;
  talukas?: string[];
}

export interface ClaimCommissionCollection {
  id: string;
  workerPaymentId: string;
  listNumber: string;
  mhNumber: string;
  workerName: string;
  receivedAmount: number;
  paymentDate: string;
  paymentMode: 'Cash' | 'UPI' | 'Bank Transfer' | 'Other';
  referenceNumber?: string;
  remark?: string;
  createdByUserId?: string;
  createdBy?: string;
  createdAt: string;
}

export interface ClaimPaymentWorker {
  id: string;
  listId?: string;
  listNumber: string;
  workerName: string;
  mhNumber: string;
  mobileNumber?: string;
  verificationDate: string;
  taluka: string;
  scheme1: string;
  scheme2?: string;
  scheme1Amount?: number;
  scheme2Amount?: number;
  fromSource?: string;
  claimAmount: number;
  sourceType: 'direct' | 'sub_agent';
  subAgentId?: string;
  subAgentName?: string;
  commissionRateSnapshot: number;
  commissionAmountSnapshot: number;
  totalReceived: number;
  pendingCommission: number;
  paymentStatus: 'Pending' | 'Partially Paid' | 'Paid';
  lastPaymentDate?: string;
  notes?: string;
  createdByUserId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
  collections?: ClaimCommissionCollection[];
}

export interface ClaimPaymentExpense {
  id: string;
  listNumber?: string | null; // null = General Expense
  expenseDate: string;
  category: 'Tea' | 'Travel' | 'Petrol' | 'Printing' | 'Stationery' | 'Office' | 'Staff' | 'Other' | string;
  amount: number;
  description: string;
  paymentMode: 'Cash' | 'UPI' | 'Bank Transfer' | 'Other';
  remark?: string;
  createdByUserId?: string;
  createdBy?: string;
  createdAt: string;
}

export interface ClaimOfficerCommission {
  id: string;
  listNumber: string;
  taluka: string;
  totalClaimAmount: number;
  officerCommissionRate: number;
  officerCommissionAmount: number;
  paymentStatus: 'Pending' | 'Paid';
  paymentDate?: string;
  paymentMode?: string;
  referenceNumber?: string;
  remark?: string;
  createdByUserId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SubAgentCommissionConfig {
  subAgentId: string;
  username: string;
  name: string;
  commissionRate: number;
}

export interface CommissionSettings {
  directWorkerCommissionRate: number; // e.g. 10.00
  defaultOfficerCommissionRate: number; // e.g. 10.00
  subAgentRates: SubAgentCommissionConfig[];
  updatedAt?: string;
}

export interface ClaimPaymentsDashboardStats {
  todayCommission: number;
  thisMonthCommission: number;
  totalCommissionExpected: number;
  totalCommissionCollected: number;
  totalCommissionPending: number;
  totalExpenses: number;
  totalOfficerCommission: number;
  netBalance: number;
  activePaymentLists: number;
  completedLists: number;
  pendingWorkerCollections: number;
}

export interface IncomeCollectionRecord {
  id: string;
  sourceType: 'Registration' | 'Renewal';
  sourceId: string;
  workerName: string;
  mhNumber: string;
  paymentDate: string;
  paymentAmount: number;
  paymentMode: 'Cash' | 'Online';
  operatorName: string;
  taluka: string;
  createdAt?: string;
  updatedAt?: string;
}

