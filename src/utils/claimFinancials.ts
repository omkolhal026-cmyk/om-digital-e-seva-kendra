/**
 * OM DIGITAL E-SEVA KENDRA - Authoritative Claim Financials & Approval Logic
 *
 * Financial Calculation Rules:
 * - Selected = Approved
 * - Unselected = Rejected
 * - Approved Scheme Amount = Include in calculations
 * - Rejected Scheme Amount = ₹0 contribution
 * - Pending Scheme Amount  = ₹0 contribution
 *
 * Example:
 * Scheme 1: ₹20,000 - Approved
 * Scheme 2: ₹20,000 - Rejected
 * -> Total Claim Amount = ₹40,000
 * -> Scheme 1 Approved Amount = ₹20,000
 * -> Scheme 2 Approved Amount = ₹0
 * -> Total Approved Amount = ₹20,000
 *
 * Original amounts in the database are ALWAYS preserved and never overwritten with zero.
 */

import { WorkerClaim } from '../types';
import { formatDate } from './exportUtils';

export type SchemeApprovalStatus = 'Approved' | 'Rejected' | 'Pending' | 'Review Required';

export interface ClaimFinancials {
  scheme1OriginalAmount: number;
  scheme1Status: SchemeApprovalStatus;
  scheme1ApprovedAmount: number;
  scheme2OriginalAmount: number;
  scheme2Status: SchemeApprovalStatus;
  scheme2ApprovedAmount: number;
  hasScheme2: boolean;
  totalClaimAmount: number;
  totalApprovedAmount: number;
  needsReview: boolean;
}

export function getClaimFinancials(claim: {
  scheme1Amount?: number | string | null;
  scheme2Amount?: number | string | null;
  totalAmount?: number | string | null;
  status?: string | null;
  scheme1Status?: string | null;
  scheme2Status?: string | null;
  approvedAmount?: number | string | null;
  scheme2Name?: string | null;
  scheme2?: string | null;
}): ClaimFinancials {
  const s1Orig = Math.max(0, Number(claim.scheme1Amount || 0));
  const s2Orig = Math.max(0, Number(claim.scheme2Amount || 0));
  const totalClaim = s1Orig + s2Orig > 0 ? s1Orig + s2Orig : Math.max(0, Number(claim.totalAmount || 0));

  const overallStatus = String(claim.status || '').trim().toLowerCase();
  const isClaimApproved = overallStatus === 'approved' || overallStatus === 'disbursed';
  const isClaimRejected = overallStatus === 'rejected';

  const s2Label = claim.scheme2Name ?? claim.scheme2 ?? '';
  const hasScheme2 = Boolean(String(s2Label).trim() !== '' && String(s2Label).trim() !== '0' && String(s2Label).trim() !== '-') || s2Orig > 0;

  let needsReview = false;

  // Determine Scheme 1 Approval Status strictly from saved DB status
  let s1Status: SchemeApprovalStatus = 'Pending';
  if (isClaimRejected) {
    s1Status = 'Rejected';
  } else if (isClaimApproved) {
    if (claim.scheme1Status && String(claim.scheme1Status).trim() !== '') {
      const s = String(claim.scheme1Status).trim().toLowerCase();
      if (s === 'approved') s1Status = 'Approved';
      else if (s === 'rejected') s1Status = 'Rejected';
      else if (s === 'review required') {
        s1Status = 'Review Required';
        needsReview = true;
      } else {
        s1Status = 'Pending';
      }
    } else {
      // Old claim record without reliable per-scheme status: do NOT assume Approved
      s1Status = 'Review Required';
      needsReview = true;
    }
  } else {
    s1Status = 'Pending';
  }

  // Determine Scheme 2 Approval Status strictly from saved DB status
  let s2Status: SchemeApprovalStatus = 'Pending';
  if (!hasScheme2) {
    s2Status = 'Pending';
  } else if (isClaimRejected) {
    s2Status = 'Rejected';
  } else if (isClaimApproved) {
    if (claim.scheme2Status && String(claim.scheme2Status).trim() !== '') {
      const s = String(claim.scheme2Status).trim().toLowerCase();
      if (s === 'approved') s2Status = 'Approved';
      else if (s === 'rejected') s2Status = 'Rejected';
      else if (s === 'review required') {
        s2Status = 'Review Required';
        needsReview = true;
      } else {
        s2Status = 'Pending';
      }
    } else {
      // Old claim record without reliable per-scheme status: do NOT assume Approved
      s2Status = 'Review Required';
      needsReview = true;
    }
  } else {
    s2Status = 'Pending';
  }

  // Strictly calculate approved amounts:
  // Approved Scheme Amount = Include in calculations
  // Rejected / Pending / Review Required Scheme Amount = ₹0 contribution
  const s1ApprovedAmt = (isClaimApproved && s1Status === 'Approved') ? s1Orig : 0;
  const s2ApprovedAmt = (isClaimApproved && hasScheme2 && s2Status === 'Approved') ? s2Orig : 0;

  let totalApproved = s1ApprovedAmt + s2ApprovedAmt;

  // If claim.approvedAmount was explicitly stored on DB while scheme status is missing, respect explicit stored value
  if (
    isClaimApproved &&
    needsReview &&
    claim.approvedAmount !== undefined &&
    claim.approvedAmount !== null &&
    !claim.scheme1Status &&
    !claim.scheme2Status
  ) {
    totalApproved = Math.max(0, Number(claim.approvedAmount));
  }

  return {
    scheme1OriginalAmount: s1Orig,
    scheme1Status: s1Status,
    scheme1ApprovedAmount: s1ApprovedAmt,
    scheme2OriginalAmount: s2Orig,
    scheme2Status: s2Status,
    scheme2ApprovedAmount: s2ApprovedAmt,
    hasScheme2,
    totalClaimAmount: totalClaim,
    totalApprovedAmount: isClaimApproved ? totalApproved : 0,
    needsReview,
  };
}

