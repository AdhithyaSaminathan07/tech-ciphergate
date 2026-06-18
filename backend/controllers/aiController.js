const Settings = require('../models/Settings');
const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Ticket = require('../models/ticketModel');
const InternalDocument = require('../models/InternalDocument');
const SecondBrainItem = require('../models/SecondBrainItem');
const PersonalNote = require('../models/PersonalNote');
const GitHubCache = require('../models/GitHubCache');
const { generateCompletion } = require('../services/claudeService');
const { syncBrainItem, calculateDeveloperExpertise, deleteBrainItem } = require('../services/secondBrainService');
const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const PERSONAL_BRAIN_EXTENSIONS = new Set(['txt', 'md', 'pdf', 'json']);

const extractPersonalBrainText = async (file, ext) => {
  if (ext === 'pdf') {
    const pdfData = await pdfParse(file.buffer);
    return pdfData.text;
  }
  return file.buffer.toString('utf-8');
};

const normalizeRelativePath = (value) => {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some(part => part === '..')) {
    throw new Error('Invalid folder-relative file path');
  }
  return normalized;
};

const upsertPersonalBrainFile = async ({ file, subdomain, uploadedBy, sourceType = 'manual_upload', relativePath, lastModified, syncId }) => {
  const displayPath = sourceType === 'connected_folder'
    ? normalizeRelativePath(relativePath || file.originalname)
    : file.originalname;
  const ext = displayPath.split('.').pop().toLowerCase();
  if (!PERSONAL_BRAIN_EXTENSIONS.has(ext)) throw new Error('Unsupported file type');

  const textContent = await extractPersonalBrainText(file, ext);
  if (!textContent || !textContent.trim()) throw new Error('File appears to be empty or could not be read.');

  const basename = displayPath.split('/').pop();
  const title = basename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const noteData = {
    subdomain,
    title,
    content: textContent.trim(),
    fileType: ext,
    originalFilename: sourceType === 'connected_folder' ? `connected-folder/${displayPath}` : displayPath,
    fileSize: file.size,
    uploadedBy,
    sourceType,
    sourceRelativePath: sourceType === 'connected_folder' ? displayPath : undefined,
    sourceLastModified: sourceType === 'connected_folder' ? Number(lastModified || 0) : null,
    syncId: syncId || null,
    tags: [ext, 'personal-note', 'manager-brain', sourceType]
  };
  const query = sourceType === 'connected_folder'
    ? { subdomain, sourceType, sourceRelativePath: displayPath }
    : { subdomain, originalFilename: displayPath };
  const savedNote = await PersonalNote.findOneAndUpdate(query, noteData, { upsert: true, new: true, setDefaultsOnInsert: true });
  await syncBrainItem('personal_note', savedNote, subdomain);
  return savedNote;
};

// Helper to extract JSON from text safely
const extractJson = (text) => {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return JSON.parse(text);
  } catch (e) {
    console.error('[AI Controller] JSON Parsing Error on text:', text);
    throw new Error('Failed to parse AI response as JSON object');
  }
};

