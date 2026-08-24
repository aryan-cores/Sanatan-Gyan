const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinary');

// ---------------- Profile Picture Storage ----------------
const profilePicStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'sanatan_gyan/profile_pics',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'fill', gravity: 'face' }]
  }
});

const uploadProfilePic = multer({
  storage: profilePicStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed for profile pictures.'));
    }
    cb(null, true);
  }
});

// ---------------- Post (Photo / Reel) Storage ----------------
// resource_type: 'auto' lets Cloudinary detect image vs video automatically
const postStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'sanatan_gyan/posts',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm']
  }
});

const uploadPost = multer({
  storage: postStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB (covers a ~1 min reel)
  fileFilter: (req, file, cb) => {
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');
    if (!isImage && !isVideo) {
      return cb(new Error('Only image or video files are allowed.'));
    }
    cb(null, true);
  }
});

module.exports = { uploadProfilePic, uploadPost };
