import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { isCloudinaryConfigured } from '../services/cloudinary.js';

// Check if Cloudinary is configured
const useCloudinary = isCloudinaryConfigured();

if (useCloudinary) {
  console.log('☁️  Using Cloudinary for photo storage');
} else {
  console.log('📁 Using local filesystem for photo storage');
  // Create uploads directory if it doesn't exist (only needed for local storage)
  let uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    // Try backend/uploads if uploads doesn't exist in cwd
    const backendUploads = path.join(process.cwd(), 'backend', 'uploads');
    if (fs.existsSync(backendUploads)) {
      uploadsDir = backendUploads;
    } else {
      // Create the directory
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log('✅ Created uploads directory:', uploadsDir);
    }
  }
  console.log('📁 Uploads directory:', uploadsDir);
}

// Configure storage - use memory storage for Cloudinary, disk storage for local
const storage = useCloudinary
  ? multer.memoryStorage() // Store in memory for Cloudinary upload
  : multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadsDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
      },
      filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
      },
    });

// File filter - only allow images with enhanced security
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  console.log('📸 File upload attempt:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size
  });

  // Check for path traversal attempts
  if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
    console.error('❌ Invalid file name:', file.originalname);
    return cb(new Error('Invalid file name. File name contains illegal characters.'));
  }

  // Allowed MIME types
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/x-png'];
  
  // Check MIME type
  if (!allowedMimes.includes(file.mimetype)) {
    console.error('❌ Invalid MIME type:', file.mimetype, 'for file:', file.originalname);
    return cb(new Error(`Invalid file type. Only images (JPEG, PNG, GIF, WebP) are allowed. Received: ${file.mimetype}`));
  }

  // Check file extension matches MIME type
  const ext = path.extname(file.originalname).toLowerCase();
  const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  
  if (!validExtensions.includes(ext)) {
    console.error('❌ Invalid file extension:', ext, 'for file:', file.originalname);
    return cb(new Error('Invalid file extension. Only image files are allowed.'));
  }

  // Additional validation: Check extension matches MIME type
  // But be lenient - trust the extension if it's valid, since MIME types can be wrong
  const mimeToExt: { [key: string]: string[] } = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/jpg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/x-png': ['.png'], // Some browsers send this for PNG
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
  };

  // Normalize MIME type for PNG (some browsers send image/x-png)
  const normalizedMime = file.mimetype === 'image/x-png' ? 'image/png' : file.mimetype;

  // Check if extension matches MIME type
  // But if the extension is valid and the MIME type is an image type, be lenient
  // (Some files have wrong MIME types but correct extensions)
  if (mimeToExt[normalizedMime] && !mimeToExt[normalizedMime].includes(ext)) {
    // If extension is valid for images, trust it over MIME type
    // (This handles cases where files are renamed or MIME type is misreported)
    if (validExtensions.includes(ext)) {
      console.warn('⚠️  MIME type mismatch but extension is valid - accepting file:', {
        mimetype: file.mimetype,
        extension: ext,
        originalname: file.originalname
      });
      // Allow it - trust the extension
    } else {
      console.error('❌ MIME type mismatch:', {
        mimetype: file.mimetype,
        normalizedMime,
        extension: ext,
        expected: mimeToExt[normalizedMime]
      });
      return cb(new Error('File extension does not match file type.'));
    }
  }

  console.log('✅ File validation passed:', file.originalname);
  cb(null, true);
};

// Configure multer
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit (allows for high-quality photos)
  },
  fileFilter: fileFilter,
});

// Single file upload
export const uploadSingle = upload.single('photo');

// Single image upload for chat messages
export const uploadChatImage = upload.single('image');

// Video filter for chat
const videoMimes = ['video/mp4', 'video/quicktime', 'video/x-m4v'];
const videoFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  if (file.originalname.includes('..') || file.originalname.includes('/')) {
    return cb(new Error('Invalid file name'));
  }
  if (videoMimes.includes(file.mimetype)) return cb(null, true);
  cb(new Error(`Invalid type. Allowed: ${videoMimes.join(', ')}`));
};
export const uploadChatVideo = multer({
  storage: useCloudinary ? multer.memoryStorage() : multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: videoFilter,
}).single('video');

// Audio filter for chat (voice messages)
const audioMimes = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/mp3',
  'audio/webm',
  'audio/ogg',
];
function normalizeAudioMime(mime: string): string {
  const m = mime.toLowerCase().split(';')[0].trim();
  return m;
}
const audioFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  if (file.originalname.includes('..') || file.originalname.includes('/')) {
    return cb(new Error('Invalid file name'));
  }
  const base = normalizeAudioMime(file.mimetype || '');
  if (audioMimes.includes(base)) return cb(null, true);
  cb(new Error(`Invalid type. Allowed: ${audioMimes.join(', ')}`));
};
export const uploadChatAudio = multer({
  storage: useCloudinary ? multer.memoryStorage() : multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: audioFilter,
}).single('audio');

// Multiple files upload (up to 6 photos)
export const uploadMultiple = upload.array('photos', 6);