const truncateText = (value, maxLength = 1200) => {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

// @desc    Analyze task and recommend parameters + developers
// @route   POST /api/ai/analyze-task
// @access  Private
const analyzeTask = asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  const subdomain = req.user?.subdomain || req.body.subdomain;

  if (!title) {
    res.status(400);
    throw new Error('Task title is required');
  }

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error('Subdomain is missing or invalid');
  }

  // 1. AI request cache look-up
  const taskHash = crypto.createHash('md5').update(title + '|' + (description || '')).digest('hex');
  const cacheKey = `ai_task_rec:${subdomain}:${taskHash}`;

  try {
    const cachedResponse = await GitHubCache.findOne({
      subdomain,
      cache_key: cacheKey,
      data_type: 'ai_request_cache',
      expires_at: { $gte: new Date() }
    });

    if (cachedResponse && cachedResponse.data) {
      console.log(`[AI Caching] Serving cached recommendation for task hash: ${taskHash}`);
      return res.json(cachedResponse.data);
    }
  } catch (cacheErr) {
    console.error('[AI Caching] Cache read error:', cacheErr.message);
  }

  // 2. Retrieve active workers and repository intelligence in parallel for faster analysis.
  let workers = [];
  let repoIntellList = [];
  try {
    [workers, repoIntellList] = await Promise.all([
      Worker.find({ subdomain, status: 'Active' })
        .select('name username skills expertiseProfile completedTasksCount activeTasksCount')
        .lean(),
      SecondBrainItem.find({ subdomain, type: 'github_repo_intelligence' })
        .select('title metadata')
        .limit(8)
        .lean()
    ]);
  } catch (err) {
    console.log('[AI Analysis] Worker or repository retrieval failed:', err.message);
  }

  const repoIntelStr = repoIntellList.slice(0, 6).map((r, i) =>
    `Repo ${i + 1} [Name: ${r.metadata?.repoName || r.title}]:
   - Primary Maintainer: ${r.metadata?.primaryMaintainer?.name || 'None'}
   - Primary Tech Stack: ${(r.metadata?.primaryStack || []).join(', ') || 'Unknown'}
   - Health Score: ${r.metadata?.healthScore || 'N/A'}/100
   - Stats: ${r.metadata?.stats?.totalCommits || 0} commits, ${r.metadata?.stats?.totalPRs || 0} PRs, ${r.metadata?.stats?.openIssues || 0} open issues`
  ).join('\n\n');

  // 5. Search Second Brain for context — personal_note (folder) items fetched first, then hybrid search
  let folderNoteResults = [];
  let searchResults = [];

  // Priority 1: Always pull the latest personal_note (connected folder) items as primary context
  try {
    folderNoteResults = await SecondBrainItem.find({
      subdomain,
      type: 'personal_note'
    })
    .sort({ updatedAt: -1 })
    .limit(6)
    .lean();
  } catch (err) {
    console.log('[AI Search] personal_note fetch failed:', err.message);
  }

  // Priority 2: Text-index search across all types for task-relevant context
  try {
    searchResults = await SecondBrainItem.find(
      { $text: { $search: title }, subdomain, type: { $ne: 'github_repo_intelligence' } },
      { score: { $meta: "textScore" } }
    )
    .sort({ score: { $meta: "textScore" } })
    .limit(6)
    .lean();
  } catch (err) {
    console.log('[AI Search] Text search failed or index not ready, falling back to regex.');
  }

  if (searchResults.length === 0) {
    const words = title.split(/\s+/).filter(w => w.length > 3);
    if (words.length > 0) {
      searchResults = await SecondBrainItem.find({
        subdomain,
        type: { $ne: 'github_repo_intelligence' },
        $or: words.map(w => ({ content: { $regex: new RegExp(w, 'i') } }))
      })
      .limit(6)
      .lean();
    }
  }

  // Merge: folder notes first (deduplicated), then general search results
  const folderNoteIds = new Set(folderNoteResults.map(r => String(r._id)));
  const dedupedSearch = searchResults.filter(r => !folderNoteIds.has(String(r._id)));
  const allContext = [...folderNoteResults, ...dedupedSearch].slice(0, 8);

  // Format context block strings — folder notes get a prominent label
  const contextStr = allContext.map((r, i) => {
    const isFolder = r.type === 'personal_note';
    const label = isFolder
      ? `📁 MANAGER FOLDER FILE ${i + 1} [Priority Context]`
      : `Context Block ${i + 1} [Type: ${r.type}]`;
    return `${label}:\nTitle: ${r.title}\nContent: ${truncateText(r.content, 2000)}`;
  }).join('\n\n');

  // Format developer profiles list with weighted scores
  const rankedWorkers = workers
    .map(w => ({
      ...w,
      _analysisScore: (w.expertiseProfile?.weightedExpertiseScore || 0) - ((w.activeTasksCount || 0) * 4)
    }))
    .sort((a, b) => b._analysisScore - a._analysisScore)
    .slice(0, 12);

  const devProfilesStr = rankedWorkers.map(w => {
    const exp = w.expertiseProfile || {};
    return `- ID: ${w._id}
  Name: ${w.name}
  Username: ${w.username}
  Skills: ${(w.skills || []).join(', ') || 'None listed'}
  Weighted Expertise Score: ${exp.weightedExpertiseScore || 0}/100
  GitHub Commits Count: ${exp.gitCommitsCount || 0}
  GitHub PRs Count: ${exp.gitPRsCount || 0}
  GitHub Files Changed: ${exp.gitFilesChangedCount || 0}
  GitHub Code Reviews: ${exp.gitCodeReviewsCount || 0}
  Completed Tasks: ${w.completedTasksCount || 0}
  Active Task Load: ${w.activeTasksCount || 0}
  Project History: ${(exp.assignedProjectsList || []).slice(0, 6).join(', ') || 'None'}`;
  }).join('\n\n');

  // Assemble AI Prompts
  const systemPrompt = `You are the CipherGate Engineering Manager AI Assistant.
Analyze the user's task and output:
1. Recommended Priority ('Low', 'Medium', 'High')
2. Recommended Complexity ('Low', 'Medium', 'High')
3. Estimated Duration in Hours (integer, e.g., 4 or 16)
4. A concrete subtask checklist (array of 3-5 subtask step strings)
5. Developer Recommendations:
   Match the top 3 best-suited developers from the provided developer profiles list.
   For each developer recommendation, you MUST calculate a Match Confidence Level ('High', 'Medium', 'Low') based on:
   - Match Score & Task History
   - Direct Stack Matches with the repository intelligence
   - Workload & Active Task Load
   You MUST provide:
   - developerId
   - developerName
   - matchScore (percentage score integer, e.g. 96)
   - confidenceLevel ('High', 'Medium', 'Low')
   - reasons (array of 3-5 bullet point justifications prefix with a checkmark "✓").
     Example reasons:
     ✓ Expert in Node.js and AWS (tech stack match)
     ✓ Completed 12 similar tasks (historical task match)
     ✓ Active workload: 1 task (workload check)
     ✓ High Git contributions score: 95 (git commits check)

IMPORTANT: The retrieved context includes 📁 MANAGER FOLDER FILE entries — these are the manager's own documents, notes, and knowledge files synced from their connected Second Brain folder. You MUST give these files THE HIGHEST PRIORITY when making recommendations. They represent the manager's direct knowledge, architecture decisions, team preferences, processes, and standards for this organization. Use them deeply and explicitly reference them in your reasoning.

Also, any [Manager Personal Note] entries are the manager's saved discussions and decisions with LLMs and carry HIGH weight.

You MUST respond ONLY with a JSON object in this exact format, with no preamble or codeblock formatting:
{
  "priority": "High",
  "complexity": "Medium",
  "estimatedHours": 8,
  "subtasks": [
    "First subtask step string",
    "Second subtask step string",
    "Third subtask step string"
  ],
  "recommendations": [
    {
      "developerId": "mongodb_developer_id",
      "developerName": "Developer Name",
      "matchScore": 95,
      "confidenceLevel": "High",
      "reasons": [
        "✓ Worked on InstaxBot (Primary Repo)",
        "✓ Expert in Node.js and AWS",
        "✓ Completed 4 similar tasks",
        "✓ Low workload (1 active task)"
      ]
    }
  ]
}`;

  const userPrompt = `TASK TO ANALYZE:
Title: ${title}
Description: ${description || 'No description provided'}

RETIREVED REPOSITORY INTELLIGENCE CONTEXT:
${repoIntelStr || 'No repository summaries indexed.'}

RETIREVED COMPANY CONTEXT:
${contextStr || 'No specific context retrieved.'}

DEVELOPER PROFILES LIST:
${devProfilesStr || 'No developers found.'}`;

  try {
    const aiResponseText = await generateCompletion(subdomain, systemPrompt, userPrompt, {
      maxTokens: 1800,
      timeoutMs: 25000,
      temperature: 0.1,
      responseFormat: { type: 'json_object' }
    });
    const parsedRecommendation = extractJson(aiResponseText);

    // Save output to AI request cache (24 hours TTL)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await GitHubCache.updateOne(
      { subdomain, cache_key: cacheKey },
      {
        subdomain,
        cache_key: cacheKey,
        username: subdomain,
        data_type: 'ai_request_cache',
        data: parsedRecommendation,
        expires_at: expiresAt,
        last_fetched: new Date()
      },
      { upsert: true }
    ).catch(err => {
      console.error('[AI Caching] Cache write error:', err.message);
    });

    res.json(parsedRecommendation);
  } catch (error) {
    console.error('[AI Controller] Analysis Error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Perform a hybrid Second Brain AI search
// @route   GET /api/ai/search
// @access  Private
const searchSecondBrain = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const subdomain = req.user?.subdomain || req.query.subdomain;

  if (!q || !q.trim()) {
    res.status(400);
    throw new Error('Search query is required');
  }

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error('Subdomain is missing or invalid');
  }

  const queryText = q.trim();
  let results = [];

  // Always fetch personal_note (folder) items first — they are highest-priority context
  let folderItems = [];
  try {
    folderItems = await SecondBrainItem.find({ subdomain, type: 'personal_note' })
      .sort({ updatedAt: -1 })
      .limit(6)
      .lean();
    folderItems = folderItems.map(r => ({
      _id: r.itemRef,
      title: r.title,
      content: r.content,
      type: r.type,
      score: 99 // highest priority
    }));
  } catch (err) {
    console.log('[AI Search] personal_note priority fetch failed:', err.message);
  }

  try {
    // Primary: MongoDB Text Index Search
    results = await SecondBrainItem.find(
      { $text: { $search: queryText }, subdomain },
      { score: { $meta: "textScore" } }
    )
    .sort({ score: { $meta: "textScore" } })
    .limit(12)
    .lean();

    // Map Mongoose results to simple structures
    results = results.map(r => ({
      _id: r.itemRef,
      title: r.title,
      content: r.content,
      type: r.type,
      score: r.score
    }));
  } catch (err) {
    console.log('[AI Search] Text search failed, trying regex fallback...');
  }

  // Fallback / Hybrid addition: regex match if text search returns little or nothing
  if (results.length < 3) {
    const words = queryText.split(/\s+/).filter(w => w.length > 3);
    if (words.length > 0) {
      const regexResults = await SecondBrainItem.find({
        subdomain,
        $or: words.map(w => ({
          $or: [
            { title: { $regex: new RegExp(w, 'i') } },
            { content: { $regex: new RegExp(w, 'i') } },
            { tags: { $regex: new RegExp(w, 'i') } }
          ]
        }))
      })
      .limit(12 - results.length)
      .lean();

      const mappedRegex = regexResults.map(r => ({
        _id: r.itemRef,
        title: r.title,
        content: r.content,
        type: r.type,
        score: 1.0
      }));

      results = [...results, ...mappedRegex];
    }
  }

  // Merge folder items first (deduplicated by _id)
  const folderIds = new Set(folderItems.map(r => String(r._id)));
  const dedupedResults = results.filter(r => !folderIds.has(String(r._id)));
  results = [...folderItems, ...dedupedResults].slice(0, 14);

  let answer = '';
  if (req.query.ask === 'true') {
    const systemPrompt = `You are the CipherGate AI Second Brain Assistant powered by DeepSeek.
Answer the user's question using the provided company context.
Context items labeled 📁 FOLDER FILE are the manager's own synced documents — treat them as the most authoritative source and reference them explicitly in your answer.
If the context does not contain enough information, politely say so but offer whatever clues you can find.
Always answer in clean, concise GitHub-style markdown. Keep your answer highly structured, engaging, and professional.
Use bolding, list bullets, and tables where appropriate to present findings.`;
    
    const contextStr = results.map((r, i) => {
      const label = r.type === 'personal_note'
        ? `📁 FOLDER FILE ${i + 1}`
        : `[Item ${i + 1} - Type: ${r.type}]`;
      return `${label}\nTitle: ${r.title}\nContent: ${truncateText(r.content, 2000)}`;
    }).join('\n\n');
    
    const userPrompt = `Question: ${queryText}
    
Context:
${contextStr || 'No specific context found.'}`;
    
    try {
      answer = await generateCompletion(subdomain, systemPrompt, userPrompt);
    } catch (err) {
      console.error('[AI Search] Failed to generate AI answer:', err.message);
      answer = `*Error generating AI response:* ${err.message}. Showing retrieved search items below.`;
    }
  }

  res.json({ results, answer });
});

