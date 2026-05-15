import "./RepoChat.css"
import { useState, useEffect, useRef, useCallback } from "react"
import {
    MessageSquare,
    Send,
    Bot,
    User,
    Sparkles,
    X,
    ChevronDown,
    ChevronUp,
    GitBranch,
    Loader2,
    Trash2,
    Copy,
    Check,
    Search,
    Globe,
    Lock,
    Maximize2,
    Minimize2,
    Plus
} from "lucide-react"
import githubService from "@/services/githubService"

// Simple markdown-like renderer for AI responses
function renderMarkdown(text) {
    if (!text) return ''
    
    // Process the text into HTML
    let html = text
    
    // Code blocks (```...```)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre class="rc-code-block"><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`
    })
    
    // Inline code (`...`)
    html = html.replace(/`([^`]+)`/g, '<code class="rc-inline-code">$1</code>')
    
    // Bold (**...**)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    
    // Italic (*...*)
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4 class="rc-h4">$1</h4>')
    html = html.replace(/^## (.+)$/gm, '<h3 class="rc-h3">$1</h3>')
    html = html.replace(/^# (.+)$/gm, '<h2 class="rc-h2">$1</h2>')
    
    // Bullet points
    html = html.replace(/^- (.+)$/gm, '<li class="rc-li">$1</li>')
    html = html.replace(/(<li class="rc-li">.*<\/li>\n?)+/g, '<ul class="rc-ul">$&</ul>')
    
    // Numbered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="rc-oli">$1</li>')
    html = html.replace(/(<li class="rc-oli">.*<\/li>\n?)+/g, '<ol class="rc-ol">$&</ol>')
    
    // Line breaks
    html = html.replace(/\n\n/g, '<br/><br/>')
    html = html.replace(/\n/g, '<br/>')
    
    return html
}

export default function RepoChat() {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [messages, setMessages] = useState([])
    const [inputValue, setInputValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [repos, setRepos] = useState([])
    const [selectedRepos, setSelectedRepos] = useState([])
    const [showRepoDropdown, setShowRepoDropdown] = useState(false)
    const [repoSearchQuery, setRepoSearchQuery] = useState('')
    const [copiedIndex, setCopiedIndex] = useState(null)
    const [loadingRepos, setLoadingRepos] = useState(false)
    
    const messagesContainerRef = useRef(null)
    const inputRef = useRef(null)
    const dropdownRef = useRef(null)

    // Scroll to bottom within the messages container only (not the page)
    const scrollToBottom = useCallback(() => {
        const container = messagesContainerRef.current
        if (container) {
            requestAnimationFrame(() => {
                container.scrollTop = container.scrollHeight
            })
        }
    }, [])

    useEffect(() => {
        scrollToBottom()
    }, [messages, isLoading, scrollToBottom])

    // Load repos when expanded
    useEffect(() => {
        if (isExpanded && repos.length === 0) {
            loadRepos()
        }
    }, [isExpanded])

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowRepoDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Escape key to exit fullscreen
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isFullscreen) {
                setIsFullscreen(false)
            }
        }
        document.addEventListener('keydown', handleEsc)
        return () => document.removeEventListener('keydown', handleEsc)
    }, [isFullscreen])

    // Lock body scroll when fullscreen
    useEffect(() => {
        if (isFullscreen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => { document.body.style.overflow = '' }
    }, [isFullscreen])

    // Add welcome message on first expand
    useEffect(() => {
        if (isExpanded && messages.length === 0) {
            setMessages([{
                role: 'assistant',
                content: `👋 **Welcome to CipherGate Repo Intelligence!**\n\nI can help you understand your GitHub repositories. Here's what you can ask me:\n\n- **"What tech stack does [repo name] use?"**\n- **"Give me an overview of [repo name]"**\n- **"Who are the top contributors to [repo name]?"**\n- **"Compare [repo A] and [repo B]"**\n\nYou can select **multiple repositories** from the dropdown above to compare or analyze them together. Let's get started! 🚀`,
                timestamp: new Date()
            }])
        }
    }, [isExpanded])

    const loadRepos = async () => {
        setLoadingRepos(true)
        try {
            const result = await githubService.getRepoChatRepos()
            if (result.success) {
                setRepos(result.repos)
            }
        } catch (err) {
            console.error('Failed to load repos:', err)
        } finally {
            setLoadingRepos(false)
        }
    }

    const handleSendMessage = async () => {
        const trimmed = inputValue.trim()
        if (!trimmed || isLoading) return

        const userMessage = {
            role: 'user',
            content: trimmed,
            timestamp: new Date()
        }

        setMessages(prev => [...prev, userMessage])
        setInputValue('')
        setIsLoading(true)

        try {
            // Build conversation history for context
            const history = messages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => ({ role: m.role, content: m.content }))

            const result = await githubService.sendRepoChatMessage(
                trimmed,
                selectedRepos.map(r => r.name),
                history
            )

            if (result.success) {
                const assistantMessage = {
                    role: 'assistant',
                    content: result.response,
                    timestamp: new Date(),
                    detectedRepos: result.detectedRepos
                }
                setMessages(prev => [...prev, assistantMessage])

                // Auto-add detected repos if none selected
                if (result.detectedRepos?.length > 0 && selectedRepos.length === 0) {
                    const newRepos = result.detectedRepos
                        .map(dr => repos.find(r => r.name === dr.name))
                        .filter(Boolean)
                    if (newRepos.length > 0) setSelectedRepos(newRepos)
                }
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: '❌ Sorry, I encountered an error processing your request. Please try again.',
                    timestamp: new Date(),
                    isError: true
                }])
            }
        } catch (err) {
            console.error('Chat error:', err)
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ **Error:** ${err.response?.data?.message || 'Failed to get response. Please check if the backend is running.'}`,
                timestamp: new Date(),
                isError: true
            }])
        } finally {
            setIsLoading(false)
        }
    }

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }

    const clearChat = () => {
        setMessages([{
            role: 'assistant',
            content: '🗑️ Chat cleared. How can I help you with your repositories?',
            timestamp: new Date()
        }])
    }

    const newChat = () => {
        setMessages([])
        setSelectedRepos([])
        setInputValue('')
        // Re-trigger welcome message
        setTimeout(() => {
            setMessages([{
                role: 'assistant',
                content: `✨ **New conversation started!**\n\nSelect repositories from the dropdown or just ask me anything about your GitHub projects.`,
                timestamp: new Date()
            }])
        }, 100)
    }

    const copyMessage = (content, index) => {
        navigator.clipboard.writeText(content)
        setCopiedIndex(index)
        setTimeout(() => setCopiedIndex(null), 2000)
    }

    const filteredRepos = repos.filter(r =>
        r.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
        (r.description && r.description.toLowerCase().includes(repoSearchQuery.toLowerCase()))
    )

    const quickPrompts = [
        "What tech stack is used?",
        "Give me an overview",
        "Who are the contributors?",
        "Compare these repositories"
    ]

    return (
        <div className="rc-container" id="repo-chat-widget">
            {/* Collapsed Bar */}
            {!isExpanded && (
                <button
                    onClick={() => setIsExpanded(true)}
                    className="rc-collapsed-bar"
                    id="repo-chat-toggle"
                >
                    <div className="rc-collapsed-left">
                        <div className="rc-collapsed-icon">
                            <Sparkles className="rc-icon-sm" />
                        </div>
                        <span className="rc-collapsed-text">
                            Ask AI about your repositories...
                        </span>
                    </div>
                    <div className="rc-collapsed-right">
                        <MessageSquare className="rc-icon-sm" />
                        <ChevronDown className="rc-icon-sm" />
                    </div>
                </button>
            )}

            {/* Fullscreen backdrop */}
            {isFullscreen && <div className="rc-fullscreen-backdrop" onClick={() => setIsFullscreen(false)} />}

            {/* Expanded Chat Panel */}
            {isExpanded && (
                <div className={`rc-panel ${isFullscreen ? 'rc-fullscreen' : ''}`}>
                    {/* Header */}
                    <div className="rc-header">
                        <div className="rc-header-left">
                            <div className="rc-header-icon">
                                <Bot className="rc-icon-md" />
                            </div>
                            <div>
                                <h3 className="rc-header-title">Repo Intelligence</h3>
                                <p className="rc-header-subtitle">
                                    {selectedRepos.length > 0
                                        ? `Analyzing: ${selectedRepos.map(r => r.name).join(', ')}` 
                                        : 'Ask anything about your repos'
                                    }
                                </p>
                            </div>
                        </div>
                        <div className="rc-header-actions">
                            <button
                                onClick={newChat}
                                className="rc-header-btn rc-new-chat-btn"
                                title="New chat"
                            >
                                <Plus className="rc-icon-sm" />
                            </button>
                            <button
                                onClick={clearChat}
                                className="rc-header-btn"
                                title="Clear chat"
                            >
                                <Trash2 className="rc-icon-sm" />
                            </button>
                            <button
                                onClick={() => setIsFullscreen(!isFullscreen)}
                                className="rc-header-btn"
                                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                            >
                                {isFullscreen 
                                    ? <Minimize2 className="rc-icon-sm" />
                                    : <Maximize2 className="rc-icon-sm" />
                                }
                            </button>
                            {!isFullscreen && (
                                <button
                                    onClick={() => setIsExpanded(false)}
                                    className="rc-header-btn"
                                    title="Minimize"
                                >
                                    <ChevronUp className="rc-icon-sm" />
                                </button>
                            )}
                            {isFullscreen && (
                                <button
                                    onClick={() => { setIsFullscreen(false); setIsExpanded(false) }}
                                    className="rc-header-btn"
                                    title="Close"
                                >
                                    <X className="rc-icon-sm" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Repo Selector - Multi Select */}
                    <div className="rc-repo-selector" ref={dropdownRef}>
                        {/* Selected repo tags */}
                        <div className="rc-repo-tags-row">
                            {selectedRepos.map(repo => (
                                <span key={repo.name} className="rc-repo-tag">
                                    {repo.private 
                                        ? <Lock className="rc-icon-xs" />
                                        : <Globe className="rc-icon-xs" />
                                    }
                                    <span>{repo.name}</span>
                                    <button
                                        onClick={() => setSelectedRepos(prev => prev.filter(r => r.name !== repo.name))}
                                        className="rc-repo-tag-remove"
                                    >
                                        <X className="rc-icon-xs" />
                                    </button>
                                </span>
                            ))}
                            <button
                                onClick={() => setShowRepoDropdown(!showRepoDropdown)}
                                className="rc-repo-add-btn"
                            >
                                <Plus className="rc-icon-xs" />
                                <span>{selectedRepos.length === 0 ? 'Select repositories (optional)' : 'Add repo'}</span>
                            </button>
                        </div>

                        {showRepoDropdown && (
                            <div className="rc-dropdown">
                                <div className="rc-dropdown-search">
                                    <Search className="rc-icon-sm rc-search-icon" />
                                    <input
                                        type="text"
                                        placeholder="Search repositories..."
                                        value={repoSearchQuery}
                                        onChange={(e) => setRepoSearchQuery(e.target.value)}
                                        className="rc-dropdown-input"
                                        autoFocus
                                    />
                                </div>
                                <div className="rc-dropdown-list">
                                    {loadingRepos ? (
                                        <div className="rc-dropdown-loading">
                                            <Loader2 className="rc-icon-sm rc-spin" />
                                            <span>Loading repos...</span>
                                        </div>
                                    ) : filteredRepos.length === 0 ? (
                                        <div className="rc-dropdown-empty">No repositories found</div>
                                    ) : (
                                        filteredRepos.map(repo => {
                                            const isSelected = selectedRepos.some(r => r.name === repo.name)
                                            return (
                                                <button
                                                    key={repo.full_name}
                                                    className={`rc-dropdown-item ${isSelected ? 'rc-selected' : ''}`}
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            setSelectedRepos(prev => prev.filter(r => r.name !== repo.name))
                                                        } else {
                                                            setSelectedRepos(prev => [...prev, repo])
                                                        }
                                                        setRepoSearchQuery('')
                                                    }}
                                                >
                                                    <div className="rc-dropdown-item-left">
                                                        <div className={`rc-checkbox ${isSelected ? 'rc-checked' : ''}`}>
                                                            {isSelected && <Check className="rc-icon-xs" />}
                                                        </div>
                                                        {repo.private 
                                                            ? <Lock className="rc-icon-xs rc-text-warning" />
                                                            : <Globe className="rc-icon-xs rc-text-success" />
                                                        }
                                                        <span className="rc-dropdown-item-name">{repo.name}</span>
                                                    </div>
                                                    {repo.language && (
                                                        <span className="rc-dropdown-item-lang">{repo.language}</span>
                                                    )}
                                                </button>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Messages */}
                    <div className="rc-messages" ref={messagesContainerRef}>
                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={`rc-message ${msg.role === 'user' ? 'rc-message-user' : 'rc-message-assistant'} ${msg.isError ? 'rc-message-error' : ''}`}
                            >
                                <div className="rc-message-avatar">
                                    {msg.role === 'user' 
                                        ? <User className="rc-icon-sm" />
                                        : <Bot className="rc-icon-sm" />
                                    }
                                </div>
                                <div className="rc-message-content">
                                    <div 
                                        className="rc-message-text"
                                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                                    />
                                    <div className="rc-message-footer">
                                        <span className="rc-message-time">
                                            {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </span>
                                        {msg.role === 'assistant' && !msg.isError && (
                                            <button
                                                onClick={() => copyMessage(msg.content, idx)}
                                                className="rc-copy-btn"
                                                title="Copy response"
                                            >
                                                {copiedIndex === idx 
                                                    ? <Check className="rc-icon-xs" />
                                                    : <Copy className="rc-icon-xs" />
                                                }
                                            </button>
                                        )}
                                    </div>
                                    {msg.detectedRepos?.length > 0 && (
                                        <div className="rc-detected-repo">
                                            <GitBranch className="rc-icon-xs" />
                                            <span>Analyzing: {msg.detectedRepos.map(r => r.name).join(', ')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="rc-message rc-message-assistant">
                                <div className="rc-message-avatar">
                                    <Bot className="rc-icon-sm" />
                                </div>
                                <div className="rc-message-content">
                                    <div className="rc-typing">
                                        <div className="rc-typing-dot" style={{ animationDelay: '0ms' }}></div>
                                        <div className="rc-typing-dot" style={{ animationDelay: '150ms' }}></div>
                                        <div className="rc-typing-dot" style={{ animationDelay: '300ms' }}></div>
                                        <span className="rc-typing-text">Analyzing repository data...</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Quick Prompts */}
                    {messages.length <= 1 && selectedRepos.length > 0 && (
                        <div className="rc-quick-prompts">
                            {quickPrompts.map((prompt, idx) => (
                                <button
                                    key={idx}
                                    className="rc-quick-btn"
                                    onClick={() => {
                                        setInputValue(prompt)
                                        inputRef.current?.focus()
                                    }}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Input */}
                    <div className="rc-input-area">
                        <div className="rc-input-wrapper">
                            <textarea
                                ref={inputRef}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyPress}
                                placeholder={selectedRepos.length > 0
                                    ? `Ask about ${selectedRepos.map(r => r.name).join(', ')}...` 
                                    : "Ask about any repository..."
                                }
                                className="rc-textarea"
                                rows={1}
                                disabled={isLoading}
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!inputValue.trim() || isLoading}
                                className="rc-send-btn"
                            >
                                {isLoading 
                                    ? <Loader2 className="rc-icon-sm rc-spin" />
                                    : <Send className="rc-icon-sm" />
                                }
                            </button>
                        </div>
                        <p className="rc-input-hint">
                            Press Enter to send • Shift+Enter for new line
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
