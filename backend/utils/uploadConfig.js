const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const FileType = require('file-type');

// Ensure upload directory exists
const createUploadDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Generic storage engine generator
const createDiskStorage = (destinationDir) => {
  const fullPath = path.join(__dirname, '..', destinationDir);
  createUploadDir(fullPath);

  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, fullPath);
    },
    filename: (req, file, cb) => {
      // Feature Flag check for strictly enforcing UUID filenames
      const useStrictUploads = process.env.ENABLE_STRICT_UPLOADS !== 'false';
      
      if (useStrictUploads) {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
      } else {
        // Legacy fallback
        const ext = path.extname(file.originalname);
        const uniqueName = `${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`;
        cb(null, uniqueName);
      }
    }
  });
};

// File filters
const imageFileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|gif/;
  const ok = allowed.test(path.extname(file.originalname).toLowerCase()) &&
              allowed.test(file.mimetype);
  if (ok) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const documentFileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|pdf|docx|doc/;
  const ok = allowed.test(path.extname(file.originalname).toLowerCase()) &&
              allowed.test(file.mimetype);
  if (ok) {
    cb(null, true);
  } else {
    cb(new Error('Only images and documents (PDF, DOCX) are allowed'), false);
  }
};

const aiDocumentFilter = (req, file, cb) => {
  const allowedExts = /\.(txt|md|pdf|json)$/i;
  if (allowedExts.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('Only .txt, .md, .pdf, .json files are allowed'), false);
  }
};

// Exports
const uploadImage = (dir, maxSizeMB = 5) => multer({
  storage: createDiskStorage(dir),
  limits: { fileSize: maxSizeMB * 1024 * 1024 },
  fileFilter: imageFileFilter
});

const uploadDocument = (dir, maxSizeMB = 10) => multer({
  storage: createDiskStorage(dir),
  limits: { fileSize: maxSizeMB * 1024 * 1024 },
  fileFilter: documentFileFilter
});

const uploadMemory = (maxSizeMB = 2) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxSizeMB * 1024 * 1024 },
  fileFilter: imageFileFilter // default to image for AI memory processing
});

const uploadAiMemory = (maxSizeMB = 50) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxSizeMB * 1024 * 1024, files: 20 },
  fileFilter: aiDocumentFilter
});

// Magic Bytes Verification Middleware
const verifyMagicBytes = async (req, res, next) => {
  if (!req.file && (!req.files || req.files.length === 0)) {
    return next();
  }

  const files = req.files || [req.file];

  for (const file of files) {
    if (!file.path) continue; // skip memory storage files

    try {
      const type = await FileType.fromFile(file.path);
      
      if (type) {
         const dangerousExts = ['exe', 'elf', 'dll', 'php', 'sh', 'bat', 'cmd', 'msi'];
         if (dangerousExts.includes(type.ext)) {
            fs.unlinkSync(file.path);
            return res.status(400).json({ message: 'Malicious file type detected' });
         }
      }
    } catch (err) {
      console.error('Magic bytes verification error:', err);
    }
  }
  next();
};

module.exports = {
  uploadImage,
  uploadDocument,
  uploadMemory,
  uploadAiMemory,
  verifyMagicBytes
};
