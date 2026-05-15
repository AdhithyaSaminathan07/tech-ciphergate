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
    <div className={`${responsive ? 'overflow-x-auto' : ''}`}>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column, index) => {
              const isSticky = column.sticky === 'right' || column.sticky === 'left';
              const stickyClass = isSticky 
                ? `sticky ${column.sticky === 'right' ? 'right-0' : 'left-0'} z-20 bg-gray-50` 
                : '';
              
              return (
                <th
                  key={index}
                  scope="col"
                  className={`${compact ? 'px-3 py-2' : 'px-6 py-3'} text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 ${column.headerAlign || 'text-center'} ${stickyClass}`}
                  style={column.width ? { width: column.width, minWidth: column.width } : {}}
                  title={column.description || column.header}
                >
                  <div className="font-bold text-gray-700">
                    {column.header}
                  </div>
                  {column.description && (
                    <div className="text-xs font-normal text-gray-500 mt-1">
                      {column.description}
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-4 text-center text-sm text-gray-500">
                {noDataMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={`
                  group
                  ${striped && rowIndex % 2 === 1 ? 'bg-gray-50' : ''}
                  ${hover ? 'hover:bg-gray-100' : ''}
                `}
              >
                {columnKeys.map((key, colIndex) => {
                  const column = columns[colIndex];
                  const isSticky = column.sticky === 'right' || column.sticky === 'left';
                  const isLastRow = rowIndex === data.length - 1;
                  const stickyClass = isSticky 
                    ? `sticky ${column.sticky === 'right' ? 'right-0' : 'left-0'} z-10 ${striped && rowIndex % 2 === 1 ? 'bg-gray-50' : 'bg-white'} group-hover:bg-gray-100` 
                    : '';
                  
                  return (
                    <td
                      key={`${rowIndex}-${colIndex}`}
                      className={`${compact ? 'px-3 py-2' : 'px-6 py-4'} ${column.nowrap !== false ? 'whitespace-nowrap' : 'whitespace-normal'} text-sm text-gray-500 ${column.align || 'text-center'} ${stickyClass}`}
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