// @desc    Get Second Brain Stats
// @route   GET /api/ai/stats
// @access  Private
const getBrainStats = asyncHandler(async (req, res) => {
  const subdomain = req.user?.subdomain || req.query.subdomain;
  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error('Subdomain is missing or invalid');
  }

  const totalItems = await SecondBrainItem.countDocuments({ subdomain });
  const projectCount = await SecondBrainItem.countDocuments({ subdomain, type: 'project' });
  const workerCount = await SecondBrainItem.countDocuments({ subdomain, type: 'worker' });
  const wikiCount = await SecondBrainItem.countDocuments({ subdomain, type: 'wiki' });
  const ticketCount = await SecondBrainItem.countDocuments({ subdomain, type: 'ticket' });
  const personalNoteCount = await SecondBrainItem.countDocuments({ subdomain, type: 'personal_note' });

  res.json({
    totalItems,
    byType: {
      project: projectCount,
      worker: workerCount,
      wiki: wikiCount,
      ticket: ticketCount,
      personal_note: personalNoteCount
    }
  });
});

// @desc    Reindex all company data manual sync
// @route   POST /api/ai/reindex
// @access  Private
const reindexData = asyncHandler(async (req, res) => {
  const subdomain = req.user?.subdomain || req.body.subdomain;
  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error('Subdomain is missing or invalid');
  }

  try {
    // Clear existing
    await SecondBrainItem.deleteMany({ subdomain });

    // 1. Sync Departments / Projects
    const departments = await Department.find({ subdomain });
    for (const dept of departments) {
      await syncBrainItem('project', dept, subdomain);
    }

    // 2. Sync Wikis
    const wikis = await InternalDocument.find({ subdomain });
    for (const wiki of wikis) {
      await syncBrainItem('wiki', wiki, subdomain);
    }

    // 3. Sync Workers (re-calculates developer expertise!)
    const workersList = await Worker.find({ subdomain, status: 'Active' });
    for (const worker of workersList) {
      await calculateDeveloperExpertise(worker._id);
    }

    // 4. Sync Completed Tickets
    const tickets = await Ticket.find({ subdomain, status: 'Done', isDeleted: { $ne: true } });
    for (const ticket of tickets) {
      await syncBrainItem('ticket', ticket, subdomain);
    }

    res.json({ message: 'AI Second Brain indexing completed successfully!' });
  } catch (error) {
    console.error('[AI Reindex] Failed to sync subdomain:', subdomain, error.message);
    res.status(500);
    throw new Error(`Reindexing failed: ${error.message}`);
  }
});

