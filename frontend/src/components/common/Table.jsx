import { useMemo } from 'react';
import Spinner from './Spinner';

const Table = ({
  columns,
  data,
  loading = false,
  noDataMessage = 'No data available',
  striped = true,
  hover = true,
  responsive = true
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
            {columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 ${column.headerAlign || 'text-center'}`}
                style={column.width ? { width: column.width } : {}}
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
            ))}
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
                  ${striped && rowIndex % 2 === 1 ? 'bg-gray-50' : ''}
                  ${hover ? 'hover:bg-gray-100' : ''}
                `}
              >
                {columnKeys.map((key, colIndex) => {
                  const column = columns[colIndex];
                  return (
                    <td
                      key={`${rowIndex}-${colIndex}`}
                      className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 ${column.align || 'text-center'}`}
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