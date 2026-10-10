import { useMemo } from 'react';
import Spinner from './Spinner';

const Table = ({
  columns,
  data,
  loading = false,
  noDataMessage = 'No data available',
  striped = true,
  hover = true,
  responsive = true,
  compact = false
}) => {
  const columnKeys = useMemo(() => {
    return columns.map(col => col.accessor);
  }, [columns]);

  if (loading) {
    return <Spinner />;
  }

  return (
    <div className={`w-full rounded-xl border border-[#E2ECE5] bg-white shadow-sm ${responsive ? 'overflow-x-auto' : ''}`}>
      <table className="min-w-full divide-y divide-[#E2ECE5]">
        <thead className="bg-[#F6F9F7]">
          <tr>
            {columns.map((column, index) => {
              const isSticky = column.sticky === 'right' || column.sticky === 'left';
              const stickyClass = isSticky 
                ? `sticky ${column.sticky === 'right' ? 'right-0' : 'left-0'} z-20 bg-[#F6F9F7]` 
                : '';
              
              return (
                <th
                  key={index}
                  scope="col"
                  className={`${compact ? 'px-3 py-2.5' : 'px-5 py-3'} text-xs font-semibold text-[#526A5E] uppercase tracking-wider border-b border-[#E2ECE5] ${column.headerAlign || 'text-center'} ${stickyClass}`}
                  style={column.width ? { width: column.width, minWidth: column.width } : {}}
                  title={column.description || column.header}
                >
                  <div className="font-bold text-[#0F241D]">
                    {column.header}
                  </div>
                  {column.description && (
                    <div className="text-[11px] font-normal text-[#526A5E] mt-0.5">
                      {column.description}
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-[#E2ECE5]/70">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-6 text-center text-sm text-[#526A5E] font-medium">
                {noDataMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={`group transition-colors duration-150 ${striped && rowIndex % 2 === 1 ? 'bg-[#F6F9F7]/40' : ''} ${hover ? 'hover:bg-[#F0FAF4]/60' : ''}`}
              >
                {columnKeys.map((key, colIndex) => {
                  const column = columns[colIndex];
                  const isSticky = column.sticky === 'right' || column.sticky === 'left';
                  const stickyClass = isSticky 
                    ? `sticky ${column.sticky === 'right' ? 'right-0' : 'left-0'} z-10 ${striped && rowIndex % 2 === 1 ? 'bg-[#F6F9F7]/40' : 'bg-white'} group-hover:bg-[#F0FAF4]/60` 
                    : '';
                  
                  return (
                    <td
                      key={`${rowIndex}-${colIndex}`}
                      className={`${compact ? 'px-3 py-2' : 'px-5 py-3.5'} ${column.nowrap !== false ? 'whitespace-nowrap' : 'whitespace-normal'} text-sm text-[#0F241D] ${column.align || 'text-center'} ${stickyClass}`}
                      style={column.width ? { width: column.width, minWidth: column.width } : {}}
                      title={column.cellDescription ? column.cellDescription(row, rowIndex) : ''}
                    >
                      {column.render
                        ? column.render(row, rowIndex)
                        : row[key]
                      }
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Table;