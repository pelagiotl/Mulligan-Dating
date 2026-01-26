import sharp from 'sharp';

/**
 * Compress and resize image to fit within Cloudinary's 10MB limit
 * @param buffer - Image buffer
 * @param maxSizeBytes - Maximum file size in bytes (default: 10MB for Cloudinary free tier)
 * @returns Compressed image buffer
 */
export async function compressImageForCloudinary(
  buffer: Buffer,
  maxSizeBytes: number = 10 * 1024 * 1024 // 10MB default
): Promise<Buffer> {
  const originalSize = buffer.length;
  console.log(`📦 Original image size: ${(originalSize / (1024 * 1024)).toFixed(2)} MB`);

  // If already under limit, return as-is
  if (originalSize <= maxSizeBytes) {
    console.log('✅ Image already under size limit, no compression needed');
    return buffer;
  }

  try {
    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    console.log(`📐 Image dimensions: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

    // Calculate target dimensions (maintain aspect ratio)
    // Use higher resolution for better quality (2560px max for high-res displays)
    let targetWidth = metadata.width || 2560;
    let targetHeight = metadata.height || 2560;
    let quality = 90; // Start with high quality
    let compressedBuffer = buffer;

    // If image is very large, resize it first (but keep it high-res for quality)
    // 2560px is good for Retina displays and modern phones
    if (targetWidth > 2560 || targetHeight > 2560) {
      // Calculate dimensions maintaining aspect ratio
      const aspectRatio = (metadata.width || 1) / (metadata.height || 1);
      if (targetWidth > targetHeight) {
        targetWidth = 2560;
        targetHeight = Math.round(2560 / aspectRatio);
      } else {
        targetHeight = 2560;
        targetWidth = Math.round(2560 * aspectRatio);
      }
      console.log(`🔄 Resizing to: ${targetWidth}x${targetHeight} (high quality)`);
    }

    // Try different quality levels - start high and reduce only if needed
    // Quality levels: 90% (excellent), 85% (very good), 80% (good), 75% (acceptable)
    const qualityLevels = [90, 85, 80, 75];
    
    for (const q of qualityLevels) {
      quality = q;
      console.log(`🔄 Trying compression with quality: ${quality}%`);
      
      // Convert to JPEG for better compression (smaller file size)
      // Preserve original format if possible, otherwise convert to JPEG
      // JPEG is better for photos, but we'll try to keep format if it's already small enough
      const format = metadata.format === 'png' && originalSize < maxSizeBytes * 1.5 
        ? 'png' 
        : 'jpeg';
      
      if (format === 'png') {
        // For PNG, use high compression but maintain quality
        compressedBuffer = await sharp(buffer)
          .resize(targetWidth, targetHeight, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .png({ 
            quality: Math.min(quality + 10, 100), // PNG quality is 0-100
            compressionLevel: 9 
          })
          .toBuffer();
      } else {
        // For JPEG, use mozjpeg for better quality at same file size
        compressedBuffer = await sharp(buffer)
          .resize(targetWidth, targetHeight, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ 
            quality, 
            mozjpeg: true, // Better quality compression algorithm
            progressive: true // Progressive JPEG for better perceived quality
          })
          .toBuffer();
      }

      const compressedSize = compressedBuffer.length;
      console.log(`📦 Compressed size: ${(compressedSize / (1024 * 1024)).toFixed(2)} MB`);

      if (compressedSize <= maxSizeBytes) {
        console.log(`✅ Compression successful! Reduced from ${(originalSize / (1024 * 1024)).toFixed(2)} MB to ${(compressedSize / (1024 * 1024)).toFixed(2)} MB`);
        return compressedBuffer;
      }
    }

    // If still too large after all quality levels, resize more aggressively
    // But still maintain reasonable quality (don't go below 1920px or 75% quality)
    console.log('⚠️  Still too large after quality compression, resizing more aggressively...');
    targetWidth = Math.max(Math.round(targetWidth * 0.85), 1920); // Don't go below 1920px
    targetHeight = Math.max(Math.round(targetHeight * 0.85), 1920);

    compressedBuffer = await sharp(buffer)
      .resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ 
        quality: 75, // Minimum quality - still looks good
        mozjpeg: true,
        progressive: true
      })
      .toBuffer();

    const finalSize = compressedBuffer.length;
    console.log(`📦 Final compressed size: ${(finalSize / (1024 * 1024)).toFixed(2)} MB`);

    if (finalSize > maxSizeBytes) {
      console.warn(`⚠️  Warning: Image still ${(finalSize / (1024 * 1024)).toFixed(2)} MB after compression (limit: ${(maxSizeBytes / (1024 * 1024)).toFixed(2)} MB)`);
    }

    return compressedBuffer;
  } catch (error: any) {
    console.error('❌ Image compression error:', error);
    // If compression fails, return original (will fail at Cloudinary but at least we tried)
    console.warn('⚠️  Returning original image - compression failed');
    return buffer;
  }
}

