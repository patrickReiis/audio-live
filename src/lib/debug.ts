// src/lib/debug.ts

// This file provides debugging utilities for the application

/**
 * Log browser information for debugging
 */
export const logBrowserInfo = (): void => {
  console.group('Browser Information');
  console.log(`User Agent: ${navigator.userAgent}`);
  console.log(`Platform: ${navigator.platform}`);
  console.log(`Window Width: ${window.innerWidth}`);
  console.log(`Window Height: ${window.innerHeight}`);
  console.log(`Device Pixel Ratio: ${window.devicePixelRatio}`);
  console.log(`Online: ${navigator.onLine}`);
  console.groupEnd();
};

/**
 * Log audio recording capabilities
 */
export const logAudioCapabilities = (): void => {
  console.group('Audio Recording Capabilities');
  
  // Check for MediaRecorder
  if (typeof MediaRecorder === 'undefined') {
    console.error('MediaRecorder API is not supported in this browser!');
  } else {
    console.log('MediaRecorder API is supported');
    
    // Check for various audio formats
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
    
    console.log('Supported audio formats:');
    formats.forEach(format => {
      console.log(`${format}: ${MediaRecorder.isTypeSupported(format) ? '✅ Supported' : '❌ Not supported'}`);
    });
  }
  
  // Check for getUserMedia
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    console.log('getUserMedia API is supported');
  } else {
    console.error('getUserMedia API is not supported in this browser!');
  }
  
  // Check for AudioContext
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (AudioContext) {
    console.log('AudioContext API is supported');
    
    try {
      const context = new AudioContext();
      console.log(`Sample Rate: ${context.sampleRate}Hz`);
      console.log(`Current Time: ${context.currentTime}`);
      console.log(`State: ${context.state}`);
      context.close();
    } catch (err) {
      console.error('Error initializing AudioContext:', err);
    }
  } else {
    console.error('AudioContext API is not supported in this browser!');
  }
  
  console.groupEnd();
};

/**
 * Log permissions status
 */
export const logPermissions = async (): Promise<void> => {
  console.group('Permissions');
  
  if (navigator.permissions) {
    try {
      const microphoneResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      console.log(`Microphone: ${microphoneResult.state}`);
    } catch (err) {
      console.error('Error checking microphone permission:', err);
    }
  } else {
    console.log('Permissions API not supported');
  }
  
  console.groupEnd();
};

export default {
  logBrowserInfo,
  logAudioCapabilities,
  logPermissions
};