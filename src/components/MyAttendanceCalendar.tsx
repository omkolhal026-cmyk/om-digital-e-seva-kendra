import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  CalendarDays,
  Coffee,
  ShieldAlert,
} from 'lucide-react';
import { User, StaffAttendanceRecord, AttendanceStatus } from '../types';

interface MyAttendanceCalendarProps {
  currentUser: User;
}

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_NAMES_MR = [
  'जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून',
  'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर'
];

const DAYS_OF_WEEK = [
  { short: 'Sun', mr: 'रवि' },
  { short: 'Mon', mr: 'सोम' },
  { short: 'Tue', mr: 'मंगळ' },
  { short: 'Wed', mr: 'बुध' },
  { short: 'Thu', mr: 'गुरु' },
  { short: 'Fri', mr: 'शुक्र' },
  { short: 'Sat', mr: 'शनि' },
];

export const MyAttendanceCalendar: React.FC<MyAttendanceCalendarProps> = ({ currentUser }) => {
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth()); // 0-indexed
  const [attendanceRecords, setAttendanceRecords] = useState<StaffAttendanceRecord[]>([]);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Month-Year formatted string: YYYY-MM
  const monthKey = useMemo(() => {
    const m = String(currentMonth + 1).padStart(2, '0');
    return `${currentYear}-${m}`;
  }, [currentYear, currentMonth]);

  // Today formatted string: YYYY-MM-DD
  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  const fetchMonthData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('om_eseva_token') || sessionStorage.getItem('om_eseva_token') || '';
      const headers: Record<string, string> = {
        'x-user-id': currentUser.id || '',
        'x-user-role': currentUser.role || 'operator',
        'x-user-username': currentUser.username || '',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Fetch attendance records only
      const attRes = await fetch(`/api/staff-attendance?month=${monthKey}`, { headers });
      if (!attRes.ok) {
        throw new Error('Failed to fetch attendance data');
      }
      const attData = await attRes.json();
      setAttendanceRecords(Array.isArray(attData) ? attData : []);
    } catch (err: any) {
      console.error('Error fetching staff attendance:', err);
      setError(err?.message || 'माहिती लोड करण्यात अडचण आली.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthData();
  }, [monthKey, currentUser.id]);

  // Navigate months
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleCurrentMonth = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  // Build calendar matrix
  const { calendarDays } = useMemo(() => {
    const days = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDay = new Date(currentYear, currentMonth, 1).getDay(); // 0 is Sunday

    const recordsMap = new Map<string, StaffAttendanceRecord>();
    for (const r of attendanceRecords) {
      recordsMap.set(r.date, r);
    }

    const grid = [];
    // Leading empty cells
    for (let i = 0; i < firstDay; i++) {
      grid.push({ isEmpty: true, dayNumber: 0, dateStr: '', dayOfWeek: 0, status: null, record: null });
    }

    // Days in current month
    for (let day = 1; day <= days; day++) {
      const dayPad = String(day).padStart(2, '0');
      const mPad = String(currentMonth + 1).padStart(2, '0');
      const dateStr = `${currentYear}-${mPad}-${dayPad}`;
      const dayOfWeek = new Date(currentYear, currentMonth, day).getDay();

      const existingRecord = recordsMap.get(dateStr);
      let status: AttendanceStatus | null = existingRecord ? existingRecord.status : null;

      // Default Sunday if no record explicitly overrides
      if (!status && dayOfWeek === 0) {
        status = 'Sunday';
      }

      grid.push({
        isEmpty: false,
        dayNumber: day,
        dateStr,
        dayOfWeek,
        isSunday: dayOfWeek === 0,
        isToday: dateStr === todayStr,
        status,
        record: existingRecord || null,
      });
    }

    return {
      daysInMonth: days,
      firstDayIndex: firstDay,
      calendarDays: grid,
    };
  }, [currentYear, currentMonth, attendanceRecords, todayStr]);

  // Calculate monthly attendance summary
  const summary = useMemo(() => {
    let presentCount = 0;
    let absentCount = 0;
    let halfDayCount = 0;
    let paidLeaveCount = 0;
    let sundayCount = 0;
    let compensatoryOffCount = 0;
    let holidayCount = 0;

    for (const cell of calendarDays) {
      if (cell.isEmpty) continue;
      if (cell.status === 'Present') presentCount++;
      else if (cell.status === 'Absent') absentCount++;
      else if (cell.status === 'Half Day') halfDayCount++;
      else if (cell.status === 'Paid Leave') paidLeaveCount++;
      else if (cell.status === 'Sunday') sundayCount++;
      else if (cell.status === 'Compensatory Off') compensatoryOffCount++;
      else if (cell.status === 'Office Holiday') holidayCount++;
    }

    return {
      present: presentCount,
      absent: absentCount,
      halfDay: halfDayCount,
      paidLeave: paidLeaveCount,
      sunday: sundayCount,
      compensatoryOff: compensatoryOffCount,
      holiday: holidayCount,
    };
  }, [calendarDays]);

  // Total leave (Paid Leave + Half Day + Compensatory Off)
  const totalLeave = summary.paidLeave + summary.halfDay + summary.compensatoryOff;

  // Status visual mapping (Compact dots & badges)
  const getStatusBadge = (status: AttendanceStatus | null, isSunday: boolean) => {
    switch (status) {
      case 'Present':
        return {
          label: 'P',
          name: 'उपस्थित',
          badge: 'bg-emerald-600 text-white',
          cellBg: 'bg-emerald-50/50 hover:bg-emerald-50 text-emerald-950 border-emerald-150',
          dot: 'bg-emerald-500',
        };
      case 'Absent':
        return {
          label: 'A',
          name: 'गैरहजर',
          badge: 'bg-rose-600 text-white',
          cellBg: 'bg-rose-50/60 hover:bg-rose-50 text-rose-950 border-rose-150',
          dot: 'bg-rose-500',
        };
      case 'Half Day':
        return {
          label: 'HD',
          name: 'अर्धा दिवस',
          badge: 'bg-orange-500 text-white',
          cellBg: 'bg-orange-50/60 hover:bg-orange-50 text-orange-950 border-orange-200',
          dot: 'bg-orange-500',
        };
      case 'Sunday':
        return {
          label: 'SUN',
          name: 'रविवार',
          badge: 'bg-slate-400 text-white',
          cellBg: 'bg-slate-50/70 hover:bg-slate-100 text-slate-700 border-slate-150',
          dot: 'bg-slate-400',
        };
      case 'Paid Leave':
        return {
          label: 'PL',
          name: 'सशुल्क रजा',
          badge: 'bg-indigo-600 text-white',
          cellBg: 'bg-indigo-50/60 hover:bg-indigo-50 text-indigo-950 border-indigo-150',
          dot: 'bg-indigo-600',
        };
      case 'Compensatory Off':
        return {
          label: 'CO',
          name: 'बदली सुट्टी',
          badge: 'bg-teal-600 text-white',
          cellBg: 'bg-teal-50/60 hover:bg-teal-50 text-teal-950 border-teal-150',
          dot: 'bg-teal-500',
        };
      case 'Office Holiday':
        return {
          label: 'H',
          name: 'सुट्टी',
          badge: 'bg-purple-600 text-white',
          cellBg: 'bg-purple-50/60 hover:bg-purple-50 text-purple-950 border-purple-150',
          dot: 'bg-purple-500',
        };
      default:
        return {
          label: '-',
          name: 'नोंद नाही',
          badge: 'bg-slate-200 text-slate-500',
          cellBg: isSunday ? 'bg-slate-50/80 border-slate-150' : 'bg-white border-slate-100',
          dot: 'bg-slate-300',
        };
    }
  };

  const isCurrentMonthView = currentYear === today.getFullYear() && currentMonth === today.getMonth();

  // History entries sorted chronologically
  const attendanceHistoryList = useMemo(() => {
    return calendarDays
      .filter((c) => !c.isEmpty && c.status)
      .map((c) => ({
        dateStr: c.dateStr,
        dayNumber: c.dayNumber,
        dayOfWeek: c.dayOfWeek,
        status: c.status!,
        inTime: c.record?.inTime || '—',
        outTime: c.record?.outTime || '—',
        notes: c.record?.notes || '',
        markedBy: c.record?.markedBy || '',
      }));
  }, [calendarDays]);

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
      {/* ============================================================== */}
      {/* 1. COMPACT HEADER: My Attendance + Month Selector             */}
      {/* ============================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 leading-tight">
              My Attendance
            </h3>
            <p className="text-xs text-slate-500">
              {currentUser.name || currentUser.username} • {MONTH_NAMES_MR[currentMonth]} {currentYear}
            </p>
          </div>
        </div>

        {/* Month Selector Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {!isCurrentMonthView && (
            <button
              onClick={handleCurrentMonth}
              className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors cursor-pointer"
            >
              चालू महिना
            </button>
          )}

          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-0.5 shadow-2xs">
            <button
              onClick={handlePrevMonth}
              title="मागील महिना (Previous Month)"
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-0.5 text-xs font-bold text-slate-800 min-w-[130px] text-center select-none">
              {MONTH_NAMES_MR[currentMonth]} {currentYear}
              <span className="text-[10px] text-slate-400 font-normal block leading-tight">
                {MONTH_NAMES_EN[currentMonth]}
              </span>
            </div>
            <button
              onClick={handleNextMonth}
              title="पुढील महिना (Next Month)"
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. FOUR SUMMARY CARDS (ATTENDANCE SUMMARY)                     */}
      {/*    Present, Absent, Half Day, Weekly Off/Holiday               */}
      {/* ============================================================== */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Present Card - Subtle Green */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-emerald-50/60 border border-emerald-200/90 flex flex-col justify-between min-h-[96px] sm:min-h-[102px] shadow-2xs">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs font-bold text-emerald-900 truncate">
                हजर (Present)
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-emerald-700 leading-none">
                {summary.present}
              </span>
              <span className="text-xs font-semibold text-emerald-700">
                दिवस
              </span>
            </div>
          </div>

          {/* 2. Absent Card - Subtle Red */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-rose-50/60 border border-rose-200/90 flex flex-col justify-between min-h-[96px] sm:min-h-[102px] shadow-2xs">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs font-bold text-rose-900 truncate">
                गैरहजर (Absent)
              </span>
              <div className="p-1.5 rounded-lg bg-rose-100 text-rose-700 shrink-0">
                <XCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-rose-700 leading-none">
                {summary.absent}
              </span>
              <span className="text-xs font-semibold text-rose-700">
                दिवस
              </span>
            </div>
          </div>

          {/* 3. Half Day Card - Subtle Orange */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-orange-50/60 border border-orange-200/90 flex flex-col justify-between min-h-[96px] sm:min-h-[102px] shadow-2xs">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs font-bold text-orange-950 truncate">
                अर्धा दिवस (Half Day)
              </span>
              <div className="p-1.5 rounded-lg bg-orange-100 text-orange-700 shrink-0">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-orange-700 leading-none">
                {summary.halfDay}
              </span>
              <span className="text-xs font-semibold text-orange-700">
                दिवस
              </span>
            </div>
          </div>

          {/* 4. Weekly Off / Holiday Card - Subtle Blue */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-blue-50/60 border border-blue-200/90 flex flex-col justify-between min-h-[96px] sm:min-h-[102px] shadow-2xs">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs font-bold text-blue-950 truncate">
                सुट्टी व ऑफ (Holiday/Off)
              </span>
              <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 shrink-0">
                <Coffee className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-blue-800 leading-none">
                {summary.sunday + summary.holiday + summary.compensatoryOff}
              </span>
              <span className="text-xs font-semibold text-blue-700">
                दिवस
              </span>
            </div>
          </div>
        </div>

        {/* Compact Summary Breakdown Outside Cards */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 px-1">
          <span className="font-semibold text-slate-600">सुट्टी तपशील:</span>
          <span>{summary.sunday} रविवार (Sundays)</span>
          <span>•</span>
          <span>{summary.holiday} कार्यालयीन सुट्टी (Office Holidays)</span>
          {summary.compensatoryOff > 0 && (
            <>
              <span>•</span>
              <span>{summary.compensatoryOff} बदली सुट्टी (Comp Off)</span>
            </>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. ONE CLEAR, EASY-TO-READ MONTHLY CALENDAR                    */}
      {/* ============================================================== */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
        {/* Days of week header */}
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200 text-center">
          {DAYS_OF_WEEK.map((d, idx) => (
            <div
              key={d.short}
              className={`py-1.5 text-xs font-bold ${
                idx === 0 ? 'text-rose-600 bg-rose-50/50' : 'text-slate-700'
              }`}
            >
              <span>{d.short}</span>
              <span className="text-[10px] font-normal text-slate-400 block leading-none mt-0.5">
                {d.mr}
              </span>
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-px bg-slate-200">
          {calendarDays.map((cell, idx) => {
            if (cell.isEmpty) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="bg-slate-50/40 min-h-[52px] sm:min-h-[58px] p-1"
                />
              );
            }

            const badge = getStatusBadge(cell.status, cell.isSunday);

            return (
              <div
                key={cell.dateStr}
                title={`${cell.dateStr}: ${badge.name}${cell.record?.notes ? ` - ${cell.record.notes}` : ''}`}
                className={`min-h-[52px] sm:min-h-[58px] p-1 sm:p-1.5 flex flex-col justify-between transition-colors ${badge.cellBg} ${
                  cell.isToday ? 'ring-2 ring-blue-600 ring-inset z-10' : ''
                }`}
              >
                {/* Cell Header: Date Number + Small Badge */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold ${
                      cell.isToday
                        ? 'text-blue-700 bg-blue-100 px-1 rounded-xs'
                        : cell.isSunday
                        ? 'text-rose-600'
                        : 'text-slate-800'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>

                  {cell.status && (
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded-xs font-bold tracking-tight ${badge.badge}`}
                    >
                      {badge.label}
                    </span>
                  )}
                </div>

                {/* Subtext: In Time or Status Label */}
                <div className="text-[9px] text-slate-500 font-medium truncate leading-tight">
                  {cell.record?.inTime ? (
                    <span className="text-slate-700 font-semibold">{cell.record.inTime}</span>
                  ) : (
                    <span className="opacity-70">{badge.name}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Compact Inline Legend */}
        <div className="px-3 py-2 bg-slate-50/90 border-t border-slate-200 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-700">सूची (Legend):</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <strong className="text-slate-800">P</strong> उपस्थित
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <strong className="text-slate-800">A</strong> गैरहजर
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            <strong className="text-slate-800">HD</strong> अर्धा दिवस
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <strong className="text-slate-800">SUN</strong> रविवार
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-teal-500" />
            <strong className="text-slate-800">CO</strong> बदली सुट्टी
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            <strong className="text-slate-800">H</strong> सुट्टी
          </span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. COLLAPSIBLE ATTENDANCE HISTORY SECTION                       */}
      {/* ============================================================== */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
        <button
          type="button"
          onClick={() => setIsHistoryExpanded((prev) => !prev)}
          className="w-full px-4 py-3 bg-slate-50/80 hover:bg-slate-100 flex items-center justify-between text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-slate-200 text-slate-700">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <span>Attendance History (मासिक उपस्थिती नोंदवही)</span>
                <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-slate-200 text-slate-700">
                  {attendanceHistoryList.length} दिवस
                </span>
              </div>
              <div className="text-[10px] text-slate-500">
                दैनिक वेळ व स्थिती नोंदी
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <span>{isHistoryExpanded ? 'नोंदी लपवा' : 'नोंदी पहा'}</span>
            {isHistoryExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </div>
        </button>

        {isHistoryExpanded && (
          <div className="p-4 border-t border-slate-200 space-y-2 bg-white">
            {attendanceHistoryList.length > 0 ? (
              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[500px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[10px]">
                    <tr>
                      <th className="py-1.5 px-3">तारीख</th>
                      <th className="py-1.5 px-3">वार</th>
                      <th className="py-1.5 px-3">स्थिती</th>
                      <th className="py-1.5 px-3">वेळ आत (In)</th>
                      <th className="py-1.5 px-3">वेळ बाहेर (Out)</th>
                      <th className="py-1.5 px-3">शेरा / नोंद</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attendanceHistoryList.map((entry) => {
                      const badge = getStatusBadge(entry.status, entry.dayOfWeek === 0);
                      const dayName = DAYS_OF_WEEK[entry.dayOfWeek]?.mr || '';

                      return (
                        <tr key={entry.dateStr} className="hover:bg-slate-50/70">
                          <td className="py-1.5 px-3 font-medium text-slate-800">
                            {entry.dateStr}
                          </td>
                          <td className="py-1.5 px-3 text-slate-500">{dayName}</td>
                          <td className="py-1.5 px-3">
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded-xs font-bold uppercase inline-flex items-center gap-1 ${badge.badge}`}
                            >
                              <span>{badge.label}</span>
                              <span className="opacity-90">{badge.name}</span>
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-slate-700 font-mono text-[11px]">
                            {entry.inTime}
                          </td>
                          <td className="py-1.5 px-3 text-slate-700 font-mono text-[11px]">
                            {entry.outTime}
                          </td>
                          <td className="py-1.5 px-3 text-slate-500 text-[11px] truncate max-w-[180px]">
                            {entry.notes || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-slate-400">
                या महिन्यासाठी कोणतीही नोंद आढळली नाही.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Permissions Disclaimer */}
      <div className="flex items-center gap-2 text-[10px] text-slate-500 bg-slate-50/80 p-2.5 rounded-lg border border-slate-200">
        <ShieldAlert className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>
          उपस्थिती नोंद Admin द्वारे व्यवस्थापित केली जाते. Staff ला केवळ स्वतःची उपस्थिती पाहण्याची परवानगी आहे.
        </span>
      </div>
    </div>
  );
};
