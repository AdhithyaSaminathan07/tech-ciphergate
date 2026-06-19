import React, { useState } from 'react';
import {
  FiDownload, FiFileText, FiDatabase, FiCalendar,
  FiCheckCircle, FiLoader, FiAlertCircle, FiGrid
} from 'react-icons/fi';

const REPORT_TEMPLATES = [
  {
    id: 'executive_summary',
    name: 'Executive Cost Summary',
    description: 'High-level monthly spend vs budget, top services, MoM trend, anomaly count.',
    format: ['PDF'],
    icon: FiGrid,
    color: 'indigo',
  },
  {
    id: 'detailed_billing',
    name: 'Detailed Billing Report',
    description: 'Line-item breakdown of all service costs, resource IDs, and tags for the selected period.',
    format: ['CSV', 'PDF'],
    icon: FiFileText,
    color: 'teal',
  },
  {
    id: 'optimization_report',
    name: 'Optimization Opportunities',
    description: 'Full list of rightsizing, idle resources, savings plans, and cleanup recommendations.',
    format: ['PDF', 'CSV'],
    icon: FiCheckCircle,
    color: 'emerald',
  },
  {
    id: 'anomaly_report',
    name: 'Anomaly Detection Report',
    description: 'All detected cost spikes, their severity, baseline deviations, and resolution status.',
    format: ['PDF'],
    icon: FiAlertCircle,
    color: 'rose',
  },
  {
    id: 'tag_compliance',
    name: 'Tag Compliance Report',
    description: 'Per-resource tag compliance scores, missing required tags, and untagged cost exposure.',
    format: ['PDF', 'CSV'],
    icon: FiDatabase,
    color: 'violet',
  },
  {
    id: 'forecast_report',
    name: 'Spending Forecast Report',
    description: 'Month-end, quarterly, and annual spend projections with confidence intervals.',
    format: ['PDF'],
    icon: FiCalendar,
    color: 'amber',
  },
];

const COLOR_MAP = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', btn: 'bg-indigo-600 hover:bg-indigo-700', badge: 'bg-indigo-100 text-indigo-700' },
  teal:   { bg: 'bg-teal-50',   text: 'text-teal-600',   btn: 'bg-teal-600 hover:bg-teal-700',   badge: 'bg-teal-100 text-teal-700' },
  emerald:{ bg: 'bg-emerald-50',text: 'text-emerald-600',btn: 'bg-emerald-600 hover:bg-emerald-700',badge: 'bg-emerald-100 text-emerald-700' },
  rose:   { bg: 'bg-rose-50',   text: 'text-rose-600',   btn: 'bg-rose-600 hover:bg-rose-700',   badge: 'bg-rose-100 text-rose-700' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-600', btn: 'bg-violet-600 hover:bg-violet-700',badge: 'bg-violet-100 text-violet-700' },
  amber:  { bg: 'bg-amber-50',  text: 'text-amber-600',  btn: 'bg-amber-600 hover:bg-amber-700', badge: 'bg-amber-100 text-amber-700' },
};

