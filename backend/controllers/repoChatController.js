const { Octokit } = require("@octokit/rest");
const OpenAI = require('openai');

// Initialize DeepSeek client (same pattern as existing openai.js)
const getDeepSeekClient = () => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY environment variable is required.');
    }
    return new OpenAI({
        apiKey: apiKey,
        baseURL: 'https://api.deepseek.com/v1'
    });
};

// Initialize Octokit
const getOctokit = () => {
    const token = process.env.GITHUB_TOKEN || process.env.NEXT_PUBLIC_GITHUB_TOKEN;
    if (!token) {
        throw new Error("GitHub Token not configured");
    }
    return new Octokit({
        auth: token,
        request: { timeout: 30000 }
    });
};

// In-memory cache for repo context (avoids hitting GitHub API every chat message)
const repoContextCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch comprehensive repo context from GitHub API
 */
const fetchRepoContext = async (octokit, owner, repoName) => {
    const cacheKey = `${owner}/${repoName}`;
    const cached = repoContextCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[RepoChat] Using cached context for ${cacheKey}`);
        return cached.data;
    }

    console.log(`[RepoChat] Fetching fresh context for ${cacheKey}`);
    
    const context = {
        basic: null,
        languages: null,
        readme: null,
        packageJson: null,
        fileTree: [],
        contributors: [],
        recentCommits: [],
        branches: [],
        topics: []
    };

    try {
        // 1. Basic repo info
        const { data: repoData } = await octokit.rest.repos.get({ owner, repo: repoName });
        context.basic = {
            name: repoData.name,
            full_name: repoData.full_name,
            description: repoData.description,
            private: repoData.private,
            html_url: repoData.html_url,
            homepage: repoData.homepage,
            stargazers_count: repoData.stargazers_count,
            forks_count: repoData.forks_count,
            open_issues_count: repoData.open_issues_count,
            watchers_count: repoData.watchers_count,
            created_at: repoData.created_at,
            updated_at: repoData.updated_at,
            pushed_at: repoData.pushed_at,
            size: repoData.size,
            default_branch: repoData.default_branch,
            license: repoData.license?.name || null,
            topics: repoData.topics || []
        };
        context.topics = repoData.topics || [];
    } catch (e) {
        console.warn(`[RepoChat] Failed to fetch basic info for ${cacheKey}:`, e.message);
    }

    try {
        // 2. Languages
        const { data: languages } = await octokit.rest.repos.listLanguages({ owner, repo: repoName });
        context.languages = languages;
    } catch (e) {
        console.warn(`[RepoChat] Failed to fetch languages:`, e.message);
    }

    try {
        // 3. README
        const { data: readme } = await octokit.rest.repos.getReadme({ owner, repo: repoName });
        const readmeContent = Buffer.from(readme.content, 'base64').toString('utf8');
        // Truncate to 3000 chars to save tokens
        context.readme = readmeContent.substring(0, 3000);
    } catch (e) {
        console.warn(`[RepoChat] No README found:`, e.message);
    }

    try {
        // 4. package.json (for Node projects)
        const { data: pkgFile } = await octokit.rest.repos.getContent({
            owner, repo: repoName, path: 'package.json'
        });
        const pkgContent = Buffer.from(pkgFile.content, 'base64').toString('utf8');
        const pkg = JSON.parse(pkgContent);
        context.packageJson = {
            name: pkg.name,
            version: pkg.version,
            description: pkg.description,
            dependencies: pkg.dependencies ? Object.keys(pkg.dependencies) : [],
            devDependencies: pkg.devDependencies ? Object.keys(pkg.devDependencies) : [],
            scripts: pkg.scripts ? Object.keys(pkg.scripts) : []
        };
    } catch (e) {
        // Not a Node project or no package.json — that's fine
    }

    try {
        // 5. File tree (top-level)
        const { data: tree } = await octokit.rest.repos.getContent({
            owner, repo: repoName, path: ''
        });
        if (Array.isArray(tree)) {
            context.fileTree = tree.map(item => ({
                name: item.name,
                type: item.type, // 'file' or 'dir'
                size: item.size
            }));
        }
    } catch (e) {
        console.warn(`[RepoChat] Failed to fetch file tree:`, e.message);
    }

    try {
        // 6. Contributors
        const { data: contributors } = await octokit.rest.repos.listContributors({
            owner, repo: repoName, per_page: 10
        });
        context.contributors = contributors.map(c => ({
            login: c.login,
            contributions: c.contributions,
            avatar_url: c.avatar_url
        }));
    } catch (e) {
        console.warn(`[RepoChat] Failed to fetch contributors:`, e.message);
    }

    try {
        // 7. Recent commits
        const { data: commits } = await octokit.rest.repos.listCommits({
            owner, repo: repoName, per_page: 10
        });
        context.recentCommits = commits.map(c => ({
            sha: c.sha.substring(0, 7),
            message: c.commit.message.split('\n')[0],
            author: c.commit.author.name,
            date: c.commit.author.date
        }));
    } catch (e) {
        console.warn(`[RepoChat] Failed to fetch commits:`, e.message);
    }

    try {
        // 8. Branches
        const { data: branches } = await octokit.rest.repos.listBranches({
            owner, repo: repoName, per_page: 20
        });
        context.branches = branches.map(b => b.name);
    } catch (e) {
        console.warn(`[RepoChat] Failed to fetch branches:`, e.message);
    }

    // Cache it
    repoContextCache.set(cacheKey, { data: context, timestamp: Date.now() });

    return context;
};

/**
 * Build a context summary string from repo data
 */
const buildContextSummary = (context) => {
    let summary = '';

    if (context.basic) {
        summary += `## Repository: ${context.basic.full_name}\n`;
        summary += `- Description: ${context.basic.description || 'No description'}\n`;
        summary += `- Visibility: ${context.basic.private ? 'Private' : 'Public'}\n`;
        summary += `- Stars: ${context.basic.stargazers_count} | Forks: ${context.basic.forks_count} | Open Issues: ${context.basic.open_issues_count}\n`;
        summary += `- Created: ${new Date(context.basic.created_at).toLocaleDateString()} | Last Updated: ${new Date(context.basic.updated_at).toLocaleDateString()}\n`;
        summary += `- Last Push: ${new Date(context.basic.pushed_at).toLocaleDateString()}\n`;
        summary += `- Default Branch: ${context.basic.default_branch}\n`;
        summary += `- Size: ${(context.basic.size / 1024).toFixed(1)} MB\n`;
        if (context.basic.license) summary += `- License: ${context.basic.license}\n`;
        if (context.basic.homepage) summary += `- Homepage: ${context.basic.homepage}\n`;
        if (context.topics.length > 0) summary += `- Topics: ${context.topics.join(', ')}\n`;
    }

    if (context.languages && Object.keys(context.languages).length > 0) {
        const totalBytes = Object.values(context.languages).reduce((a, b) => a + b, 0);
        const langBreakdown = Object.entries(context.languages)
            .map(([lang, bytes]) => `${lang}: ${((bytes / totalBytes) * 100).toFixed(1)}%`)
            .join(', ');
        summary += `\n## Languages\n${langBreakdown}\n`;
    }

    if (context.packageJson) {
        summary += `\n## Node.js Project Info\n`;
        if (context.packageJson.name) summary += `- Package: ${context.packageJson.name} v${context.packageJson.version || 'N/A'}\n`;
        if (context.packageJson.dependencies.length > 0) {
            summary += `- Dependencies (${context.packageJson.dependencies.length}): ${context.packageJson.dependencies.join(', ')}\n`;
        }
        if (context.packageJson.devDependencies.length > 0) {
            summary += `- Dev Dependencies (${context.packageJson.devDependencies.length}): ${context.packageJson.devDependencies.join(', ')}\n`;
        }
        if (context.packageJson.scripts.length > 0) {
            summary += `- Scripts: ${context.packageJson.scripts.join(', ')}\n`;
        }
    }

    if (context.fileTree.length > 0) {
        const dirs = context.fileTree.filter(f => f.type === 'dir').map(f => f.name);
        const files = context.fileTree.filter(f => f.type === 'file').map(f => f.name);
        summary += `\n## Project Structure (Top Level)\n`;
        if (dirs.length > 0) summary += `- Directories: ${dirs.join(', ')}\n`;
        if (files.length > 0) summary += `- Files: ${files.join(', ')}\n`;
    }

    if (context.contributors.length > 0) {
        summary += `\n## Contributors (Top ${context.contributors.length})\n`;
        context.contributors.forEach(c => {
            summary += `- ${c.login}: ${c.contributions} contributions\n`;
        });
    }

    if (context.recentCommits.length > 0) {
        summary += `\n## Recent Commits\n`;
        context.recentCommits.slice(0, 5).forEach(c => {
            summary += `- [${c.sha}] ${c.message} (by ${c.author}, ${new Date(c.date).toLocaleDateString()})\n`;
        });
    }

    if (context.branches.length > 0) {
        summary += `\n## Branches (${context.branches.length})\n`;
        summary += context.branches.join(', ') + '\n';
    }

    if (context.readme) {
        summary += `\n## README (excerpt)\n${context.readme}\n`;
    }

    return summary;
};

