import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  XCircle,
  Clock,
  Save,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  User as UserIcon,
  Phone,
} from 'lucide-react';
import { User, AttendanceStatus } from '../types';

interface StaffAttendanceItem {
  userId: string;
  username: string;
  name: string;
  mobile?: string;
  isMarked: boolean;
  status: AttendanceStatus;
  inTime: string;
  outTime: string;
  notes: string;
}

interface DailyStaffAttendanceModuleProps {
  currentUser: User;
  onSuccessSaved: () => void;
  onSkipToDashboard: () => void;
  getAuthHeaders: () => Record<string, string>;
}

const MARATHI_MONTHS = [
  'जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून',
  'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर'
];

const MARATHI_DAYS = [
  'रविवार', 'सोमवार', 'मंगळवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'
];

export const DailyStaffAttendanceModule: React.FC<DailyStaffAttendanceModuleProps> = ({
  currentUser,
  onSuccessSaved,
  onSkipToDashboard,
  getAuthHeaders,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [todayDate, setTodayDate] = useState<string>('');
  const [dayOfWeek, setDayOfWeek] = useState<number>(0);
  const [isSunday, setIsSunday] = useState<boolean>(false);
  const [isCompletedAlready, setIsCompletedAlready] = useState<boolean>(false);
  const [staffList, setStaffList] = useState<StaffAttendanceItem[]>([]);

  // Fetch status on mount
  const fetchTodayStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/staff-attendance/today-status', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        throw new Error('आजची उपस्थिती स्थिती तपासण्यात अडचण आली.');
      }
      const data = await res.json();
      setTodayDate(data.date || '');
      setDayOfWeek(data.dayOfWeek ?? 0);
      setIsSunday(Boolean(data.isSunday));
      setIsCompletedAlready(Boolean(data.isCompleted));

      if (Array.isArray(data.staff)) {
        setStaffList(
          data.staff.map((s: any) => ({
            userId: s.userId,
            username: s.username,
            name: s.name || s.username,
            mobile: s.mobile || '',
            isMarked: Boolean(s.isMarked),
            status: (s.status as AttendanceStatus) || 'Present',
            inTime: s.inTime || '09:30',
            outTime: s.outTime || '18:30',
            notes: s.notes || '',
          }))
        );
      }
    } catch (err: any) {
      console.error('Error fetching today attendance:', err);
      setError(err?.message || 'माहिती लोड करण्यात त्रुटी आली.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTodayStatus();
  }, []);

  // Update a specific staff member's field
  const handleUpdateStaff = (userId: string, fields: Partial<StaffAttendanceItem>) => {
    setStaffList((prev) =>
      prev.map((item) => (item.userId === userId ? { ...item, ...fields } : item))
    );
  };

  // Quick action: Mark all staff as Present
  const handleMarkAllPresent = () => {
    setStaffList((prev) =>
      prev.map((item) => ({
        ...item,
        status: 'Present',
        inTime: item.inTime || '09:30',
        outTime: item.outTime || '18:30',
      }))
    );
  };

  // Submit and save attendance
  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (staffList.length === 0) {
      onSkipToDashboard();
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        date: todayDate,
        records: staffList.map((s) => ({
          userId: s.userId,
          username: s.name || s.username,
          status: s.status,
          inTime: s.inTime || '09:30',
          outTime: s.outTime || '18:30',
          notes: s.notes || '',
        })),
      };

      const res = await fetch('/api/staff-attendance/daily-batch', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'उपस्थिती सेव्ह करताना त्रुटी आली.');
      }

      // Notify parent to transition to dashboard with success message
      onSuccessSaved();
    } catch (err: any) {
      console.error('Failed to save daily attendance:', err);
      setError(err?.message || 'उपस्थिती सेव्ह होऊ शकली नाही. कृपया पुन्हा प्रयत्न करा.');
      setSaving(false);
    }
  };

  // Format date in Marathi and English
  const dateFormatted = React.useMemo(() => {
    if (!todayDate) return { marathi: '', english: '' };
    const [y, m, d] = todayDate.split('-').map(Number);
    const mName = MARATHI_MONTHS[m - 1] || '';
    const dayName = MARATHI_DAYS[dayOfWeek] || '';
    return {
      marathi: `${d} ${mName} ${y} (${dayName})`,
      english: `${todayDate} (${dayName})`,
    };
  }, [todayDate, dayOfWeek]);

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-slate-200">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-700">आजची उपस्थिती माहिती तपासत आहे...</p>
        <p className="text-xs text-slate-400 mt-1">Please wait while checking today's attendance status.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-2 sm:p-4">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30 text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin First Login of the Day</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-blue-300" />
              <span>दैनिक कर्मचारी उपस्थिती (Daily Staff Attendance)</span>
            </h2>
            <p className="text-xs text-blue-200/90 font-medium">
              तारीख: <strong className="text-white">{dateFormatted.marathi}</strong> • {dateFormatted.english}
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-white/10 backdrop-blur-xs border border-white/20 text-right">
              <div className="text-[10px] text-blue-200 uppercase font-semibold">एकूण सक्रिय कर्मचारी</div>
              <div className="text-lg font-black text-white">{staffList.length} Staff Members</div>
            </div>
            {isCompletedAlready && (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                ✓ आजची नोंद आधीच पूर्ण झाली आहे (Completed)
              </span>
            )}
          </div>
        </div>

        {/* Informative Prompt */}
        <div className="mt-4 pt-3 border-t border-white/10 text-xs text-blue-100/80 flex items-center justify-between flex-wrap gap-2">
          <span>
            {isCompletedAlready
              ? 'टीप: आजची उपस्थिती आधीच सेव्ह झाली आहे. आपण आवश्यक असल्यास दुरुस्ती करून पुन्हा सेव्ह करू शकता किंवा थेट डॅशबोर्डवर जाऊ शकता.'
              : 'कृपया सर्व कर्मचाऱ्यांची आजची उपस्थिती तपासून सेव्ह करा. सेव्ह केल्यावर आपण थेट डॅशबोर्डवर जाल.'}
          </span>
          <button
            type="button"
            onClick={onSkipToDashboard}
            className="text-xs font-semibold text-blue-200 hover:text-white underline inline-flex items-center gap-1"
          >
            <span>डॅशबोर्डवर जा (Go to Dashboard)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Quick Actions Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span>जलद कृती (Quick Actions):</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleMarkAllPresent}
            className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 text-xs font-bold transition-colors inline-flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>सर्व हजर करा (All Present)</span>
          </button>
        </div>
      </div>

      {/* 3. Staff Attendance Entries Form */}
      <form onSubmit={handleSaveAttendance} className="space-y-4">
        <div className="space-y-3">
          {staffList.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
              कोणतेही सक्रिय कर्मचारी (Operators) आढळले नाहीत.
            </div>
          ) : (
            staffList.map((staff, idx) => (
              <div
                key={staff.userId}
                className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Staff Info */}
                <div className="flex items-center gap-3 min-w-[200px]">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 font-bold flex items-center justify-center shrink-0">
                    <UserIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 leading-tight">
                      {staff.name}
                    </h4>
                    <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                      <span>@{staff.username}</span>
                      {staff.mobile && (
                        <span className="flex items-center gap-0.5 text-slate-400">
                          <Phone className="w-3 h-3" />
                          {staff.mobile}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Selection: Present, Absent, Half Day */}
                <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
                  {/* Present Button */}
                  <button
                    type="button"
                    onClick={() => handleUpdateStaff(staff.userId, { status: 'Present' })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      staff.status === 'Present'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200/60'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>हजर (Present)</span>
                  </button>

                  {/* Absent Button */}
                  <button
                    type="button"
                    onClick={() => handleUpdateStaff(staff.userId, { status: 'Absent' })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      staff.status === 'Absent'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200/60'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>गैरहजर (Absent)</span>
                  </button>

                  {/* Half Day Button */}
                  <button
                    type="button"
                    onClick={() => handleUpdateStaff(staff.userId, { status: 'Half Day' })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      staff.status === 'Half Day'
                        ? 'bg-orange-500 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200/60'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>अर्धा दिवस (Half Day)</span>
                  </button>
                </div>

                {/* In / Out Times & Notes */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] font-bold text-slate-500">In:</label>
                    <input
                      type="time"
                      value={staff.inTime}
                      disabled={staff.status === 'Absent'}
                      onChange={(e) => handleUpdateStaff(staff.userId, { inTime: e.target.value })}
                      className="px-2 py-1 text-xs rounded-lg border border-slate-300 bg-white font-mono disabled:opacity-50"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <label className="text-[10px] font-bold text-slate-500">Out:</label>
                    <input
                      type="time"
                      value={staff.outTime}
                      disabled={staff.status === 'Absent'}
                      onChange={(e) => handleUpdateStaff(staff.userId, { outTime: e.target.value })}
                      className="px-2 py-1 text-xs rounded-lg border border-slate-300 bg-white font-mono disabled:opacity-50"
                    />
                  </div>

                  <input
                    type="text"
                    placeholder="शेरा / Note (पर्यायी)"
                    value={staff.notes}
                    onChange={(e) => handleUpdateStaff(staff.userId, { notes: e.target.value })}
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white min-w-[140px] max-w-[200px]"
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* 4. Bottom Sticky / Fixed Action Footer */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">टीप:</span> उपस्थिती नोंद TiDB Cloud डेटाबेसमध्ये कायमस्वरूपी सेव्ह होते आणि ऑपरेटर कॅलेंडर व अहवालात तत्काळ अपडेट होते.
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSkipToDashboard}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
            >
              डॅशबोर्डवर जा (Skip)
            </button>

            <button
              type="submit"
              disabled={saving || staffList.length === 0}
              className="px-5 py-2.5 rounded-xl brand-gradient text-white text-xs font-bold shadow-md hover:opacity-95 disabled:opacity-60 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>सेव्ह करत आहे...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>उपस्थिती सेव्ह करा व डॅशबोर्ड उघडा</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
