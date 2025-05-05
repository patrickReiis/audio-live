// src/lib/audioUtils.ts

/**
 * Checks if a specific audio format is supported by the browser.
 * 
 * @param mimeType The mime type to check for support
 * @returns boolean indicating if the format is supported
 */
export const isFormatSupported = (mimeType: string): boolean => {
  return MediaRecorder.isTypeSupported(mimeType);
};

/**
 * Gets the most preferred audio format that is supported by the browser.
 * Tries mp3, then ogg, then falls back to webm.
 * 
 * @returns The most preferred supported mime type
 */
export const getBestSupportedFormat = (): string => {
  const formats = ['audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/webm'];
  
  for (const format of formats) {
    if (isFormatSupported(format)) {
      return format;
    }
  }
  
  return ''; // Empty string if no supported format found
};

/**
 * Determines the appropriate file extension based on the mime type.
 * 
 * @param mimeType The mime type
 * @returns The corresponding file extension
 */
export const getFileExtension = (mimeType: string): string => {
  switch (mimeType) {
    case 'audio/mp3':
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/webm':
      return 'webm';
    default:
      return 'audio'; // Generic fallback
  }
};

/**
 * Logs available audio formats to console.
 * Useful for debugging browser support.
 */
export const logSupportedFormats = (): void => {
  const formats = [
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/ogg',
    'audio/ogg;codecs=opus',
    'audio/mp3',
    'audio/mpeg',
    'audio/wav',
    'audio/aac'
  ];
  
  console.group('Supported Audio Formats');
  formats.forEach(format => {
    console.log(`${format}: ${isFormatSupported(format) ? '✅ Supported' : '❌ Not supported'}`);
  });
  console.groupEnd();
};

/**
 * Converts an audio blob to a different format using Web Audio API.
 * Note: This is a complex operation and has limitations based on browser support.
 * 
 * @param blob The audio blob to convert
 * @param targetFormat The target mime type
 * @returns Promise resolving to a blob in the target format
 */
export const convertAudioFormat = async (
  blob: Blob,
  targetFormat: string
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    // If already in target format, return as-is
    if (blob.type === targetFormat) {
      resolve(blob);
      return;
    }

    const fileReader = new FileReader();
    
    fileReader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Decode the audio data
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Create a new source buffer
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // Create a media stream destination
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        
        // Start playing (required for the MediaRecorder to have data)
        source.start(0);
        
        // Set up a MediaRecorder with the target format
        const mediaRecorder = new MediaRecorder(destination.stream, { 
          mimeType: targetFormat 
        });
        
        const chunks: Blob[] = [];
        
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };
        
        mediaRecorder.onstop = () => {
          const newBlob = new Blob(chunks, { type: targetFormat });
          resolve(newBlob);
          audioContext.close();
        };
        
        // Start recording
        mediaRecorder.start();
        
        // Stop after the duration of the audio
        setTimeout(() => {
          mediaRecorder.stop();
          source.stop();
        }, audioBuffer.duration * 1000);
      } catch (error) {
        console.error('Error converting audio format:', error);
        reject(error);
      }
    };
    
    fileReader.onerror = (error) => {
      reject(error);
    };
    
    fileReader.readAsArrayBuffer(blob);
  });
};

export default {
  isFormatSupported,
  getBestSupportedFormat,
  getFileExtension,
  logSupportedFormats,
  convertAudioFormat
};