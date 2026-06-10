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

  // 1. Claude Request Cache Look-up
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

  // 2. Retrieve all projects for subdomain
  const projects = await Department.find({ subdomain }).lean();
  
  // 3. Retrieve all active workers (developers) with expertise profiles
  const workers = await Worker.find({ subdomain, status: 'Active' }).lean();

  // 4. Retrieve Repository Intelligence Context from Second Brain
  let repoIntellList = [];
  try {
    repoIntellList = await SecondBrainItem.find({
      subdomain,
      type: 'github_repo_intelligence'
    }).lean();
  } catch (err) {
    console.log('[AI Search] Repository intelligence retrieval failed.');
  }

  const repoIntelStr = repoIntellList.map((r, i) =>
    `Repo ${i + 1} [Name: ${r.metadata?.repoName || r.title}]:
   - Primary Maintainer: ${r.metadata?.primaryMaintainer?.name || 'None'}
   - Primary Tech Stack: ${(r.metadata?.primaryStack || []).join(', ') || 'Unknown'}
   - Health Score: ${r.metadata?.healthScore || 'N/A'}/100
   - Stats: ${r.metadata?.stats?.totalCommits || 0} commits, ${r.metadata?.stats?.totalPRs || 0} PRs, ${r.metadata?.stats?.openIssues || 0} open issues`
  ).join('\n\n');

  // 5. Search Second Brain for context (Hybrid retrieval search)
  let searchResults = [];
  try {
    searchResults = await SecondBrainItem.find(
      { $text: { $search: title }, subdomain, type: { $ne: 'github_repo_intelligence' } },
      { score: { $meta: "textScore" } }
    )
    .sort({ score: { $meta: "textScore" } })
    .limit(5)
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
      .limit(5)
      .lean();
    }
  }

  // Format context block strings
  const contextStr = searchResults.map((r, i) => 
    `Context Block ${i + 1} [Type: ${r.type}]:\nTitle: ${r.title}\nContent: ${r.content}`
  ).join('\n\n');

  // Format developer profiles list with weighted scores
  const devProfilesStr = workers.map(w => {
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
  Project History: ${(exp.assignedProjectsList || []).join(', ') || 'None'}`;
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

IMPORTANT: The retrieved company context may include [Manager Personal Note] entries — these are the manager's own saved discussions and decisions with LLMs. Give these notes HIGH weight when they are relevant to the task, as they represent the manager's direct knowledge, design decisions, and preferences for this team.

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
    const aiResponseText = await generateCompletion(subdomain, systemPrompt, userPrompt);
    const parsedRecommendation = extractJson(aiResponseText);

    // Save output to Claude Request Cache (24 hours TTL)
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

  try {
    // Primary: MongoDB Text Index Search
    results = await SecondBrainItem.find(
      { $text: { $search: queryText }, subdomain },
      { score: { $meta: "textScore" } }
    )
    .sort({ score: { $meta: "textScore" } })
    .limit(10)
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
        itemRef: { $not: { $in: results.map(r => r._id) } }, // avoid duplicates
        $or: words.map(w => ({
          $or: [
            { title: { $regex: new RegExp(w, 'i') } },
            { content: { $regex: new RegExp(w, 'i') } },
            { tags: { $regex: new RegExp(w, 'i') } }
          ]
        }))
      })
      .limit(10 - results.length)
      .lean();

      const mappedRegex = regexResults.map(r => ({
        _id: r.itemRef,
        title: r.title,
        content: r.content,
        type: r.type,
        score: 1.0 // Flat score for regex matches
      }));

      results = [...results, ...mappedRegex];
    }
  }

  let answer = '';
  if (req.query.ask === 'true') {
    const systemPrompt = `You are the CipherGate AI Second Brain Assistant.
Answer the user's question using ONLY the provided company context (projects, tickets, wikis, workers).
If the context does not contain enough information, politely say so but offer whatever clues you can find.
Always answer in clean, concise GitHub-style markdown. Keep your answer highly structured, engaging, and professional.
Use bolding, list bullets, and tables where appropriate to present findings.`;
    
    const contextStr = results.map((r, i) => 
      `[Item ${i + 1} - Type: ${r.type}]\nTitle: ${r.title}\nContent: ${r.content}`
    ).join('\n\n');
    
    const userPrompt = `Question: ${queryText}
    
Context:
${contextStr || 'No specific context found.'}`;
    
    try {
      answer = await generateCompletion(subdomain, systemPrompt, userPrompt);
    } catch (err) {
      console.error('[AI Search] Failed to generate Claude answer:', err.message);
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
      const title = originalFilename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

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
    .select('title originalFilename fileType fileSize tags createdAt updatedAt')
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

module.exports = {
  analyzeTask,
  searchSecondBrain,
  getBrainStats,
  reindexData,
  logAiDecision,
  getAiAuditLogs,
  uploadPersonalBrainFiles,
  getPersonalBrainFiles,
  deletePersonalBrainFile
};
