import re

with open('src/components/server/ServerOverview.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace small font sizes with text-xs (which is 12px)
content = re.sub(r'text-\[(?:8|9|10|11)px\]', 'text-xs', content)

# 2. Fix the H1 so it fits on one line
content = content.replace(
    '<h1 className="text-2xl font-black text-slate-800 tracking-tight">FinOps Executive Control Cockpit</h1>',
    '<h1 className="text-2xl font-bold text-slate-800 tracking-tight truncate leading-[1.2]">FinOps Cockpit</h1>'
)

# 3. Fix duplicate critical anomaly flash banner
# We will just remove the second occurrence (which is inside the <>)
# We can find the second occurrence using a split
parts = content.split('{/* Critical Anomaly Flash Banner */}')
if len(parts) > 2:
    # First part is before the first banner.
    # parts[1] is the first banner code up to the second comment.
    # parts[2] is the code after the second comment.
    
    # We want to remove the second banner block
    # It starts with:
    #       {criticalAnomaliesCount > 0 && (
    # ...
    #       )}
    # Let's just use regex to remove the second block
    pass

content = re.sub(
    r'(\{\/\* Critical Anomaly Flash Banner \*\/\}[\s\S]*?\{criticalAnomaliesCount > 0 && \([\s\S]*?\)\s*\})([\s\S]*?)\{\/\* Critical Anomaly Flash Banner \*\/\}[\s\S]*?\{criticalAnomaliesCount > 0 && \([\s\S]*?\)\s*\}',
    r'\1\2',
    content,
    count=1
)

# 4. Group related stats into a 2-column grid instead of 1-column on mobile
content = content.replace(
    '<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">',
    '<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">'
)

# 5. Fix KPICard for mobile so icon and text stack on small screens, preventing clipping
# And adjusting paddings/gaps to match 8pt scale
old_kpi = r'''const KPICard = \(\{ icon: Icon, label, value, sub, color, trend: trendDir \}\) => \(
  <div className="bg-white/95 backdrop-blur-md p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner \$\{color\}`}>
      <Icon size=\{20\} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-slate-400 font-bold tracking-wider">\{label\}</p>
      <div className="flex items-baseline gap-2 mt-0.5">
        <p className="text-xl font-black text-slate-800 font-mono truncate">\{value\}</p>
        \{trendDir !== undefined && \(
          <span className=\{`text-xs font-extrabold flex items-center gap-0.5 \$\{trendDir > 0 \? 'text-rose-500' : 'text-emerald-500'\}`\}>
            \{trendDir > 0 \? <FiArrowUp size=\{10\} /> : <FiArrowDown size=\{10\} />\}
            \{Math.abs\(trendDir\)\}%
          </span>
        \)\}
      </div>
      \{sub && <p className="text-xs text-slate-400 font-semibold mt-0.5 truncate">\{sub\}</p>\}
    </div>
  </div>
\);'''

new_kpi = '''const KPICard = ({ icon: Icon, label, value, sub, color, trend: trendDir }) => (
  <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shadow-inner shrink-0 ${color}`}>
      <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
    </div>
    <div className="flex-1 min-w-0 flex flex-col w-full gap-1">
      <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-base sm:text-lg font-bold text-slate-800 font-mono truncate">{value}</p>
        {trendDir !== undefined && (
          <span className={`text-xs font-medium flex items-center gap-1 ${trendDir > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
            {trendDir > 0 ? <FiArrowUp size={12} /> : <FiArrowDown size={12} />}
            {Math.abs(trendDir)}%
          </span>
        )}
      </div>
      {sub && <p className="text-xs text-slate-400 font-medium truncate">{sub}</p>}
    </div>
  </div>
);'''

content = re.sub(old_kpi, new_kpi, content)

with open('src/components/server/ServerOverview.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('ServerOverview updated successfully!')