// @desc    Log AI decision (Applied details, specs, merges, etc)
// @route   POST /api/ai/audit-log
// @access  Private
const logAiDecision = asyncHandler(async (req, res) => {
  const { taskId, taskTitle, recommendedPriority, recommendedComplexity, estimatedHours, recommendedDevelopers, actionTaken, actionDetail } = req.body;
  const subdomain = req.user?.subdomain;

  if (!taskId || !taskTitle || !actionTaken) {
    res.status(400);
    throw new Error('Task details and action taken are required');
  }

  const AiAuditLog = require('../models/AiAuditLog');
  const log = new AiAuditLog({
    subdomain,
    taskId,
    taskTitle,
    recommendedPriority: recommendedPriority || 'Medium',
    recommendedComplexity: recommendedComplexity || 'Medium',
    estimatedHours: estimatedHours || 0,
    recommendedDevelopers: recommendedDevelopers || [],
    actionTaken,
    actionDetail: actionDetail || '',
    performedBy: req.user._id
  });

  await log.save();
  res.status(201).json({ success: true, log });
});

// @desc    Get AI Audit Logs history
// @route   GET /api/ai/audit-logs
// @access  Private
const getAiAuditLogs = asyncHandler(async (req, res) => {
  const subdomain = req.user?.subdomain;
  const AiAuditLog = require('../models/AiAuditLog');
  
  const logs = await AiAuditLog.find({ subdomain })
    .populate('performedBy', 'name username')
    .sort({ createdAt: -1 });
    
  res.json(logs);
});