/**
 * Standard formatted Excel row for any Claim-related export.
 * Includes all required individual scheme approval statuses and numeric amounts.
 */
export function formatClaimExcelRow(c: WorkerClaim, index: number): Record<string, any> {
  const fin = getClaimFinancials(c);

  return {
    'Sr No (अ.क्र.)': index + 1,
    'Claim ID': c.id || '',
    'Customer Name (कामगाराचे नाव)': c.workerName || '',
    'MH Number (MH क्रमांक)': c.mhNumber || '',
    'Mobile Number (मोबाईल नंबर)': c.mobileNumber || '',
    'Alternate Mobile': c.alternateMobileNumber || '',
    'Taluka (तालुका)': c.taluka || '',
    'Verification Date (पडताळणी तारीख)': c.verificationDate ? formatDate(c.verificationDate) : (c.claimDate ? formatDate(c.claimDate) : '-'),
    'Scheme 1 Name (योजना १ नाव)': c.scheme1Name || '',
    'Scheme 1 Original Amount (योजना १ मूळ रक्कम ₹)': fin.scheme1OriginalAmount,
    'Scheme 1 Approval Status (योजना १ स्थिती)': fin.scheme1Status,
    'Scheme 1 Approved Amount (योजना १ मंजूर रक्कम ₹)': fin.scheme1ApprovedAmount,
    'Class / Year 1': c.classYear || '',
    'Scheme 2 Name (योजना २ नाव)': fin.hasScheme2 ? (c.scheme2Name || '-') : '-',
    'Scheme 2 Original Amount (योजना २ मूळ रक्कम ₹)': fin.scheme2OriginalAmount,
    'Scheme 2 Approval Status (योजना २ स्थिती)': fin.hasScheme2 ? fin.scheme2Status : '-',
    'Scheme 2 Approved Amount (योजना २ मंजूर रक्कम ₹)': fin.scheme2ApprovedAmount,
    'Class / Year 2': c.classYear2 || '',
    'Total Claim Amount (एकूण क्लेम रक्कम ₹)': fin.totalClaimAmount,
    'Total Approved Amount (एकूण मंजूर रक्कम ₹)': fin.totalApprovedAmount,
    'Government List Number (शासकीय यादी क्र.)': c.listNumber || 'Unassigned',
    'Claim Status (स्थिती)': c.status || 'Pending',
    'Payment Mode': c.paymentMode || '',
    'From Source (स्त्रोत)': c.fromSource || '',
    'Financial Year (आर्थिक वर्ष)': c.financialYear || '',
    'Claim Date': c.claimDate ? formatDate(c.claimDate) : '',
    'Operator Name (नोंदणीकर्ता)': c.operatorName || c.createdBy || '',
    'Remarks': c.remarks || '',
  };
}
