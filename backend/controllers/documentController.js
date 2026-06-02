const InternalDocument = require('../models/InternalDocument');
const asyncHandler = require('express-async-handler');

// @desc    Get all wiki documents
// @route   GET /api/documents
// @access  Private
const getDocuments = asyncHandler(async (req, res) => {
  const subdomain = req.user?.subdomain || req.query.subdomain;
  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error('Subdomain is missing or invalid.');
  }

  const documents = await InternalDocument.find({ subdomain })
    .populate('createdBy', 'name username photo')
    .sort({ createdAt: -1 });

  res.json(documents);
});

// @desc    Get single wiki document
// @route   GET /api/documents/:id
// @access  Private
const getDocumentById = asyncHandler(async (req, res) => {
  const document = await InternalDocument.findById(req.params.id)
    .populate('createdBy', 'name username photo');

  if (!document) {
    res.status(404);
    throw new Error('Document not found');
  }

  // Subdomain validation
  const subdomain = req.user?.subdomain || req.query.subdomain;
  if (document.subdomain !== subdomain) {
    res.status(403);
    throw new Error('Not authorized to access this document');
  }

  res.json(document);
});

// @desc    Create new wiki document
// @route   POST /api/documents
// @access  Private
const createDocument = asyncHandler(async (req, res) => {
  const { title, content, category, tags } = req.body;
  const subdomain = req.user?.subdomain || req.body.subdomain;
  const createdBy = req.user?._id;

  if (!title || !content) {
    res.status(400);
    throw new Error('Title and content are required');
  }

  if (!subdomain || subdomain === 'main') {
    res.status(400);
    throw new Error('Subdomain is missing or invalid');
  }

  if (!createdBy) {
    res.status(401);
    throw new Error('User context missing');
  }

  const document = new InternalDocument({
    title,
    content,
    category: category || 'General',
    tags: Array.isArray(tags) ? tags : [],
    subdomain,
    createdBy
  });

  await document.save();
  await document.populate('createdBy', 'name username photo');

  // Trigger Second Brain sync hook (non-blocking)
  try {
    const { syncBrainItem } = require('../services/secondBrainService');
    syncBrainItem('wiki', document, subdomain).catch(err => 
      console.error('[SecondBrainSync] Wiki sync error:', err.message)
    );
  } catch (e) {
    // Service might not be created yet, will sync later
  }

  res.status(201).json(document);
});

// @desc    Update wiki document
// @route   PUT /api/documents/:id
// @access  Private
const updateDocument = asyncHandler(async (req, res) => {
  const { title, content, category, tags } = req.body;
  const document = await InternalDocument.findById(req.params.id);

  if (!document) {
    res.status(404);
    throw new Error('Document not found');
  }

  // Subdomain validation
  const subdomain = req.user?.subdomain || req.body.subdomain;
  if (document.subdomain !== subdomain) {
    res.status(403);
    throw new Error('Not authorized to update this document');
  }

  if (title) document.title = title;
  if (content) document.content = content;
  if (category) document.category = category;
  if (tags) document.tags = Array.isArray(tags) ? tags : [];

  await document.save();
  await document.populate('createdBy', 'name username photo');

  // Trigger Second Brain sync hook (non-blocking)
  try {
    const { syncBrainItem } = require('../services/secondBrainService');
    syncBrainItem('wiki', document, subdomain).catch(err => 
      console.error('[SecondBrainSync] Wiki sync error:', err.message)
    );
  } catch (e) {
    // Service might not be created yet, will sync later
  }

  res.json(document);
});

// @desc    Delete wiki document
// @route   DELETE /api/documents/:id
// @access  Private
const deleteDocument = asyncHandler(async (req, res) => {
  const document = await InternalDocument.findById(req.params.id);

  if (!document) {
    res.status(404);
    throw new Error('Document not found');
  }

  // Subdomain validation
  const subdomain = req.user?.subdomain || req.query.subdomain;
  if (document.subdomain !== subdomain) {
    res.status(403);
    throw new Error('Not authorized to delete this document');
  }

  const docId = document._id;
  await document.deleteOne();

  // Trigger Second Brain item delete hook (non-blocking)
  try {
    const { deleteBrainItem } = require('../services/secondBrainService');
    deleteBrainItem('wiki', docId, subdomain).catch(err => 
      console.error('[SecondBrainSync] Wiki delete error:', err.message)
    );
  } catch (e) {
    // Service might not be created yet, will sync later
  }

  res.json({ message: 'Document removed successfully', documentId: docId });
});

module.exports = {
  getDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  deleteDocument
};
