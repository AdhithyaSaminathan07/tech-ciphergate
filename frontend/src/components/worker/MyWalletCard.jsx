import React, { useState, useEffect, useContext } from 'react';
import { Wallet, ArrowDownCircle, ArrowUpCircle, History, Clock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import appContext from '../../context/AppContext';
import { getWalletHistory } from '../../services/salaryService';
import Spinner from '../common/Spinner';

const MyWalletCard = () => {
  const { user } = useAuth();
  const { subdomain } = useContext(appContext);
  
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const res = await getWalletHistory(user._id, subdomain);
        setBalance(res.balance || 0);
        setHistory(res.history || []);
      } catch (error) {
        console.error('Failed to fetch wallet info', error);
      } finally {
        setIsLoading(false);
      }
    };
    if (user && subdomain) {
      fetchWallet();
    }
  }, [user, subdomain]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-3xl p-6 border border-slate-100/80 shadow-sm flex justify-center items-center h-full min-h-[200px]">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-teal-700 to-emerald-900 rounded-3xl p-6 shadow-md relative overflow-hidden h-full flex flex-col justify-between group transition-all duration-300">
      {/* Background decorations */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700 pointer-events-none"></div>
      <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-emerald-400/20 rounded-full blur-2xl pointer-events-none"></div>
      <Wallet className="absolute top-4 right-4 text-white/5 text-8xl -rotate-12 pointer-events-none" />

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-black text-teal-100 uppercase tracking-widest flex items-center gap-1.5">
            <Wallet size={12} /> My Wallet
          </p>
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-full transition-colors backdrop-blur-sm"
          >
            <History size={10} /> {showHistory ? 'Hide History' : 'History'}
          </button>
        </div>

        {!showHistory ? (
          <div className="flex-1 flex flex-col justify-center">
            <p className="text-teal-100/80 text-sm font-medium mb-1">Available Balance</p>
            <h3 className="text-4xl md:text-5xl font-black text-white tracking-tight drop-shadow-sm">
              ₹{balance.toLocaleString('en-IN')}
            </h3>
            <p className="text-xs text-teal-200 mt-2 font-medium flex items-center gap-1.5">
              <Clock size={12} /> Updated just now
            </p>
            <div className="mt-5 p-3 bg-black/10 rounded-xl border border-white/10 backdrop-blur-md">
              <p className="text-xs text-teal-50 font-medium leading-relaxed">
                Your wallet holds your profit shares from Salary Projects. This balance can be credited to your salary or paid out directly.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col mt-2 max-h-[220px] overflow-hidden">
            {history.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-teal-100/50">
                <History size={24} className="mb-2 opacity-50" />
                <p className="text-xs font-medium">No transactions yet</p>
              </div>
            ) : (
              <div className="overflow-y-auto pr-1 space-y-2 pb-1 custom-scrollbar">
                {history.map(txn => (
                  <div key={txn._id} className="bg-white/10 border border-white/10 p-2.5 rounded-xl flex items-center justify-between backdrop-blur-sm">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${txn.type === 'Credit' ? 'bg-green-400/20 text-green-300' : 'bg-rose-400/20 text-rose-300'}`}>
                        {txn.type === 'Credit' ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate max-w-[120px]">{txn.description}</p>
                        <p className="text-[9px] text-teal-200/80">{new Date(txn.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="text-right pl-2">
                      <p className={`text-sm font-black ${txn.type === 'Credit' ? 'text-green-300' : 'text-rose-300'}`}>
                        {txn.type === 'Credit' ? '+' : '-'}₹{txn.amount}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyWalletCard;