// =============================================================================
// PERSONAL BRAIN — Manager's Second Brain Folder Integration
// =============================================================================

/**
 * @desc    Upload personal brain files (txt, md, pdf) from manager's desktop folder
 * @route   POST /api/ai/personal-brain/upload
 * @access  Private — Admin Only
 */
const uploadPersonalBrainFiles = asyncHandler(async (req, res) => {
  const subdomain = req.user?.subdomain;

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error('Subdomain is missing or invalid');
  }

  if (!req.files || req.files.length === 0) {
    res.status(400);
    throw new Error('No files were uploaded');
  }

  const results = [];
  const errors = [];

  for (const file of req.files) {
    try {
      const originalFilename = file.originalname;
      const ext = originalFilename.split('.').pop().toLowerCase();

      if (!['txt', 'md', 'pdf', 'json'].includes(ext)) {
        errors.push({ filename: originalFilename, error: 'Unsupported file type. Only .txt, .md, .pdf, .json allowed.' });
        continue;
      }

      // Extract text content
      let textContent = '';
      if (ext === 'pdf') {
        const pdfData = await pdfParse(file.buffer);
        textContent = pdfData.text;
      } else {
        textContent = file.buffer.toString('utf-8');
      }

      if (!textContent || !textContent.trim()) {
        errors.push({ filename: originalFilename, error: 'File appears to be empty or could not be read.' });
        continue;
      }

      // Derive title from filename (strip extension)
      const title = originalFilename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();

      // ✅ Change 3: Duplicate protection — upsert by subdomain + originalFilename
      const noteData = {
        subdomain,
        title,
        content: textContent.trim(),
        fileType: ext,
        originalFilename,
        fileSize: file.size,
        uploadedBy: req.user._id,
        tags: [ext, 'personal-note', 'manager-brain']
      };

      const savedNote = await PersonalNote.findOneAndUpdate(
        { subdomain, originalFilename },
        noteData,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Sync into SecondBrainItem index
      await syncBrainItem('personal_note', savedNote, subdomain);

      results.push({
        _id: savedNote._id,
        title: savedNote.title,
        originalFilename: savedNote.originalFilename,
        fileType: savedNote.fileType,
        fileSize: savedNote.fileSize,
        createdAt: savedNote.createdAt,
        updatedAt: savedNote.updatedAt,
        isUpdate: true // always upsert
      });

      console.log(`[PersonalBrain] Indexed file: "${originalFilename}" for subdomain: ${subdomain}`);
    } catch (fileErr) {
      console.error(`[PersonalBrain] Failed to process file: ${file.originalname}`, fileErr.message);
      errors.push({ filename: file.originalname, error: fileErr.message });
    }
  }

  res.status(201).json({
    message: `${results.length} file(s) indexed into Second Brain.`,
    indexed: results,
    errors
  });
});

