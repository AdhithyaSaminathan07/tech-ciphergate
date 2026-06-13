import React, { useState, useRef, useEffect } from 'react';
import { FiSend, FiCpu, FiUser, FiTool, FiChevronDown, FiChevronUp, FiAlertCircle } from 'react-icons/fi';

const chatWithAgent = async (message, history) => {
  const { getAuthToken } = await import('../../utils/authUtils');
  const api = (await import('../../services/api')).default;
  const token = getAuthToken();
  const response = await api.post('/server/chat', { message, conversationHistory: history }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

// Simple markdown renderer
const renderMarkdown = (text) => {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h3 class="font-bold text-slate-800 mt-3 mb-1 text-sm">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-bold text-slate-900 mt-4 mb-2 text-base">$1</h2>')
    .replace(/^- (.+)$/gm, '<li class="ml-3 list-disc text-xs">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 px-1 py-0.5 rounded text-[10px] font-mono">$1</code>');
};

const SUGGESTED_PROMPTS = [
  'What is our current month-to-date cloud spend?',
  'Which services are costing the most this month?',
  'Are there any billing anomalies I should know about?',
  'What are our top rightsizing opportunities?',
  'Show me our month-end spending forecast.',
  'Which projects are consuming the most budget?',
];

const ToolCallBlock = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-indigo-100 rounded-xl overflow-hidden bg-indigo-50/50 text-[10px]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-indigo-700 font-bold hover:bg-indigo-50 transition"
      >
        <span className="flex items-center gap-1.5">
          <FiTool size={11} />
          {toolCall.tool}
          {toolCall.error ? <span className="text-rose-500 ml-1">(Error)</span> : <span className="text-emerald-600 ml-1">✓</span>}
        </span>
        {expanded ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1">
          {Object.keys(toolCall.params || {}).length > 0 && (
            <div className="text-indigo-500">Params: {JSON.stringify(toolCall.params)}</div>
          )}
          <pre className="bg-white border border-indigo-100 p-2 rounded-lg text-[9px] font-mono text-slate-700 max-h-32 overflow-auto whitespace-pre-wrap">
            {toolCall.error ? `Error: ${toolCall.error}` : JSON.stringify(toolCall.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

const AiFinOpsChat = () => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `# Welcome to CipherGate AI FinOps Advisor 👋

I am your **Senior AWS FinOps Architect**. I analyze your live cloud billing data and provide evidence-based cost optimization recommendations.

**I will always query your real billing database before answering.** Try asking me:
- What are our current month-to-date costs?
- Show me our top cost drivers this month.
- What savings opportunities exist?
- Are there any cost anomalies?`,
      toolCalls: []
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    const messageText = (text || input).trim();
    if (!messageText || isLoading) return;

    setInput('');
    setError('');

    const userMessage = { role: 'user', content: messageText };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const historyForAPI = updatedMessages
        .slice(-10)
        .filter(m => m.role !== 'assistant' || m.toolCalls?.length === 0)
        .map(m => ({ role: m.role, content: m.content }));

      const response = await chatWithAgent(messageText, historyForAPI);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.response,
        toolCalls: response.toolCalls || []
      }]);
    } catch (err) {
      const errMsg = err?.response?.data?.error || err.message || 'Failed to get response.';
      setError(errMsg);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ **Error**: ${errMsg}\n\nThis may be because:\n- Claude API key is not configured in Settings\n- You have reached your daily AI usage limit\n- No billing data exists (trigger a sync first)`,
        toolCalls: [],
        isError: true
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[600px] gap-0">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-md px-6 py-4 border border-slate-100 rounded-t-2xl flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
            <FiCpu className="text-white" size={16} />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 font-sans">CipherGate AI FinOps Advisor</h1>
            <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse inline-block" />
              MCP Tools Active — Claude-powered
            </p>
          </div>
        </div>
        <div className="text-[10px] text-slate-400 font-semibold text-right hidden md:block">
          <p>Policy: Tool-first responses</p>
          <p>Auto-execution: Disabled</p>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto bg-slate-50/60 border-x border-slate-100 px-4 py-6 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center shadow-sm ${
              msg.role === 'user'
                ? 'bg-slate-800 text-white'
                : msg.isError
                ? 'bg-rose-100 text-rose-600'
                : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
            }`}>
              {msg.role === 'user' ? <FiUser size={14} /> : <FiCpu size={14} />}
            </div>

            <div className={`max-w-[82%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
              {/* Bubble */}
              <div className={`px-4 py-3 rounded-2xl text-xs leading-relaxed shadow-sm ${
                msg.role === 'user'
                  ? 'bg-slate-800 text-slate-100 rounded-tr-none'
                  : msg.isError
                  ? 'bg-rose-50 text-rose-800 border border-rose-100 rounded-tl-none'
                  : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
              }`}>
                {msg.role === 'user' ? (
                  <p>{msg.content}</p>
                ) : (
                  <div
                    className="prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                )}
              </div>

              {/* Tool calls */}
              {msg.toolCalls?.length > 0 && (
                <div className="w-full space-y-1">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider px-1">MCP Tool Executions</p>
                  {msg.toolCalls.map((tc, tcIdx) => (
                    <ToolCallBlock key={tcIdx} toolCall={tc} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex-shrink-0 flex items-center justify-center">
              <FiCpu className="text-white animate-pulse" size={14} />
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">Querying billing database…</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested prompts */}
      {messages.length <= 1 && !isLoading && (
        <div className="bg-white border-x border-slate-100 px-4 py-3">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Suggested Questions</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => sendMessage(prompt)}
                className="px-3 py-1.5 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 text-slate-600 text-[10px] font-semibold rounded-lg transition"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="bg-white/90 backdrop-blur-md border border-slate-100 rounded-b-2xl px-4 py-3 shadow-sm">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about costs, anomalies, savings opportunities, or forecasts…"
            rows={1}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none bg-slate-50 disabled:opacity-50 transition"
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim()}
            className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center disabled:opacity-40 transition shadow-sm"
          >
            <FiSend size={15} />
          </button>
        </div>
        <p className="text-[9px] text-slate-400 mt-1.5 text-center">
          AI strictly queries live billing data via MCP tools. Auto-execution is disabled.
        </p>
      </div>
    </div>
  );
};

export default AiFinOpsChat;