/**
 * Fetch list of all repos for the authenticated user (for repo suggestions)
 */
const fetchAllRepoNames = async (octokit) => {
    try {
        const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
            affiliation: 'owner,collaborator,organization_member',
            visibility: 'all',
            sort: 'updated',
            per_page: 100
        });
        return repos.map(r => ({
            name: r.name,
            full_name: r.full_name,
            owner: r.owner.login,
            description: r.description,
            language: r.language,
            private: r.private
        }));
    } catch (e) {
        console.error('[RepoChat] Failed to fetch repo list:', e.message);
        return [];
    }
};

/**
 * Try to find matching repos from user's message (returns multiple)
 */
const findReposInMessage = (message, repos) => {
    const msgLower = message.toLowerCase();
    const found = [];
    
    for (const repo of repos) {
        if (msgLower.includes(repo.name.toLowerCase())) {
            // Avoid duplicates
            if (!found.some(r => r.name === repo.name)) {
                found.push(repo);
            }
        }
    }

    return found;
};


// @desc    Chat about repositories
// @route   POST /api/github/repo-chat
// @access  Private (Admin)
const repoChat = async (req, res) => {
    try {
        const { message, repoName, repoNames = [], conversationHistory = [] } = req.body;

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Message is required' 
            });
        }

        const octokit = getOctokit();
        const deepseek = getDeepSeekClient();

        // Fetch all repos to help with repo detection
        const allRepos = await fetchAllRepoNames(octokit);
        
        let targetRepos = [];
        let contextSummary = '';

        // Support both legacy single repoName and new repoNames array
        const explicitNames = repoNames.length > 0 
            ? repoNames 
            : (repoName ? [repoName] : []);

        // Resolve explicitly provided repo names
        for (const name of explicitNames) {
            const found = allRepos.find(r => 
                r.name.toLowerCase() === name.toLowerCase() ||
                r.full_name.toLowerCase() === name.toLowerCase()
            );
            if (found && !targetRepos.some(t => t.name === found.name)) {
                targetRepos.push(found);
            }
        }

        // If no repos explicitly selected, try to detect from message
        if (targetRepos.length === 0) {
            targetRepos = findReposInMessage(message, allRepos);
        }

        // Fetch context for all target repos (limit to 5 to avoid token overload)
        const reposToFetch = targetRepos.slice(0, 5);
        const contextParts = [];
        for (const repo of reposToFetch) {
            const ctx = await fetchRepoContext(octokit, repo.owner, repo.name);
            contextParts.push(buildContextSummary(ctx));
        }
        contextSummary = contextParts.join('\n\n---\n\n');

        // Build the system prompt
        const repoListSummary = allRepos.map(r => 
            `- ${r.name} (${r.private ? 'Private' : 'Public'}${r.language ? ', ' + r.language : ''}): ${r.description || 'No description'}`
        ).join('\n');

        const repoFocusText = reposToFetch.length > 0
            ? `## Currently Analyzing ${reposToFetch.length} Repository(ies):\n${reposToFetch.map(r => `- **${r.name}**`).join('\n')}\n\n${contextSummary}`
            : '## No specific repository selected yet.\nHelp the user by asking which repository they want to know about, or answer general questions about their GitHub projects.';

        const systemPrompt = `You are CipherGate AI Assistant — an intelligent GitHub repository analyst embedded in the CipherGate platform. You help users understand their GitHub repositories, projects, and codebases.

## Your Capabilities:
- Analyze tech stacks, dependencies, and project architectures
- Provide overviews and summaries of repositories
- Explain project structures and file organizations
- Share contributor and activity insights
- Compare repositories when asked
- Answer technical questions about specific repos

## Available Repositories:
${repoListSummary}

${repoFocusText}

## Guidelines:
1. Be concise but thorough in your responses
2. Use markdown formatting for readability (headers, bullet points, code blocks)
3. If the user asks about a specific repo, provide detailed information from the context
4. If you don't have enough information, say so honestly
5. For tech stack questions, analyze languages, dependencies, and project structure
6. Always be helpful and professional
7. When listing technologies, organize them by category (Frontend, Backend, Database, etc.)
8. When comparing repos, use tables or side-by-side format for clarity`;

        // Build conversation messages
        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        // Add conversation history (last 10 messages max to save tokens)
        const recentHistory = conversationHistory.slice(-10);
        for (const msg of recentHistory) {
            messages.push({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            });
        }

        // Add current message
        messages.push({ role: 'user', content: message });

        console.log(`[RepoChat] Processing chat - Repos: [${reposToFetch.map(r => r.name).join(', ') || 'none'}], Message: "${message.substring(0, 50)}..."`);

        // Call DeepSeek
        const response = await deepseek.chat.completions.create({
            model: 'deepseek-chat',
            messages: messages,
            temperature: 0.7,
            max_tokens: 2048,
        });

        const aiResponse = response.choices[0].message.content.trim();

        res.json({
            success: true,
            response: aiResponse,
            detectedRepos: reposToFetch.map(r => ({
                name: r.name,
                full_name: r.full_name,
                language: r.language,
                private: r.private
            }))
        });

    } catch (error) {
        console.error('[RepoChat] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process chat message',
            error: error.message
        });
    }
};

// @desc    Get list of repos for chat suggestions
// @route   GET /api/github/repo-chat/repos
// @access  Private (Admin)
const getRepoList = async (req, res) => {
    try {
        const octokit = getOctokit();
        const repos = await fetchAllRepoNames(octokit);
        
        res.json({
            success: true,
            repos: repos
        });
    } catch (error) {
        console.error('[RepoChat] Error fetching repo list:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch repository list',
            error: error.message
        });
    }
};

module.exports = { repoChat, getRepoList };