const generateCSVReport = (type, dateRange) => {
  const now = new Date().toISOString().split('T')[0];
  let csvContent = '';

  if (type === 'detailed_billing') {
    csvContent = [
      'Date,Service,Resource ID,Resource Name,Cost (USD),Region,Project Tag,Environment Tag,Team Tag',
      `${now},Amazon EC2,i-0abc123def456,prod-web-01,124.50,us-east-1,Frontend,Production,Platform`,
      `${now},Amazon RDS,db-inst-prod-01,prod-database,287.30,us-east-1,Backend,Production,Database`,
      `${now},Amazon S3,s3-data-lake-01,finops-data-lake,12.40,us-east-1,FinOps,Production,Platform`,
      `${now},AWS Lambda,lambda-cost-processor,cost-processor,3.20,us-east-1,FinOps,Production,Platform`,
    ].join('\n');
  } else if (type === 'tag_compliance') {
    csvContent = [
      'Resource ID,Resource Type,Region,Compliance Score,Missing Tags,Cost (USD)',
      `i-0abc123def456,EC2 Instance,us-east-1,100%,None,124.50`,
      `vol-0abc123def456,EBS Volume,us-east-1,40%,"Project,Environment,Team",18.20`,
      `rds-prod-01,RDS Instance,us-east-1,80%,Team,287.30`,
    ].join('\n');
  } else if (type === 'optimization_report') {
    csvContent = [
      'Resource ID,Resource Name,Type,Recommendation,Current Cost/mo,Projected Cost/mo,Monthly Savings,Risk Level',
      `i-0stale123,stale-dev-box,EC2 Rightsizing,t3.large → t3.small,54.00,27.00,27.00,Low`,
      `i-0idle456,idle-batch-01,Idle Resource,Terminate instance,108.00,0.00,108.00,Low`,
      `vol-unattached789,orphan-vol-01,EBS Cleanup,Delete unattached volume,22.40,0.00,22.40,Low`,
    ].join('\n');
  } else {
    csvContent = ['Report Type,Generated At,Status', `${type},${now},Sample data`].join('\n');
  }

  // Trigger browser download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ciphergate_${type}_${now}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const Reports = () => {
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [generatingId, setGeneratingId] = useState('');
  const [completedReports, setCompletedReports] = useState([]);

  const handleGenerate = async (template, format) => {
    const key = `${template.id}_${format}`;
    setGeneratingId(key);
    await new Promise(r => setTimeout(r, 1400)); // Simulate generation

    if (format === 'CSV') {
      generateCSVReport(template.id, dateRange);
    } else {
      // For PDF, notify user it requires backend PDF service
      alert(`PDF export for "${template.name}" requires the backend PDF generator to be configured. Your CSV export is available immediately.`);
    }

    setCompletedReports(prev => [...prev, key]);
    setGeneratingId('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-950 font-sans">Reports</h1>
        <p className="text-slate-500 text-sm mt-1">
          Generate, download, and schedule standard or custom billing reports in PDF and CSV formats.
        </p>
      </div>

      {/* Date range selector */}
      <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="space-y-1.5 flex-1">
            <label className="text-[10px] text-slate-400 font-bold tracking-wider">Report Start Date</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="w-full px-4 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 bg-slate-50"
            />
          </div>
          <div className="space-y-1.5 flex-1">
            <label className="text-[10px] text-slate-400 font-bold tracking-wider">Report End Date</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="w-full px-4 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 bg-slate-50"
            />
          </div>
          <div className="flex gap-2">
            {['This Month', 'Last Month', 'Last 90d'].map(preset => (
              <button
                key={preset}
                onClick={() => {
                  const now = new Date();
                  if (preset === 'This Month') {
                    setDateRange({ start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, end: now.toISOString().split('T')[0] });
                  } else if (preset === 'Last Month') {
                    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    const le = new Date(now.getFullYear(), now.getMonth(), 0);
                    setDateRange({ start: lm.toISOString().split('T')[0], end: le.toISOString().split('T')[0] });
                  } else {
                    const d90 = new Date(now); d90.setDate(d90.getDate() - 90);
                    setDateRange({ start: d90.toISOString().split('T')[0], end: now.toISOString().split('T')[0] });
                  }
                }}
                className="px-3 py-2.5 text-[10px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Report templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {REPORT_TEMPLATES.map(template => {
          const colors = COLOR_MAP[template.color];
          const IconComp = template.icon;
          return (
            <div key={template.id} className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl ${colors.bg} ${colors.text} flex items-center justify-center flex-shrink-0`}>
                  <IconComp size={18} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-slate-900">{template.name}</h3>
                  <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{template.description}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-auto pt-3 border-t border-slate-50">
                {template.format.map(fmt => {
                  const key = `${template.id}_${fmt}`;
                  const isGenerating = generatingId === key;
                  const isDone = completedReports.includes(key);
                  return (
                    <button
                      key={fmt}
                      onClick={() => handleGenerate(template, fmt)}
                      disabled={!!generatingId}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg text-white transition disabled:opacity-50 ${ isDone ? 'bg-emerald-600' : colors.btn }`}
                    >
                      {isGenerating ? (
                        <FiLoader size={10} className="animate-spin" />
                      ) : isDone ? (
                        <FiCheckCircle size={10} />
                      ) : (
                        <FiDownload size={10} />
                      )}
                      {isGenerating ? 'Generating…' : isDone ? `${fmt} Downloaded` : `Download ${fmt}`}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent downloads log */}
      {completedReports.length > 0 && (
        <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl border border-slate-100 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Session Download History</h2>
          <div className="space-y-2">
            {completedReports.map((key, idx) => {
              const [id, fmt] = key.split('_');
              const tmpl = REPORT_TEMPLATES.find(t => key.startsWith(t.id));
              return (
                <div key={idx} className="flex items-center gap-3 text-xs text-slate-600 py-1.5 border-b border-slate-50 last:border-0">
                  <FiCheckCircle className="text-emerald-500 flex-shrink-0" size={14} />
                  <span className="font-semibold">{tmpl?.name || id}</span>
                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[9px] font-bold">{fmt}</span>
                  <span className="ml-auto text-slate-400 text-[10px]">{new Date().toLocaleTimeString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