/**
 * @desc    Get all personal brain files for this subdomain
 * @route   GET /api/ai/personal-brain
 * @access  Private — Admin Only
 */
const getPersonalBrainFiles = asyncHandler(async (req, res) => {
  const subdomain = req.user?.subdomain;

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error('Subdomain is missing or invalid');
  }

  const notes = await PersonalNote.find({ subdomain })
    .select('title originalFilename fileType fileSize tags sourceType sourceRelativePath sourceLastModified createdAt updatedAt')
    .sort({ updatedAt: -1 })
    .lean();

  res.json(notes);
});

/**
 * @desc    Delete a personal brain file and remove from Second Brain index
 * @route   DELETE /api/ai/personal-brain/:id
 * @access  Private — Admin Only
 */
const deletePersonalBrainFile = asyncHandler(async (req, res) => {
  const subdomain = req.user?.subdomain;
  const { id } = req.params;

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error('Subdomain is missing or invalid');
  }

  const note = await PersonalNote.findOne({ _id: id, subdomain });
  if (!note) {
    res.status(404);
    throw new Error('Personal note not found');
  }

  // Remove from Second Brain index
  await SecondBrainItem.deleteOne({ itemRef: note._id, subdomain });

  // Remove the note itself
  await PersonalNote.deleteOne({ _id: id, subdomain });

  console.log(`[PersonalBrain] Deleted file: "${note.originalFilename}" for subdomain: ${subdomain}`);

  res.json({ message: `"${note.originalFilename}" removed from Second Brain.`, deletedId: id });
});

