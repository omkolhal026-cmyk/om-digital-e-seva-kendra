import React, { useState } from 'react';
import { ScanText, X, MessageSquare, Send, Cloud, Sparkles, CheckCircle2, Upload, FileUp } from 'lucide-react';

interface FutureFeaturesModalProps {
  onClose: () => void;
  onApplyOcrExtracted?: (extracted: any) => void;
}

export const FutureFeaturesModal: React.FC<FutureFeaturesModalProps> = ({
  onClose,
  onApplyOcrExtracted,
}) => {
  const [activeTab, setActiveTab] = useState<'ocr' | 'whatsapp' | 'cloud'>('ocr');
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);

  const [waMobile, setWaMobile] = useState('9822114455');
  const [waMessage, setWaMessage] = useState(
    'Greetings from OM DIGITAL E-SEVA KENDRA! Your MBOCWW Worker Registration renewal (MH-12-2024-001001) has been approved.'
  );

  const handleRunOcr = async () => {
    setOcrScanning(true);
    setOcrResult(null);

    try {
      const res = await fetch('/api/ocr-parse', { method: 'POST' });
      const data = await res.json();

      setTimeout(() => {
        setOcrScanning(false);
        setOcrResult(data.extracted);
      }, 1000);
    } catch (err) {
      setOcrScanning(false);
      alert('OCR parsing failed');
    }
  };

  const handleSendWhatsApp = () => {
    const encoded = encodeURIComponent(waMessage);
    const link = `https://wa.me/91${waMobile}?text=${encoded}`;
    window.open(link, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200/90 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative text-slate-900">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-blue-700" />
          <h3 className="text-lg font-bold text-slate-900">Smart E-Seva Utilities & Integrations</h3>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200/90 mb-5">
          <button
            onClick={() => setActiveTab('ocr')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'ocr' ? 'brand-gradient text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ScanText className="w-3.5 h-3.5" />
            <span>AI OCR PDF Parser</span>
          </button>

          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'whatsapp' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>WhatsApp / SMS</span>
          </button>

          <button
            onClick={() => setActiveTab('cloud')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'cloud' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Cloud Sync</span>
          </button>
        </div>

        {/* OCR Tab */}
        {activeTab === 'ocr' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 font-medium">
              Upload MBOCWW application form or Aadhaar PDF. The AI OCR engine extracts worker details, DOB, and account information automatically.
            </p>

            <div
              onClick={handleRunOcr}
              className="p-8 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-300 hover:border-blue-600 cursor-pointer text-center space-y-2 transition-all"
            >
              <FileUp className="w-8 h-8 text-blue-700 mx-auto animate-bounce" />
              <div className="text-xs font-bold text-slate-900">Click to simulate scanning sample PDF / Document</div>
              <div className="text-[10px] text-slate-500 font-medium">Supports PDF, PNG, JPG scans of MBOCWW forms</div>
            </div>

            {ocrScanning && (
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs text-center font-bold animate-pulse">
                Analyzing MBOCWW Document layout & extracting field values...
              </div>
            )}

            {ocrResult && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs font-medium">
                <div className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>OCR Extraction Complete (96% Confidence)</span>
                </div>
                <div><span className="text-slate-500">Worker Name:</span> {ocrResult.workerName}</div>
                <div><span className="text-slate-500">Father Name:</span> {ocrResult.fatherName}</div>
                <div><span className="text-slate-500">Aadhaar No:</span> {ocrResult.aadhaarNumber}</div>
                <div><span className="text-slate-500">MH Reg No:</span> {ocrResult.mhNumber}</div>
                <div><span className="text-slate-500">Bank Account:</span> {ocrResult.accountNumber} ({ocrResult.bankName})</div>
              </div>
            )}
          </div>
        )}

        {/* WhatsApp Tab */}
        {activeTab === 'whatsapp' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 font-medium">
              Send instant receipt notifications and status updates directly to worker WhatsApp numbers.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Worker Mobile Number
              </label>
              <input
                type="text"
                value={waMobile}
                onChange={(e) => setWaMobile(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:bg-white focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                WhatsApp Message Text
              </label>
              <textarea
                value={waMessage}
                onChange={(e) => setWaMessage(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
              />
            </div>

            <button
              onClick={handleSendWhatsApp}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs"
            >
              <Send className="w-4 h-4" />
              <span>Send WhatsApp Receipt Now</span>
            </button>
          </div>
        )}

        {/* Cloud Sync Tab */}
        {activeTab === 'cloud' && (
          <div className="space-y-4 text-center py-4">
            <Cloud className="w-12 h-12 text-blue-700 mx-auto" />
            <h4 className="text-sm font-bold text-slate-900">Automated Cloud & Local DB Synchronization</h4>
            <p className="text-xs text-slate-500 font-medium">
              All worker registrations, renewals, and claims are persisted safely on Cloud Run container memory & JSON files.
            </p>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              ✓ Database Status: Connected & Synchronized
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
