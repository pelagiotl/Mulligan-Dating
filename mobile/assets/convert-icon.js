// Script to convert SVG to PNG for app icon
// Run with: node convert-icon.js

const fs = require('fs');
const path = require('path');

console.log('📱 Mulligan App Icon Converter');
console.log('');
console.log('Since image conversion tools are not available, please use one of these methods:');
console.log('');
console.log('METHOD 1: Online Converter (Easiest)');
console.log('1. Go to https://cloudconvert.com/svg-to-png');
console.log('2. Upload: mobile/assets/app-icon-option-4.svg');
console.log('3. Set width: 1024, height: 1024');
console.log('4. Download and save as: mobile/assets/icon.png');
console.log('');
console.log('METHOD 2: Using Figma (Recommended)');
console.log('1. Open Figma (figma.com) - free account works');
console.log('2. Create new file, add 1024x1024 frame');
console.log('3. Import app-icon-option-4.svg');
console.log('4. Export as PNG, 1x resolution');
console.log('5. Save to: mobile/assets/icon.png');
console.log('');
console.log('METHOD 3: Using macOS Preview');
console.log('1. Open app-icon-option-4.svg in Safari');
console.log('2. File > Export as PDF');
console.log('3. Open PDF in Preview');
console.log('4. File > Export, choose PNG, set size to 1024x1024');
console.log('5. Save as: mobile/assets/icon.png');
console.log('');
console.log('The icon design is ready in: mobile/assets/app-icon-option-4.svg');
console.log('It features:');
console.log('- Burgundy background (#8B1538)');
console.log('- White/pink gradient heart');
console.log('- "M" letter inside the heart');
console.log('- 1024x1024 dimensions');







