import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// File filter - only allow images with enhanced security
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Check for path traversal attempts
  if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
    return cb(new Error('Invalid file name. File name contains illegal characters.'));
  }

  // Allowed MIME types
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  // Check MIME type
  if (!allowedMimes.includes(file.mimetype)) {
    return cb(new Error('Invalid file type. Only images (JPEG, PNG, GIF, WebP) are allowed.'));
  }

  // Check file extension matches MIME type
  const ext = path.extname(file.originalname).toLowerCase();
  const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  
  if (!validExtensions.includes(ext)) {
    return cb(new Error('Invalid file extension. Only image files are allowed.'));
  }

  // Additional validation: Check extension matches MIME type
  const mimeToExt: { [key: string]: string[] } = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/jpg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
  };

  if (mimeToExt[file.mimetype] && !mimeToExt[file.mimetype].includes(ext)) {
    return cb(new Error('File extension does not match file type.'));
  }

  cb(null, true);
};

// Configure multer
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 40 * 1024 * 1024, // 40MB limit (increased to accommodate large photos)
  },
  fileFilter: fileFilter,
});

// Single file upload
export const uploadSingle = upload.single('photo');

// Multiple files upload (up to 6 photos)
export const uploadMultiple = upload.array('photos', 6);

