import { useState, useEffect, useContext } from 'react';
import { getWorkers } from '../../services/workerService';
import appContext from '../../context/AppContext';
import Card from '../common/Card';
import Spinner from '../common/Spinner';

const Scoreboard = ({ department, noCard = false }) => {
  const [workers, setWorkers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { subdomain } = useContext(appContext);

  useEffect(() => {
    const loadWorkers = async () => {
      if (!subdomain || subdomain == 'main') {
        return;
      }

      setIsLoading(true);
      try {
        // Get all workers
        const workersData = await getWorkers({ subdomain });
        
        // Filter workers by department and sort by total points
        const filteredWorkers = workersData
          .filter(worker => worker.department === department)
          .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
        
        setWorkers(filteredWorkers);
      } catch (error) {
        console.error('Failed to load scoreboard:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadWorkers();
  }, [department]);

  const ScoreHeader = () => (
    <div className="flex items-center">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 110 18 9 9 0 010-18z" />
      </svg>
      Department Scoreboard
    </div>
  );

  const LoadingState = () => (
    <div className="flex justify-center py-8">
      <Spinner />
    </div>
  );

  const EmptyState = () => (
    <p className="text-center py-6 text-gray-500">
      No workers found in this department.
    </p>
  );
  
  if (isLoading) {
    return noCard ? <LoadingState /> : <Card title={<ScoreHeader />}><LoadingState /></Card>;
  }
  
  if (workers.length === 0) {
    return noCard ? <EmptyState /> : <Card title={<ScoreHeader />}><EmptyState /></Card>;
  }
  
  const content = (
    <>
      {!noCard && <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><ScoreHeader /></h2>}
      
      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {workers.map((worker, index) => (
          <div key={worker._id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center shadow-sm">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-black text-xs mr-3">
              {index + 1}
            </div>
            <div className="flex-shrink-0 h-12 w-12 mr-4 relative">
              <img 
                className="h-full w-full rounded-2xl object-cover border-2 border-white shadow-sm" 
                src={worker.photo ? worker.photo : `https://ui-avatars.com/api/?name=${encodeURIComponent(worker.name)}`}
                alt={worker.name} 
              />
              {index === 0 && (
                <div className="absolute -top-1 -right-1 bg-amber-400 text-white p-1 rounded-full shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-2 w-2" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-slate-900 truncate tracking-tight">
                {worker.name}
              </div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {worker.department || 'Employee'}
              </div>
            </div>
            <div className="flex flex-col items-end">
              <div className="text-sm font-black text-teal-600">
                {worker.totalPoints || 0}
              </div>
              <div className="text-[9px] font-bold text-slate-400 uppercase">Points</div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-100">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/80">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-[11px] font-black text-slate-500 uppercase tracking-widest">
                Rank
              </th>
              <th scope="col" className="px-6 py-3 text-left text-[11px] font-black text-slate-500 uppercase tracking-widest">
                Employee
              </th>
              <th scope="col" className="px-6 py-3 text-left text-[11px] font-black text-slate-500 uppercase tracking-widest">
                Total Points
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-50">
            {workers.map((worker, index) => (
              <tr key={worker._id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap font-bold text-slate-400">
                  #{index + 1}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      <img 
                        className="h-10 w-10 rounded-xl object-cover border border-slate-100 shadow-sm" 
                        src={worker.photo ? worker.photo : `https://ui-avatars.com/api/?name=${encodeURIComponent(worker.name)}`}
                        alt={worker.name} 
                      />
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-black text-slate-900 tracking-tight">
                        {worker.name}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-teal-600">
                  {worker.totalPoints || 0} pts
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  if (noCard) return content;

  return (
    <Card title={<ScoreHeader />}>
      {content}
    </Card>
  );
};

export default Scoreboard;