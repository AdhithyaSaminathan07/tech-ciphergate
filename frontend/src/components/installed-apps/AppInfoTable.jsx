import React from 'react';
import { ExternalLink, Clock } from 'lucide-react';

/**
 * Section 9: Application Information key-value table displaying
 * Application Name, Developer, Category, and Web Access URL.
 * Stacks label/value cleanly on narrow mobile viewports (320px–639px)
 * and renders a structured two-column table from sm/tablet upwards.
 */
const AppInfoTable = ({ app }) => {
  const rows = [
    {
      label: 'Application Name',
      value: app.name,
      type: 'text',
    },
    {
      label: 'Developer',
      value: app.developer,
      type: 'text',
    },
    {
      label: 'Category',
      value: app.category,
      type: 'badge',
    },
    {
      label: 'Web Access URL',
      value: app.webAccessUrl,
      type: 'url',
    },
  ];

  return (
    <section aria-labelledby="app-info-heading" className="space-y-3 sm:space-y-4">
      <div>
        <h2 id="app-info-heading" className="text-base sm:text-xl font-bold text-slate-900 mb-0">
          Application Information
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Verified distribution metadata and web access details.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left border-collapse block sm:table">
          <tbody className="divide-y divide-slate-200/80 block sm:table-row-group">
            {rows.map((row) => (
              <tr
                key={row.label}
                className="flex flex-col sm:table-row hover:bg-slate-50/70 transition-colors"
              >
                <th
                  scope="row"
                  className="w-full sm:w-1/3 px-4 sm:px-5 pt-3 pb-1 sm:py-3.5 text-[11px] sm:text-sm font-semibold uppercase sm:normal-case tracking-wider sm:tracking-normal text-slate-500 sm:text-slate-600 bg-slate-50/80 block sm:table-cell"
                >
                  {row.label}
                </th>
                <td className="w-full sm:w-2/3 px-4 sm:px-5 pt-1.5 pb-3.5 sm:py-3.5 text-sm text-slate-900 font-medium break-words block sm:table-cell">
                  {row.type === 'badge' ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F0FAF4] text-[#087443] border border-[#C9F5D9]">
                      {row.value || 'Not specified'}
                    </span>
                  ) : row.type === 'url' ? (
                    row.value ? (
                      <a
                        href={row.value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[#087443] hover:text-[#065F37] hover:underline font-semibold break-all"
                      >
                        <span>{row.value}</span>
                        <ExternalLink size={14} className="shrink-0" />
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                        <Clock size={12} />
                        Coming Soon
                      </span>
                    )
                  ) : (
                    <span>{row.value || 'Not specified'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default AppInfoTable;
