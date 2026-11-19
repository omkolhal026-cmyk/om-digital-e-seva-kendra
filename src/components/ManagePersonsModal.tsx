import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Search,
  UserPlus,
  Edit2,
  Trash2,
  AlertTriangle,
  GitMerge,
  Archive,
  RefreshCw,
  CheckCircle,
  Users,
  Database,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { PersonSourceRecord, PersonUsageDetails } from '../types';

interface ManagePersonsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPersonUpdated?: (updatedName?: string) => void;
  currentUser?: { name?: string; role?: string; username?: string };
}

export const ManagePersonsModal: React.FC<ManagePersonsModalProps> = ({
  isOpen,
  onClose,
  onPersonUpdated,
  currentUser,
}) => {
  const [persons, setPersons] = useState<PersonSourceRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Quick Add State
  const [newName, setNewName] = useState<string>('');
  const [isAdding, setIsAdding] = useState<boolean>(false);

  // Edit State
  const [editingPerson, setEditingPerson] = useState<PersonSourceRecord | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Delete / In-Use Modal State
  const [deleteTarget, setDeleteTarget] = useState<PersonSourceRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [mergeTargetName, setMergeTargetName] = useState<string>('');
  const [showInUseDialog, setShowInUseDialog] = useState<boolean>(false);

  // Duplicate Resolution Mode
  const [isDuplicateToolOpen, setIsDuplicateToolOpen] = useState<boolean>(false);
  const [selectedDuplicates, setSelectedDuplicates] = useState<string[]>([]);
  const [duplicateTargetPerson, setDuplicateTargetPerson] = useState<string>('');
  const [isMerging, setIsMerging] = useState<boolean>(false);

  const getAuthHeader = () => {
    const token =
      localStorage.getItem('om_eseva_token') ||
      sessionStorage.getItem('om_eseva_token') ||
      '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchPersons = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/persons?includeInactive=true', {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
      });
      if (!res.ok) {
        throw new Error('व्यक्तींची यादी लोड करताना त्रुटी आली');
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setPersons(data);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'नेटवर्क त्रुटी आली.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPersons();
      setSearchTerm('');
      setErrorMessage(null);
      setSuccessMessage(null);
      setEditingPerson(null);
      setDeleteTarget(null);
      setShowInUseDialog(false);
    }
  }, [isOpen]);

  const notifyChange = (updatedName?: string) => {
    window.dispatchEvent(new CustomEvent('from-sources-updated', { detail: { name: updatedName } }));
    if (onPersonUpdated) {
      onPersonUpdated(updatedName);
    }
  };

  // Filtered persons based on search
  const filteredPersons = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return persons;
    return persons.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.createdBy && p.createdBy.toLowerCase().includes(q))
    );
  }, [persons, searchTerm]);

  // Identify Potential Duplicates (case-insensitive or whitespace differences)
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, PersonSourceRecord[]>();
    for (const p of persons) {
      const normalized = p.name.trim().toLowerCase().replace(/\s+/g, '');
      const list = map.get(normalized) || [];
      list.push(p);
      map.set(normalized, list);
    }
    const dupes: PersonSourceRecord[][] = [];
    map.forEach((list) => {
      if (list.length > 1) {
        dupes.push(list);
      }
    });
    return dupes;
  }, [persons]);

  // Handle Add New Person
  const handleAddPerson = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newName.trim().replace(/\s+/g, ' ');
    if (!clean) {
      setErrorMessage('कृपया व्यक्तीचे नाव प्रविष्ट करा.');
      return;
    }

    setIsAdding(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch('/api/persons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ name: clean }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'व्यक्ती जोडण्यात अडचण आली.');
      }

      setNewName('');
      setSuccessMessage(`"${clean}" व्यक्ती यशस्वीरित्या जोडली गेली! सर्व फॉर्म्समध्ये उपलब्ध.`);
      await fetchPersons();
      notifyChange(clean);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  // Handle Edit Person
  const startEditing = (p: PersonSourceRecord) => {
    setEditingPerson(p);
    setEditValue(p.name);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSaveEdit = async () => {
    if (!editingPerson) return;
    const clean = editValue.trim().replace(/\s+/g, ' ');
    if (!clean) {
      setErrorMessage('व्यक्तीचे नाव रिकामे असू शकत नाही.');
      return;
    }

    if (clean === editingPerson.name) {
      setEditingPerson(null);
      return;
    }

    setIsEditing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/persons/${editingPerson.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          id: editingPerson.id,
          oldName: editingPerson.name,
          newName: clean,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'नाव अद्ययावत करताना त्रुटी आली.');
      }

      setSuccessMessage(
        `"${editingPerson.name}" चे नाव बदलून "${clean}" केले. सर्व ${data.affectedRecords || 0} जुन्या नोंदी आपोआप अद्ययावत केल्या.`
      );
      setEditingPerson(null);
      await fetchPersons();
      notifyChange(clean);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsEditing(false);
    }
  };

  // Handle Initial Delete Request
  const initiateDelete = (p: PersonSourceRecord) => {
    setDeleteTarget(p);
    setMergeTargetName('');
    setErrorMessage(null);
    setSuccessMessage(null);

    if (p.usageCount > 0) {
      setShowInUseDialog(true);
    } else {
      setShowInUseDialog(false);
    }
  };

  // Execute Safe Delete (for 0-usage persons)
  const confirmDirectDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/persons/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          name: deleteTarget.name,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'व्यक्ती हटवताना त्रुटी आली.');
      }

      if (data.inUse) {
        setShowInUseDialog(true);
        return;
      }

      setSuccessMessage(`"${deleteTarget.name}" व्यक्ती यशस्वीरित्या हटवली गेली.`);
      setDeleteTarget(null);
      await fetchPersons();
      notifyChange();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Execute Merge when in use
  const handleExecuteMerge = async () => {
    if (!deleteTarget || !mergeTargetName) {
      setErrorMessage('कृपया विलीन करण्यासाठी लक्ष्य व्यक्ती निवडा.');
      return;
    }

    setIsDeleting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/persons/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          name: deleteTarget.name,
          mergeInto: mergeTargetName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'विलीन करताना त्रुटी आली.');
      }

      setSuccessMessage(data.message || `यशस्वीरित्या विलीन केले.`);
      setDeleteTarget(null);
      setShowInUseDialog(false);
      await fetchPersons();
      notifyChange(mergeTargetName);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Execute Archive when in use
  const handleExecuteArchive = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/persons/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          name: deleteTarget.name,
          archiveOnly: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'संग्रहित करताना त्रुटी आली.');
      }

      setSuccessMessage(`"${deleteTarget.name}" व्यक्ती सुरक्षितपणे संग्रहित (Archived) करण्यात आली आहे.`);
      setDeleteTarget(null);
      setShowInUseDialog(false);
      await fetchPersons();
      notifyChange();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Multi-Duplicate Resolution Wizard
  const handleRunDuplicateMerge = async () => {
    if (selectedDuplicates.length === 0 || !duplicateTargetPerson) {
      setErrorMessage('कृपया डुप्लिकेट व्यक्ती आणि मुख्य लक्ष्य व्यक्ती निवडा.');
      return;
    }

    setIsMerging(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/persons/merge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          sources: selectedDuplicates,
          target: duplicateTargetPerson,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'डुप्लिकेट विलीन करताना त्रुटी आली.');
      }

      setSuccessMessage(data.message || 'डुप्लिकेट यशस्वीरित्या विलीन केले.');
      setSelectedDuplicates([]);
      setDuplicateTargetPerson('');
      setIsDuplicateToolOpen(false);
      await fetchPersons();
      notifyChange(duplicateTargetPerson);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsMerging(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <Users className="w-5 h-5 text-blue-100" />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span>माध्यम / व्यक्ती व्यवस्थापन</span>
                <span className="text-xs bg-white/20 text-blue-100 px-2 py-0.5 rounded-full font-semibold">
                  Global From System
                </span>
              </h2>
              <p className="text-xs text-blue-100">
                येथील सर्व बदल नोंदणी, नूतनीकरण, क्लेम व सर्व फॉर्म्समध्ये त्वरित लागू होतात.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="बंद करा (Close)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-500 hover:text-rose-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-500 hover:text-emerald-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Top Controls: Add Person & Search */}
        <div className="p-6 border-b border-slate-100 space-y-4 bg-slate-50/50">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Quick Add Form */}
            <div className="md:col-span-7 flex items-center gap-2">
              <div className="relative flex-1">
                <UserPlus className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleAddPerson();
                    }
                  }}
                  placeholder="नवीन व्यक्तीचे नाव टाका (Add New Person Name)..."
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <button
                type="button"
                onClick={(e) => handleAddPerson(e)}
                disabled={isAdding || !newName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {isAdding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                <span>+ जोडा (Add)</span>
              </button>
            </div>

            {/* Search Box */}
            <div className="md:col-span-5 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="नाव शोधा (Search Saved Persons)..."
                className="w-full pl-9 pr-8 py-2 text-xs font-medium bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Duplicate Detection Alert / Button */}
          {duplicateGroups.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-amber-900 font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  सापडले: <strong>{duplicateGroups.length}</strong> संभाव्य डुप्लिकेट व्यक्ती आढळल्या (समान किंवा जवळचे नाव).
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsDuplicateToolOpen((prev) => !prev)}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <GitMerge className="w-3 h-3" />
                <span>{isDuplicateToolOpen ? 'साधन लपवा' : 'डुप्लिकेट एकत्र करा (Merge)'}</span>
              </button>
            </div>
          )}

          {/* Duplicate Resolution Drawer */}
          {isDuplicateToolOpen && duplicateGroups.length > 0 && (
            <div className="bg-white border border-amber-300 rounded-xl p-4 space-y-3 shadow-inner">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <GitMerge className="w-4 h-4 text-amber-600" />
                <span>संभाव्य डुप्लिकेट विलीन करा (Safe Duplicate Merge Tool)</span>
              </h4>
              <p className="text-[11px] text-slate-600">
                खालीलपैकी डुप्लिकेट असलेले नाव निवडा आणि ते कोणत्या एका मुख्य नावामध्ये विलीन करायचे आहे ते ठरवा. मागील सर्व ऐतिहासिक नोंदी सुरक्षितपणे त्या मुख्य नावाकडे वर्ग केल्या जातील.
              </p>

              <div className="space-y-2 max-h-40 overflow-y-auto divide-y divide-slate-100 pr-1">
                {duplicateGroups.map((group, idx) => (
                  <div key={idx} className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-700">गट {idx + 1}:</span>
                      {group.map((p) => (
                        <span
                          key={p.id}
                          className="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[11px] font-bold text-slate-800"
                        >
                          "{p.name}" ({p.usageCount} नोंदी)
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDuplicates(group.slice(1).map((p) => p.name));
                        setDuplicateTargetPerson(group[0].name);
                      }}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                    >
                      या गटासाठी विलीन सेटअप करा →
                    </button>
                  </div>
                ))}
              </div>

              {selectedDuplicates.length > 0 && (
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2 mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-900">
                      काढून टाकण्यात येणारे डुप्लिकेट: {selectedDuplicates.join(', ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-700 shrink-0">राखून ठेवायचे मुख्य नाव:</span>
                    <select
                      value={duplicateTargetPerson}
                      onChange={(e) => setDuplicateTargetPerson(e.target.value)}
                      className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold text-slate-900 flex-1"
                    >
                      <option value="">मुख्य व्यक्ती निवडा...</option>
                      {persons.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={isMerging || !duplicateTargetPerson}
                      onClick={handleRunDuplicateMerge}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded text-xs transition-colors cursor-pointer"
                    >
                      {isMerging ? 'विलीन होत आहे...' : 'विलीन करा (Merge)'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Persons Table List */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              नोंदवलेली व्यक्तींची यादी ({filteredPersons.length})
            </span>
            <button
              type="button"
              onClick={fetchPersons}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>ताजे करा (Refresh)</span>
            </button>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
              <p className="text-xs font-medium">माहिती लोड होत आहे...</p>
            </div>
          ) : filteredPersons.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-1 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Users className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-bold text-slate-600">कोणतीही व्यक्ती आढळली नाही.</p>
              <p className="text-[11px]">वरील "+ जोडा" फॉर्म वापरून नवीन व्यक्ती जोडा.</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-100/70 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <div className="col-span-5">व्यक्तीचे नाव (Person Name)</div>
                <div className="col-span-4">नोंदी संदर्भ (Usage Across System)</div>
                <div className="col-span-3 text-right">कृती (Actions)</div>
              </div>

              {filteredPersons.map((p) => {
                const isUnderEdit = editingPerson?.id === p.id;
                const inUse = p.usageCount > 0;

                return (
                  <div
                    key={p.id}
                    className={`grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-xs transition-colors ${
                      !p.isActive ? 'bg-slate-50/70 opacity-60' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Name Column */}
                    <div className="col-span-5">
                      {isUnderEdit ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit();
                              if (e.key === 'Escape') setEditingPerson(null);
                            }}
                            autoFocus
                            className="w-full px-2 py-1 text-xs font-bold border border-blue-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white text-slate-900"
                          />
                          <button
                            type="button"
                            disabled={isEditing}
                            onClick={handleSaveEdit}
                            className="px-2 py-1 bg-blue-600 text-white rounded font-bold text-[11px] hover:bg-blue-700 cursor-pointer"
                          >
                            साठवा
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPerson(null)}
                            className="px-2 py-1 bg-slate-200 text-slate-700 rounded font-bold text-[11px] hover:bg-slate-300 cursor-pointer"
                          >
                            रद्द
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-sm">{p.name}</span>
                          {!p.isActive && (
                            <span className="text-[10px] bg-slate-200 text-slate-600 font-bold px-1.5 py-0.5 rounded">
                              संग्रहित (Archived)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Usage Breakdown Column */}
                    <div className="col-span-4 flex items-center gap-2">
                      {inUse ? (
                        <div className="group relative cursor-pointer">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <Database className="w-3 h-3 text-blue-600" />
                            <span>{p.usageCount} नोंदींमध्ये वापर</span>
                          </span>

                          {/* Hover Tooltip Breakdown */}
                          <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block z-30 bg-slate-900 text-white p-2 rounded-lg text-[10px] shadow-xl whitespace-nowrap space-y-0.5 pointer-events-none">
                            <p className="font-bold text-blue-300 border-b border-slate-700 pb-0.5 mb-1">
                              तपशीलवार नोंदी:
                            </p>
                            {p.usageDetails?.registrations > 0 && (
                              <div>नोंदणी (Registration): {p.usageDetails.registrations}</div>
                            )}
                            {p.usageDetails?.renewals > 0 && (
                              <div>नूतनीकरण (Renewal): {p.usageDetails.renewals}</div>
                            )}
                            {p.usageDetails?.claims > 0 && (
                              <div>दावा (Claim): {p.usageDetails.claims}</div>
                            )}
                            {p.usageDetails?.oldClaims > 0 && (
                              <div>जुना दावा (Old Claim): {p.usageDetails.oldClaims}</div>
                            )}
                            {p.usageDetails?.materials > 0 && (
                              <div>साहित्य वाटप: {p.usageDetails.materials}</div>
                            )}
                            {p.usageDetails?.whatsapp > 0 && (
                              <div>WhatsApp गट: {p.usageDetails.whatsapp}</div>
                            )}
                            {p.usageDetails?.claimPayments > 0 && (
                              <div>पेमेंट लिस्ट: {p.usageDetails.claimPayments}</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500">
                          वापरात नाही (Unused)
                        </span>
                      )}
                    </div>

                    {/* Action Buttons Column */}
                    <div className="col-span-3 flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEditing(p)}
                        className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="नाव दुरुस्त करा (Edit Person Name)"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => initiateDelete(p)}
                        className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="हटवा किंवा विलीन करा (Delete / Merge Person)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              नाव बदलल्यास अथवा विलीन केल्यास ऐतिहासिक नोंदींचा डेटा जसाच्या तसा सुरक्षित राहतो.
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold cursor-pointer transition-colors"
          >
            पूर्ण झाले (Done)
          </button>
        </div>
      </div>

      {/* Delete / In-Use Safe Resolution Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4 animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden space-y-4 p-6">
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-xl shrink-0 ${
                  deleteTarget.usageCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                }`}
              >
                {deleteTarget.usageCount > 0 ? <AlertTriangle className="w-6 h-6" /> : <Trash2 className="w-6 h-6" />}
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  {deleteTarget.usageCount > 0
                    ? `"${deleteTarget.name}" व्यक्ती वापरात आहे`
                    : `"${deleteTarget.name}" व्यक्ती हटवायची आहे का?`}
                </h3>
                <p className="text-xs text-slate-600">
                  {deleteTarget.usageCount > 0
                    ? `ही व्यक्ती सध्या प्रणालीतील एकूण ${deleteTarget.usageCount} नोंदींमध्ये वापरलेली आहे. ऐतिहासिक नोंदी सुरक्षित राहण्यासाठी ही थेट हटवता येत नाही.`
                    : `ही व्यक्ती कोणत्याही नोंदींमध्ये वापरलेली नाही. ही कायमची हटवली जाऊ शकते.`}
                </p>
              </div>
            </div>

            {/* In-Use Safe Options */}
            {deleteTarget.usageCount > 0 ? (
              <div className="space-y-3 pt-2">
                {/* Option 1: Merge Duplicates */}
                <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
                  <label className="block text-xs font-bold text-blue-950 flex items-center gap-1.5">
                    <GitMerge className="w-4 h-4 text-blue-600" />
                    <span>पर्याय १: दुसऱ्या व्यक्तीमध्ये विलीन करा (Recommended Safe Merge)</span>
                  </label>
                  <p className="text-[11px] text-slate-600">
                    "{deleteTarget.name}" च्या सर्व {deleteTarget.usageCount} नोंदी खाली निवडलेल्या मुख्य व्यक्तीकडे वर्ग केल्या जातील.
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      value={mergeTargetName}
                      onChange={(e) => setMergeTargetName(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800"
                    >
                      <option value="">मुख्य लक्ष्य व्यक्ती निवडा (Select Target Person)...</option>
                      {persons
                        .filter((p) => p.name.toLowerCase() !== deleteTarget.name.toLowerCase())
                        .map((p) => (
                          <option key={p.id} value={p.name}>
                            {p.name} ({p.usageCount} नोंदी)
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={isDeleting || !mergeTargetName}
                      onClick={handleExecuteMerge}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer transition-colors"
                    >
                      विलीन करा
                    </button>
                  </div>
                </div>

                {/* Option 2: Archive */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Archive className="w-4 h-4 text-slate-600" />
                    <span>पर्याय २: संग्रहित करा (Archive / Hide from Dropdowns)</span>
                  </label>
                  <p className="text-[11px] text-slate-600">
                    मागील नोंदी सुरक्षित राहतील; परंतु भविष्यातील नवीन फॉर्म्समध्ये हे नाव ड्रॉपडाउन पर्यायात दिसणार नाही.
                  </p>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={handleExecuteArchive}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
                  >
                    संग्रहित करा (Archive)
                  </button>
                </div>
              </div>
            ) : null}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                रद्द करा (Cancel)
              </button>

              {deleteTarget.usageCount === 0 && (
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={confirmDirectDelete}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>होय, हटवा (Delete Permanently)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