// @desc Return connected-folder manifest used by the browser to upload changes only
const getPersonalBrainManifest = asyncHandler(async (req, res) => {
  const subdomain = req.user?.subdomain;
  const notes = await PersonalNote.find({ subdomain, sourceType: 'connected_folder' })
    .select('sourceRelativePath sourceLastModified fileSize updatedAt')
    .lean();
  res.json(notes.map(note => ({
    relativePath: note.sourceRelativePath,
    lastModified: note.sourceLastModified || 0,
    size: note.fileSize || 0,
    updatedAt: note.updatedAt
  })));
});

// @desc Upload a batch of new/changed files from a connected browser folder
const syncPersonalBrainFiles = asyncHandler(async (req, res) => {
  const subdomain = req.user?.subdomain;
  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error('Subdomain is missing or invalid');
  }
  let metadata;
  try {
    metadata = JSON.parse(req.body.metadata || '[]');
  } catch (_) {
    res.status(400);
    throw new Error('Invalid sync metadata');
  }
  if (!req.files?.length || metadata.length !== req.files.length) {
    res.status(400);
    throw new Error('Each synchronized file requires matching metadata');
  }

  const indexed = [];
  const errors = [];
  for (let i = 0; i < req.files.length; i += 1) {
    const file = req.files[i];
    try {
      const note = await upsertPersonalBrainFile({
        file,
        subdomain,
        uploadedBy: req.user._id,
        sourceType: 'connected_folder',
        relativePath: metadata[i].relativePath,
        lastModified: metadata[i].lastModified,
        syncId: req.body.syncId
      });
      indexed.push({ relativePath: note.sourceRelativePath, fileSize: note.fileSize });
    } catch (error) {
      errors.push({ relativePath: metadata[i]?.relativePath || file.originalname, error: error.message });
    }
  }
  res.status(errors.length ? 207 : 200).json({ indexed, errors });
});

// @desc Finalize a successful folder scan and remove files no longer present locally
const finalizePersonalBrainSync = asyncHandler(async (req, res) => {
  const subdomain = req.user?.subdomain;
  const relativePaths = Array.isArray(req.body.relativePaths)
    ? req.body.relativePaths.map(normalizeRelativePath)
    : null;
  if (!relativePaths || relativePaths.length > 10000) {
    res.status(400);
    throw new Error('A valid completed folder manifest is required');
  }

  const staleNotes = await PersonalNote.find({
    subdomain,
    sourceType: 'connected_folder',
    ...(relativePaths.length ? { sourceRelativePath: { $nin: relativePaths } } : {})
  });
  if (!relativePaths.length) {
    // An empty manifest is valid only when explicitly confirmed by the client.
    if (req.body.confirmEmpty !== true) {
      res.status(400);
      throw new Error('Empty folder synchronization requires confirmation');
    }
  }

  for (const note of staleNotes) {
    await SecondBrainItem.deleteOne({ itemRef: note._id, subdomain });
  }
  if (staleNotes.length) {
    await PersonalNote.deleteMany({ _id: { $in: staleNotes.map(note => note._id) }, subdomain });
  }
  res.json({ deleted: staleNotes.length, completedAt: new Date().toISOString() });
});

module.exports = {
  analyzeTask,
  searchSecondBrain,
  getBrainStats,
  reindexData,
  logAiDecision,
  getAiAuditLogs,
  uploadPersonalBrainFiles,
  getPersonalBrainFiles,
  deletePersonalBrainFile,
  getPersonalBrainManifest,
  syncPersonalBrainFiles,
  finalizePersonalBrainSync
};
